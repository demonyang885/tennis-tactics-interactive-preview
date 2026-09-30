import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createStarterBoard, type BoardDocument } from "../src/board/model";
import { CLOUD_BACKUP_MAX_BYTES, type CloudSnapshot } from "../src/cloud/snapshot";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const user = { id: "account-one", email: "player@example.com", name: "网球练习者" };
function board(id: string, title: string): BoardDocument {
  const initial = createStarterBoard(title);
  const ball = initial.actors.find(actor => actor.kind === "ball")!;
  const { smartRally: _smartRally, ...manual } = initial;
  return { ...manual, id, updatedAt: "2026-09-30T09:00:00.000Z", frames: [{ ...initial.frames[0], paths: [{
    id: `${id}-serve`, kind: "shot", actorId: ball.id, from: initial.frames[0].poses[ball.id], to: [.3, .18], control: [.72, .5],
  }] }] };
}
function snapshot(boards: BoardDocument[]): CloudSnapshot {
  return { version: 1, boards: boards.map(item => ({ kind: "rallypath-board-backup", version: 2, board: item })) };
}
async function openHome(page: Page, boards: BoardDocument[] = []) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key, boards }) => {
    window.localStorage.clear();
    if (boards.length) window.localStorage.setItem(key, JSON.stringify({ version: 1, boards }));
  }, { key: BOARD_KEY, boards });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
}
async function openAccount(page: Page) {
  await page.getByRole("button", { name: "打开账户与同步", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "账户与同步", exact: true });
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))).toBeLessThan(1);
}
async function storedBoards(page: Page): Promise<BoardDocument[]> {
  return page.evaluate(key => JSON.parse(window.localStorage.getItem(key) ?? '{"boards":[]}').boards, BOARD_KEY);
}

test("anonymous players keep local boards and enter login through the account sheet", async ({ page }) => {
  const local = board("anonymous-local", "未登录的发球练习");
  let writes = 0;
  await page.route("**/api/account", route => route.fulfill({ json: { user: null } }));
  await page.route("**/api/library", route => { writes += Number(route.request().method() === "PUT"); return route.fulfill({ status: 401, json: { error: "请先登录" } }); });
  await openHome(page, [local]);
  await openAccount(page);
  const login = page.getByRole("link", { name: "使用 ChatGPT 登录", exact: true });
  await expect(login).toHaveAttribute("href", "/signin-with-chatgpt?return_to=%2F");
  await expect(login).toHaveAttribute("target", "_top");
  await expect(page.getByText("保存在此浏览器", { exact: true })).toBeVisible();
  expect(await storedBoards(page)).toEqual([local]);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "关闭账户与同步", exact: true }).click();
  await page.getByRole("button", { name: "接着画未登录的发球练习", exact: true }).click();
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await page.getByRole("button", { name: "打开未登录的发球练习的画板菜单", exact: true }).click();
  await page.getByRole("button", { name: "账户与同步", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "账户与同步", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "使用 ChatGPT 登录", exact: true })).toBeVisible();
});

test("static hosting keeps the original local flow and hides an unavailable login route", async ({ page }) => {
  const local = board("static-local", "本机战术");
  await page.route("**/api/account", route => route.fulfill({ status: 404, body: "Not Found" }));
  await openHome(page, [local]);
  await expect(page.getByRole("button", { name: "打开账户与同步", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "使用 ChatGPT 登录", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "接着画本机战术", exact: true }).click();
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  expect((await storedBoards(page))[0].id).toBe(local.id);
});

test("the first device explicitly uploads its local library and shows the signed-in account", async ({ page }, testInfo) => {
  const local = board("first-local", "第一台设备的练习");
  let current = { revision: 0, updatedAt: null as string | null, snapshot: null as CloudSnapshot | null };
  let writes = 0;
  await page.route("**/api/account", route => route.fulfill({ json: { user } }));
  await page.route("**/api/library", route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(current.revision);
      writes += 1;
      current = { revision: current.revision + 1, updatedAt: "2026-09-30T10:00:00.000Z", snapshot: body.snapshot };
    }
    return route.fulfill({ json: current });
  });
  await openHome(page, [local]);
  await openAccount(page);
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(page.getByText(/首次同步：/)).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "同步此浏览器的画板", exact: true }).click();
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  expect(writes).toBe(1);
  expect(current.snapshot?.boards[0].board.id).toBe(local.id);
  expect((await storedBoards(page))[0].id).toBe(local.id);
  await expect(page.getByRole("link", { name: "退出登录", exact: true })).toHaveAttribute("target", "_top");
  await page.screenshot({ path: testInfo.outputPath("account-synced.png"), fullPage: true });
});

test("a second device receives its cloud boards without uploading an empty library", async ({ page }) => {
  const remote = board("cloud-device-board", "手机上保存的战术");
  let writes = 0;
  await page.route("**/api/account", route => route.fulfill({ json: { user } }));
  await page.route("**/api/library", route => {
    writes += Number(route.request().method() === "PUT");
    return route.fulfill({ json: { revision: 3, updatedAt: "2026-09-30T10:00:00.000Z", snapshot: snapshot([remote]) } });
  });
  await openHome(page);
  await expect(page.getByRole("button", { name: "接着画手机上保存的战术", exact: true })).toBeVisible();
  await openAccount(page);
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  expect((await storedBoards(page))[0].id).toBe(remote.id);
  expect(writes).toBe(0);
});

test("conflicting devices preserve both versions until the player keeps both", async ({ page }, testInfo) => {
  const local = board("shared-board", "电脑上的本机版本");
  const remote = { ...board("shared-board", "手机上的云端版本"), updatedAt: "2026-09-30T10:00:00.000Z" };
  let current = { revision: 4, updatedAt: "2026-09-30T10:00:00.000Z", snapshot: snapshot([remote]) };
  let writes = 0;
  await page.route("**/api/account", route => route.fulfill({ json: { user } }));
  await page.route("**/api/library", route => {
    if (route.request().method() === "PUT") {
      writes += 1;
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(4);
      current = { ...current, revision: 5, snapshot: body.snapshot };
    }
    return route.fulfill({ json: current });
  });
  await openHome(page, [local]);
  await openAccount(page);
  await expect(page.getByText("两台设备都有修改", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "备份本机版本", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "备份云端版本", exact: true })).toBeVisible();
  expect(await storedBoards(page)).toEqual([local]);
  expect(writes).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("account-conflict.png"), fullPage: true });
  await page.getByRole("button", { name: "保留两份并同步", exact: true }).click();
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  const saved = await storedBoards(page);
  expect(saved).toHaveLength(2);
  expect(saved.find(item => item.id === local.id)?.title).toBe(local.title);
  expect(saved.some(item => item.id !== local.id && item.title.includes(remote.title))).toBe(true);
  expect(current.snapshot.boards).toHaveLength(2);
});

test("offline editing preserves local changes and retries when the connection returns", async ({ page }) => {
  const local = board("offline-board", "可离线编辑的画板");
  let current = { revision: 0, updatedAt: null as string | null, snapshot: null as CloudSnapshot | null };
  let writes = 0;
  await page.route("**/api/account", route => route.fulfill({ json: { user } }));
  await page.route("**/api/library", route => {
    if (route.request().method() === "PUT") {
      writes += 1;
      current = { revision: current.revision + 1, updatedAt: "2026-09-30T11:00:00.000Z", snapshot: route.request().postDataJSON().snapshot };
    }
    return route.fulfill({ json: current });
  });
  await openHome(page, [local]);
  await openAccount(page);
  await page.getByRole("button", { name: "同步此浏览器的画板", exact: true }).click();
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  await page.evaluate(key => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
    const stored = JSON.parse(window.localStorage.getItem(key)!);
    stored.boards[0].title = "离线时的新名称";
    stored.boards[0].updatedAt = "2026-09-30T12:00:00.000Z";
    window.localStorage.setItem(key, JSON.stringify(stored));
    window.dispatchEvent(new Event("tennis-board-drafts-changed"));
  }, BOARD_KEY);
  await expect(page.getByText("离线 · 已保存在此浏览器", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "立即同步", exact: true })).toBeDisabled();
  expect((await storedBoards(page))[0].title).toBe("离线时的新名称");
  expect(writes).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  expect(current.snapshot?.boards[0].board.title).toBe("离线时的新名称");
  expect(writes).toBe(2);
});

test("a downloaded library backup can be restored while keeping existing local boards", async ({ page }) => {
  const original = board("backup-original", "备份里的发球练习");
  const existing = board("restore-existing", "原有的本机画板");
  await page.route("**/api/account", route => route.fulfill({ json: { user: null } }));
  await openHome(page, [original]);
  await openAccount(page);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份本机画板", exact: true }).click();
  const download = await downloadReady;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const backup = await readFile(downloadPath!, "utf8");
  expect(JSON.parse(backup).snapshot.boards[0].board.id).toBe(original.id);
  await page.evaluate(({ key, existing }) => {
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [existing] }));
    window.dispatchEvent(new Event("tennis-board-drafts-changed"));
  }, { key: BOARD_KEY, existing });
  await page.getByLabel("选择画板备份文件").setInputFiles(downloadPath!);
  await expect(page.getByText("备份已导入，原画板保留。", { exact: true })).toBeVisible();
  const restored = await storedBoards(page);
  expect(restored).toHaveLength(2);
  expect(restored.find(item => item.id === existing.id)).toEqual(existing);
  expect(restored.some(item => item.id !== original.id && item.title.includes(original.title))).toBe(true);
});

test("invalid or oversized backup files show a repairable error without changing local boards", async ({ page }) => {
  const local = board("safe-local", "不能丢失的画板");
  await page.route("**/api/account", route => route.fulfill({ json: { user: null } }));
  await openHome(page, [local]);
  await openAccount(page);
  await page.getByLabel("选择画板备份文件").setInputFiles({ name: "damaged.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
  await expect(page.locator(".cloud-account-error")).toBeVisible();
  expect(await storedBoards(page)).toEqual([local]);
  await page.getByLabel("选择画板备份文件").setInputFiles({ name: "oversized.json", mimeType: "application/json", buffer: Buffer.alloc(CLOUD_BACKUP_MAX_BYTES + 1) });
  await expect(page.getByText("备份超过 8 MB，未更改本机画板。", { exact: true })).toBeVisible();
  expect(await storedBoards(page)).toEqual([local]);
});

test("a remote update asks an open editor to reopen while keeping the current view", async ({ page }) => {
  const local = board("open-editor-board", "电脑上打开的画板");
  let current = { revision: 0, updatedAt: null as string | null, snapshot: null as CloudSnapshot | null };
  await page.route("**/api/account", route => route.fulfill({ json: { user } }));
  await page.route("**/api/library", route => {
    if (route.request().method() === "PUT") current = { revision: current.revision + 1, updatedAt: "2026-09-30T11:00:00.000Z", snapshot: route.request().postDataJSON().snapshot };
    return route.fulfill({ json: current });
  });
  await openHome(page, [local]);
  await openAccount(page);
  await page.getByRole("button", { name: "同步此浏览器的画板", exact: true }).click();
  await expect(page.getByText("已同步", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭账户与同步", exact: true }).click();
  await page.getByRole("button", { name: "接着画电脑上打开的画板", exact: true }).click();
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await page.getByRole("button", { name: "打开电脑上打开的画板的画板菜单", exact: true }).click();
  await page.getByRole("button", { name: "账户与同步", exact: true }).click();
  current = { ...current, revision: 2, snapshot: { ...current.snapshot!, boards: current.snapshot!.boards.map(item => ({ ...item, board: { ...item.board, title: "手机更新后的画板", updatedAt: "2026-09-30T12:00:00.000Z" } })) } };
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(page.getByText("另一台设备有更新，请返回首页后重新打开画板。", { exact: true })).toBeVisible();
  expect((await storedBoards(page))[0].title).toBe("手机更新后的画板");
  await page.getByRole("button", { name: "关闭账户与同步", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开电脑上打开的画板的画板菜单", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await expect(page.getByRole("button", { name: "接着画手机更新后的画板", exact: true })).toBeVisible();
  await openAccount(page);
  await expect(page.getByText("另一台设备有更新，请返回首页后重新打开画板。", { exact: true })).toHaveCount(0);
});
