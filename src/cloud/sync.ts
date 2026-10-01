import { readBoards, type BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { parseBoardBackupJSON } from "../learning/storage";
import { CLOUD_APPLY_JOURNAL_KEY, CLOUD_META_KEY, applyLocalSnapshot, captureLocalSnapshot,
  localRawBackup, pendingLocalRecovery, recoverCloudApply, retainBothSnapshots } from "./local";
import { CLOUD_BACKUP_MAX_BYTES, createLibraryBackupJSON, snapshotHash, validateCloudSnapshot, type CloudSnapshot } from "./snapshot";

export type { CloudSnapshot } from "./snapshot";
export type CloudUser = { id: string; email: string; name?: string };
export type CloudLibrary = { revision: number; updatedAt: string | null; snapshot: CloudSnapshot | null };
export type CloudSyncState = {
  status: "checking" | "signed-out" | "unavailable" | "ready" | "syncing" | "synced"
    | "conflict" | "account-mismatch" | "recovery" | "error";
  user: CloudUser | null;
  revision: number | null;
  updatedAt: string | null;
  localBoardCount: number;
  cloudBoardCount: number | null;
  error: string | null;
  conflict: CloudLibrary | null;
  canAutoSync: boolean;
};
type CloudMetadata = { version: 1; owner: string; base: { revision: number; hash: string; updatedAt: string | null } | null };
export type CloudSyncClient = ReturnType<typeof createCloudSyncClient>;
const EMPTY: CloudSnapshot = { version: 1, boards: [] };

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window !== "undefined" && window.localStorage) return { ok: true, value: window.localStorage };
  } catch { /* State communicates blocked storage without changing it. */ }
  return { ok: false, error: "此环境无法使用本机储存；请先保留原来的画板备份" };
}

function readMetadata(storage: BoardStorage): BoardResult<CloudMetadata | null> {
  try {
    const raw = storage.getItem(CLOUD_META_KEY);
    if (raw === null) return { ok: true, value: null };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    const item = value as CloudMetadata;
    if (item.version !== 1 || typeof item.owner !== "string" || !item.owner.trim() || item.owner.length > 500
      || item.base !== null && (typeof item.base !== "object" || item.base === null
        || !Number.isSafeInteger(item.base.revision) || item.base.revision < 0
        || typeof item.base.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.base.hash)
        || item.base.updatedAt !== null && (typeof item.base.updatedAt !== "string" || !Number.isFinite(Date.parse(item.base.updatedAt))))) throw new Error();
    return { ok: true, value: item };
  } catch { return { ok: false, error: "本机同步记录无法读取；请下载原始备份，未覆盖任何画板" }; }
}

function validateLibrary(value: unknown): BoardResult<CloudLibrary> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "云端回应格式不正确" };
  const item = value as Record<string, unknown>;
  if (typeof item.revision !== "number" || !Number.isSafeInteger(item.revision) || item.revision < 0
    || item.updatedAt !== null && (typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt)))) {
    return { ok: false, error: "云端版本记录无效，未更改本机画板" };
  }
  if (item.snapshot === null && item.revision === 0) return { ok: true, value: { revision: 0, updatedAt: item.updatedAt, snapshot: null } };
  const snapshot = validateCloudSnapshot(item.snapshot);
  return snapshot.ok
    ? { ok: true, value: { revision: item.revision, updatedAt: item.updatedAt as string | null, snapshot: snapshot.value } }
    : snapshot;
}

export function createCloudSyncClient(options: {
  storage?: BoardStorage;
  fetch?: typeof fetch;
  onChange?: (state: CloudSyncState) => void;
  onLocalChange?: (reason: "pull" | "keep-both" | "recover" | "import") => void;
} = {}) {
  const target = resolveStorage(options.storage), request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const listeners = new Set<(state: CloudSyncState) => void>();
  let metadata: CloudMetadata | null = null, remote: CloudLibrary | null = null, running = false, changedDuringRun = false;
  let state: CloudSyncState = { status: "checking", user: null, revision: null, updatedAt: null,
    localBoardCount: 0, cloudBoardCount: null, error: null, conflict: null, canAutoSync: false };
  const emit = (patch: Partial<CloudSyncState>) => {
    state = { ...state, ...patch };
    state.canAutoSync = Boolean(state.user && metadata?.owner === state.user.id && metadata.base
      && ["ready", "synced", "error"].includes(state.status));
    options.onChange?.(state);
    listeners.forEach(listener => listener(state));
  };
  const fail = (error: string, status: CloudSyncState["status"] = "error") => emit({ status, error });
  const signedOut = () => {
    remote = null;
    const local = target.ok ? readBoards(target.value) : null;
    emit({ status: "signed-out", user: null, conflict: null, revision: null, updatedAt: null,
      cloudBoardCount: null, error: null, localBoardCount: local?.ok ? local.value.length : 0 });
  };

  const guard = (): { storage: BoardStorage; snapshot: CloudSnapshot; metadata: CloudMetadata | null } | null => {
    if (!target.ok) { fail(target.error); return null; }
    const recovery = pendingLocalRecovery(target.value);
    if (!recovery.ok) { fail(recovery.error); return null; }
    if (recovery.value) { fail("本机还有未完成的恢复记录；请先完成恢复，再同步", "recovery"); return null; }
    const local = captureLocalSnapshot(target.value);
    if (!local.ok) { fail(local.error); return null; }
    const stored = readMetadata(target.value);
    if (!stored.ok) { fail(stored.error); return null; }
    metadata = stored.value;
    emit({ localBoardCount: local.value.boards.length });
    if (state.user && metadata && metadata.owner !== state.user.id) {
      fail("这台浏览器的画板属于另一个账号。请先备份，并在另一浏览器或独立浏览器资料中使用当前账号。", "account-mismatch");
      return null;
    }
    return { storage: target.value, snapshot: local.value, metadata };
  };

  const loadAccount = async (): Promise<CloudUser | null> => {
    const response = await request("/api/account", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (response.status === 401) { signedOut(); return null; }
    if (response.status === 404 || !response.headers.get("content-type")?.includes("application/json")) {
      remote = null;
      emit({ status: "unavailable", user: null, conflict: null, error: "这个网址只支援本机保存；请使用私人云端测试网址登入同步" });
      return null;
    }
    if (!response.ok) throw new Error("暂时无法确认登入账号；本机画板仍然保留");
    const value: unknown = await response.json();
    const user = typeof value === "object" && value !== null && "user" in value ? value.user : null;
    if (user === null && typeof value === "object" && value !== null && "user" in value) { signedOut(); return null; }
    if (typeof user !== "object" || user === null || !("id" in user) || typeof user.id !== "string" || !user.id
      || !("email" in user) || typeof user.email !== "string" || !user.email) throw new Error("登入资料无效；未开始同步");
    const normalized: CloudUser = { id: user.id, email: user.email,
      ...("name" in user && typeof user.name === "string" ? { name: user.name } : {}) };
    if (state.user?.id !== normalized.id) {
      remote = null;
      emit({ conflict: null, revision: null, updatedAt: null, cloudBoardCount: null });
    }
    emit({ user: normalized });
    return normalized;
  };

  const loadRemote = async (user: CloudUser): Promise<CloudLibrary> => {
    const response = await request("/api/library", { credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", "X-RallyPath-Account": user.id } });
    if (response.status === 401) { signedOut(); throw new Error("登入已失效；请重新登入，画板仍保留在本机"); }
    if (response.status === 403) throw new Error("账号已改变或没有存取权限；未同步其他账号的资料");
    if (!response.ok) throw new Error("暂时读不到云端画板；本机画板仍然保留");
    const parsed = validateLibrary(await response.json());
    if (!parsed.ok) throw new Error(parsed.error);
    remote = parsed.value;
    emit({ revision: remote.revision, updatedAt: remote.updatedAt, cloudBoardCount: remote.snapshot?.boards.length ?? 0 });
    return remote;
  };

  const recordBase = (storage: BoardStorage, user: CloudUser, library: CloudLibrary, hash: string) => {
    const next: CloudMetadata = { version: 1, owner: user.id,
      base: { revision: library.revision, updatedAt: library.updatedAt, hash } };
    storage.setItem(CLOUD_META_KEY, JSON.stringify(next));
    metadata = next;
  };

  const showConflict = (library: CloudLibrary) => {
    remote = library;
    emit({ status: "conflict", conflict: library, revision: library.revision, updatedAt: library.updatedAt,
      cloudBoardCount: library.snapshot?.boards.length ?? 0,
      error: "本机与云端都有不同改动；两边都已保留。可先下载备份，或保留两份再同步。" });
  };

  const pull = async (user: CloudUser, library: CloudLibrary, local: CloudSnapshot, storage: BoardStorage) => {
    const snapshot = library.snapshot ?? EMPTY, hash = await snapshotHash(snapshot);
    const nextMetadata: CloudMetadata = { version: 1, owner: user.id,
      base: { revision: library.revision, updatedAt: library.updatedAt, hash } };
    const applied = applyLocalSnapshot(storage, local, snapshot, JSON.stringify(nextMetadata));
    if (!applied.ok) { fail(applied.error, storage.getItem(CLOUD_APPLY_JOURNAL_KEY) ? "recovery" : "error"); return; }
    metadata = nextMetadata;
    emit({ status: "synced", conflict: null, error: null, localBoardCount: snapshot.boards.length });
    options.onLocalChange?.("pull");
  };

  const push = async (user: CloudUser, library: CloudLibrary, snapshot: CloudSnapshot, storage: BoardStorage) => {
    // Persist ownership before a network write; a failed upload must not expose
    // this browser's library to the next signed-in account.
    if (!metadata) {
      metadata = { version: 1, owner: user.id, base: null };
      storage.setItem(CLOUD_META_KEY, JSON.stringify(metadata));
    }
    const response = await request("/api/library", { method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-RallyPath-Account": user.id },
      body: JSON.stringify({ expectedRevision: library.revision, snapshot }) });
    if (response.status === 409) {
      const conflict: unknown = await response.json();
      const current = typeof conflict === "object" && conflict !== null && "current" in conflict ? validateLibrary(conflict.current) : null;
      if (!current?.ok) throw new Error("云端版本或账号已经改变；请重新同步，未覆盖云端");
      showConflict(current.value);
      return;
    }
    if (response.status === 401) { signedOut(); throw new Error("登入已失效；请重新登入，本机画板仍然保留"); }
    if (response.status === 403) throw new Error("账号已改变或没有存取权限；未同步其他账号的资料");
    if (response.status === 413) throw new Error("画板超过云端容量；请下载本机备份，未覆盖云端");
    if (!response.ok) throw new Error("这次上传未完成；本机画板仍然保留，请重新同步");
    const saved = validateLibrary(await response.json());
    if (!saved.ok) throw new Error(saved.error);
    const hash = await snapshotHash(snapshot);
    if (saved.value.revision <= library.revision || await snapshotHash(saved.value.snapshot ?? EMPTY) !== hash) {
      throw new Error("云端没有确认相同的画板版本；请重试同步，本机资料仍保留");
    }
    remote = saved.value;
    recordBase(storage, user, saved.value, hash);
    const latest = captureLocalSnapshot(storage);
    emit({ status: latest.ok && await snapshotHash(latest.value) === hash ? "synced" : "ready", conflict: null, error: null,
      revision: saved.value.revision, updatedAt: saved.value.updatedAt, cloudBoardCount: saved.value.snapshot?.boards.length ?? 0,
      localBoardCount: latest.ok ? latest.value.boards.length : snapshot.boards.length });
  };

  const reconcile = async (user: CloudUser, library: CloudLibrary, allowPush: boolean) => {
    const local = guard();
    if (!local) return;
    const localHash = await snapshotHash(local.snapshot), cloudHash = await snapshotHash(library.snapshot ?? EMPTY);
    const base = local.metadata?.base;
    if (base && library.revision < base.revision) throw new Error("云端版本比上次同步旧；请先保留备份，未覆盖任何资料");
    if (base && library.revision === base.revision && cloudHash !== base.hash) throw new Error("云端版本内容与记录不同；未覆盖任何画板");
    if (localHash === cloudHash) {
      recordBase(local.storage, user, library, cloudHash);
      emit({ status: "synced", conflict: null, error: null });
      return;
    }
    if (!base) {
      if (!local.snapshot.boards.length) { await pull(user, library, local.snapshot, local.storage); return; }
      if (!(library.snapshot?.boards.length) && library.revision === 0) {
        if (allowPush) await push(user, library, local.snapshot, local.storage);
        else emit({ status: "ready", error: null, conflict: null });
        return;
      }
      showConflict(library);
      return;
    }
    if (localHash === base.hash) { await pull(user, library, local.snapshot, local.storage); return; }
    if (library.revision === base.revision && cloudHash === base.hash) {
      if (allowPush) await push(user, library, local.snapshot, local.storage);
      else emit({ status: "ready", error: null, conflict: null });
      return;
    }
    showConflict(library);
  };

  const perform = async (task: () => Promise<void>) => {
    if (running) return;
    running = true;
    changedDuringRun = false;
    try {
      const execute = async () => {
        emit({ status: "syncing", error: null });
        await task();
      };
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request("rallypath-cloud-library", execute);
      else await execute();
    } catch (error) {
      fail(error instanceof Error ? error.message : "同步暂时无法完成；本机画板仍然保留",
        state.user === null && state.status === "signed-out" ? "signed-out" : "error");
    } finally {
      running = false;
      if (changedDuringRun && state.status === "synced") emit({ status: "ready" });
    }
  };

  return {
    getState: () => state,
    subscribe(listener: (next: CloudSyncState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refreshAccount() {
      await perform(async () => {
        const user = await loadAccount();
        if (!user || !guard()) return;
        await reconcile(user, await loadRemote(user), false);
      });
    },
    async syncNow() {
      await perform(async () => {
        const user = await loadAccount();
        if (!user || !guard()) return;
        await reconcile(user, await loadRemote(user), true);
      });
    },
    markLocalChanged() {
      if (running) { changedDuringRun = true; return; }
      if (!target.ok) return;
      const local = guard();
      if (local && state.user && state.status !== "conflict") emit({ status: "ready" });
    },
    async keepBoth() {
      await perform(async () => {
        const user = await loadAccount();
        if (!user) return;
        const local = guard();
        if (!local) return;
        const library = await loadRemote(user);
        const merged = retainBothSnapshots(local.snapshot, library.snapshot ?? EMPTY);
        if (!merged.ok) { fail(merged.error); return; }
        const nextMetadata: CloudMetadata = { version: 1, owner: user.id,
          base: { revision: library.revision, updatedAt: library.updatedAt, hash: await snapshotHash(library.snapshot ?? EMPTY) } };
        const applied = applyLocalSnapshot(local.storage, local.snapshot, merged.value, JSON.stringify(nextMetadata));
        if (!applied.ok) { fail(applied.error, local.storage.getItem(CLOUD_APPLY_JOURNAL_KEY) ? "recovery" : "error"); return; }
        metadata = nextMetadata;
        emit({ localBoardCount: merged.value.boards.length, conflict: null });
        options.onLocalChange?.("keep-both");
        await push(user, library, merged.value, local.storage);
      });
    },
    async recoverLocal() {
      await perform(async () => {
        if (!target.ok) { fail(target.error); return; }
        const recovered = recoverCloudApply(target.value);
        if (!recovered.ok) { fail(recovered.error, "recovery"); return; }
        options.onLocalChange?.("recover");
        const local = guard();
        if (local) emit({ status: state.user ? "ready" : "signed-out", error: null });
      });
    },
    async importLocalBackup(serialized: string): Promise<BoardResult<void>> {
      let result: BoardResult<void> = { ok: false, error: "同步正在进行，请稍后再导入备份" };
      const previousState = state, previousStatus = state.status;
      const rejectImport = (error: string) => {
        result = { ok: false, error };
        // A bad file is recoverable in the import UI; it must not replace the
        // existing sign-in or synchronization state.
        emit({ status: previousStatus, error: previousState.error });
      };
      await perform(async () => {
        const local = guard();
        if (!local) { result = { ok: false, error: state.error ?? "本机资料尚未准备好，请稍后再导入" }; return; }
        if (typeof serialized !== "string" || new TextEncoder().encode(serialized).byteLength > CLOUD_BACKUP_MAX_BYTES) {
          rejectImport("备份超过 8 MB；未导入任何画板"); return;
        }
        let value: unknown;
        try { value = JSON.parse(serialized); }
        catch { rejectImport("备份不是有效的 JSON；未导入任何画板"); return; }
        let snapshot: BoardResult<CloudSnapshot>;
        if (typeof value === "object" && value !== null && "kind" in value && value.kind === "rallypath-library-backup") {
          if (!("version" in value) || value.version !== 1 || !("snapshot" in value)) {
            rejectImport("不支持这份画板库备份的版本"); return;
          }
          snapshot = validateCloudSnapshot(value.snapshot);
        } else {
          const individual = parseBoardBackupJSON(serialized);
          snapshot = individual.ok ? validateCloudSnapshot({ version: 1,
            boards: [{ kind: "rallypath-board-backup", version: 2, ...individual.value }] }) : individual;
        }
        if (!snapshot.ok) { rejectImport(snapshot.error); return; }
        const merged = retainBothSnapshots(local.snapshot, snapshot.value, "备份副本");
        if (!merged.ok) { rejectImport(merged.error); return; }
        const applied = applyLocalSnapshot(local.storage, local.snapshot, merged.value, local.storage.getItem(CLOUD_META_KEY));
        if (!applied.ok) {
          result = applied;
          if (local.storage.getItem(CLOUD_APPLY_JOURNAL_KEY)) fail(applied.error, "recovery");
          else rejectImport(applied.error);
          return;
        }
        result = { ok: true, value: undefined };
        emit({ status: previousStatus === "conflict" ? "conflict" : state.user ? "ready" : "signed-out",
          localBoardCount: merged.value.boards.length, error: previousStatus === "conflict" ? previousState.error : null });
        options.onLocalChange?.("import");
      });
      return result;
    },
    localBackup(): BoardResult<string> {
      if (!target.ok) return target;
      const pending = pendingLocalRecovery(target.value);
      if (!pending.ok || pending.value) return localRawBackup(target.value);
      const local = captureLocalSnapshot(target.value);
      if (!local.ok) return localRawBackup(target.value);
      return createLibraryBackupJSON(local.value);
    },
    cloudBackup(): BoardResult<string> {
      if (!state.user || !remote) return { ok: false, error: "尚未读取云端画板，请先确认登入并同步" };
      return createLibraryBackupJSON(remote.snapshot ?? EMPTY, { revision: remote.revision, updatedAt: remote.updatedAt });
    },
  };
}
