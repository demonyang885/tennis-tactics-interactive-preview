import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRightIcon,
  FilePlusIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";

import { cloneBoard, createStarterBoard, type BoardDocument } from "../board/model";
import { BOARD_STORAGE_KEY, deleteBoard, readBoards, saveBoard } from "../board/storage";
import { parseBoardJSON } from "../board/validate";
import { MobileScroll } from "../mobile";

export const BOARD_DRAFTS_EVENT = "tennis-board-drafts-changed";

export type BoardLibraryProps = {
  openBoard: (board: BoardDocument, persisted?: boolean, notice?: string) => void;
  /** The editor directly beneath this library screen remains mounted. */
  activeBoardId?: string;
  /** Allows a parent FlowStack reset to force a fresh storage read. */
  draftsRevision?: number;
  /** Override only when the host already publishes a different draft event. */
  draftsEventName?: string;
};

const IMPORT_SUFFIX = "（导入）";
const MAX_BOARD_TITLE_LENGTH = 120;
type DraftsLoadState = "loading" | "ready" | "error";
type StorageFailure =
  | { kind: "load"; message: string }
  | { kind: "import"; message: string }
  | { kind: "delete"; message: string; board: BoardDocument };

function importedTitle(title: string) {
  let stem = title
    .slice(0, MAX_BOARD_TITLE_LENGTH - IMPORT_SUFFIX.length)
    .trimEnd();
  const lastCode = stem.charCodeAt(stem.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) stem = stem.slice(0, -1);
  return `${stem || "导入画板"}${IMPORT_SUFFIX}`.slice(0, MAX_BOARD_TITLE_LENGTH);
}

function boardDate(updatedAt: string) {
  return new Date(updatedAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

/**
 * The pushed 草稿与模板 screen. It deliberately lists every valid local
 * document; playable-path filtering belongs only to the animated home hero.
 */
export function BoardLibrary({
  openBoard,
  activeBoardId,
  draftsRevision = 0,
  draftsEventName = BOARD_DRAFTS_EVENT,
}: BoardLibraryProps) {
  const [drafts, setDrafts] = useState<BoardDocument[]>([]);
  const [loadState, setLoadState] = useState<DraftsLoadState>("loading");
  const [storageFailure, setStorageFailure] = useState<StorageFailure | null>(null);
  const [storageStatus, setStorageStatus] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const result = readBoards();
    if (result.ok) {
      setDrafts(result.value);
      setLoadState("ready");
      setStorageFailure((current) => current?.kind === "load" ? null : current);
      return;
    }
    setLoadState("error");
    setStorageStatus("");
    setStorageFailure({ kind: "load", message: "暂时读不到此浏览器里的画板，请重试" });
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BOARD_STORAGE_KEY) refresh();
    };
    window.addEventListener(draftsEventName, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(draftsEventName, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [draftsEventName, draftsRevision, refresh]);

  const removeDraft = (board: BoardDocument) => {
    const result = deleteBoard(board.id);
    if (!result.ok) {
      setStorageStatus("");
      setStorageFailure({ kind: "delete", message: `暂时无法删除「${board.title}」，请重试`, board });
      return;
    }
    setStorageFailure(null);
    setStorageStatus(`已删除「${board.title}」`);
    setDrafts((current) => current.filter((item) => item.id !== board.id));
    window.dispatchEvent(new Event(draftsEventName));
  };

  const importBoard = async (file: File | undefined) => {
    if (!file) return;
    setStorageStatus("正在打开备份…");
    setStorageFailure(null);
    try {
      const parsed = parseBoardJSON(await file.text());
      if (!parsed.ok) {
        setStorageStatus("");
        setStorageFailure({ kind: "import", message: "这个备份打不开，请换一个文件重试" });
        return;
      }
      const imported = cloneBoard(parsed.value, importedTitle(parsed.value.title));
      const saved = saveBoard(imported);
      if (!saved.ok) {
        setStorageStatus("");
        setStorageFailure({ kind: "import", message: "这个备份还没存下来，请重试" });
        return;
      }
      setStorageFailure(null);
      setStorageStatus("备份已导入，可以继续修改");
      window.dispatchEvent(new Event(draftsEventName));
      openBoard(saved.value, true, "备份已导入，可以继续修改");
    } catch {
      setStorageStatus("");
      setStorageFailure({ kind: "import", message: "这个备份打不开，请换一个文件重试" });
    }
  };

  const retryFailure = () => {
    if (!storageFailure) return;
    if (storageFailure.kind === "load") {
      refresh();
      return;
    }
    if (storageFailure.kind === "import") {
      importRef.current?.click();
      return;
    }
    removeDraft(storageFailure.board);
  };

  const failureAction = storageFailure?.kind === "load"
    ? "重试"
    : storageFailure?.kind === "import"
      ? "重新选择"
      : "再试一次";
  const initialLoadFailed = loadState === "error" && drafts.length === 0;

  return (
    <MobileScroll className="board-home-scroll board-library-scroll">
      <main className="board-home board-library">
        <section className="board-home-hero board-library-hero">
          <span className="board-kicker"><LayersIcon /> 草稿与模板</span>
          <h2>打开一份画板</h2>
          <p>打开本机草稿，或从发球站位画一条新球路。</p>
          <div className="board-home-primary board-library-primary">
            <button onClick={() => openBoard(createStarterBoard("我的战术板"), false)}>
              <PlusIcon />画一条新球路
            </button>
            <button onClick={() => importRef.current?.click()}>
              <UploadIcon />导入备份
            </button>
          </div>
          <input
            ref={importRef}
            className="board-hidden-file"
            hidden
            tabIndex={-1}
            aria-hidden="true"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importBoard(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </section>

        {storageFailure && <div className="board-error-action" role="alert"><span>{storageFailure.message}</span><button onClick={retryFailure}>{failureAction}</button></div>}
        {storageStatus && <p className="board-library-status" role="status" aria-live="polite">{storageStatus}</p>}

        <section className="board-home-section board-library-drafts" aria-labelledby="board-library-drafts-title">
          <div className="board-section-heading">
            <div>
              <span>本机草稿</span>
              <h3 id="board-library-drafts-title">全部画板</h3>
            </div>
            <small>{loadState === "loading" ? "读取中" : initialLoadFailed ? "未读取" : `${drafts.length} 份`}</small>
          </div>
          {loadState === "loading" && drafts.length === 0 ? (
            <div className="board-empty">
              <LayersIcon />
              <p>正在读取画板…</p>
            </div>
          ) : initialLoadFailed ? (
            <div className="board-empty">
              <LayersIcon />
              <p>画板还没读出来。重试后再看。</p>
            </div>
          ) : drafts.length > 0 ? (
            <div className="board-draft-list">
              {drafts.map((board) => (
                <article key={board.id}>
                  <button
                    className="board-draft-open"
                    onClick={() => openBoard(board, true)}
                  >
                    <span className="board-draft-icon"><LayersIcon /></span>
                    <span>
                      <strong>{board.title}</strong>
                      <small>{board.frames.length} 拍 · {boardDate(board.updatedAt)}</small>
                    </span>
                    <ChevronRightIcon />
                  </button>
                  <button
                    className="board-draft-delete"
                    aria-label={board.id === activeBoardId ? `${board.title}正在打开，暂时不能删除` : `删除${board.title}`}
                    disabled={board.id === activeBoardId}
                    onClick={() => removeDraft(board)}
                  >
                    <TrashIcon />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="board-empty">
              <FilePlusIcon />
              <p>这里还没有画板。画出第一条球路后，会保存在此浏览器。</p>
              <button onClick={() => openBoard(createStarterBoard("我的战术板"), false)}>画第一拍</button>
            </div>
          )}
        </section>
      </main>
    </MobileScroll>
  );
}
