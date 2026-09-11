# Court Canvas Smart Rally — Design QA

## Evidence

- Source visual truth: `/Users/clawbot/.codex/attachments/7403c781-828e-434b-bd95-97f5d4938215/codex-clipboard-b27c7413-2db7-4005-b9ec-c51eac9a8a76.png`
- Browser-rendered implementation: `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics/test-results/court-board-renders-the-pu-baaa8-th-without-simulator-chrome/court-board-public-mobile.png`
- Focused comparison input: `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics/docs/design-qa/controls-comparison.png`
- Live implementation: `http://127.0.0.1:4173/`, inspected in the Codex in-app browser.
- Source pixels: 908 × 454. The source is a partial, framed, likely high-density device crop; its exact CSS density is not encoded in the file.
- Implementation pixels/CSS size: 390 × 844 at device scale factor 1; the captured screen measures 390 CSS px wide with no simulator chrome.
- Focus normalization: implementation rows `y=594…844` were cropped and resampled to 454 px high only for side-by-side control comparison. Layout conclusions use proportions and hierarchy, not resampled pixel distances.
- State: source shows an active two-beat board. The persisted implementation screenshot shows the initial zero-beat state; the matching active `2 拍 · 3.0 秒` state was separately exercised and visually inspected in the in-app browser after `发球 → 对手跑位 → 回球`.

## Full-view comparison evidence

The source does not include a full screen, so full-screen pixel fidelity cannot be asserted. The 390 × 844 implementation capture was instead checked for product integrity: the court remains the dominant region; the header, compact `第 N 拍` history chip, instruction row, and persistent bottom dock fit without overlap, clipping, browser chrome, or horizontal overflow. The desktop in-app preview also retained the calibrated device frame without duplicated phone chrome.

## Focused region comparison evidence

`docs/design-qa/controls-comparison.png` places the source and implementation in one image. Both use the same lower-control hierarchy: two secondary square controls (`对象`, `添加`) followed by a substantially larger dark-green `播放` action with the beat count and duration aligned at the far edge. The implementation intentionally removes the source's always-visible frame rail, per the approved smart-rally direction, and replaces it with one compact `第 N 拍` history entry on the court.

## Required fidelity surfaces

- Fonts and typography: the existing app/system Chinese sans stack preserves the source's compact, high-weight instruction heading and smaller muted helper line. Labels do not wrap or truncate at 390 px.
- Spacing and layout rhythm: all persistent controls are at least 44 px high; the guide and dock preserve clear separation, even at 390 × 844. Court space increases after removing the frame rail.
- Colors and visual tokens: coach green, warm off-white surfaces, pale green borders, bright yellow ball route, and dashed blue movement route match the supplied direction. Disabled playback is visibly distinct; the exercised active state restores the dark-green primary action.
- Image quality and asset fidelity: there are no missing product images in the supplied control reference. Runtime device assets remain protected and sharp; app icons use one Radix icon family. Court graphics remain crisp at device scale factor 1.
- Copy and content: `拖出发球线路`, `现在拖动对手跑位`, and `从网球拖出下一拍` state the exact next gesture. Automatic transitions are also announced through a polite live region.
- Accessibility and interaction: the selected actor has a visible white ring in addition to role color; targets meet the 44 px minimum; undo/redo restores the serialized smart stage; direct ball selection can skip movement; manual and imported boards are not opted into the guided flow by shape alone.

## Comparison history

### Pre-QA product review

- Earlier P1: the visible frame rail and repeated object/tool selection made users manage editor modes instead of constructing a rally.
  - Fix: removed the persistent rail and explicit normal-flow `新增一拍`; starter boards now open armed for the serve and advance `shot → receiver move → next shot` automatically.
- Earlier P1: inferring smart mode from “two players plus one ball” could take over tactic, legacy, or imported boards.
  - Fix: added explicit, validated, serialized `smartRally` metadata; only starter boards opt in.
- Earlier P1: generic tail trimming could hide a legitimate final manual/tactic frame.
  - Fix: playback trims only an explicitly generated, empty smart continuation frame.
- Earlier P2: undo/redo or mid-playback exit could lose or jump away from the active authoring stage.
  - Fix: the smart cursor travels with document history, while advanced historical edits retain their selected frame; playback returns to the armed smart stage when it started there.
- Follow-up P1: completing a shot advanced to the receiver frame and made the authored route appear to disappear, even though it remained stored in the preceding frame. The first attempted fix used a 46% opacity ball-only trail; live review showed that it still read as missing and dropped the completed movement path.
  - Fix: the complete preceding beat now remains clearly visible throughout receiver movement and next-shot authoring. The ball route stays near normal strength and same-beat movement remains legible, without duplicating either into frame data, hit testing, object lists, exports, or playback.
- Follow-up P1: when a serve ended exactly on the receiver, the ball and receiver shared the same hit target. Smart drawing modes discarded the guided actor selection, so the receiver-movement gesture could be stored as a shot and skip directly to the third frame, preventing the intended second-shot flow.
  - Fix: hit testing now preserves the actor armed by the current guided stage when targets overlap. A browser regression reproduces the exact overlap, verifies receiver movement and the second shot in the same beat, and confirms the third frame is created only after that shot.

### Post-fix visual comparison

- Evidence: `docs/design-qa/controls-comparison.png` plus the 390 × 844 implementation capture.
- Result: no actionable P0, P1, or P2 visual, interaction, responsive, or accessibility findings remain.
- No focused sub-crop beyond the complete lower control region was needed because all relevant labels, icon alignment, spacing, border treatments, and playback states are legible in the combined comparison.

## Verification

- Primary interactions exercised: zero-click serve, automatic receiver selection, receiver movement, next shot, hitter alternation, overlapping ball/receiver targets, direct skip, short-drag cancellation, directional shots, undo, redo, save/reload continuation, playback, history opening, manual blank-board fallback, multi-ball fallback, and simulated touch input.
- Browser console: the final reload and complete flow produced no current runtime errors. Earlier Vite hot-reload parse messages occurred during editing and were resolved before the final reload/build.
- Automated gate: runtime/content checks, production build, 38 serial Playwright tests, 4 Sites package tests, 3 Pages package tests, and `git diff --check` passed.
- Independent browser QA: two testers reproduced the deployed defect first, then verified the fixed working tree at desktop, 390 × 844, and 360 × 732 simulated-touch sizes. The eight-case second-shot matrix passed with zero console errors or warnings.

## Findings

- No actionable P0/P1/P2 findings.

## Follow-up polish

- P3: confirm the 8 ms haptic cue and perceived entry latency on a physical iPhone and Android device before a production release; desktop and 390 px browser checks cannot validate hardware vibration.

final result: passed
