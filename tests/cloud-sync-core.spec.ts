import { expect, test } from "@playwright/test";
import { createStarterBoard, setPath, updatePath, type BoardDocument } from "../src/board/model";
import { BOARD_STORAGE_KEY, deleteBoard, saveBoard, type BoardStorage } from "../src/board/storage";
import { type BoardResult } from "../src/board/validate";
import { BOARD_ALTERNATIVES_STORAGE_KEY, createAlternativeDraft } from "../src/learning/alternative";
import { BOARD_COPY_JOURNAL_KEY } from "../src/learning/copyJournal";
import { BOARD_DELETE_JOURNAL_KEY } from "../src/learning/deleteJournal";
import { BOARD_DISCOVERY_STORAGE_KEY } from "../src/learning/discovery";
import { BOARD_FOLLOW_UP_STORAGE_KEY } from "../src/learning/followUp";
import { BOARD_IMPORT_JOURNAL_KEY } from "../src/learning/importJournal";
import { BOARD_LEARNING_STORAGE_KEY, type BoardBackupPackage } from "../src/learning/storage";
import { CLOUD_APPLY_JOURNAL_KEY, CLOUD_META_KEY, applyLocalSnapshot, captureLocalSnapshot,
  recoverCloudApply, retainBothSnapshots } from "../src/cloud/local";
import { CLOUD_BACKUP_MAX_BYTES, CLOUD_MAX_BYTES, canonicalSnapshot, createLibraryBackupJSON,
  snapshotHash, validateCloudSnapshot, type CloudSnapshot } from "../src/cloud/snapshot";
import { createCloudSyncClient, type CloudLibrary, type CloudUser } from "../src/cloud/sync";

const DATE = "2026-09-30T12:00:00.000Z";
const ALICE: CloudUser = { id: "alice", email: "alice@example.test" };
const BOB: CloudUser = { id: "bob", email: "bob@example.test" };
const EMPTY: CloudSnapshot = { version: 1, boards: [] };

function value<T>(result: BoardResult<T>): T {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

class MemoryStorage implements BoardStorage {
  values = new Map<string, string>();
  beforeRead?: (key: string) => void;
  beforeWrite?: (key: string, raw: string | null) => void;
  getItem(key: string) {
    this.beforeRead?.(key);
    return this.values.get(key) ?? null;
  }
  setItem(key: string, raw: string) {
    this.beforeWrite?.(key, raw);
    this.values.set(key, raw);
  }
  removeItem(key: string) {
    this.beforeWrite?.(key, null);
    this.values.delete(key);
  }
  raw() { return Object.fromEntries(this.values); }
}

type Upload = { expectedRevision: number; snapshot: CloudSnapshot };
class MemoryAPI {
  user: CloudUser | null = ALICE;
  library: CloudLibrary = { revision: 0, updatedAt: null, snapshot: null };
  puts: Upload[] = [];
  reads = 0;
  failNextPut = false;
  libraryStatus = 200;
  beforePut?: () => Promise<void> | void;
  beforeGet?: () => Promise<void> | void;
  respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }
  fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === "/api/account") return this.respond({ user: this.user }, this.user ? 200 : 401);
    if (url !== "/api/library") throw new Error(`Unexpected request: ${url}`);
    expect(new Headers(init?.headers).get("X-RallyPath-Account")).toBe(this.user?.id);
    if (init?.method !== "PUT") {
      this.reads++;
      await this.beforeGet?.();
      return this.respond(this.library, this.libraryStatus);
    }
    const upload = JSON.parse(String(init.body)) as Upload;
    this.puts.push(structuredClone(upload));
    await this.beforePut?.();
    if (this.failNextPut) { this.failNextPut = false; throw new Error("network disconnected"); }
    if (upload.expectedRevision !== this.library.revision) return this.respond({ current: this.library }, 409);
    this.library = { revision: this.library.revision + 1, updatedAt: DATE, snapshot: structuredClone(upload.snapshot) };
    return this.respond(this.library);
  }) as typeof fetch;
  advance(snapshot: CloudSnapshot) {
    this.library = { revision: this.library.revision + 1, updatedAt: DATE, snapshot: structuredClone(snapshot) };
  }
}

function board(id = "board-1", title = "发球计划"): BoardDocument {
  const starter = { ...createStarterBoard(title), id, smartRally: undefined, createdAt: DATE, updatedAt: DATE };
  const ball = starter.actors.find(actor => actor.kind === "ball")!;
  return { ...setPath(starter, 0, { id: "shot-1", kind: "shot", actorId: ball.id,
    from: starter.frames[0].poses[ball.id], to: [.7, .2], control: [.8, .55] }), updatedAt: DATE };
}

function snapshot(...boards: BoardDocument[]): CloudSnapshot {
  return value(validateCloudSnapshot({ version: 1, boards: boards.map(item => ({
    kind: "rallypath-board-backup", version: 2, board: item,
  })) }));
}

function seeded(...boards: BoardDocument[]) {
  const storage = new MemoryStorage();
  for (const item of boards) value(saveBoard(item, storage));
  return storage;
}

function linkedSnapshot(): CloudSnapshot {
  const source = board();
  const draft = value(createAlternativeDraft(source, source.frames[0].id, "serve-wide"));
  const alternative = { ...draft, board: updatePath(draft.board, 0, "shot-1", { to: [.25, .3] }) };
  const backup: BoardBackupPackage = { kind: "rallypath-board-backup", version: 2, board: source,
    learning: { version: 1, boardId: source.id, route: "skill", skillId: "serve-placement", updatedAt: DATE },
    followUp: { version: 1, id: "follow-up-1", boardId: source.id, frameId: source.frames[0].id,
      progress: .4, skillId: "serve-placement", skillLabel: "发球落点", question: "落点在哪里？",
      note: "继续练习落点", uncertain: false, createdAt: DATE, updatedAt: DATE },
    discovery: { version: 1, id: "discovery-1", boardId: source.id, frameId: source.frames[0].id,
      progress: .7, note: "对手靠后", nextTry: "短球", uncertain: false, createdAt: DATE, updatedAt: DATE },
    alternative,
  };
  return value(validateCloudSnapshot({ version: 1, boards: [backup] }));
}

test("refresh preserves existing unsynced drafts until the user explicitly uploads", async () => {
  const storage = seeded(board()), before = storage.raw(), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  expect(client.getState()).toMatchObject({ status: "ready", localBoardCount: 1, cloudBoardCount: 0, canAutoSync: false });
  expect(api.puts).toHaveLength(0);
  expect(storage.raw()).toEqual(before);
  await client.syncNow();
  expect(api.puts).toHaveLength(1);
  expect(api.puts[0].expectedRevision).toBe(0);
  expect(api.puts[0].snapshot).toEqual(value(captureLocalSnapshot(storage)));
  expect(client.getState()).toMatchObject({ status: "synced", revision: 1, canAutoSync: true });
  expect(JSON.parse(storage.getItem(CLOUD_META_KEY)!)).toMatchObject({ owner: ALICE.id, base: { revision: 1 } });
});

test("an empty device pulls complete linked editable backups without uploading", async () => {
  const storage = new MemoryStorage(), api = new MemoryAPI();
  api.advance(linkedSnapshot());
  let localChanges = 0;
  const client = createCloudSyncClient({ storage, fetch: api.fetch, onLocalChange: () => { localChanges++; } });
  await client.refreshAccount();
  expect(client.getState()).toMatchObject({ status: "synced", revision: 1, localBoardCount: 1 });
  expect(value(captureLocalSnapshot(storage))).toEqual(api.library.snapshot);
  expect(api.puts).toHaveLength(0);
  expect(localChanges).toBe(1);
  expect(storage.getItem(CLOUD_APPLY_JOURNAL_KEY)).toBeNull();
});

test("network failure preserves the raw draft and fixes ownership before retrying a CAS upload", async () => {
  const original = board(), storage = seeded(original), api = new MemoryAPI();
  const raw = storage.getItem(BOARD_STORAGE_KEY);
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  api.failNextPut = true;
  await client.syncNow();
  expect(client.getState().status).toBe("error");
  expect(storage.getItem(BOARD_STORAGE_KEY)).toBe(raw);
  expect(JSON.parse(storage.getItem(CLOUD_META_KEY)!)).toEqual({ version: 1, owner: ALICE.id, base: null });
  expect(api.library.revision).toBe(0);
  await client.syncNow();
  expect(client.getState().status).toBe("synced");
  expect(api.puts.map(item => item.expectedRevision)).toEqual([0, 0]);
});

test("two devices editing the same base preserve both drafts and do not overwrite the newer cloud revision", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const left = new MemoryStorage(), right = new MemoryStorage();
  const a = createCloudSyncClient({ storage: left, fetch: api.fetch });
  const b = createCloudSyncClient({ storage: right, fetch: api.fetch });
  await a.refreshAccount();
  await b.refreshAccount();
  value(saveBoard({ ...original, title: "设备 A 的改动" }, left));
  value(saveBoard({ ...original, title: "设备 B 的改动" }, right));
  await a.syncNow();
  const cloud = structuredClone(api.library), rightRaw = right.raw();
  await b.syncNow();
  expect(b.getState()).toMatchObject({ status: "conflict", revision: 2 });
  expect(api.library).toEqual(cloud);
  expect(api.puts).toHaveLength(1);
  expect(right.raw()).toEqual(rightRaw);
});

test("a write race returns a 409 conflict and preserves the latest remote library", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const storage = new MemoryStorage(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  value(saveBoard({ ...original, title: "本机改动" }, storage));
  const raw = storage.raw(), competing = snapshot({ ...original, title: "另一台设备改动" });
  api.beforePut = () => { api.advance(competing); };
  await client.syncNow();
  expect(api.puts[0].expectedRevision).toBe(1);
  expect(client.getState()).toMatchObject({ status: "conflict", revision: 2 });
  expect(api.library.snapshot).toEqual(competing);
  expect(storage.raw()).toEqual(raw);
});

test("a remote deletion removes the unmodified local copy without resurrecting it", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const storage = new MemoryStorage(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  api.advance(EMPTY);
  await client.syncNow();
  expect(value(captureLocalSnapshot(storage))).toEqual(EMPTY);
  expect(api.puts).toHaveLength(0);
  expect(client.getState()).toMatchObject({ status: "synced", revision: 2, localBoardCount: 0 });
});

test("a stale local edit conflicts with a cloud deletion instead of resurrecting the deleted board", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const storage = new MemoryStorage(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  value(saveBoard({ ...original, title: "离线改动" }, storage));
  const raw = storage.raw();
  api.advance(EMPTY);
  await client.syncNow();
  expect(client.getState().status).toBe("conflict");
  expect(storage.raw()).toEqual(raw);
  expect(api.library.snapshot).toEqual(EMPTY);
  expect(api.puts).toHaveLength(0);
});

test("a local deletion uploads the empty library and an old unchanged device then observes that deletion", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const first = new MemoryStorage(), second = new MemoryStorage();
  const a = createCloudSyncClient({ storage: first, fetch: api.fetch });
  const b = createCloudSyncClient({ storage: second, fetch: api.fetch });
  await a.refreshAccount();
  await b.refreshAccount();
  value(deleteBoard(original.id, first));
  await a.syncNow();
  expect(api.library.snapshot).toEqual(EMPTY);
  expect(api.puts[0]).toMatchObject({ expectedRevision: 1, snapshot: EMPTY });
  await b.syncNow();
  expect(value(captureLocalSnapshot(second))).toEqual(EMPTY);
  expect(api.puts).toHaveLength(1);
});

for (const journal of [BOARD_IMPORT_JOURNAL_KEY, BOARD_DELETE_JOURNAL_KEY, BOARD_COPY_JOURNAL_KEY, CLOUD_APPLY_JOURNAL_KEY]) {
  test(`pending recovery blocks network library access and all draft writes: ${journal}`, async () => {
    const storage = seeded(board()), api = new MemoryAPI();
    storage.setItem(journal, '{"interrupted":true}');
    const raw = storage.raw(), client = createCloudSyncClient({ storage, fetch: api.fetch });
    await client.syncNow();
    expect(client.getState().status).toBe("recovery");
    expect(api.reads).toBe(0);
    expect(api.puts).toHaveLength(0);
    expect(storage.raw()).toEqual(raw);
    const backup = JSON.parse(value(client.localBackup()));
    expect(backup.kind).toBe("rallypath-local-recovery");
    expect(backup.raw[journal]).toBe(raw[journal]);
  });
}

for (const corruptKey of [BOARD_STORAGE_KEY, BOARD_LEARNING_STORAGE_KEY, BOARD_FOLLOW_UP_STORAGE_KEY,
  BOARD_DISCOVERY_STORAGE_KEY, BOARD_ALTERNATIVES_STORAGE_KEY]) {
  test(`corrupted storage remains byte-identical and can be exported as a raw recovery backup: ${corruptKey}`, async () => {
    const storage = seeded(board()), api = new MemoryAPI();
    storage.setItem(corruptKey, "{broken original bytes\n");
    const before = storage.raw(), client = createCloudSyncClient({ storage, fetch: api.fetch });
    await client.syncNow();
    expect(client.getState().status).toBe("error");
    expect(api.reads).toBe(0);
    expect(api.puts).toHaveLength(0);
    expect(storage.raw()).toEqual(before);
    const backup = JSON.parse(value(client.localBackup()));
    expect(backup.kind).toBe("rallypath-local-recovery");
    expect(backup.raw[corruptKey]).toBe(before[corruptKey]);
  });
}

test("a different signed-in account cannot upload the previous owner's drafts or export its cloud cache", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.syncNow();
  expect(client.cloudBackup().ok).toBe(true);
  const raw = storage.raw(), writes = api.puts.length;
  api.user = BOB;
  api.library = { revision: 0, snapshot: null, updatedAt: null };
  await client.refreshAccount();
  await client.syncNow();
  expect(client.getState()).toMatchObject({ status: "account-mismatch", user: BOB, canAutoSync: false });
  expect(api.puts).toHaveLength(writes);
  expect(storage.raw()).toEqual(raw);
  expect(client.cloudBackup().ok).toBe(false);
});

test("failed first upload still blocks a later account from inheriting the local drafts", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  api.failNextPut = true;
  await client.syncNow();
  const raw = storage.raw();
  api.user = BOB;
  await client.syncNow();
  expect(client.getState().status).toBe("account-mismatch");
  expect(api.puts).toHaveLength(1);
  expect(storage.raw()).toEqual(raw);
});

test("session expiry during library access clears access to the cached cloud backup", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.syncNow();
  expect(client.cloudBackup().ok).toBe(true);
  api.libraryStatus = 401;
  await client.refreshAccount();
  expect(client.getState()).toMatchObject({ status: "signed-out", user: null, canAutoSync: false });
  expect(client.cloudBackup().ok).toBe(false);
});

test("keeping both remaps every linked board and alternative ID while preserving frame and actor references", () => {
  const remote = linkedSnapshot(), merged = value(retainBothSnapshots(remote, remote));
  expect(merged).toEqual(remote);
  const local = snapshot({ ...remote.boards[0].board, title: "本机版本" });
  const both = value(retainBothSnapshots(local, remote));
  const copy = both.boards.find(item => item.board.id !== local.boards[0].board.id)!;
  expect(both.boards).toHaveLength(2);
  expect(copy.board.id).not.toBe(remote.boards[0].board.id);
  expect(copy.board.title).toContain("云端副本");
  expect(copy.learning!.boardId).toBe(copy.board.id);
  expect(copy.followUp!.boardId).toBe(copy.board.id);
  expect(copy.discovery!.boardId).toBe(copy.board.id);
  expect(copy.followUp!.id).not.toBe(remote.boards[0].followUp!.id);
  expect(copy.discovery!.id).not.toBe(remote.boards[0].discovery!.id);
  expect(copy.alternative!.sourceBoardId).toBe(copy.board.id);
  expect(copy.alternative!.sourceSnapshot.id).toBe(copy.board.id);
  expect(copy.alternative!.id).toBe(copy.alternative!.board.id);
  expect(copy.alternative!.id).not.toBe(remote.boards[0].alternative!.id);
  expect(copy.board.actors).toEqual(remote.boards[0].board.actors);
  expect(copy.board.frames).toEqual(remote.boards[0].board.frames);
  expect(copy.followUp!.frameId).toBe(copy.board.frames[0].id);
  expect(copy.discovery!.frameId).toBe(copy.board.frames[0].id);
  expect(copy.alternative!.startFrameId).toBe(copy.board.frames[0].id);
});

test("quota failure midway through a pull restores every raw envelope and clears its journal", () => {
  const original = board(), storage = seeded(original), before = storage.raw();
  const expected = value(captureLocalSnapshot(storage));
  let failed = false;
  storage.beforeWrite = key => {
    if (key === BOARD_LEARNING_STORAGE_KEY && !failed) { failed = true; throw new Error("quota full"); }
  };
  const applied = applyLocalSnapshot(storage, expected, linkedSnapshot(), '{"newMetadata":true}');
  expect(applied.ok).toBe(false);
  expect(failed).toBe(true);
  expect(storage.raw()).toEqual(before);
  expect(storage.getItem(CLOUD_APPLY_JOURNAL_KEY)).toBeNull();
});

test("a failed rollback retains its journal, blocks synchronization, and recovers when storage becomes writable", async () => {
  const original = board(), storage = seeded(original), originalRaw = storage.raw();
  const next = linkedSnapshot();
  next.boards[0].board.title = "云端的新版本";
  let blocked = false;
  storage.beforeWrite = key => {
    if (key === BOARD_LEARNING_STORAGE_KEY) blocked = true;
    if (blocked) throw new Error("quota and rollback blocked");
  };
  const applied = applyLocalSnapshot(storage, value(captureLocalSnapshot(storage)), next, '{"newMetadata":true}');
  expect(applied.ok).toBe(false);
  expect(storage.getItem(CLOUD_APPLY_JOURNAL_KEY)).not.toBeNull();
  const api = new MemoryAPI(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  const failedRaw = storage.raw();
  await client.syncNow();
  expect(client.getState().status).toBe("recovery");
  expect(api.reads).toBe(0);
  expect(storage.raw()).toEqual(failedRaw);
  storage.beforeWrite = undefined;
  value(recoverCloudApply(storage));
  expect(storage.raw()).toEqual(originalRaw);
});

test("journal recovery refuses to overwrite an edit made after the interrupted cloud transaction", () => {
  const storage = seeded(board()), oldRaw = storage.getItem(BOARD_STORAGE_KEY)!;
  const cloudRaw = JSON.stringify({ version: 1, boards: [board("board-1", "云端版本")] });
  const laterRaw = JSON.stringify({ version: 1, boards: [board("board-1", "后续本机修改")] });
  storage.setItem(CLOUD_APPLY_JOURNAL_KEY, JSON.stringify({ version: 1, changes: [
    { key: BOARD_STORAGE_KEY, before: oldRaw, after: cloudRaw },
  ] }));
  storage.setItem(BOARD_STORAGE_KEY, laterRaw);
  const before = storage.raw();
  expect(recoverCloudApply(storage).ok).toBe(false);
  expect(storage.raw()).toEqual(before);
});

test("local edits during a network read are preserved and remain eligible for the next CAS upload", async () => {
  const original = board(), api = new MemoryAPI();
  api.advance(snapshot(original));
  const storage = new MemoryStorage(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  api.beforeGet = () => { value(saveBoard({ ...original, title: "读取期间的修改" }, storage)); };
  await client.refreshAccount();
  expect(client.getState().status).toBe("ready");
  expect(value(captureLocalSnapshot(storage)).boards[0].board.title).toBe("读取期间的修改");
  expect(api.puts).toHaveLength(0);
});

test("snapshot validation rejects duplicate IDs and mismatched linked records without changing input", async () => {
  const valid = snapshot(board());
  const duplicate = { ...valid, boards: [valid.boards[0], valid.boards[0]] };
  expect(validateCloudSnapshot(duplicate).ok).toBe(false);
  const linked = linkedSnapshot();
  linked.boards[0].learning!.boardId = "wrong-board";
  const before = JSON.stringify(linked);
  expect(validateCloudSnapshot(linked).ok).toBe(false);
  expect(JSON.stringify(linked)).toBe(before);
  const reordered = { boards: valid.boards, version: 1 as const };
  expect(canonicalSnapshot(valid)).toBe(canonicalSnapshot(reordered));
  expect(await snapshotHash(valid)).toBe(await snapshotHash(reordered));
});

test("a first-time local library conflicts with a previously deleted cloud library rather than restoring it", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  api.advance(EMPTY);
  const raw = storage.raw(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  await client.syncNow();
  expect(client.getState()).toMatchObject({ status: "conflict", revision: 1, cloudBoardCount: 0 });
  expect(storage.raw()).toEqual(raw);
  expect(api.puts).toHaveLength(0);
});

test("an edit between the immutable before-image capture and journal creation is never adopted or overwritten", () => {
  const storage = seeded(board()), expected = value(captureLocalSnapshot(storage));
  const newerRaw = JSON.stringify({ version: 1, boards: [board("board-1", "另一页的最新版本")] });
  let reads = 0;
  storage.beforeRead = key => {
    if (key === BOARD_STORAGE_KEY && ++reads === 2) storage.values.set(BOARD_STORAGE_KEY, newerRaw);
  };
  const applied = applyLocalSnapshot(storage, expected, snapshot(board("board-1", "云端版本")), '{"newMetadata":true}');
  expect(applied.ok).toBe(false);
  expect(storage.getItem(BOARD_STORAGE_KEY)).toBe(newerRaw);
  expect(storage.getItem(CLOUD_APPLY_JOURNAL_KEY)).toBeNull();
  expect(storage.getItem(CLOUD_META_KEY)).toBeNull();
});

test("an unsaved local-change notification during an upload keeps the client ready for the next edit", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  api.beforePut = () => { client.markLocalChanged(); };
  await client.syncNow();
  expect(client.getState()).toMatchObject({ status: "ready", revision: 1, canAutoSync: true });
  api.beforePut = undefined;
  await client.syncNow();
  expect(client.getState().status).toBe("synced");
  expect(api.puts).toHaveLength(1);
});

test("an edit saved while the upload is in flight remains local and uploads against the acknowledged revision next", async () => {
  const original = board(), storage = seeded(original), api = new MemoryAPI();
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  api.beforePut = () => {
    value(saveBoard({ ...original, title: "上传期间的新改动" }, storage));
    client.markLocalChanged();
  };
  await client.syncNow();
  expect(client.getState()).toMatchObject({ status: "ready", revision: 1 });
  expect(api.library.snapshot!.boards[0].board.title).toBe(original.title);
  expect(value(captureLocalSnapshot(storage)).boards[0].board.title).toBe("上传期间的新改动");
  api.beforePut = undefined;
  await client.syncNow();
  expect(api.puts.map(item => item.expectedRevision)).toEqual([0, 1]);
  expect(api.library.snapshot!.boards[0].board.title).toBe("上传期间的新改动");
  expect(client.getState().status).toBe("synced");
});

test("an older cloud revision is rejected even when its contents match the local library", async () => {
  const api = new MemoryAPI(), storage = new MemoryStorage();
  api.advance(snapshot(board()));
  api.advance(snapshot(board("board-1", "当前云端版本")));
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  const raw = storage.raw();
  api.library.revision = 1;
  await client.refreshAccount();
  expect(client.getState().status).toBe("error");
  expect(storage.raw()).toEqual(raw);
  expect(api.puts).toHaveLength(0);
});

test("changed contents at the same cloud revision are rejected without changing local data", async () => {
  const api = new MemoryAPI(), storage = new MemoryStorage();
  api.advance(snapshot(board()));
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  const raw = storage.raw();
  api.library.snapshot = snapshot(board("board-1", "无新版本号的改动"));
  await client.syncNow();
  expect(client.getState().status).toBe("error");
  expect(storage.raw()).toEqual(raw);
  expect(api.puts).toHaveLength(0);
});

test("failure to persist the before-image journal leaves every original byte untouched", () => {
  const storage = seeded(board()), expected = value(captureLocalSnapshot(storage)), raw = storage.raw();
  storage.beforeWrite = key => { if (key === CLOUD_APPLY_JOURNAL_KEY) throw new Error("journal exceeds quota"); };
  const result = applyLocalSnapshot(storage, expected, linkedSnapshot(), '{"newMetadata":true}');
  expect(result.ok).toBe(false);
  expect(storage.raw()).toEqual(raw);
});

test("orphaned but otherwise valid linked records block upload and remain available in the raw backup", async () => {
  const storage = seeded(board()), api = new MemoryAPI();
  storage.setItem(BOARD_LEARNING_STORAGE_KEY, JSON.stringify({ version: 1, records: [{
    version: 1, boardId: "deleted-board", route: "skill", skillId: "serve-placement", updatedAt: DATE,
  }] }));
  const raw = storage.raw(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.syncNow();
  expect(client.getState().status).toBe("error");
  expect(api.puts).toHaveLength(0);
  expect(api.reads).toBe(0);
  expect(storage.raw()).toEqual(raw);
  const backup = JSON.parse(value(client.localBackup()));
  expect(backup.raw[BOARD_LEARNING_STORAGE_KEY]).toBe(raw[BOARD_LEARNING_STORAGE_KEY]);
});

test("a downloaded library restores all linked content into a fresh anonymous browser without API writes", async () => {
  const api = new MemoryAPI(), source = new MemoryStorage();
  api.advance(linkedSnapshot());
  const original = createCloudSyncClient({ storage: source, fetch: api.fetch });
  await original.refreshAccount();
  const exported = value(original.localBackup());
  const target = new MemoryStorage();
  api.user = null;
  let changes = 0;
  const restored = createCloudSyncClient({ storage: target, fetch: api.fetch, onLocalChange: () => { changes++; } });
  await restored.refreshAccount();
  const reads = api.reads;
  value(await restored.importLocalBackup(exported));
  const incoming = value(captureLocalSnapshot(target)).boards[0], existing = value(captureLocalSnapshot(source)).boards[0];
  expect(restored.getState()).toMatchObject({ status: "signed-out", localBoardCount: 1 });
  expect(incoming.board.id).not.toBe(existing.board.id);
  expect(incoming.board.title).toContain("备份副本");
  expect(incoming.learning!.boardId).toBe(incoming.board.id);
  expect(incoming.followUp!.boardId).toBe(incoming.board.id);
  expect(incoming.discovery!.boardId).toBe(incoming.board.id);
  expect(incoming.alternative!.sourceBoardId).toBe(incoming.board.id);
  expect(incoming.alternative!.sourceSnapshot.id).toBe(incoming.board.id);
  expect(incoming.alternative!.id).toBe(incoming.alternative!.board.id);
  expect(incoming.board.frames).toEqual(existing.board.frames);
  expect(incoming.learning!.skillId).toBe(existing.learning!.skillId);
  expect(incoming.followUp!.note).toBe(existing.followUp!.note);
  expect(incoming.discovery!.nextTry).toBe(existing.discovery!.nextTry);
  expect(api.reads).toBe(reads);
  expect(api.puts).toHaveLength(0);
  expect(changes).toBe(1);
  expect(target.getItem(CLOUD_META_KEY)).toBeNull();
});

test("a legacy old-site board JSON imports alongside existing drafts and remains fully editable", async () => {
  const existing = board("local-board", "本机已有画板"), legacy = board("old-site-board", "旧站画板");
  const storage = seeded(existing), api = new MemoryAPI();
  const baseline = value(captureLocalSnapshot(storage)).boards[0].board;
  api.user = null;
  const client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.refreshAccount();
  value(await client.importLocalBackup(JSON.stringify(legacy)));
  const restored = value(captureLocalSnapshot(storage));
  expect(restored.boards).toHaveLength(2);
  expect(restored.boards.find(item => item.board.id === existing.id)!.board).toEqual(baseline);
  const copy = restored.boards.find(item => item.board.id !== existing.id)!.board;
  expect(copy.id).not.toBe(legacy.id);
  expect(copy.frames).toEqual(legacy.frames);
  value(saveBoard({ ...copy, title: "导入后修改" }, storage));
  expect(value(captureLocalSnapshot(storage)).boards.find(item => item.board.id === copy.id)!.board.title).toBe("导入后修改");
  expect(api.puts).toHaveLength(0);
});

test("a v2 individual backup imports linked content without replacing an existing board with the same ID", async () => {
  const incoming = linkedSnapshot(), existing = { ...incoming.boards[0].board, title: "同 ID 的本机改动" };
  const storage = seeded(existing), api = new MemoryAPI(), client = createCloudSyncClient({ storage, fetch: api.fetch });
  const baseline = value(captureLocalSnapshot(storage)).boards[0].board;
  value(await client.importLocalBackup(JSON.stringify(incoming.boards[0])));
  const restored = value(captureLocalSnapshot(storage));
  expect(restored.boards).toHaveLength(2);
  expect(restored.boards.find(item => item.board.id === existing.id)!.board).toEqual(baseline);
  const imported = restored.boards.find(item => item.board.id !== existing.id)!;
  expect(imported.learning!.boardId).toBe(imported.board.id);
  expect(imported.alternative!.sourceBoardId).toBe(imported.board.id);
  expect(api.reads).toBe(0);
  expect(api.puts).toHaveLength(0);
});

for (const [label, serialized] of [
  ["malformed JSON", "{broken"],
  ["unsupported library version", JSON.stringify({ kind: "rallypath-library-backup", version: 2, snapshot: EMPTY })],
  ["invalid linked record", JSON.stringify({ kind: "rallypath-library-backup", version: 1, snapshot: {
    version: 1, boards: [{ kind: "rallypath-board-backup", version: 2, board: board(),
      learning: { version: 1, boardId: "wrong-board", route: "skill", skillId: "serve-placement", updatedAt: DATE } }],
  } })],
] as const) {
  test(`invalid imported backups preserve every original byte: ${label}`, async () => {
    const storage = seeded(board()), raw = storage.raw(), api = new MemoryAPI();
    const client = createCloudSyncClient({ storage, fetch: api.fetch });
    expect((await client.importLocalBackup(serialized)).ok).toBe(false);
    expect(storage.raw()).toEqual(raw);
    expect(api.reads).toBe(0);
    expect(api.puts).toHaveLength(0);
  });
}

test("backup import respects pending recovery and prevents additions to another account's browser library", async () => {
  const api = new MemoryAPI(), storage = seeded(board()), client = createCloudSyncClient({ storage, fetch: api.fetch });
  await client.syncNow();
  const serialized = JSON.stringify(board("import-board", "准备导入"));
  storage.setItem(BOARD_IMPORT_JOURNAL_KEY, '{"pending":true}');
  const pending = storage.raw();
  expect((await client.importLocalBackup(serialized)).ok).toBe(false);
  expect(client.getState().status).toBe("recovery");
  expect(storage.raw()).toEqual(pending);
  storage.removeItem(BOARD_IMPORT_JOURNAL_KEY);
  api.user = BOB;
  await client.refreshAccount();
  const otherOwner = storage.raw(), puts = api.puts.length;
  expect((await client.importLocalBackup(serialized)).ok).toBe(false);
  expect(client.getState().status).toBe("account-mismatch");
  expect(storage.raw()).toEqual(otherOwner);
  expect(api.puts).toHaveLength(puts);
});

test("large editable libraries use a compact download that restores into a fresh anonymous browser", async () => {
  const boards = Array.from({ length: 6 }, (_, boardIndex) => {
    const original = board(`large-${boardIndex}`);
    return { ...original, frames: Array.from({ length: 60 }, (_, frameIndex) => ({
      ...original.frames[0], id: `frame-${boardIndex}-${frameIndex}`, paths: [],
      marks: Array.from({ length: 100 }, (_, markIndex) => ({
        id: `mark-${boardIndex}-${frameIndex}-${markIndex}`, kind: "text" as const,
        position: [.5, .5] as [number, number], text: "x",
      })),
    })) };
  });
  const library = snapshot(...boards), storage = new MemoryStorage();
  const raw = JSON.stringify({ version: 1, boards: library.boards.map(item => item.board) });
  expect(raw.length).toBeLessThan(4_000_000);
  expect(new TextEncoder().encode(JSON.stringify(library)).byteLength).toBeLessThan(CLOUD_MAX_BYTES);
  expect(new TextEncoder().encode(JSON.stringify({ kind: "rallypath-library-backup", version: 1,
    snapshot: library }, null, 2)).byteLength).toBeGreaterThan(CLOUD_BACKUP_MAX_BYTES);
  storage.setItem(BOARD_STORAGE_KEY, raw);
  const helperDownload = value(createLibraryBackupJSON(library, { revision: 3, updatedAt: DATE }));
  expect(helperDownload).not.toContain("\n");
  expect(new TextEncoder().encode(helperDownload).byteLength).toBeLessThanOrEqual(CLOUD_BACKUP_MAX_BYTES);
  expect(JSON.parse(helperDownload)).toMatchObject({ revision: 3, updatedAt: DATE, snapshot: library });
  const api = new MemoryAPI(), source = createCloudSyncClient({ storage, fetch: api.fetch });
  const download = value(source.localBackup());
  expect(download).not.toContain("\n");
  const target = new MemoryStorage(), restored = createCloudSyncClient({ storage: target, fetch: api.fetch });
  value(await restored.importLocalBackup(download));
  const recovered = value(captureLocalSnapshot(target));
  expect(recovered.boards).toHaveLength(6);
  for (const item of recovered.boards) {
    const original = library.boards.find(entry => item.board.title === `${entry.board.title} · 备份副本`
      && item.board.frames[0].id === entry.board.frames[0].id)!;
    expect(original).toBeDefined();
    expect(item.board.id).not.toBe(original.board.id);
    expect(item.board.frames).toEqual(original.board.frames);
    expect(item.board.frames).toHaveLength(60);
    expect(item.board.frames[59].marks).toHaveLength(100);
  }
  expect(restored.getState()).toMatchObject({ status: "signed-out", localBoardCount: 6 });
  expect(api.reads).toBe(0);
  expect(api.puts).toHaveLength(0);
});
