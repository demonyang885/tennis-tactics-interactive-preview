import { waitForWorkspace, openBoardSettings, openWorkspaceLibrary } from "./workspace-navigation";
import { expect, test, type FileChooser, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { BoardDocument } from "../src/board/model";
import type { BoardBackupPackage } from "../src/learning/storage";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const LEARNING_KEY = "rallypath:board-learning:v1";
const FOLLOW_UP_KEY = "rallypath:board-follow-up:v1";
const DISCOVERY_KEY = "rallypath:board-discovery:v1";
const ALTERNATIVE_KEY = "rallypath:board-alternatives:v1";
const IMPORT_JOURNAL_KEY = "rallypath:board-import-pending:v1";
const CONTENT_KEYS = [BOARD_KEY, LEARNING_KEY, FOLLOW_UP_KEY, DISCOVERY_KEY, ALTERNATIVE_KEY, IMPORT_JOURNAL_KEY];
const recordedAt = "2026-10-01T08:00:00.000Z";

const sourceBoard: BoardDocument = {
  version: 1,
  id: "v032-json-source",
  title: "两拍与发现 JSON 验收",
  purpose: "review",
  authoringMode: "blank-rally",
  updatedAt: recordedAt,
  actors: [
    { id: "me", kind: "player", label: "我方", color: "#3e8ad6" },
    { id: "opponent", kind: "player", label: "对手", color: "#dc4151" },
    { id: "ball", kind: "ball", label: "网球", color: "#d8ef72" },
  ],
  frames: [{
    id: "first-beat", label: "第 1 拍", duration: 1.8,
    poses: { me: [.64, .98], opponent: [.3, .07], ball: [.64, .96] },
    paths: [
      { id: "first-shot", kind: "shot", actorId: "ball", from: [.64, .96], to: [.28, .18], control: [.72, .48], pace: "control" },
      { id: "receiver-move", kind: "move", actorId: "opponent", from: [.3, .07], to: [.28, .18] },
    ],
    marks: [{ id: "first-note", kind: "text", position: [.6, .6], text: "接发：深一点 🎾" }],
  }, {
    id: "second-beat", label: "第 2 拍", duration: 2.4,
    poses: { me: [.64, .98], opponent: [.28, .18], ball: [.28, .18] },
    paths: [{ id: "reply-shot", kind: "shot", actorId: "ball", from: [.28, .18], to: [.68, .82], control: [.18, .5], pace: "drive" }],
    marks: [{ id: "second-target", kind: "target", position: [.68, .82], size: [.12, .09] }],
  }],
};

function backupFixture(linked: boolean): BoardBackupPackage {
  if (!linked) return { kind: "rallypath-board-backup", version: 1, board: sourceBoard };
  const alternativeBoard: BoardDocument = {
    ...sourceBoard, id: "v032-json-alternative", title: `${sourceBoard.title} · 试试`,
    frames: [sourceBoard.frames[0], { ...sourceBoard.frames[1], paths: [{
      ...sourceBoard.frames[1].paths[0], to: [.4, .85], control: [.48, .52],
    }] }],
  };
  return {
    kind: "rallypath-board-backup", version: 2, board: sourceBoard,
    learning: { version: 1, boardId: sourceBoard.id, route: "skill", skillId: "recovery", updatedAt: recordedAt },
    followUp: { version: 1, id: "v032-json-follow-up", boardId: sourceBoard.id,
      frameId: "second-beat", progress: .35, skillId: "recovery", skillLabel: "击球后回位",
      question: "击球以后，能不能先回到下一拍的位置？", note: "第二拍回位更早了；还不确定。",
      uncertain: true, createdAt: recordedAt, updatedAt: recordedAt },
    discovery: { version: 1, id: "v032-json-discovery", boardId: sourceBoard.id,
      frameId: "second-beat", progress: .65, note: "看到短球时先站稳 🎾", nextTry: "下一次试深斜线",
      uncertain: false, createdAt: recordedAt, updatedAt: recordedAt },
    alternative: { version: 1, id: alternativeBoard.id, sourceBoardId: sourceBoard.id,
      startFrameId: "second-beat", tacticId: "defend-high-middle", sourceSnapshot: sourceBoard,
      board: alternativeBoard, createdAt: recordedAt, updatedAt: recordedAt },
  };
}

async function settled(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect.poll(() => page.getByTestId("flow-current").evaluate(element =>
    Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
}

async function contentSnapshot(page: Page) {
  return page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), CONTENT_KEYS);
}

async function openShare(page: Page) {
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true })
    .getByRole("button", { name: /^保存与分享/ }).click();
  const share = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await expect(share).toBeVisible();
  return share;
}

async function chooseImport(page: Page, file: Parameters<FileChooser["setFiles"]>[0]) {
  // Use the actual visible import button and its native file chooser; the
  // payload comes from the preceding browser download without reconstruction.
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("flow-current").getByRole("button", { name: "导入备份", exact: true }).click();
  await (await chooserPromise).setFiles(file);
}

for (const linked of [false, true]) {
  test(`C1–C4: real ${linked ? "v2 discovery and legacy observation" : "v1 board-only"} download imports into a fresh browser and survives reopening`, async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    const fixture = backupFixture(linked);
    await page.evaluate(({ fixture, keys }) => {
      localStorage.setItem(keys.board, JSON.stringify({ version: 1, boards: [fixture.board] }));
      for (const [field, key] of Object.entries(keys.relationships)) {
        const record = fixture[field as "learning" | "followUp" | "discovery" | "alternative"];
        if (record) localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] }));
      }
    }, { fixture, keys: { board: BOARD_KEY, relationships: {
      learning: LEARNING_KEY, followUp: FOLLOW_UP_KEY, discovery: DISCOVERY_KEY, alternative: ALTERNATIVE_KEY,
    } } });
    await page.reload();
    await waitForWorkspace(page);
    await settled(page);
    const before = await contentSnapshot(page);
    const share = await openShare(page);
    const downloadPromise = page.waitForEvent("download");
    await share.getByRole("button", { name: /^备份画板/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(await download.failure()).toBeNull();
    const backupPath = testInfo.outputPath("real-browser-backup.json");
    await download.saveAs(backupPath);
    const bytes = await readFile(backupPath);
    const downloaded: BoardBackupPackage = JSON.parse(bytes.toString("utf8"));
    expect(downloaded).toEqual(fixture);
    expect(downloaded.board.frames).toHaveLength(2);
    await expect(share.getByRole("status")).toContainText("已开始下载");
    expect(await contentSnapshot(page)).toEqual(before);

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const fresh = await browser.newContext({ baseURL, userAgent, viewport: { width: 1280, height: 900 } });
    try {
      const importedPage = await fresh.newPage();
      await importedPage.emulateMedia({ reducedMotion: "reduce" });
      await importedPage.goto("./");
      expect(await contentSnapshot(importedPage)).toEqual(Object.fromEntries(CONTENT_KEYS.map(key => [key, null])));
      await waitForWorkspace(importedPage);
      await openWorkspaceLibrary(importedPage);
      await settled(importedPage);
      await chooseImport(importedPage, backupPath);
      await expect(importedPage.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
      await settled(importedPage);
      await expect(importedPage.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
      const imported = await importedPage.evaluate(keys => {
        const boards = JSON.parse(localStorage.getItem(keys.board) ?? "null").boards as BoardDocument[];
        const relationships = Object.fromEntries(Object.entries(keys.relationships).map(([field, key]) =>
          [field, JSON.parse(localStorage.getItem(key) ?? "null")?.records?.[0]]));
        return { boards, relationships, journal: localStorage.getItem(keys.journal) };
      }, { board: BOARD_KEY, relationships: {
        learning: LEARNING_KEY, followUp: FOLLOW_UP_KEY, discovery: DISCOVERY_KEY, alternative: ALTERNATIVE_KEY,
      }, journal: IMPORT_JOURNAL_KEY });
      expect(imported.boards).toHaveLength(1);
      expect(imported.journal).toBeNull();
      const restored = imported.boards[0];
      expect(restored.id).not.toBe(sourceBoard.id);
      expect(restored.title).toBe(`${sourceBoard.title}（导入）`);
      expect({ ...restored, id: sourceBoard.id, title: sourceBoard.title, updatedAt: recordedAt }).toEqual(sourceBoard);
      if (linked) {
        const { learning, followUp, discovery, alternative } = imported.relationships;
        expect({ ...learning, boardId: sourceBoard.id, updatedAt: recordedAt }).toEqual(fixture.learning);
        expect(followUp.id).not.toBe(fixture.followUp!.id);
        expect({ ...followUp, id: fixture.followUp!.id, boardId: sourceBoard.id, updatedAt: recordedAt }).toEqual(fixture.followUp);
        expect(discovery.id).not.toBe(fixture.discovery!.id);
        expect({ ...discovery, id: fixture.discovery!.id, boardId: sourceBoard.id, updatedAt: recordedAt }).toEqual(fixture.discovery);
        expect(alternative.id).not.toBe(fixture.alternative!.id);
        expect(alternative.sourceBoardId).toBe(restored.id);
        expect({ ...alternative.sourceSnapshot, id: sourceBoard.id }).toEqual(sourceBoard);
        expect({ ...alternative.board, id: fixture.alternative!.id }).toEqual(fixture.alternative!.board);
        expect({ ...alternative, id: fixture.alternative!.id, sourceBoardId: sourceBoard.id,
          sourceSnapshot: sourceBoard, board: fixture.alternative!.board, updatedAt: recordedAt }).toEqual(fixture.alternative);
      } else expect(imported.relationships).toEqual({ learning: undefined, followUp: undefined, discovery: undefined, alternative: undefined });

      const saved = await contentSnapshot(importedPage);
      await importedPage.reload();
      await waitForWorkspace(importedPage);
      await settled(importedPage);
      expect(await contentSnapshot(importedPage)).toEqual(saved);
      const reopenedShare = await openShare(importedPage);
      const reopenedDownloadPromise = importedPage.waitForEvent("download");
      await reopenedShare.getByRole("button", { name: /^备份画板/ }).click();
      const reopenedDownload = await reopenedDownloadPromise;
      const reopenedPath = testInfo.outputPath("reopened-browser-backup.json");
      await reopenedDownload.saveAs(reopenedPath);
      const reopened = JSON.parse(await readFile(reopenedPath, "utf8"));
      expect(reopened.board).toEqual(restored);
      for (const field of ["learning", "followUp", "discovery", "alternative"]) {
        expect(reopened[field]).toEqual(imported.relationships[field]);
      }
      expect(await contentSnapshot(importedPage)).toEqual(saved);

      // A damaged copy of the real file must fail without replacing the
      // successfully restored board or any of its related records.
      await importedPage.reload();
      await waitForWorkspace(importedPage);
      await openWorkspaceLibrary(importedPage);
      await settled(importedPage);
      await chooseImport(importedPage, { name: "truncated-backup.json", mimeType: "application/json", buffer: bytes.subarray(0, bytes.length - 5) });
      await expect(importedPage.getByRole("alert")).toContainText("这个备份打不开，请换一个文件重试");
      expect(await contentSnapshot(importedPage)).toEqual(saved);
    } finally {
      await fresh.close();
    }
    expect(await contentSnapshot(page)).toEqual(before);
  });
}
