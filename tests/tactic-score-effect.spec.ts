import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getScoreBounceMotion } from "../src/content/effects";
import { tactics } from "../src/content/library";
import type { Tactic } from "../src/content/types";

const wrongFoot = tactics.find((tactic) => tactic.id === "wrong-foot")!;

async function waitForFlowSettled(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect.poll(async () => page.getByTestId("flow-current").evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.abs(transform.m41);
  })).toBeLessThan(1);
}

async function openWrongFootTactic(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  await waitForFlowSettled(page);
  await page.getByRole("button", { name: "拉开空档", exact: true }).click();
  await page.getByRole("button", { name: /打回头球，10秒/ }).click();
}

async function captureScoreEvidence(screen: Locator, testInfo: TestInfo, filename: string, attachmentName: string) {
  const outputPath = testInfo.outputPath(filename);
  await screen.screenshot({ path: outputPath });
  await testInfo.attach(attachmentName, { path: outputPath, contentType: "image/png" });
  if (process.env.UPDATE_DESIGN_EVIDENCE !== "1") return;
  const evidenceDirectory = path.join(process.cwd(), "docs", "score-motion");
  await mkdir(evidenceDirectory, { recursive: true });
  await copyFile(outputPath, path.join(evidenceDirectory, filename));
}

async function brightIncomingLineSamples(court: Locator) {
  return court.locator("canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("RallyPath canvas has no 2D context");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    const courtHeight = Math.max(100, Math.min(height - 78, width * .74 * 2.14));
    const courtWidth = courtHeight / 2.14;
    const courtX = (width - courtWidth) / 2;
    const courtY = 41;
    const from = [.69, .88] as const;
    const to = [.16, .07] as const;

    return [.24, .50, .76].map((progress) => {
      const x = courtX + (from[0] + (to[0] - from[0]) * progress) * courtWidth;
      const y = courtY + (from[1] + (to[1] - from[1]) * progress) * courtHeight;
      const radius = 6;
      const left = Math.max(0, Math.floor((x - radius) * scaleX));
      const top = Math.max(0, Math.floor((y - radius) * scaleY));
      const sampleWidth = Math.min(canvas.width - left, Math.ceil(radius * 2 * scaleX));
      const sampleHeight = Math.min(canvas.height - top, Math.ceil(radius * 2 * scaleY));
      const pixels = context.getImageData(left, top, sampleWidth, sampleHeight).data;
      let brightLime = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (green > 185 && red > 125 && green - blue > 70) brightLime += 1;
      }
      return brightLime / (scaleX * scaleY);
    });
  });
}

test("the approved score bounce follows the authored direction and exits the court", () => {
  const landing = wrongFoot.frames.at(-2)!;
  expect(getScoreBounceMotion(wrongFoot, landing.t * wrongFoot.duration - .01)).toBeNull();

  const impact = getScoreBounceMotion(wrongFoot, landing.t * wrongFoot.duration)!;
  expect(impact.phase).toBe("impact");
  expect(impact.position).toEqual(landing.ball);

  const bounce = getScoreBounceMotion(wrongFoot, wrongFoot.duration * .86)!;
  expect(bounce.phase).toBe("bounce");
  expect(bounce.position[0]).toBeLessThan(impact.position[0]);
  expect(bounce.position[1]).toBeLessThan(impact.position[1]);
  expect(bounce.lift).toBeGreaterThan(0);

  const scored = getScoreBounceMotion(wrongFoot, wrongFoot.duration)!;
  expect(scored.phase).toBe("scored");
  expect(scored.outsideCourt).toBe(true);
  expect(scored.opponentDistance).toBeGreaterThan(scored.reachThreshold);
});

test("an out-of-court bounce is not scored while the opponent remains within reach", () => {
  const defendedExit: Tactic = {
    id: "defended-exit",
    name: "对手守住出口",
    duration: 10,
    frames: [
      { t: 0, ball: [.5, .9], me: [.5, .94], opponent: [.5, .04], caption: "准备观察对手站位", loft: 0 },
      { t: .8, ball: [.5, .08], me: [.5, .9], opponent: [.5, .02], caption: "网球落地后继续向外", loft: .4 },
      { t: 1, ball: [.5, .02], me: [.5, .88], opponent: [.5, 0], caption: "对手仍然守在球路附近", loft: 0, ballMotion: { kind: "score-bounce", direction: [0, -1] } },
    ],
  };

  const motion = getScoreBounceMotion(defendedExit, defendedExit.duration)!;
  expect(motion.outsideCourt).toBe(true);
  expect(motion.opponent).toEqual([.5, 0]);
  expect(motion.opponentDistance).toBeLessThanOrEqual(motion.reachThreshold);
  expect(motion.phase).toBe("bounce");
});

test("ordinary tactics never infer a score effect from their coordinates", () => {
  const returnMiddle = tactics.find((tactic) => tactic.id === "return-middle")!;
  expect(getScoreBounceMotion(returnMiddle, returnMiddle.duration)).toBeNull();
});

test("score feedback appears only after the ball bounces away and clears on scrub", async ({ page }) => {
  await openWrongFootTactic(page);
  await expect(page.getByRole("heading", { name: "打回头球" })).toBeVisible();
  await waitForFlowSettled(page);
  const court = page.getByTestId("court-stage");
  const slider = page.getByRole("slider", { name: "播放进度" });

  await slider.fill("7.9");
  await expect(court).toHaveAttribute("data-ball-phase", "impact");
  await expect(court.getByRole("img")).toHaveAttribute("aria-label", /网球已经落地.*不显示下一落点圆环/);
  await expect(court.getByText("落地→弹出得分")).toBeVisible();
  await expect(court.getByText("圆环＝下一落点")).toHaveCount(0);
  expect((await brightIncomingLineSamples(court)).filter((count) => count >= 3)).toHaveLength(3);
  await expect(page.getByText("落地后继续向外弹开，对手无法触球")).toHaveCount(0);

  await slider.fill("8.6");
  await expect(court).toHaveAttribute("data-ball-phase", "bounce");
  await expect(page.getByText("落地后继续向外弹开，对手无法触球")).toHaveCount(0);

  await slider.fill("10");
  await expect(court).toHaveAttribute("data-ball-phase", "scored");
  await expect(court.getByRole("img")).toHaveAttribute("aria-label", /弹出对手可触及范围，完成这一分/);
  await expect(court.getByText("已弹出触球范围")).toBeVisible();
  await expect(page.getByText("落地后继续向外弹开，对手无法触球")).toBeVisible();
  await expect(page.getByTestId("flow-current").getByText(/\+1/)).toHaveCount(0);

  await slider.fill("5");
  await expect(court).toHaveAttribute("data-ball-phase", "flight");
  await expect(page.getByText("落地后继续向外弹开，对手无法触球")).toHaveCount(0);
});

test("the score motion remains legible in the unscaled iPhone screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openWrongFootTactic(page);
  await waitForFlowSettled(page);
  const screen = page.getByTestId("device-screen");
  const box = await screen.boundingBox();
  expect(box?.width).toBeCloseTo(393, 0);
  expect(box?.height).toBeCloseTo(852, 0);
  const courtBox = await page.getByTestId("court-stage").boundingBox();
  expect(courtBox).not.toBeNull();
  expect(courtBox!.x).toBeGreaterThanOrEqual(box!.x);
  expect(courtBox!.y).toBeGreaterThanOrEqual(box!.y);
  expect(courtBox!.x + courtBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  expect(courtBox!.y + courtBox!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);

  const slider = page.getByRole("slider", { name: "播放进度" });
  await slider.fill("7.9");
  await expect(page.getByTestId("court-stage")).toHaveAttribute("data-ball-phase", "impact");
  await captureScoreEvidence(screen, testInfo, "implementation-impact-393x852.png", "score-motion-impact");
  await slider.fill("8.6");
  await expect(page.getByTestId("court-stage")).toHaveAttribute("data-ball-phase", "bounce");
  await captureScoreEvidence(screen, testInfo, "implementation-bounce-393x852.png", "score-motion-bounce");
  await slider.fill("10");
  await expect(page.getByTestId("court-stage")).toHaveAttribute("data-ball-phase", "scored");
  await captureScoreEvidence(screen, testInfo, "implementation-scored-393x852.png", "score-motion-scored");
});
