import { waitForWorkspace, expandBoardTools, openBoardSettings, openWorkspaceLibrary, reopenWorkspaceBoard } from "./workspace-navigation";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { confirmBoardDeletion } from "./board-library-helpers";
import { getShotDurationForPace, type BoardDocument, type BoardPath } from "../src/board/model";
import { getBoardGeometry, pointOnBoardPath } from "../src/board/render";
import { boardBackupSignature } from "../src/learning/importJournal";
import { FIXED_SKILLS } from "../src/learning/model";
import { combinations, tactics } from "../src/content/library";
import { SKILL_PRACTICES, visiblePracticeContextPaths } from "../src/learning/practice";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const LEARNING_KEY = "rallypath:board-learning:v1";
const FOLLOW_UP_KEY = "rallypath:board-follow-up:v1";
const DISCOVERY_KEY = "rallypath:board-discovery:v1";
const ALTERNATIVE_KEY = "rallypath:board-alternatives:v1";
const IMPORT_JOURNAL_KEY = "rallypath:board-import-pending:v1";
const DELETE_JOURNAL_KEY = "rallypath:board-delete-pending:v1";
const COPY_JOURNAL_KEY = "rallypath:board-copy-pending:v1";

test("keeps every fixed skill on the same three-stage teaching progression", () => {
  expect(SKILL_PRACTICES).toHaveLength(6);
  for (const plan of SKILL_PRACTICES) {
    expect(plan.stages.map((stage) => stage.id)).toEqual(["fixed", "read", "compete"]);
    for (const stage of plan.stages) {
      expect(stage.board.purpose).toBe("practice");
      expect(stage.board.frames.some((frame) => frame.paths.some((path) => path.kind === "shot"))).toBe(true);
      expect(stage.board.frames.some((frame) => frame.paths.some((path) => path.kind === "move"))).toBe(true);
      expect(stage.pass).toMatch(/\d/);
    }
  }
});

test("a skill demo shows only its current route until the ready-for-next-ball frame", () => {
  for (const plan of SKILL_PRACTICES) {
    for (const stage of plan.stages) {
      const { board } = stage;
      const finalIndex = board.frames.length - 1;
      expect(board.frames[finalIndex].paths, `${plan.id}/${stage.id} ends with a hold`).toEqual([]);
      for (let index = 0; index < finalIndex; index += 1) {
        expect(visiblePracticeContextPaths(board, index), `${plan.id}/${stage.id} beat ${index + 1}`).toEqual([]);
      }
      expect(visiblePracticeContextPaths(board, finalIndex)).toEqual(board.frames[finalIndex - 1].paths);
      expect(visiblePracticeContextPaths(board, -1)).toEqual([]);
    }
  }
});

test("each practice ball uses the same route-length and pace timing as an authored board", () => {
  for (const plan of SKILL_PRACTICES) {
    for (const stage of plan.stages) {
      for (const frame of stage.board.frames) {
        const ball = frame.paths.find((path) => path.actorId === "ball");
        if (!ball) continue;
        expect(ball.pace, `${plan.id}/${stage.id}/${frame.id} has a pace`).toBeDefined();
        expect(frame.duration, `${plan.id}/${stage.id}/${frame.id} playback timing`)
          .toBe(getShotDurationForPace(ball, ball.pace!));
      }
    }
  }
});

test("each first-stage setup names the target and cone count shown on its board", () => {
  for (const plan of SKILL_PRACTICES) {
    const firstFrame = plan.stages[0].board.frames[0];
    const targets = firstFrame.marks.filter((mark) => mark.kind === "target").length;
    const cones = firstFrame.marks.filter((mark) => mark.kind === "cone").length;
    for (const item of plan.guide.setup) {
      const targetCount = item.match(/^(\d+)(?:目标区|后场区)$/);
      if (targetCount) expect(targets, `${plan.id}: ${item}`).toBe(Number(targetCount[1]));
      const coneCount = item.match(/^(\d+)标志(?:碟|桶)$/);
      if (coneCount) expect(cones, `${plan.id}: ${item}`).toBe(Number(coneCount[1]));
    }
  }
});

test("the first recovery demonstration covers both wide balls without prescribing invisible footwork", () => {
  const recovery = SKILL_PRACTICES.find((plan) => plan.id === "recovery");
  expect(recovery).toBeDefined();
  const fixed = recovery!.stages[0];
  const feeds = fixed.board.frames.flatMap((frame) => frame.paths.filter((path) => path.kind === "feed"));
  expect(feeds.some((path) => path.to[0] < .3)).toBe(true);
  expect(feeds.some((path) => path.to[0] > .7)).toBe(true);
  const replies = fixed.board.frames.flatMap((frame) => frame.paths.filter((path) => path.kind === "shot"));
  expect(replies).toHaveLength(2);
  expect(replies.every((path) => Math.abs(path.to[0] - .5) < .1 && path.to[1] < .25)).toBe(true);
  expect(fixed.task).not.toContain("交叉步");
  expect(recovery!.guide.focus).toContain("下一拍");
});

test("the first serve-placement demonstration shows why the server prepares after choosing a target", () => {
  const serve = SKILL_PRACTICES.find((plan) => plan.id === "serve-placement");
  expect(serve).toBeDefined();
  const fixed = serve!.stages[0];
  expect(fixed.board.frames[0].paths.some((path) => path.kind === "shot" && path.to[1] > .2 && path.to[1] < .5)).toBe(true);
  expect(fixed.board.frames.some((frame) => frame.paths.some((path) => path.kind === "feed"))).toBe(true);
  expect(fixed.board.frames[0].paths.some((path) => path.kind === "move" && path.actorId === "me")).toBe(true);
  expect(fixed.board.frames[0].paths.some((path) => path.kind === "move" && path.actorId === "opponent")).toBe(true);
  expect(serve!.guide.sequence.join(" ")).toContain("接回球");
  expect(serve!.guide.setup).toContain("1目标区");
});

test("the first next-ball cue ties preparation to the opponent's contact", () => {
  const nextBall = SKILL_PRACTICES.find((plan) => plan.id === "next-ball");
  expect(nextBall).toBeDefined();
  expect(nextBall!.guide.focus).toContain("对手触球");
  expect(nextBall!.guide.focus).toContain("分腿");
  expect(nextBall!.stages[0].task).toContain("对手触球");
  expect(nextBall!.stages[0].focus).toContain("分腿");
});

const pointBoard: BoardDocument = {
  version: 1,
  id: "learning-flow-board",
  title: "我记住的这一分",
  updatedAt: "2026-09-20T09:00:00.000Z",
  purpose: "review",
  authoringMode: "blank-rally",
  actors: [
    { id: "me", label: "我方", kind: "player", color: "#3e8ad6" },
    { id: "opponent", label: "对手", kind: "player", color: "#dc4151" },
    { id: "ball", label: "网球", kind: "ball", color: "#d8ef72" },
  ],
  frames: [{
    id: "opening",
    label: "第 1 拍",
    duration: 1.5,
    poses: { me: [.64, .98], opponent: [.3, .07], ball: [.64, .96] },
    paths: [{ id: "serve", kind: "shot", actorId: "ball", from: [.64, .96], to: [.28, .18], control: [.72, .48] }],
    marks: [],
  }],
};

const twoBeatPoint: BoardDocument = {
  ...pointBoard,
  id: "learning-two-beat-board",
  title: "我记住的两拍",
  frames: [pointBoard.frames[0], {
    id: "reply",
    label: "第 2 拍",
    duration: 1.5,
    poses: { me: [.64, .98], opponent: [.3, .07], ball: [.28, .18] },
    paths: [{ id: "reply-shot", kind: "shot", actorId: "ball", from: [.28, .18], to: [.68, .82], control: [.18, .5] }],
    marks: [],
  }],
};

async function waitForFlowSettled(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect.poll(async () => page.getByTestId("flow-current").evaluateAll((elements) => {
    if (elements.length !== 1) return Infinity;
    const transform = new DOMMatrixReadOnly(getComputedStyle(elements[0]).transform);
    return Math.abs(transform.m41);
  })).toBeLessThan(1);
}

async function seedAndOpenPoint(page: Page, board: BoardDocument = pointBoard) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: BOARD_KEY, board });
  await page.reload();
  await waitForWorkspace(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await waitForFlowSettled(page);
}

// Old observations remain readable in backups and copies, but their retired
// bottom-sheet entry is no longer used to create new notes.
async function seedLegacyObservation(page: Page, note: string, uncertain = false) {
  await page.evaluate(({ key, boardId, note, uncertain }) => {
    const now = "2026-09-20T10:00:00.000Z";
    window.localStorage.setItem(key, JSON.stringify({ version: 1, records: [{
      version: 1, id: "legacy-observation", boardId, frameId: "opening", progress: .5,
      skillId: "recovery", skillLabel: "击球后回位", question: "击球以后，能不能先回到下一拍的位置？",
      note, uncertain, createdAt: now, updatedAt: now,
    }] }));
  }, { key: FOLLOW_UP_KEY, boardId: pointBoard.id, note, uncertain });
}

async function openLearningSheet(page: Page) {
  await waitForFlowSettled(page);
  await openBoardSettings(page);
  await page.getByTestId("board-learning-entry").click();
  const sheet = page.getByRole("dialog", { name: "这分卡在哪？", exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function openSkillChoices(page: Page) {
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: "练一项", exact: true }).click();
  const skillSheet = page.getByRole("dialog", { name: "这次先练好一件事", exact: true });
  await expect(skillSheet).toBeVisible();
  return skillSheet;
}

test("navigation rows provide accessible settings and learning actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: BOARD_KEY, board: twoBeatPoint });
  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);

  await openBoardSettings(page);
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  for (const name of ["修改名称", "保存与分享", "草稿与模板"]) {
    await expect(menu.getByRole("button", { name })).toBeEnabled();
    const bounds = await menu.getByRole("button", { name }).boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");

  await expandBoardTools(page);
  await page.locator(".board-dock-tools").getByRole("button", { name: /打开拍次/ }).click();
  const history = page.getByRole("dialog", { name: "拍次", exact: true });
  await expect(history.getByRole("button", { name: /编辑第 2 拍/ }).locator(":scope > svg:last-child")).toHaveCount(0);
  await history.getByRole("button", { name: "关闭拍次", exact: true }).click();

  const learning = await openLearningSheet(page);
  await expect(learning.locator(".learning-choice-grid > button > svg:last-child")).toHaveCount(0);
  await expect(learning.getByRole("button", { name: "练一项" }).locator(":scope > svg:last-child")).toHaveCount(0);
  await learning.getByRole("button", { name: "练一项" }).click();
  await expect(page.locator(".learning-skill-list > button:not([aria-pressed='true']) > svg:last-child")).toHaveCount(0);
});

async function openSkillPractice(page: Page, skillName: string) {
  const sheet = await openSkillChoices(page);
  await sheet.getByRole("button", { name: new RegExp(skillName) }).last().click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: skillName, exact: true })).toBeVisible();
}

async function openBoardLibrary(page: Page) {
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /草稿与模板/ }).click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact: true })).toBeVisible();
}

async function seedLinkedBoardAndOpenLibrary(page: Page) {
  const activeBoard: BoardDocument = {
    ...pointBoard,
    id: "learning-delete-active-board",
    title: "仍在打开的画板",
    updatedAt: "2026-09-21T09:00:00.000Z",
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, followUpKey, boards, learningBoardId }) => {
    window.localStorage.clear();
    window.localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards }));
    window.localStorage.setItem(learningKey, JSON.stringify({
      version: 1,
      records: [{
        version: 1,
        boardId: learningBoardId,
        route: "skill",
        skillId: "recovery",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }],
    }));
    window.localStorage.setItem(followUpKey, JSON.stringify({ version: 1, records: [{ version: 1, id: "observation-linked", boardId: learningBoardId, frameId: "opening", progress: .5, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" }] }));
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY, boards: [pointBoard, activeBoard], learningBoardId: pointBoard.id });
  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openBoardLibrary(page);
}

async function chooseCurrentSkill(page: Page, skillName: string) {
  await page.getByRole("button", { name: new RegExp(`打开${skillName}训练说明`) }).click();
  const guide = page.getByRole("dialog", { name: skillName, exact: true });
  await expect(guide.getByTestId("skill-practice-guide")).toBeVisible();
  await guide.getByRole("button", { name: "练这个", exact: true }).click();
}

async function chooseTacticForPoint(page: Page) {
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /拉开空档/ }).click();
  await waitForFlowSettled(page);
  await page.locator(".tactic-card").first().click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: "选这个打法", exact: true }).click();
  await waitForFlowSettled(page);
}

test("pauses all discovery writing entrances while retaining review boards and legacy records", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.stack ?? error.message));
  await seedAndOpenPoint(page);
  await seedLegacyObservation(page, "回位更早了");
  await page.evaluate(({ key, boardId }) => {
    const now = "2026-09-20T10:00:00.000Z";
    localStorage.setItem(key, JSON.stringify({ version: 1, records: [{
      version: 1, id: "paused-discovery", boardId, frameId: "opening", progress: .5,
      note: "已有的战术发现", nextTry: "保留之后再整理", uncertain: false,
      createdAt: now, updatedAt: now,
    }] }));
  }, { key: DISCOVERY_KEY, boardId: pointBoard.id });
  const recordKeys = [BOARD_KEY, FOLLOW_UP_KEY, DISCOVERY_KEY, LEARNING_KEY];
  const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), recordKeys);
  const expectNoDiscovery = async () => {
    await expect(page.getByRole("button", { name: /^(一分的发现|练后发现|记下这一分的发现|记下刚才一分)$/ })).toHaveCount(0);
    await expect(page.getByTestId("discovery-edit-layer")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /^(一分的发现|练后发现)$/ })).toHaveCount(0);
  };
  const staleDiscoveryRequest = async () => {
    await page.evaluate(boardId => {
      window.dispatchEvent(new CustomEvent("rallypath-board-discovery-open", { detail: { boardId, kind: "point", frameId: "opening" } }));
      return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, pointBoard.id);
    await expectNoDiscovery();
  };

  await openWorkspaceLibrary(page);
  await expectNoDiscovery();
  await staleDiscoveryRequest();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForWorkspace(page);
  await openBoardSettings(page);
  await expectNoDiscovery();
  await staleDiscoveryRequest();
  await page.keyboard.press("Escape");
  const choices = await openLearningSheet(page);
  await expectNoDiscovery();
  await choices.getByRole("button", { name: "练一项", exact: true }).click();
  await page.getByRole("dialog", { name: "这次先练好一件事", exact: true }).getByRole("button", { name: /击球后回位/ }).last().click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: "打开击球后回位训练说明", exact: true }).click();
  await expect(page.getByTestId("skill-practice-guide")).toBeVisible();
  await expectNoDiscovery();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);

  await openBoardLibrary(page);
  await expect(page.getByRole("region", { name: "找回发现笔记", exact: true })).toHaveCount(0);
  await expectNoDiscovery();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  const learning = await openLearningSheet(page);
  await learning.getByRole("button", { name: "看看全部打法", exact: true }).click();
  await page.getByRole("button", { name: /^打开接发稳住再上网互动对打/ }).click();
  for (let decision = 0; decision < 2; decision++) {
    const actions = page.getByTestId("flow-current").locator(".rally-choice-button");
    await expect(actions.first()).toBeVisible({ timeout: 22_000 });
    await actions.first().click();
    await expect(page.getByTestId("flow-current").getByText(`回合第 ${decision + 2} 段`, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("flow-current").locator(".rally-choice-button").first()).toBeVisible({ timeout: 22_000 });
  await staleDiscoveryRequest();
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), recordKeys)).toEqual(before);
  expect(browserErrors).toEqual([]);
});

async function clickAuthoredRoute(page: Page, path: BoardPath = pointBoard.frames[0].paths[0]) {
  const canvas = page.getByTestId("flow-current").getByTestId("board-canvas");
  const metrics = await canvas.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, rect: element.getBoundingClientRect().toJSON() }));
  const geometry = getBoardGeometry(metrics.width, metrics.height);
  for (const progress of [.3, .45, .6, .72]) {
    const at = geometry.toCanvas(pointOnBoardPath(path, progress));
    const x=metrics.rect.x + at[0] * metrics.rect.width / metrics.width;
    const y=metrics.rect.y + at[1] * metrics.rect.height / metrics.height;
    await page.mouse.click(x,y);
    if (await page.getByRole("button", { name: "一键改直线", exact: true }).isVisible()) return;
  }
}

for (const skill of FIXED_SKILLS) {
  test(`${skill.label} exposes its first-stage court and returns without changing the personal point`, async ({ page }) => {
    await seedAndOpenPoint(page);
    const originalBoards = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
    await openSkillPractice(page, skill.label);

    const stage = SKILL_PRACTICES.find((plan) => plan.id === skill.id)!.stages[0];
    const beatLabels = stage.board.frames.filter((frame) => frame.paths.length > 0).map((frame) => frame.label).join("、");
    await expect(page.getByRole("img", { name: `网球场示范：${beatLabels}。${stage.task}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /暂停练习示范|重新播放练习示范/ })).toBeVisible();

    await page.getByRole("button", { name: "返回上一页", exact: true }).click();
    await waitForFlowSettled(page);
    await expect(page.getByTestId("board-canvas")).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(originalBoards);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  });
}

test("does not offer a tactic link before the child draws a point", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await waitForWorkspace(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("board-learning-entry")).toHaveCount(0);
});

test("hides the tactic shortcut during playback and restores it for editing", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openBoardSettings(page);
  await expect(page.getByTestId("board-learning-entry")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /播放战术/ }).click();
  await expect(page.getByTestId("board-learning-entry")).toHaveCount(0);
  await page.getByRole("button", { name: "继续修改", exact: true }).click();
  await openBoardSettings(page);
  await expect(page.getByTestId("board-learning-entry")).toBeVisible();
});

test("opens contextual tactic choices from board settings", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openBoardSettings(page);
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(menu.getByTestId("board-learning-entry")).toBeVisible();
  await page.keyboard.press("Escape");
  const sheet = await openLearningSheet(page);
  await expect(sheet.getByRole("button", { name: "练一项", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /拉开空档/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "返回下一步选择" })).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

test("connects an existing personal point to a skill through normal UI and reopens it after reload", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await expect(page.getByTestId("skill-practice-board")).toBeVisible();
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.locator(".phone-stage")).toHaveAttribute("data-board-immersive", "true");
  await expect(page.getByTestId("flow-fixed-header")).toHaveCount(0);

  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(stored).toMatchObject({ version: 1, records: [{ boardId: pointBoard.id, route: "skill", skillId: "recovery" }] });

  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  const skillSheet = await openSkillChoices(page);
  const savedSkill = skillSheet.locator(".learning-current");
  await expect(savedSkill).toContainText("击球后回位");
  await savedSkill.click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "击球后回位", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回上一页", exact: true })).toBeVisible();
});

for (const skill of FIXED_SKILLS) {
  test(`${skill.label} remains linked to its board after closing and reopening the page`, async ({ page, context }) => {
    test.setTimeout(45_000);
    await seedAndOpenPoint(page);
    const originalBoards = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
    await openSkillPractice(page, skill.label);
    const stage = SKILL_PRACTICES.find(plan => plan.id === skill.id)!.stages[0];
    await expect(page.getByRole("img", { name: new RegExp(stage.task) })).toBeVisible();
    await chooseCurrentSkill(page, skill.label);
    await waitForFlowSettled(page);
    await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
    const records = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
    expect(records).toMatchObject({ records: [{ boardId: pointBoard.id, route: "skill", skillId: skill.id }] });
    expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(originalBoards);

    await page.close();
    const reopened = await context.newPage();
    await reopened.emulateMedia({ reducedMotion: "reduce" });
    await reopened.goto("/");
    await waitForWorkspace(reopened);
    await waitForFlowSettled(reopened);
    const choices = await openSkillChoices(reopened);
    await expect(choices.locator(".learning-current")).toContainText(skill.label);
  });
}

test("iPad touch can choose a first-stage skill in portrait and recover it in landscape", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(({ key, board }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
    }, { key: BOARD_KEY, board: pointBoard });
    await page.reload();
    await waitForWorkspace(page);
    await expect(page.getByTestId("board-canvas")).toBeVisible();
    await waitForFlowSettled(page);
    const originalBoards = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
    await openBoardSettings(page);
    await page.getByTestId("board-learning-entry").tap();
    await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).tap();
    await page.getByRole("dialog", { name: "这次先练好一件事" }).getByRole("button", { name: /击球后回位/ }).last().tap();
    await waitForFlowSettled(page);
    await expect(page.getByTestId("skill-practice-board")).toBeVisible();
    await page.getByRole("button", { name: /暂停练习示范|重新播放练习示范/ }).tap({ timeout: 8_000 });
    await page.getByRole("button", { name: "打开击球后回位训练说明" }).tap({ timeout: 8_000 });
    await expect(page.getByRole("dialog", { name: "击球后回位" })).toBeVisible();
    await page.getByRole("dialog", { name: "击球后回位" }).getByRole("button", { name: "练这个" }).tap({ timeout: 8_000 });
    await waitForFlowSettled(page);
    await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(originalBoards);

    await page.setViewportSize({ width: 1024, height: 768 });
    const canvas = await page.getByTestId("flow-current").getByTestId("board-canvas").boundingBox();
    expect(canvas).not.toBeNull();
    expect(canvas!.x).toBeGreaterThanOrEqual(0);
    expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(1024);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto("/");
    await waitForWorkspace(reopened);
    await waitForFlowSettled(reopened);
    await openBoardSettings(reopened);
    await reopened.getByTestId("board-learning-entry").tap();
    await reopened.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).tap();
    await expect(reopened.getByRole("dialog", { name: "这次先练好一件事" }).locator(".learning-current")).toContainText("击球后回位");
  } finally {
    await context.close();
  }
});

test("two personal boards keep separate skill choices and do not create empty drafts", async ({ page }) => {
  test.setTimeout(60_000);
  const otherBoard: BoardDocument = { ...pointBoard, id: "learning-other-board", title: "另一张个人画板", updatedAt: "2026-09-19T09:00:00.000Z" };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, boards }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ version: 1, boards }));
  }, { key: BOARD_KEY, boards: [pointBoard, otherBoard] });
  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);

  await openBoardLibrary(page);
  await page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: otherBoard.title }).click();
  await waitForFlowSettled(page);
  const beforeChoice = await openSkillChoices(page);
  await expect(beforeChoice.locator(".learning-current")).toHaveCount(0);
  await beforeChoice.getByRole("button", { name: /变线控制/ }).last().click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "变线控制", exact: true })).toBeVisible();
  await chooseCurrentSkill(page, "变线控制");
  await waitForFlowSettled(page);

  const saved = await page.evaluate(({ boardsKey, learningKey }) => ({
    boards: JSON.parse(localStorage.getItem(boardsKey) ?? "null") as { boards: BoardDocument[] },
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
  }), { boardsKey: BOARD_KEY, learningKey: LEARNING_KEY });
  expect(saved.boards.boards.map(board => board.id).sort()).toEqual([pointBoard.id, otherBoard.id].sort());
  expect(saved.learning.records.map(record => [record.boardId, record.skillId]).sort()).toEqual([
    [pointBoard.id, "recovery"], [otherBoard.id, "direction-change"],
  ].sort());

  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await reopenWorkspaceBoard(page, pointBoard.title);
  const firstChoice = await openSkillChoices(page);
  await expect(firstChoice.locator(".learning-current")).toContainText("击球后回位");
  await firstChoice.getByRole("button", { name: "关闭下一步" }).click();
  await openBoardLibrary(page);
  await page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: otherBoard.title }).click();
  await waitForFlowSettled(page);
  const secondChoice = await openSkillChoices(page);
  await expect(secondChoice.locator(".learning-current")).toContainText("变线控制");
});

test("returns from a skill without painting its old header or guide over the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await page.getByRole("button", { name: "打开击球后回位训练说明" }).click();
  await expect(page.getByRole("dialog", { name: "击球后回位", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.getByRole("button", { name: "练这个", exact: true }).click();
  const transition = await page.evaluate(() => {
    const board = document.querySelector('.flow-screen[data-flow-current="true"] .board-editor');
    const oldScreen = document.querySelector(".flow-screen:has(.skill-practice-screen)");
    const oldGuide = document.querySelector(".bottom-sheet:has(.skill-practice-guide)");
    const oldOverlay = document.querySelector(".sheet-overlay");
    const paints = (element: Element | null) => Boolean(element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
    return {
      boardCurrent: Boolean(board),
      oldHeaderVisible: paints(oldScreen),
      oldGuideVisible: paints(oldGuide),
      oldOverlayVisible: paints(oldOverlay),
    };
  });
  expect(transition).toEqual({ boardCurrent: true, oldHeaderVisible: false, oldGuideVisible: false, oldOverlayVisible: false });
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("flow-fixed-header")).toHaveCount(0);
});

test("returns from merely viewing a skill without exposing the old board header or saving a choice", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  const transition = await page.evaluate(() => {
    const board = document.querySelector('.flow-screen[data-flow-current="true"] .board-editor');
    const oldScreen = document.querySelector(".flow-screen:has(.skill-practice-screen)");
    const oldHeader = document.querySelector(".flow-fixed-header");
    const paints = (element: Element | null) => Boolean(element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
    return { boardCurrent: Boolean(board), oldPracticeVisible: paints(oldScreen), oldHeaderVisible: paints(oldHeader) };
  });
  expect(transition).toEqual({ boardCurrent: true, oldPracticeVisible: false, oldHeaderVisible: false });
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("flow-fixed-header")).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

test("viewing or cancelling another skill keeps the existing choice and creates no practice draft", async ({ page }) => {
  await seedAndOpenPoint(page);
  const draftBefore = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);

  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);

  await openSkillPractice(page, "变线控制");
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();

  const learning = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(learning).toMatchObject({ records: [{ boardId: pointBoard.id, route: "skill", skillId: "recovery" }] });
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(draftBefore);
});

test("viewing a skill without choosing it does not add a draft or learning record", async ({ page }) => {
  await seedAndOpenPoint(page);
  const draftBefore = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
  await openSkillPractice(page, "连上下一拍");
  await expect(page.getByTestId("skill-practice-board")).toBeVisible();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(draftBefore);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

test("does not report success or leave the practice screen when saving the skill choice fails", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "发球落点");
  await page.evaluate((learningKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === learningKey) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, LEARNING_KEY);
  await page.getByRole("button", { name: /打开发球落点训练说明/ }).click();
  const guide = page.getByRole("dialog", { name: "发球落点", exact: true });
  await guide.getByRole("button", { name: "练这个", exact: true }).click();
  await expect(guide.getByRole("alert")).toContainText("尚未保存");
  await expect(page.getByRole("heading", { name: "发球落点", exact: true })).toBeVisible();
  await expect(guide.getByRole("button", { name: "练这个", exact: true })).toBeEnabled();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

test("keeps a board and its skill choice when linked deletion cannot be completed", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);

  await page.evaluate((learningKey) => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string) {
      if (key === learningKey) throw new DOMException("storage blocked", "QuotaExceededError");
      return original.call(this, key);
    };
  }, LEARNING_KEY);

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);

  await expect(library.getByRole("alert")).toContainText(`暂时无法删除「${pointBoard.title}」，请重试`);
  await expect(row).toBeVisible();
  await expect(library.getByText(/已删除/)).toHaveCount(0);
  const persisted = await page.evaluate(({ boardKey, learningKey, boardId }) => ({
    boardIds: (JSON.parse(window.localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards.map((board) => board.id),
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null"),
    boardId,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, boardId: pointBoard.id });
  expect(persisted.boardIds).toContain(persisted.boardId);
  expect(persisted.learning).toMatchObject({ records: [{ boardId: pointBoard.id, route: "skill", skillId: "recovery" }] });
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, note: "回位更早了" }] });
});

test("rolls back the skill choice when deleting its observation fails", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate((followUpKey) => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string) {
      if (key === followUpKey) throw new DOMException("storage blocked", "QuotaExceededError");
      return original.call(this, key);
    };
  }, FOLLOW_UP_KEY);
  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(library.getByRole("alert")).toContainText(`暂时无法删除「${pointBoard.title}」，请重试`);
  await expect(row).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), LEARNING_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, skillId: "recovery" }] });
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, note: "回位更早了" }] });
});

test("removes the linked skill choice only after its board can be deleted", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);

  await expect(row).toHaveCount(0);
  await expect(library.getByRole("status")).toContainText(`已删除「${pointBoard.title}」`);
  const persisted = await page.evaluate(({ boardKey, learningKey, boardId }) => ({
    boardIds: (JSON.parse(window.localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards.map((board) => board.id),
    learning: window.localStorage.getItem(learningKey),
    boardId,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, boardId: pointBoard.id });
  expect(persisted.boardIds).not.toContain(persisted.boardId);
  expect(persisted.learning).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), FOLLOW_UP_KEY)).toBeNull();
});

test("restores the linked skill choice when the board deletion write fails", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate((boardKey) => {
    const original = Storage.prototype.setItem;
    let failNextBoardWrite = true;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === boardKey && failNextBoardWrite) {
        failNextBoardWrite = false;
        throw new DOMException("storage blocked", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  }, BOARD_KEY);

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);

  await expect(library.getByRole("alert")).toContainText(`暂时无法删除「${pointBoard.title}」，请重试`);
  await expect(row).toBeVisible();
  const persisted = await page.evaluate(({ boardKey, learningKey, boardId }) => ({
    boardIds: (JSON.parse(window.localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards.map((board) => board.id),
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null"),
    boardId,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, boardId: pointBoard.id });
  expect(persisted.boardIds).toContain(persisted.boardId);
  expect(persisted.learning).toMatchObject({ records: [{ boardId: pointBoard.id, route: "skill", skillId: "recovery" }] });
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, note: "回位更早了" }] });
});

test("recovers linked records after deleting the board and restoring its choice both fail", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate(({ boardKey, learningKey }) => {
    const original = Storage.prototype.setItem;
    let failBoardDelete = true;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === boardKey && failBoardDelete) {
        failBoardDelete = false;
        throw new DOMException("board write blocked", "QuotaExceededError");
      }
      if (key === learningKey) {
        throw new DOMException("choice restore blocked", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY });

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(library.getByRole("alert")).toContainText("关联记录未能完整恢复");
  await expect(row).toBeVisible();
  await expect(library.getByText(/已删除/)).toHaveCount(0);

  await page.reload();
  await waitForWorkspace(page);
  await openBoardLibrary(page);
  await page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: pointBoard.title }).click();
  await waitForFlowSettled(page);
  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, note: "回位更早了" }] });
});

test("does not start linked deletion if its recovery journal cannot be saved", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate((journalKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === journalKey) throw new DOMException("journal write blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, DELETE_JOURNAL_KEY);

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(library.getByRole("alert")).toContainText("未开始删除");
  await expect(row).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DELETE_JOURNAL_KEY)).toBeNull();
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), LEARNING_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, skillId: "recovery" }] });
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY)).toMatchObject({ records: [{ boardId: pointBoard.id, note: "回位更早了" }] });
});

test("can delete an unlinked board even when journal writes are unavailable", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate(({ learningKey, followUpKey, journalKey }) => {
    window.localStorage.removeItem(learningKey);
    window.localStorage.removeItem(followUpKey);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === journalKey) throw new DOMException("journal write blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, { learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY, journalKey: DELETE_JOURNAL_KEY });

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(row).toHaveCount(0);
  await expect(library.getByRole("status")).toContainText(`已删除「${pointBoard.title}」`);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DELETE_JOURNAL_KEY)).toBeNull();
});

test("reports incomplete cleanup without resurrecting a successfully deleted board", async ({ page }) => {
  await seedLinkedBoardAndOpenLibrary(page);
  await page.evaluate((journalKey) => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string) {
      if (key === journalKey) throw new DOMException("journal cleanup blocked", "QuotaExceededError");
      return original.call(this, key);
    };
  }, DELETE_JOURNAL_KEY);

  const library = page.getByTestId("flow-current");
  const row = library.getByRole("region", { name: "全部画板", exact: true }).locator(".board-draft-list > article").filter({ hasText: pointBoard.title });
  await row.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(row).toHaveCount(0);
  await expect(library.getByRole("alert")).toContainText("删除记录尚未清理");
  await expect(library.locator(".board-draft-open").filter({ hasText: "仍在打开的画板" })).toBeEnabled();
  await expect(library.getByRole("status").filter({ hasText: `已删除「${pointBoard.title}」` })).toHaveCount(0);

  await page.reload();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DELETE_JOURNAL_KEY)).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), FOLLOW_UP_KEY)).toBeNull();
  const storedBoards = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null") as { boards: BoardDocument[] }, BOARD_KEY);
  expect(storedBoards.boards.map((board) => board.id)).not.toContain(pointBoard.id);
});

test("imports a linked board backup and reopens its skill from the normal UI", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openBoardLibrary(page);

  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "linked-board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      kind: "rallypath-board-backup",
      version: 1,
      board: pointBoard,
      learning: {
        version: 1,
        boardId: pointBoard.id,
        route: "skill",
        skillId: "recovery",
        updatedAt: "2026-09-20T10:00:00.000Z",
      },
      followUp: { version: 1, id: "observation-imported", boardId: pointBoard.id, frameId: "opening", progress: .5, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
    })),
  });
  await waitForFlowSettled(page);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();

  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
  const persisted = await page.evaluate(({ boardKey, learningKey, sourceId }) => {
    const boards = (JSON.parse(window.localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards;
    const learning = JSON.parse(window.localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> };
    return { boardId: boards[0]?.id, sourceId, learning };
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, sourceId: pointBoard.id });
  expect(persisted.boardId).not.toBe(persisted.sourceId);
  expect(persisted.learning).toMatchObject({ records: [{ boardId: persisted.boardId, skillId: "recovery" }] });
  const restoredFollowUp = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY);
  expect(restoredFollowUp).toMatchObject({ records: [{ boardId: persisted.boardId, frameId: "opening", note: "回位更早了" }] });
});

test("retired discoveries remain in editable backups, copies, and imports without becoming court text", async ({ page }) => {
  await seedAndOpenPoint(page);
  await seedLegacyObservation(page, "回位更早了");
  await page.evaluate(({ key, boardId }) => {
    const now = "2026-09-20T10:00:00.000Z";
    localStorage.setItem(key, JSON.stringify({ version: 1, records: [{
      version: 1, id: "legacy-discovery", boardId, frameId: "opening", progress: .5,
      note: "对手回中路太慢", nextTry: "下一次打另一边", uncertain: false,
      createdAt: now, updatedAt: now,
    }] }));
  }, { key: DISCOVERY_KEY, boardId: pointBoard.id });

  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const share = page.getByRole("dialog", { name: "保存与分享", exact: true });
  const downloadPromise = page.waitForEvent("download");
  await share.getByRole("button", { name: /^备份画板/ }).click();
  const download = await downloadPromise;
  const buffer = await readFile(await download.path());
  const backup = JSON.parse(buffer.toString("utf8"));
  expect(backup).toMatchObject({
    version: 2,
    board: { id: pointBoard.id, frames: [{ marks: [] }] },
    followUp: { boardId: pointBoard.id, note: "回位更早了" },
    discovery: { boardId: pointBoard.id, note: "对手回中路太慢", nextTry: "下一次打另一边" },
  });

  await share.getByRole("button", { name: /^另存一份/ }).click();
  const copied = await page.evaluate(({ boardKey, followUpKey, discoveryKey, sourceId }) => {
    const boards = (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards;
    const followUps = (JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> }).records;
    const discoveries = (JSON.parse(localStorage.getItem(discoveryKey) ?? "null") as { records: Array<{ boardId: string; note: string; nextTry: string }> }).records;
    return { boards, followUps, discoveries, sourceId };
  }, { boardKey: BOARD_KEY, followUpKey: FOLLOW_UP_KEY, discoveryKey: DISCOVERY_KEY, sourceId: pointBoard.id });
  expect(copied.boards).toHaveLength(2);
  const copyId = copied.boards.find(board => board.id !== pointBoard.id)?.id;
  expect(copyId).toBeTruthy();
  expect(copied.followUps.find(item => item.boardId === copyId)).toMatchObject({ note: "回位更早了" });
  expect(copied.discoveries.find(item => item.boardId === copyId)).toMatchObject({ note: "对手回中路太慢", nextTry: "下一次打另一边" });
  expect(copied.boards.find(board => board.id === copyId)?.frames[0].marks).toEqual([]);

  await share.getByRole("button", { name: "关闭保存与分享", exact: true }).click();
  await openBoardLibrary(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: "application/json", buffer,
  });
  await waitForFlowSettled(page);
  const imported = await page.evaluate(({ boardKey, followUpKey, discoveryKey }) => {
    const boards = (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards;
    const followUps = (JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> }).records;
    const discoveries = (JSON.parse(localStorage.getItem(discoveryKey) ?? "null") as { records: Array<{ boardId: string; note: string; nextTry: string }> }).records;
    const board = boards.find(item => item.title.endsWith("（导入）"));
    return { board, followUp: followUps.find(item => item.boardId === board?.id), discovery: discoveries.find(item => item.boardId === board?.id) };
  }, { boardKey: BOARD_KEY, followUpKey: FOLLOW_UP_KEY, discoveryKey: DISCOVERY_KEY });
  expect(imported.board?.id).toBeTruthy();
  expect(imported.board?.id).not.toBe(pointBoard.id);
  expect(imported.board?.frames[0].marks).toEqual([]);
  expect(imported.followUp).toMatchObject({ note: "回位更早了" });
  expect(imported.discovery).toMatchObject({ note: "对手回中路太慢", nextTry: "下一次打另一边" });
});

test("retired point and practice notes are available only on demand in board management without rewriting them", async ({ page }) => {
  await seedAndOpenPoint(page);
  await seedLegacyObservation(page, "回位更早了");
  await page.evaluate(({ key, boardId }) => {
    const now = "2026-09-20T10:00:00.000Z";
    localStorage.setItem(key, JSON.stringify({ version: 1, records: [{
      version: 1, id: "legacy-discovery", boardId, frameId: "opening", progress: .5,
      note: "对手回中路太慢", nextTry: "下一次打另一边", uncertain: false,
      createdAt: now, updatedAt: now,
    }] }));
  }, { key: DISCOVERY_KEY, boardId: pointBoard.id });
  const before = await page.evaluate(({ boardKey, followUpKey, discoveryKey }) => ({
    board: localStorage.getItem(boardKey), followUp: localStorage.getItem(followUpKey), discovery: localStorage.getItem(discoveryKey),
  }), { boardKey: BOARD_KEY, followUpKey: FOLLOW_UP_KEY, discoveryKey: DISCOVERY_KEY });

  await openBoardLibrary(page);
  const library = page.getByTestId("flow-current");
  await expect(library.getByText("对手回中路太慢")).toHaveCount(0);
  await library.getByRole("button", { name: "查看旧记录" }).click();
  const legacy = library.getByRole("region", { name: "以前留下的记录" });
  await expect(legacy).toContainText(pointBoard.title);
  await expect(legacy).toContainText("对手回中路太慢");
  await expect(legacy).toContainText("下一次打另一边");
  await expect(legacy).toContainText("回位更早了");
  await expect(legacy.getByRole("textbox")).toHaveCount(0);
  await expect(legacy.getByRole("button", { name: /保存|编辑|删除/ })).toHaveCount(0);
  expect(await page.evaluate(({ boardKey, followUpKey, discoveryKey }) => ({
    board: localStorage.getItem(boardKey), followUp: localStorage.getItem(followUpKey), discovery: localStorage.getItem(discoveryKey),
  }), { boardKey: BOARD_KEY, followUpKey: FOLLOW_UP_KEY, discoveryKey: DISCOVERY_KEY })).toEqual(before);
});

test("board management can read a retired discovery even when an older page removed its board", async ({ page }) => {
  await page.goto("/");
  const raw = JSON.stringify({ version: 1, records: [{
    version: 1, id: "orphan-discovery", boardId: "older-removed-board", frameId: "opening",
    note: "这分先看对手站位", nextTry: "下次回深中路", uncertain: false,
    createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z",
  }] });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: DISCOVERY_KEY, value: raw });
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await library.getByRole("button", { name: "查看旧记录" }).click();
  const legacy = library.getByRole("region", { name: "以前留下的记录" });
  await expect(legacy).toContainText("原画板已不在本机");
  await expect(legacy).toContainText("这分先看对手站位");
  await expect(legacy).toContainText("下次回深中路");
  expect(await page.evaluate(key => localStorage.getItem(key), DISCOVERY_KEY)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBeNull();
});

test("board management reports a damaged retired record without rewriting its raw data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(key => localStorage.setItem(key, "{damaged"), DISCOVERY_KEY);
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await library.getByRole("button", { name: "查看旧记录" }).click();
  const legacy = library.getByRole("region", { name: "以前留下的记录" });
  await expect(legacy.getByRole("alert")).toContainText("原资料没有更改");
  await expect(legacy.getByRole("button", { name: "导出原始资料" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), DISCOVERY_KEY)).toBe("{damaged");
});

test("an interrupted linked backup import leaves no partial board and can be retried after reopening", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const backup = {
    kind: "rallypath-board-backup",
    version: 1,
    board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    followUp: { version: 1, id: "observation-imported", boardId: pointBoard.id, frameId: "opening", progress: .5, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
  };
  const file = { name: "interrupted-linked-board.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };

  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key && failOnce) {
        failOnce = false;
        throw new Error("test interrupted observation write");
      }
      return original.call(this, name, value);
    };
  }, FOLLOW_UP_KEY);

  const chooseBackup = async () => {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("flow-current").getByRole("button", { name: "导入备份" }).click();
    await (await chooserPromise).setFiles(file);
  };
  await chooseBackup();
  await expect(page.getByRole("alert")).toContainText("这个备份还没完整存下来，请重试");
  expect(await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    board: localStorage.getItem(boardKey),
    learning: localStorage.getItem(learningKey),
    followUp: localStorage.getItem(followUpKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY })).toEqual({ board: null, learning: null, followUp: null });

  await page.reload();
  await waitForWorkspace(page);
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBeNull();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await chooseBackup();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const persisted = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards,
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    followUp: JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> },
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(persisted.boards).toHaveLength(1);
  expect(persisted.learning.records).toMatchObject([{ boardId: persisted.boards[0].id, skillId: "recovery" }]);
  expect(persisted.followUp.records).toMatchObject([{ boardId: persisted.boards[0].id, note: "回位更早了" }]);
});

test("retrying a linked import after cleanup also fails completes the same board", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const backup = {
    kind: "rallypath-board-backup",
    version: 1,
    board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    followUp: { version: 1, id: "observation-imported", boardId: pointBoard.id, frameId: "opening", progress: .5, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
  };
  const file = { name: "retry-partial-board.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };

  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.evaluate(({ boardKey, followUpKey }) => {
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    let failFollowUp = true;
    let failBoardCleanup = true;
    Storage.prototype.setItem = function setItemOnce(name: string, value: string) {
      if (name === followUpKey && failFollowUp) {
        failFollowUp = false;
        throw new Error("test interrupted observation write");
      }
      return setItem.call(this, name, value);
    };
    Storage.prototype.removeItem = function removeItemOnce(name: string) {
      if (name === boardKey && failBoardCleanup) {
        failBoardCleanup = false;
        throw new Error("test failed board cleanup");
      }
      return removeItem.call(this, name);
    };
  }, { boardKey: BOARD_KEY, followUpKey: FOLLOW_UP_KEY });

  const chooseBackup = async (selectedFile = file) => {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("flow-current").getByRole("button", { name: "导入备份" }).click();
    await (await chooserPromise).setFiles(selectedFile);
  };
  await chooseBackup();
  await expect(page.getByRole("alert")).toContainText("导入未完成");
  expect(await page.evaluate(key => localStorage.getItem(key), IMPORT_JOURNAL_KEY)).not.toBeNull();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await expect(page.locator('.board-error-action[role="status"]')).toContainText("重新选择同一份备份继续");
  await expect(page.getByTestId("flow-current").locator(".board-draft-open")).toHaveCount(0);
  await chooseBackup({ ...file, name: "another-board.json", buffer: Buffer.from(JSON.stringify({ ...backup, board: { ...pointBoard, title: "另一张画板" } })) });
  await expect(page.getByRole("alert")).toContainText("请重新选择同一份备份");
  await chooseBackup();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();

  const persisted = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards,
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    followUp: JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> },
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(persisted.boards).toHaveLength(1);
  expect(persisted.learning.records).toMatchObject([{ boardId: persisted.boards[0].id, skillId: "recovery" }]);
  expect(persisted.followUp.records).toMatchObject([{ boardId: persisted.boards[0].id, note: "回位更早了" }]);
  expect(await page.evaluate(key => localStorage.getItem(key), IMPORT_JOURNAL_KEY)).toBeNull();
});

test("a damaged import marker does not present a possibly partial board as complete", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, "{damaged-import-marker");
  }, { boardKey: BOARD_KEY, journalKey: IMPORT_JOURNAL_KEY, board: pointBoard });
  await page.reload();

  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact: true })).toBeVisible();
  const library = page.getByTestId("flow-current");
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  await library.getByRole("button", { name: "重试检查" }).click();
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  const exportButton = library.getByRole("button", { name: "导出原始资料" });
  await expect(exportButton).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^rallypath-recovery-\d{4}-\d{2}-\d{2}\.json$/);
  const snapshot = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(snapshot).toMatchObject({ kind: "rallypath-local-recovery", version: 1,
    records: { [IMPORT_JOURNAL_KEY]: "{damaged-import-marker" } });
  expect(JSON.parse(snapshot.records[BOARD_KEY]).boards).toMatchObject([{ id: pointBoard.id }]);
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error("test download unavailable"); }; });
  await exportButton.click();
  await expect(library.locator(".board-library-status[role='alert']")).toContainText("暂时无法导出原始资料");
  await expect(library.getByText("已请求浏览器下载", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), IMPORT_JOURNAL_KEY)).toBe("{damaged-import-marker");
});

test("a damaged copy marker offers a complete raw recovery download from the normal UI", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, "{damaged-copy-marker");
  }, { boardKey: BOARD_KEY, journalKey: COPY_JOURNAL_KEY, board: pointBoard });
  await page.reload();

  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await library.getByRole("button", { name: "导出原始资料" }).click();
  const download = await downloadPromise;
  const snapshot = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(snapshot).toMatchObject({ kind: "rallypath-local-recovery", version: 1,
    records: { [COPY_JOURNAL_KEY]: "{damaged-copy-marker" } });
  expect(JSON.parse(snapshot.records[BOARD_KEY]).boards).toMatchObject([{ id: pointBoard.id }]);
  expect(await page.evaluate(key => localStorage.getItem(key), COPY_JOURNAL_KEY)).toBe("{damaged-copy-marker");
});

test("opening another tab cannot clean a copy whose board has not been published yet", async ({ page }) => {
  const target = { ...pointBoard, id: "copy-still-writing", title: "仍在另存的副本" };
  const choice = { version: 1, boardId: target.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-26T08:00:00.000Z" };
  const marker = { version: 1, sourceId: pointBoard.id, targetId: target.id, learning: choice };
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, journalKey, board, linkedChoice, pending }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(learningKey, JSON.stringify({ version: 1, records: [linkedChoice] }));
    localStorage.setItem(journalKey, JSON.stringify(pending));
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY,
    board: pointBoard, linkedChoice: choice, pending: marker });

  const otherTab = await page.context().newPage();
  await otherTab.goto("/");
  await expect(otherTab.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await expect(otherTab.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(otherTab);
  await waitForFlowSettled(otherTab);
  await otherTab.getByTestId("flow-current").getByRole("button", { name: "重试检查" }).click();
  const duringCopy = await otherTab.evaluate(({ learningKey, journalKey }) => ({
    choice: JSON.parse(localStorage.getItem(learningKey) ?? "null")?.records?.[0],
    journal: localStorage.getItem(journalKey),
  }), { learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY });
  expect(duringCopy.choice).toMatchObject(choice);
  expect(duringCopy.journal).toBe(JSON.stringify(marker));

  await page.evaluate(({ boardKey, board, copy }) => {
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board, copy] }));
  }, { boardKey: BOARD_KEY, board: pointBoard, copy: target });
  await otherTab.reload();
  const completed = await otherTab.evaluate(({ learningKey, journalKey }) => ({
    choice: JSON.parse(localStorage.getItem(learningKey) ?? "null")?.records?.[0],
    journal: localStorage.getItem(journalKey),
  }), { learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY });
  expect(completed.choice).toMatchObject(choice);
  expect(completed.journal).toBeNull();
  await otherTab.close();
});

test("a discard confirmation closes when another tab replaces the pending copy", async ({ page }) => {
  const firstChoice = { version: 1, boardId: "pending-copy-one", route: "skill", skillId: "recovery", updatedAt: "2026-09-26T08:00:00.000Z" };
  const nextChoice = { ...firstChoice, boardId: "pending-copy-two" };
  const first = { version: 1, sourceId: pointBoard.id, targetId: firstChoice.boardId, learning: firstChoice };
  const next = { ...first, targetId: nextChoice.boardId, learning: nextChoice };
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, journalKey, board, choices, marker }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(learningKey, JSON.stringify({ version: 1, records: choices }));
    localStorage.setItem(journalKey, JSON.stringify(marker));
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY,
    board: pointBoard, choices: [firstChoice, nextChoice], marker: first });
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await library.getByRole("button", { name: "放弃未完成的副本" }).click();
  await expect(library.getByRole("group", { name: "确认放弃未完成的副本" })).toBeVisible();

  const otherTab = await page.context().newPage();
  await otherTab.goto("/");
  await otherTab.evaluate(({ journalKey, marker }) => localStorage.setItem(journalKey, JSON.stringify(marker)),
    { journalKey: COPY_JOURNAL_KEY, marker: next });
  await expect(library.getByRole("group", { name: "确认放弃未完成的副本" })).toHaveCount(0);
  expect(await page.evaluate(({ learningKey, journalKey }) => ({
    choices: JSON.parse(localStorage.getItem(learningKey) ?? "null")?.records,
    marker: localStorage.getItem(journalKey),
  }), { learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY })).toMatchObject({
    choices: [firstChoice, nextChoice], marker: JSON.stringify(next),
  });
  await otherTab.close();
});

test("a damaged import title can be repaired only with its original backup without duplicating the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const targetId = "repairable-import-board";
  const backup = {
    kind: "rallypath-board-backup",
    version: 1,
    board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    followUp: { version: 1, id: "observation-imported", boardId: pointBoard.id, frameId: "opening", progress: .5,
      skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？",
      note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
  };
  const serialized = JSON.stringify(backup);
  const damagedMarker = JSON.stringify({ version: 1, signature: boardBackupSignature(serialized), targetId, targetTitle: null });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board, marker }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, marker);
  }, { boardKey: BOARD_KEY, journalKey: IMPORT_JOURNAL_KEY,
    board: { ...pointBoard, id: targetId, title: `${pointBoard.title}（导入）` }, marker: damagedMarker });
  await page.reload();

  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  const repair = library.getByRole("button", { name: "选择原备份修复" });
  await expect(repair).toBeVisible();
  const choose = async (contents: string) => {
    const chooserPromise = page.waitForEvent("filechooser");
    await repair.click();
    await (await chooserPromise).setFiles({ name: "original-backup.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  };
  await choose(JSON.stringify({ ...backup, board: { ...pointBoard, title: "另一份画板" } }));
  await expect(library.getByRole("alert")).toContainText("不是上次同一份备份");
  expect(await page.evaluate(key => localStorage.getItem(key), IMPORT_JOURNAL_KEY)).toBe(damagedMarker);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null").boards.length, BOARD_KEY)).toBe(1);

  await choose(serialized);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const persisted = await page.evaluate(({ boardKey, learningKey, followUpKey, journalKey }) => ({
    boards: JSON.parse(localStorage.getItem(boardKey) ?? "null").boards as BoardDocument[],
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    followUp: JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> },
    journal: localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY, journalKey: IMPORT_JOURNAL_KEY });
  expect(persisted.boards).toHaveLength(1);
  expect(persisted.boards[0]).toMatchObject({ id: targetId, title: `${pointBoard.title}（导入）` });
  expect(persisted.learning.records).toMatchObject([{ boardId: targetId, skillId: "recovery" }]);
  expect(persisted.followUp.records).toMatchObject([{ boardId: targetId, note: "回位更早了" }]);
  expect(persisted.journal).toBeNull();

  await page.reload();
  await waitForWorkspace(page);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
});

test("a damaged import marker cannot attach a backup to a changed target board", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const targetId = "changed-import-target";
  const serialized = JSON.stringify({ kind: "rallypath-board-backup", version: 1, board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" } });
  const marker = JSON.stringify({ version: 1, signature: boardBackupSignature(serialized), targetId, targetTitle: null });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board, markerValue }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, markerValue);
  }, { boardKey: BOARD_KEY, journalKey: IMPORT_JOURNAL_KEY,
    board: { ...pointBoard, id: targetId, title: "我已经改过的画板" }, markerValue: marker });
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("flow-current").getByRole("button", { name: "选择原备份修复" }).click();
  await (await chooserPromise).setFiles({ name: "same-backup.json", mimeType: "application/json", buffer: Buffer.from(serialized) });
  await expect(page.getByTestId("flow-current").getByRole("alert")).toContainText("已被修改，未覆盖");
  expect(await page.evaluate(({ boardKey, learningKey, journalKey }) => ({
    boards: (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards,
    learning: localStorage.getItem(learningKey), journal: localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: IMPORT_JOURNAL_KEY })).toMatchObject({
    boards: [{ id: targetId, title: "我已经改过的画板" }], learning: null, journal: marker,
  });
});

test("repairing a damaged import keeps its marker when final cleanup fails and retries the same board", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const targetId = "damaged-import-retry";
  const backup = {
    kind: "rallypath-board-backup", version: 1, board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
  };
  const serialized = JSON.stringify(backup);
  const damagedMarker = JSON.stringify({ version: 1, signature: boardBackupSignature(serialized), targetId, targetTitle: null });
  await page.goto("/");
  await page.evaluate(({ journalKey, marker }) => {
    localStorage.clear();
    localStorage.setItem(journalKey, marker);
  }, { journalKey: IMPORT_JOURNAL_KEY, marker: damagedMarker });
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.evaluate(key => {
    const original = Storage.prototype.removeItem;
    let failOnce = true;
    Storage.prototype.removeItem = function removeItemOnce(name: string) {
      if (name === key && failOnce) {
        failOnce = false;
        throw new Error("test final cleanup unavailable");
      }
      return original.call(this, name);
    };
  }, IMPORT_JOURNAL_KEY);
  const choose = async () => {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("flow-current").getByRole("button", { name: "选择原备份修复" }).click();
    await (await chooserPromise).setFiles({ name: "original.json", mimeType: "application/json", buffer: Buffer.from(serialized) });
  };
  await choose();
  await expect(page.getByTestId("flow-current").getByRole("alert")).toContainText("导入续接记录尚未清理");
  expect(await page.evaluate(key => localStorage.getItem(key), IMPORT_JOURNAL_KEY)).toBe(damagedMarker);
  expect(await page.evaluate(key => (JSON.parse(localStorage.getItem(key) ?? "null") as { boards: BoardDocument[] }).boards[0].id, BOARD_KEY)).toBe(targetId);

  await page.reload();
  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await choose();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const result = await page.evaluate(({ boardKey, learningKey, journalKey }) => ({
    boards: (JSON.parse(localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards,
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    journal: localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: IMPORT_JOURNAL_KEY });
  expect(result.boards).toHaveLength(1);
  expect(result.boards[0].id).toBe(targetId);
  expect(result.learning.records).toMatchObject([{ boardId: targetId, skillId: "recovery" }]);
  expect(result.journal).toBeNull();
});

test("a damaged deletion marker keeps existing boards safe until their links can be checked", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, "{damaged-delete-marker");
  }, { boardKey: BOARD_KEY, journalKey: DELETE_JOURNAL_KEY, board: pointBoard });
  await page.reload();

  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  await expect(library.getByRole("button", { name: "导出原始资料" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), DELETE_JOURNAL_KEY)).toBe("{damaged-delete-marker");
});

test("a deletion marker with only a damaged title restores links to its existing board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const marker = JSON.stringify({ version: 1, boardId: pointBoard.id, title: null,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    followUp: { version: 1, id: "observation-linked", boardId: pointBoard.id, frameId: "opening", progress: .5,
      skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？",
      note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
  });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board, journal }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, journal);
  }, { boardKey: BOARD_KEY, journalKey: DELETE_JOURNAL_KEY, board: pointBoard, journal: marker });
  await page.reload();

  await waitForWorkspace(page);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
  const stored = await page.evaluate(({ learningKey, followUpKey, journalKey }) => ({
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    followUp: JSON.parse(localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> },
    journal: localStorage.getItem(journalKey),
  }), { learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY, journalKey: DELETE_JOURNAL_KEY });
  expect(stored.learning.records).toMatchObject([{ boardId: pointBoard.id, skillId: "recovery" }]);
  expect(stored.followUp.records).toMatchObject([{ boardId: pointBoard.id, note: "回位更早了" }]);
  expect(stored.journal).toBeNull();
});

test("a damaged deletion title remains isolated when the original board is missing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const marker = JSON.stringify({ version: 1, boardId: pointBoard.id, title: null,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" } });
  await page.goto("/");
  await page.evaluate(({ journalKey, journal }) => {
    localStorage.clear();
    localStorage.setItem(journalKey, journal);
  }, { journalKey: DELETE_JOURNAL_KEY, journal: marker });
  await page.reload();

  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await expect(library.getByRole("button", { name: "导出原始资料" })).toBeVisible();
  await expect(library.getByRole("button", { name: "画一条新球路" })).toBeDisabled();
  expect(await page.evaluate(({ journalKey, learningKey }) => ({
    journal: localStorage.getItem(journalKey), learning: localStorage.getItem(learningKey),
  }), { journalKey: DELETE_JOURNAL_KEY, learningKey: LEARNING_KEY })).toEqual({ journal: marker, learning: null });
});

test("a damaged deletion title cannot restore mismatched linked records", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const marker = JSON.stringify({ version: 1, boardId: pointBoard.id, title: null,
    learning: { version: 1, boardId: "another-board", route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" } });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board, journal }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, journal);
  }, { boardKey: BOARD_KEY, journalKey: DELETE_JOURNAL_KEY, board: pointBoard, journal: marker });
  await page.reload();

  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await expect(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  expect(await page.evaluate(({ journalKey, learningKey }) => ({
    journal: localStorage.getItem(journalKey), learning: localStorage.getItem(learningKey),
  }), { journalKey: DELETE_JOURNAL_KEY, learningKey: LEARNING_KEY })).toEqual({ journal: marker, learning: null });
});

test("a damaged deletion title keeps the board held when link restoration fails and retries from the UI", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failFlag = "test-deny-delete-recovery";
  await page.addInitScript(({ learningKey, flag }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === learningKey && sessionStorage.getItem(flag) === "yes") throw new Error("test linked write unavailable");
      return original.call(this, name, value);
    };
  }, { learningKey: LEARNING_KEY, flag: failFlag });
  const marker = JSON.stringify({ version: 1, boardId: pointBoard.id, title: null,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" } });
  await page.goto("/");
  await page.evaluate(({ boardKey, journalKey, board, journal, flag }) => {
    localStorage.clear();
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(journalKey, journal);
    sessionStorage.setItem(flag, "yes");
  }, { boardKey: BOARD_KEY, journalKey: DELETE_JOURNAL_KEY, board: pointBoard, journal: marker, flag: failFlag });
  await page.reload();
  await expect(page.getByTestId("board-canvas")).toHaveCount(0);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeDisabled();
  await expect(library.getByRole("alert")).toContainText("关联选择尚未恢复");
  expect(await page.evaluate(({ journalKey, learningKey }) => ({
    journal: localStorage.getItem(journalKey), learning: localStorage.getItem(learningKey),
  }), { journalKey: DELETE_JOURNAL_KEY, learningKey: LEARNING_KEY })).toEqual({ journal: marker, learning: null });

  await page.evaluate(flag => sessionStorage.removeItem(flag), failFlag);
  await library.getByRole("button", { name: "重试检查" }).click();
  await expect(library.locator(".board-draft-open").filter({ hasText: pointBoard.title })).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), DELETE_JOURNAL_KEY)).toBeNull();
  await library.locator(".board-draft-open").filter({ hasText: pointBoard.title }).click();
  await waitForFlowSettled(page);
  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
});

test("an import never starts when its retry record cannot be saved", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function denyJournal(name: string, value: string) {
      if (name === key) throw new Error("test unavailable retry storage");
      return original.call(this, name, value);
    };
  }, IMPORT_JOURNAL_KEY);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("flow-current").getByRole("button", { name: "导入备份" }).click();
  await (await chooserPromise).setFiles({ name: "cannot-start.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pointBoard)) });
  await expect(page.getByRole("alert")).toContainText("未开始导入");
  expect(await page.evaluate(({ boardKey, learningKey, followUpKey, journalKey }) => ({
    board: localStorage.getItem(boardKey),
    learning: localStorage.getItem(learningKey),
    followUp: localStorage.getItem(followUpKey),
    journal: localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY, journalKey: IMPORT_JOURNAL_KEY })).toEqual({ board: null, learning: null, followUp: null, journal: null });
});

test("repeated backup imports remain separate and easy to distinguish", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openBoardLibrary(page);

  const backup = {
    kind: "rallypath-board-backup",
    version: 1,
    board: pointBoard,
    learning: { version: 1, boardId: pointBoard.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    followUp: { version: 1, id: "observation-imported", boardId: pointBoard.id, frameId: "opening", progress: .5, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回位更早了", uncertain: false, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z" },
  };
  const file = { name: "repeat-linked-board.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };
  const libraryFile = page.getByTestId("flow-current").locator('input[type="file"]');
  await libraryFile.setInputFiles(file);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  await waitForFlowSettled(page);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();

  const stored = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: (JSON.parse(window.localStorage.getItem(boardKey) ?? "null") as { boards: BoardDocument[] }).boards,
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null") as { records: Array<{ boardId: string; skillId: string }> },
    followUp: JSON.parse(window.localStorage.getItem(followUpKey) ?? "null") as { records: Array<{ boardId: string; note: string }> },
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(stored.boards.map((board) => board.title).sort()).toEqual([`${pointBoard.title}（导入 2）`, `${pointBoard.title}（导入）`].sort());
  expect(new Set(stored.boards.map((board) => board.id)).size).toBe(2);
  expect(stored.boards.every((board) => board.id !== pointBoard.id)).toBe(true);
  expect(new Set(stored.learning.records.map((record) => record.boardId))).toEqual(new Set(stored.boards.map((board) => board.id)));
  expect(new Set(stored.followUp.records.map((record) => record.boardId))).toEqual(new Set(stored.boards.map((board) => board.id)));
});

test("does not attach another board's skill when importing a mismatched backup", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openBoardLibrary(page);
  const boardsBefore = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "wrong-skill-board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      kind: "rallypath-board-backup",
      version: 1,
      board: pointBoard,
      learning: { version: 1, boardId: "different-board", route: "skill", skillId: "recovery", updatedAt: "2026-09-20T10:00:00.000Z" },
    })),
  });
  await expect(page.getByRole("alert")).toContainText("这个备份打不开");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(boardsBefore);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  await expect(page.getByTestId("flow-current").locator(".board-draft-open")).toHaveCount(1);
});

test("keeps the selected skill and observation when a personal board is saved as a copy", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);
  await seedLegacyObservation(page, "回位更早了");

  await openBoardSettings(page);
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await menu.getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await saveShare.getByRole("button", { name: /^另存一份/ }).click();
  await expect(saveShare.getByRole("status")).toContainText(`已另存为「${pointBoard.title} 副本」`);
  await saveShare.getByRole("button", { name: "关闭保存与分享", exact: true }).click();
  await openBoardLibrary(page);

  const copyRow = page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: `${pointBoard.title} 副本` });
  await expect(copyRow).toBeVisible();
  await copyRow.click();
  await waitForFlowSettled(page);
  const skillSheet = await openSkillChoices(page);
  await expect(skillSheet.locator(".learning-current")).toContainText("击球后回位");
  const records = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), FOLLOW_UP_KEY);
  expect(records.records).toHaveLength(2);
  expect(records.records.map((item: { note: string }) => item.note)).toEqual(["回位更早了", "回位更早了"]);
});

test("does not expose an incomplete copy when its practice observation cannot be saved", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);
  await seedLegacyObservation(page, "下一拍先回位");

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, FOLLOW_UP_KEY);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await saveShare.getByRole("button", { name: /^另存一份/ }).click();
  await expect(saveShare.getByRole("alert")).toContainText("副本尚未保存");
  const afterFailure = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    followUp: JSON.parse(window.localStorage.getItem(followUpKey) ?? "null").records,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(afterFailure.boards).toHaveLength(1);
  expect(afterFailure.learning).toHaveLength(1);
  expect(afterFailure.followUp).toHaveLength(1);

  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  await page.getByRole("dialog", { name: "保存与分享", exact: true }).getByRole("button", { name: /^另存一份/ }).click();
  const afterRetry = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    followUp: JSON.parse(window.localStorage.getItem(followUpKey) ?? "null").records,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(afterRetry.boards).toHaveLength(2);
  const copy = afterRetry.boards.find((item: BoardDocument) => item.id !== pointBoard.id);
  expect(copy).toBeDefined();
  expect(afterRetry.learning.some((item: { boardId: string }) => item.boardId === copy.id)).toBe(true);
  expect(afterRetry.followUp.some((item: { boardId: string; note: string }) => item.boardId === copy.id && item.note === "下一拍先回位")).toBe(true);
});

test("cleans copied relationships if saving the final copy board fails", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);
  await seedLegacyObservation(page, "", true);

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, BOARD_KEY);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await saveShare.getByRole("button", { name: /^另存一份/ }).click();
  await expect(saveShare.getByRole("alert")).toContainText("副本尚未保存");
  const stored = await page.evaluate(({ boardKey, learningKey, followUpKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    learning: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    followUp: JSON.parse(window.localStorage.getItem(followUpKey) ?? "null").records,
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, followUpKey: FOLLOW_UP_KEY });
  expect(stored.boards).toHaveLength(1);
  expect(stored.learning).toHaveLength(1);
  expect(stored.followUp).toHaveLength(1);
  expect(stored.boards[0].id).toBe(pointBoard.id);
});

test("recovers an orphaned copied choice after both saving and rollback fail", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);

  await page.evaluate(({ boardKey, learningKey }) => {
    const original = Storage.prototype.setItem;
    let learningWrites = 0;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === learningKey && ++learningWrites === 2) throw new DOMException("rollback failed", "QuotaExceededError");
      if (name === boardKey) throw new DOMException("board save failed", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, { boardKey: BOARD_KEY, learningKey: LEARNING_KEY });
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await saveShare.getByRole("button", { name: /^另存一份/ }).click();
  await expect(saveShare.getByRole("alert")).toContainText("关联记录清理未完成");
  const interrupted = await page.evaluate(({ boardKey, learningKey, journalKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    choices: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    pending: JSON.parse(window.localStorage.getItem(journalKey) ?? "null"),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY });
  expect(interrupted.boards).toHaveLength(1);
  expect(interrupted.choices).toHaveLength(2);
  expect(interrupted.pending?.targetId).toBe(interrupted.choices.find((item: { boardId: string }) => item.boardId !== pointBoard.id)?.boardId);

  await page.reload();
  await expect(page.locator(".board-workspace-status[role=alert]")).toContainText(/未完成|恢复|读不到/);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await library.getByRole("button", { name: "重试检查" }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), COPY_JOURNAL_KEY)).not.toBeNull();
  await library.getByRole("button", { name: "放弃未完成的副本" }).click();
  await library.getByRole("group", { name: "确认放弃未完成的副本" }).getByRole("button", { name: "取消" }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), COPY_JOURNAL_KEY)).not.toBeNull();
  await library.getByRole("button", { name: "放弃未完成的副本" }).click();
  await library.getByRole("group", { name: "确认放弃未完成的副本" }).getByRole("button", { name: "确认放弃副本" }).click();
  const recovered = await page.evaluate(({ boardKey, learningKey, journalKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    choices: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    pending: window.localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY });
  expect(recovered.boards).toHaveLength(1);
  expect(recovered.choices).toHaveLength(1);
  expect(recovered.choices[0].boardId).toBe(pointBoard.id);
  expect(recovered.pending).toBeNull();
});

test("does not begin a linked copy when its recovery marker cannot be saved", async ({ page }) => {
  await seedAndOpenPoint(page);
  await openSkillPractice(page, "击球后回位");
  await chooseCurrentSkill(page, "击球后回位");
  await waitForFlowSettled(page);

  await page.evaluate((journalKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === journalKey) throw new DOMException("journal save failed", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, COPY_JOURNAL_KEY);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await saveShare.getByRole("button", { name: /^另存一份/ }).click();
  await expect(saveShare.getByRole("alert")).toContainText("未开始另存");
  const stored = await page.evaluate(({ boardKey, learningKey, journalKey }) => ({
    boards: JSON.parse(window.localStorage.getItem(boardKey) ?? "null").boards,
    choices: JSON.parse(window.localStorage.getItem(learningKey) ?? "null").records,
    pending: window.localStorage.getItem(journalKey),
  }), { boardKey: BOARD_KEY, learningKey: LEARNING_KEY, journalKey: COPY_JOURNAL_KEY });
  expect(stored.boards).toHaveLength(1);
  expect(stored.choices).toHaveLength(1);
  expect(stored.pending).toBeNull();
});

test("does not leave the personal board for a skill when the edited point cannot be saved", async ({ page }) => {
  await seedAndOpenPoint(page);
  await page.evaluate((boardKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === boardKey) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, BOARD_KEY);

  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^修改名称/ }).click();
  const rename = page.getByTestId("board-rename-layer");
  await rename.getByRole("textbox", { name: /^画板名称/ }).fill("尚未保存的这一分");
  await rename.getByRole("button", { name: "完成", exact: true }).click();
  await expect(rename).toBeHidden();

  const skillSheet = await openSkillChoices(page);
  await skillSheet.getByRole("button", { name: /^发球落点/ }).click();
  await expect(skillSheet.getByRole("alert")).toContainText("这次修改尚未保存，请重试");
  await expect(page.getByTestId("skill-practice-board")).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

test("recovers an unsaved point from an editable backup after browser storage refuses the write", async ({ page }) => {
  await seedAndOpenPoint(page);
  const original = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
  await page.evaluate((boardKey) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function denyBoardWrite(key: string, value: string) {
      if (key === boardKey) throw new DOMException("storage full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  }, BOARD_KEY);

  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^修改名称/ }).click();
  const rename = page.getByTestId("board-rename-layer");
  await rename.getByRole("textbox", { name: /^画板名称/ }).fill("从备份找回的这一分");
  await rename.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板未保存");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(original);

  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^保存与分享/ }).click();
  const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
  await expect(saveShare.locator(".board-export-warning")).toContainText("尚未保存");
  const downloadPromise = page.waitForEvent("download");
  await saveShare.getByRole("button", { name: /^备份画板/ }).click();
  const download = await downloadPromise;
  const buffer = await readFile(await download.path());
  const backup = JSON.parse(buffer.toString("utf8"));
  expect(backup).toMatchObject({ kind: "rallypath-board-backup", version: 1,
    board: { id: pointBoard.id, title: "从备份找回的这一分" } });
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(original);

  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error("test download unavailable"); }; });
  await saveShare.getByRole("button", { name: /^备份画板/ }).click();
  await expect(saveShare.getByRole("alert")).toContainText("这次备份没有生成，请重试");
  await expect(saveShare).not.toContainText("已开始下载");

  await page.reload();
  await waitForWorkspace(page);
  await waitForFlowSettled(page);
  await openBoardLibrary(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: "application/json", buffer,
  });
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  const boards = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null").boards as BoardDocument[], BOARD_KEY);
  expect(boards).toHaveLength(2);
  expect(boards.some(board => board.id === pointBoard.id && board.title === pointBoard.title)).toBe(true);
  expect(boards.some(board => board.id !== pointBoard.id && board.title === "从备份找回的这一分（导入）")).toBe(true);
});

test("finds a matching tactic and returns it to the original point", async ({ page }) => {
  await seedAndOpenPoint(page);
  const before = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /拉开空档/ }).click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "拉开空档" })).toBeInViewport({ ratio: .1 });
  const matching=tactics.filter(tactic=>(tactic.category??"先稳住")==="拉开空档").length+combinations.filter(item=>item.category==="拉开空档").length;
  await expect(page.getByRole("region", { name: "拉开空档" }).getByRole("button")).toHaveCount(matching);
  await page.getByRole("region", { name: "拉开空档" }).getByRole("button").first().click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: "选这个打法", exact: true }).click();
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();

  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(stored).toMatchObject({ version: 1, records: [{ boardId: pointBoard.id, route: "tactic" }] });
  expect(stored.records[0].tacticId).toEqual(expect.any(String));
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(before);
  const selected = await openLearningSheet(page);
  await expect(selected.locator(".learning-current:not(.learning-alternative-entry)")).toContainText("已选打法");
});

test("the board's far-right tactic category is visible when its old entry opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  const sheet=await openLearningSheet(page);
  await sheet.getByRole("button", { name: "把握机会", exact: true }).click();
  await waitForFlowSettled(page);
  const selected=page.getByRole("region", { name: "把握机会" });
  await expect(selected).toBeInViewport({ ratio: .1 });
  await expect(selected.getByRole("button").first()).toBeInViewport();
});

test("another tactic starts from the selected beat, saves separately, and survives reopening", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  await chooseTacticForPoint(page);
  const original = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
  let sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /从这拍试试/ }).click();
  await waitForFlowSettled(page);
  await expect(page.getByText(/从第 1 拍试试/)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), ALTERNATIVE_KEY)).toBeNull();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  expect(await page.evaluate(key => localStorage.getItem(key), ALTERNATIVE_KEY)).toBeNull();

  sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /从这拍试试/ }).click();
  await waitForFlowSettled(page);
  await clickAuthoredRoute(page);
  await page.getByRole("button", { name: "一键改直线", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("已保存");
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), ALTERNATIVE_KEY);
  expect(stored.records).toHaveLength(1);
  expect(stored.records[0].sourceBoardId).toBe(pointBoard.id);
  expect(stored.records[0].sourceSnapshot.frames[0].paths[0].control).toBeDefined();
  expect(stored.records[0].board.frames[0].paths[0].control).toBeUndefined();
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(original);

  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: /播放战术/ }).click();
  const compare = page.getByRole("group", { name: "比较两条打法" });
  await expect(compare).toBeVisible();
  await compare.getByRole("button", { name: "试试" }).click();
  await expect(compare.getByRole("button", { name: "试试" })).toHaveAttribute("aria-pressed", "true");
  await compare.getByRole("button", { name: "原来" }).click();
  await expect(compare.getByRole("button", { name: "原来" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await waitForWorkspace(page);
  await page.getByRole("button", { name: /播放战术/ }).click();
  await expect(page.getByRole("group", { name: "比较两条打法" })).toBeVisible();
});

test("a two-beat point keeps its first beat unchanged when trying a new second beat", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page, twoBeatPoint);
  await chooseTacticForPoint(page);
  await expandBoardTools(page);
  await page.locator(".board-dock-tools").getByRole("button", { name: /打开拍次/ }).click();
  const frames = page.getByRole("dialog", { name: "拍次" });
  await frames.getByRole("button", { name: /^编辑第 2 拍/ }).click();
  await page.getByRole("dialog", { name: "第 2 拍" }).getByRole("button", { name: "取消编辑拍次" }).click();
  const sheet = await openLearningSheet(page);
  await expect(sheet.getByRole("button", { name: /从这拍试试/ })).toContainText("从第 2 拍开始");
  await sheet.getByRole("button", { name: /从这拍试试/ }).click();
  await waitForFlowSettled(page);
  await expect(page.getByText(/从第 2 拍试试/)).toBeVisible();
  await clickAuthoredRoute(page, twoBeatPoint.frames[1].paths[0]);
  await page.getByRole("button", { name: "一键改直线", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("已保存");
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.records?.[0], ALTERNATIVE_KEY);
  expect(stored.startFrameId).toBe("reply");
  expect(stored.board.frames[0]).toEqual(stored.sourceSnapshot.frames[0]);
  expect(stored.board.frames[1].paths[0].control).toBeUndefined();
  const source = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.boards?.[0], BOARD_KEY);
  expect(source.frames).toEqual(twoBeatPoint.frames);

  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await expandBoardTools(page);
  await page.locator(".board-dock-tools").getByRole("button", { name: /打开拍次/ }).click();
  await page.getByRole("dialog", { name: "拍次" }).getByRole("button", { name: /^编辑第 1 拍/ }).click();
  await page.getByRole("dialog", { name: "第 1 拍" }).getByRole("button", { name: "取消编辑拍次" }).click();
  await clickAuthoredRoute(page);
  await page.getByRole("button", { name: "一键改直线", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("已保存");
  await page.getByRole("button", { name: /播放战术/ }).click();
  await expect(page.getByRole("group", { name: "比较两条打法" })).toContainText("原分已改，按当时起点比较");
  const afterSourceEdit = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.records?.[0], ALTERNATIVE_KEY);
  expect(afterSourceEdit.sourceSnapshot.frames).toEqual(twoBeatPoint.frames);
});

test("a saved alternative remains reachable after its original point is deleted", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  await chooseTacticForPoint(page);
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /从这拍试试/ }).click();
  await waitForFlowSettled(page);
  await clickAuthoredRoute(page);
  await page.getByRole("button", { name: "一键改直线", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("已保存");

  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  const library = page.getByTestId("flow-current");
  await library.getByRole("button", { name: `删除${pointBoard.title}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expect(library.getByRole("status")).toContainText(`已删除「${pointBoard.title}」`);
  await expect(library.getByRole("region", { name: "原分已不在本机的试法" })).toBeVisible();
  await library.getByRole("region", { name: "原分已不在本机的试法" }).getByRole("button", { name: /我记住的这一分/ }).click();
  await waitForFlowSettled(page);
  await expect(page.getByText(/原分已不在本机；这里保留了当时的起点/)).toBeVisible();
  await page.getByRole("button", { name: /播放战术/ }).click();
  const compare = page.getByRole("group", { name: "比较两条打法" });
  await expect(compare).toBeVisible();
  await compare.getByRole("button", { name: "原来" }).click();
  await expect(compare.getByRole("button", { name: "原来" })).toHaveAttribute("aria-pressed", "true");
  await compare.getByRole("button", { name: "试试" }).click();
  await expect(compare.getByRole("button", { name: "试试" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBeNull();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.records?.length, ALTERNATIVE_KEY)).toBe(1);
  await page.reload();
  await openWorkspaceLibrary(page);
  await expect(page.getByRole("region", { name: "原分已不在本机的试法" })).toBeVisible();
});

test("a failed alternative write stays unsaved until the user retries", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  await chooseTacticForPoint(page);
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /从这拍试试/ }).click();
  await waitForFlowSettled(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function setItem(name: string, value: string) {
      if (name === key && failOnce) {
        failOnce = false;
        throw new DOMException("storage full", "QuotaExceededError");
      }
      return original.call(this, name, value);
    };
  }, ALTERNATIVE_KEY);
  await clickAuthoredRoute(page);
  await page.getByRole("button", { name: "一键改直线", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("未保存");
  expect(await page.evaluate(key => localStorage.getItem(key), ALTERNATIVE_KEY)).toBeNull();
  await openBoardSettings(page);
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(menu.getByText("保存失败")).toBeVisible();
  await menu.getByRole("button", { name: "重试" }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("已保存");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.records?.length, ALTERNATIVE_KEY)).toBe(1);
});

const representativePoints: {
  id: string;
  title: string;
  category: string;
  tacticId: string;
  tacticName: string;
  skillId: string;
  skillName: string;
  me: [number, number];
  opponent: [number, number];
  ball: [number, number];
  landing: [number, number];
  control: [number, number];
}[] = [
  { id: "pressed-wide", title: "被拉开后争取回位", category: "先稳住", tacticId: "defend-high-middle", tacticName: "防守高深回中", skillId: "recovery", skillName: "击球后回位", me: [.82, .94], opponent: [.18, .08], ball: [.82, .88], landing: [.5, .14], control: [.72, .48] },
  { id: "short-ball", title: "短球打深后跟进", category: "把握机会", tacticId: "approach-follow", tacticName: "短球进攻随球上网", skillId: "next-ball", skillName: "连上下一拍", me: [.58, .70], opponent: [.35, .08], ball: [.58, .64], landing: [.72, .16], control: [.66, .41] },
  { id: "cross-then-line", title: "斜线调动再变线", category: "拉开空档", tacticId: "three-cross-one-line", tacticName: "斜线调动再变线", skillId: "direction-change", skillName: "变线控制", me: [.72, .93], opponent: [.27, .08], ball: [.72, .89], landing: [.27, .18], control: [.55, .48] },
];

for (const scenario of representativePoints) {
  test(`${scenario.title} can reach its tactic and skill from one personal board`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const board: BoardDocument = {
      ...pointBoard,
      id: scenario.id,
      title: scenario.title,
      frames: [{
        ...pointBoard.frames[0],
        poses: { me: scenario.me, opponent: scenario.opponent, ball: scenario.ball },
        paths: [{ ...pointBoard.frames[0].paths[0], from: scenario.ball, to: scenario.landing, control: scenario.control }],
      }],
    };
    await seedAndOpenPoint(page, board);
    const original = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null").boards[0], BOARD_KEY);

    const sheet = await openLearningSheet(page);
    await sheet.getByRole("button", { name: scenario.category, exact: true }).click();
    await waitForFlowSettled(page);
    const tacticCard = page.locator(".tactic-card").filter({ hasText: scenario.tacticName });
    await expect(tacticCard).toHaveCount(1);
    await tacticCard.click();
    await waitForFlowSettled(page);
    await expect(page.getByRole("heading", { name: scenario.tacticName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "查看战术讲解", exact: true }).click();
    const explanation = page.getByRole("dialog", { name: scenario.tacticName, exact: true });
    await expect(explanation.getByRole("heading", { name: "什么时候用？", exact: true })).toBeVisible();
    await expect(explanation.getByText("这样打，想换来什么？", { exact: true })).toBeVisible();
    await explanation.getByRole("button", { name: "回到动画", exact: true }).click();
    await page.getByRole("button", { name: "选这个打法", exact: true }).click();
    await waitForFlowSettled(page);
    await expect(page.getByTestId("board-canvas")).toBeVisible();
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null").records[0], LEARNING_KEY))
      .toMatchObject({ boardId: board.id, route: "tactic", tacticId: scenario.tacticId });

    await openSkillPractice(page, scenario.skillName);
    await expect(page.getByTestId("skill-practice-board")).toBeVisible();
    await chooseCurrentSkill(page, scenario.skillName);
    await waitForFlowSettled(page);
    await expect(page.getByTestId("board-canvas")).toBeVisible();
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null").records[0], LEARNING_KEY))
      .toMatchObject({ boardId: board.id, route: "skill", skillId: scenario.skillId });
    const after = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null").boards, BOARD_KEY);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(original.id);
    expect(after[0].actors).toEqual(original.actors);
    expect(after[0].frames).toEqual(original.frames);

    await page.reload();
    await waitForWorkspace(page);
    await waitForFlowSettled(page);
    const saved = await openSkillChoices(page);
    await expect(saved.locator(".learning-current")).toContainText(scenario.skillName);
  });
}

test("returns from a tactic without painting the old tactic screen over the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /拉开空档/ }).click();
  await waitForFlowSettled(page);
  await page.locator(".tactic-card").first().click();
  await waitForFlowSettled(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.getByRole("button", { name: "选这个打法", exact: true }).click();
  const transition = await page.evaluate(() => {
    const board = document.querySelector('.flow-screen[data-flow-current="true"] .board-editor');
    const oldScreen = document.querySelector(".flow-screen:has(.tactic-showcase-screen)");
    const oldHeader = document.querySelector(".flow-fixed-header");
    const paints = (element: Element | null) => Boolean(element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
    return { boardCurrent: Boolean(board), oldTacticVisible: paints(oldScreen), oldHeaderVisible: paints(oldHeader) };
  });
  expect(transition).toEqual({ boardCurrent: true, oldTacticVisible: false, oldHeaderVisible: false });
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("flow-fixed-header")).toHaveCount(0);
});

test("returns from viewing a tactic without painting the catalogue or creating a choice", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAndOpenPoint(page);
  const initialBoards = await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
  const sheet = await openLearningSheet(page);
  await sheet.getByRole("button", { name: /拉开空档/ }).click();
  await waitForFlowSettled(page);
  await page.locator(".tactic-card").first().click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.getByRole("button", { name: "关闭打法列表", exact: true }).click();
  const transition = await page.evaluate(() => {
    const board = document.querySelector('.flow-screen[data-flow-current="true"] .board-editor');
    const oldCatalogue = document.querySelector(".flow-screen:has(.tactic-catalogue)");
    const oldHeader = document.querySelector(".flow-fixed-header");
    const paints = (element: Element | null) => Boolean(element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
    return { boardCurrent: Boolean(board), oldCatalogueVisible: paints(oldCatalogue), oldHeaderVisible: paints(oldHeader) };
  });
  expect(transition).toEqual({ boardCurrent: true, oldCatalogueVisible: false, oldHeaderVisible: false });
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY)).toBe(initialBoards);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARNING_KEY)).toBeNull();
});

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test(`keeps the next-step drawer usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedAndOpenPoint(page);
    await openBoardSettings(page);
    const entry = page.getByTestId("board-learning-entry");
    await entry.scrollIntoViewIfNeeded();
    const entryBox = await entry.boundingBox();
    expect(entryBox).not.toBeNull();
    expect(entryBox!.width).toBeGreaterThanOrEqual(44);
    expect(entryBox!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    const sheet = await openLearningSheet(page);
    const bounds = await sheet.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height * .64);
    await expect(sheet.getByRole("button", { name: /拉开空档/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "练一项", exact: true })).toBeVisible();
  });
}

test("keeps contextual learning in settings and respects reduced motion", async ({ page }) => {
  await seedAndOpenPoint(page);
  await expect(page.getByTestId("board-learning-entry")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoardSettings(page);
  const entry = page.getByTestId("board-learning-entry");
  await expect(entry).toHaveAccessibleName("找打法");
  await expect(entry).toContainText("打法参考");
  await expect(entry).toHaveCSS("animation-name", "none");
});
