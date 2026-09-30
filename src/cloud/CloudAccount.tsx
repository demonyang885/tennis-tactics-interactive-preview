import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { CheckCircledIcon, Cross2Icon, DownloadIcon, PersonIcon, UpdateIcon } from "@radix-ui/react-icons";
import { BottomSheet, useKeyboard } from "../mobile";
import { BOARD_DRAFTS_EVENT } from "../home/BoardLibrary";
import { BOARD_LEARNING_EVENT } from "../learning/storage";
import { BOARD_FOLLOW_UP_EVENT } from "../learning/followUp";
import { BOARD_DISCOVERY_EVENT } from "../learning/discovery";
import { BOARD_ALTERNATIVES_EVENT } from "../learning/alternative";
import { createCloudSyncClient, type CloudSyncState } from "./sync";
import { CLOUD_BACKUP_MAX_BYTES } from "./snapshot";
import "./cloud-account.css";

type AccountContext = { state: CloudSyncState; openAccount: () => void };
const Account = createContext<AccountContext | null>(null);
const localEvents = [BOARD_DRAFTS_EVENT, BOARD_LEARNING_EVENT, BOARD_FOLLOW_UP_EVENT, BOARD_DISCOVERY_EVENT, BOARD_ALTERNATIVES_EVENT];

function accountStatus(state: CloudSyncState, online: boolean) {
  if (!online) return "离线 · 已保存在此浏览器";
  switch (state.status) {
    case "checking": return "正在检查账户…";
    case "signed-out": return "保存在此浏览器";
    case "unavailable": return "保存在此浏览器";
    case "ready": return state.canAutoSync ? "等待同步" : "尚未同步";
    case "syncing": return "正在同步…";
    case "synced": return "已同步";
    case "conflict": return "两台设备都有修改";
    case "account-mismatch": return "本机画板属于另一个账户";
    case "recovery": return "上次同步需要恢复";
    case "error": return "同步未完成 · 本机画板保留";
  }
}

export function CloudAccountProvider({ children }: PropsWithChildren) {
  const applyingCloud = useRef(false);
  const [editorRefreshNotice, setEditorRefreshNotice] = useState("");
  const [client] = useState(() => createCloudSyncClient({ onLocalChange: reason => {
    if (document.querySelector('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting) .board-editor')) setEditorRefreshNotice(reason === "pull" ? "另一台设备有更新，请返回首页后重新打开画板。" : "画板库已更新，请返回首页后重新打开画板。");
    applyingCloud.current = true;
    try { localEvents.forEach(name => window.dispatchEvent(new Event(name))); }
    finally { applyingCloud.current = false; }
  } }));
  const [state, setState] = useState(() => client.getState());
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [backupError, setBackupError] = useState("");
  const [backupNotice, setBackupNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboard();
  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    void client.refreshAccount();
    const localChanged = () => {
      if (applyingCloud.current) return;
      client.markLocalChanged();
    };
    const connected = () => {
      setOnline(true);
      if (client.getState().canAutoSync) void client.syncNow();
    };
    const disconnected = () => setOnline(false);
    const foreground = () => {
      if (document.visibilityState === "visible" && navigator.onLine && client.getState().canAutoSync) void client.syncNow();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("tennis-tactics:") || event.key.startsWith("rallypath:")) localChanged();
    };
    localEvents.forEach(name => window.addEventListener(name, localChanged));
    window.addEventListener("storage", storageChanged);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      unsubscribe();
      localEvents.forEach(name => window.removeEventListener(name, localChanged));
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [client]);
  useEffect(() => {
    if (state.status !== "ready" || !state.canAutoSync || !online) return;
    const timer = setTimeout(() => void client.syncNow(), 900);
    return () => clearTimeout(timer);
  }, [client, state, online]);
  useEffect(() => {
    if (!editorRefreshNotice) return;
    const flow = document.querySelector(".tennis-app .flow-stack");
    if (!flow) return;
    const checkEditor = () => {
      if (!flow.querySelector('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting) .board-editor')) setEditorRefreshNotice("");
    };
    const observer = new MutationObserver(checkEditor);
    observer.observe(flow, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-flow-current", "class"] });
    checkEditor();
    return () => observer.disconnect();
  }, [editorRefreshNotice]);
  const openAccount = () => { keyboard.hide(); setBackupError(""); setBackupNotice(""); setOpen(true); };
  const downloadBackup = (cloud: boolean) => {
    const result = cloud ? client.cloudBackup() : client.localBackup();
    if (!result.ok) { setBackupError(result.error); return; }
    const url = URL.createObjectURL(new Blob([result.value], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `rallypath-${cloud ? "cloud" : "local"}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupError("");
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    setBackupError(""); setBackupNotice("");
    if (file.size > CLOUD_BACKUP_MAX_BYTES) { setBackupError("备份超过 8 MB，未更改本机画板。"); return; }
    setImporting(true);
    try {
      const result = await client.importLocalBackup(await file.text());
      if (!result.ok) setBackupError(result.error);
      else setBackupNotice("备份已导入，原画板保留。");
    } catch { setBackupError("无法读取这份备份，请重新选择 JSON 文件；本机画板仍保留。"); }
    finally { setImporting(false); }
  };
  const busy = state.status === "syncing" || state.status === "checking";
  const canSync = !!state.user && !["account-mismatch", "recovery", "conflict"].includes(state.status);
  return <Account.Provider value={{ state, openAccount }}>
    {children}
    <BottomSheet open={open} onOpenChange={setOpen} title="账户与同步" description="先保存在本机，再同步到你的账户。" snap={.625}>
      <div className="cloud-account">
        <button className="cloud-account-close" aria-label="关闭账户与同步" onClick={() => { keyboard.hide(); setOpen(false); }}><Cross2Icon /></button>
        <div className="cloud-account-identity"><span className="cloud-account-avatar"><PersonIcon /></span><div><strong>{state.user?.name || (state.user ? "我的账户" : "本机画板")}</strong>{state.user && <small>{state.user.email}</small>}</div></div>
        <p className={`cloud-account-status is-${state.status}`} role="status" aria-live="polite">{state.status === "synced" && online ? <CheckCircledIcon /> : <span className="cloud-account-status-dot" />}{accountStatus(state, online)}</p>
        <p className="cloud-account-count">此浏览器 {state.localBoardCount} 个画板{state.user && state.cloudBoardCount !== null ? ` · 云端 ${state.cloudBoardCount} 个画板` : ""}</p>
        {editorRefreshNotice && <p className="cloud-account-copy" role="status">{editorRefreshNotice}</p>}
        {state.status === "signed-out" && <><p className="cloud-account-copy">用同一个账户登录手机和电脑，就能继续自己的画板与练习记录。登录前的画板仍保留在此浏览器。</p><a className="cloud-account-primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">使用 ChatGPT 登录</a></>}
        {state.user && <>
          {state.status === "ready" && !state.canAutoSync && state.cloudBoardCount === 0 && <p className="cloud-account-copy">首次同步：点击“同步此浏览器的画板”，把这里的画板与练习记录加入当前账户。其他设备用同一个账户登录后即可继续。</p>}
          {state.status === "synced" && <p className="cloud-account-copy">修改后会自动同步。在另一台设备用同一个账户登录，回到页面时会检查最新画板。</p>}
          {state.updatedAt && state.status === "synced" && <p className="cloud-account-time">上次同步 {new Date(state.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
          {canSync && <button className="cloud-account-primary" disabled={busy || !online} onClick={() => void client.syncNow()}><UpdateIcon />{busy ? "正在同步…" : state.status === "ready" && !state.canAutoSync && state.cloudBoardCount === 0 ? "同步此浏览器的画板" : "立即同步"}</button>}
          {state.status === "conflict" && <div className="cloud-account-recovery"><p>本机与云端都有修改，已暂停同步。保留两份后，云端版本会另存为副本，方便逐一比较；本机版本也会保留。</p><button className="cloud-account-primary" disabled={!online} onClick={() => void client.keepBoth()}>保留两份并同步</button><div className="cloud-account-backups"><button onClick={() => downloadBackup(false)}><DownloadIcon />备份本机版本</button><button onClick={() => downloadBackup(true)}><DownloadIcon />备份云端版本</button></div></div>}
          {state.status === "account-mismatch" && <div className="cloud-account-recovery"><p>为保留原账户的数据，已暂停同步。请退出后使用原账户登录，或在另一个浏览器／浏览器用户中登录新账户。</p></div>}
          {state.status === "recovery" && <div className="cloud-account-recovery"><p>画板仍保留在本机。先恢复上次未完成的同步，再继续编辑或同步。</p><button className="cloud-account-primary" disabled={busy} onClick={() => void client.recoverLocal()}>恢复本机画板</button></div>}
        </>}
        <div className="cloud-account-backups cloud-account-file-actions"><button disabled={importing} onClick={() => downloadBackup(false)}><DownloadIcon />备份本机画板</button><button disabled={busy || importing || state.status === "account-mismatch" || state.status === "recovery"} onClick={() => backupInput.current?.click()}>{importing ? "正在导入…" : "导入画板备份"}</button></div>
        <input ref={backupInput} type="file" accept=".json,application/json" aria-label="选择画板备份文件" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importBackup(file); }} />
        {backupNotice && <p className="cloud-account-copy" role="status">{backupNotice}</p>}
        {state.error && !backupError && <p className="cloud-account-error" role="alert">{state.error}</p>}
        {backupError && <p className="cloud-account-error" role="alert">{backupError}</p>}
        {!state.user && state.status === "error" && <button className="cloud-account-secondary" disabled={busy || !online} onClick={() => void client.refreshAccount()}>重新检查账户</button>}
        {!online && <p className="cloud-account-copy">可以继续编辑本机画板。网络恢复后，已连接的账户会重新尝试同步。</p>}
        {state.user && <a className="cloud-account-signout" href="/signout-with-chatgpt?return_to=%2F" target="_top">退出登录</a>}
      </div>
    </BottomSheet>
  </Account.Provider>;
}

export function CloudAccountButton() {
  const account = useContext(Account);
  if (!account || account.state.status === "checking" || account.state.status === "unavailable" || account.state.status === "syncing" && !account.state.user) return null;
  const needsAttention = ["error", "conflict", "account-mismatch", "recovery"].includes(account.state.status);
  return <button className={`home-header-account${needsAttention ? " has-attention" : ""}`} aria-label="打开账户与同步" aria-haspopup="dialog" onClick={account.openAccount}><PersonIcon /><span className="cloud-account-indicator" aria-hidden="true" /></button>;
}

export function CloudAccountMenuItem({ beforeOpen }: { beforeOpen: () => boolean | void }) {
  const account = useContext(Account);
  if (!account || account.state.status === "checking" || account.state.status === "unavailable" || account.state.status === "syncing" && !account.state.user) return null;
  return <button onClick={() => { if (beforeOpen() !== false) account.openAccount(); }}><PersonIcon /><span><strong>账户与同步</strong></span></button>;
}
