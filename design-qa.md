# Court Canvas Smart Rally — Design QA

## Evidence

- Source visual truth: `/Users/clawbot/.codex/attachments/7403c781-828e-434b-bd95-97f5d4938215/codex-clipboard-b27c7413-2db7-4005-b9ec-c51eac9a8a76.png`
- Browser-rendered implementation: `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics/test-results/court-board-renders-the-pu-baaa8-th-without-simulator-chrome/court-board-public-mobile.png`
- Focused comparison input: `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics/docs/design-qa/controls-comparison.png`
- Live implementation: `http://127.0.0.1:4174/`, inspected in the Codex in-app browser.
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
  - Fix: the complete preceding beat now remains clearly visible throughout receiver movement and next-shot authoring. The ball route stays near normal strength and same-beat movement remains legible without duplicating either into frame data, object lists, exports, or playback. The latest completed ball route is the sole deliberate hit-testing exception so its curve can be adjusted in place.
- Follow-up P1: when a serve ended exactly on the receiver, the ball and receiver shared the same hit target. Smart drawing modes discarded the guided actor selection, so the receiver-movement gesture could be stored as a shot and skip directly to the third frame, preventing the intended second-shot flow.
  - Fix: hit testing now preserves the actor armed by the current guided stage when targets overlap. A browser regression reproduces the exact overlap, verifies receiver movement and the second shot in the same beat, and confirms the third frame is created only after that shot.

### Post-fix visual comparison

- Evidence: `docs/design-qa/controls-comparison.png` plus the 390 × 844 implementation capture.
- Result: no actionable P0, P1, or P2 visual, interaction, responsive, or accessibility findings remain.
- No focused sub-crop beyond the complete lower control region was needed because all relevant labels, icon alignment, spacing, border treatments, and playback states are legible in the combined comparison.

## Verification

- Primary interactions exercised: zero-click serve from the revised serving stance, automatic receiver selection, receiver movement, next shot, hitter alternation, overlapping ball/receiver targets, direct skip, short-drag cancellation, directional shots, undo, redo, save/reload continuation, playback, history opening, guided pure-blank continuation, manual legacy blank-board fallback, multi-ball fallback, and simulated touch input.
- Browser console: the final reload and complete flow produced no current runtime errors. Earlier Vite hot-reload parse messages occurred during editing and were resolved before the final reload/build.
- Automated gate: runtime/content checks, production build, 48 serial Playwright tests, 4 Sites package tests, 3 Pages package tests, and `git diff --check` passed.
- Independent browser QA: two testers reproduced the deployed defect first, then verified the fixed working tree at desktop, 390 × 844, and 360 × 732 simulated-touch sizes. The eight-case second-shot matrix passed with zero console errors or warnings.

## Findings

- No actionable P0/P1/P2 findings.

## Follow-up polish

- P3: confirm the 8 ms haptic cue and perceived entry latency on a physical iPhone and Android device before a production release; desktop and 390 px browser checks cannot validate hardware vibration.

## Integrated board fixes — 2026-09-11

- The fresh ready board now opens in a right-side serving stance: the server and ball share the near baseline area, the receiver starts at the opposite baseline, and the ball remains the armed zero-click drag target even where it overlaps the server.
- A newly created pure blank board records explicit blank-rally provenance. Once the user places exactly two players and one ball, it enters the same guided rally flow without changing legacy drafts, imports, or non-standard boards.
- The blank-board regression reproduces the reported failure and verifies two consecutive ball routes: the first route remains stored and visibly present, the next frame inherits its landing point, receiver movement is retained, the second route creates a third frame, and one undo removes only the second shot plus its automatic successor.
- A separate persisted-draft regression seeds the legacy default blank document that previously failed, opens it through the normal library entry, saves and reloads it, then completes receiver movement and a second shot. The conservative migration does not opt in renamed imports, tactic-backed boards, partial boards, or non-standard boards.
- If a provenance-marked blank board temporarily becomes non-standard, deleting the extra player now restores both the serialized smart cursor and the live ball selection/drawing tool. A browser regression confirms the very next drag creates a shot and successor frame rather than merely moving the ball.
- The latest 390 × 844 browser capture shows the revised serving stance at one-to-one public-mobile width. The Codex in-app browser was also checked at desktop preview size; the court, labels, instruction row, and dock remain unclipped, and the console contains no errors or warnings.
- Result: no actionable P0, P1, or P2 visual, interaction, responsive, accessibility, or persistence findings remain in the integrated build.

## Directional score motion — 2026-09-11

### Evidence

- Source visual truth: `/Users/clawbot/.codex/generated_images/01a08b94-11ad-7f73-9afc-80de954f9a5e/exec-cc0d85fa-52ba-4a13-a09f-83730bcb20dc.png` (853 × 1844 px).
- Browser-rendered implementation: `docs/score-motion/implementation-impact-393x852.png`, `docs/score-motion/implementation-bounce-393x852.png`, and `docs/score-motion/implementation-scored-393x852.png` (394 × 852 px captures of a 393 × 852 CSS-pixel iPhone screen at device scale factor 1).
- Combined comparison input: `docs/score-motion/design-qa-comparison.png` (812 × 896 px). The source was normalized to the implementation height before both screens were placed in the same image.
- States: exact landing at 7.9 s, bounce/fly-away at 8.6 s, scored at 10.0 s, plus a scrub back to 5.0 s.

### Full-view and focused comparison evidence

The approved image is a motion-language target, not a request to replace the latest app shell. The implementation therefore preserves the current header, court proportions, timeline, explanation entry, typography, and protected phone runtime. The combined comparison verifies the selected visual semantics on the same full screen: one continuous incoming path, a restrained landing pulse, one yellow ball with fading same-color history, an outgoing path that follows the authored left-up vector, and no points, check badge, or celebration UI. The authored landing is closer to the baseline than the concept mock; preserving that real tactic coordinate is intentional.

The 393 × 852 captures make the contact ellipse, ghost spacing, trajectory, player separation, and result sentence readable without a second crop. No smaller focused crop was required.

### Required fidelity surfaces

- Fonts and typography: the existing system Chinese stack and hierarchy remain unchanged. The final sentence is a single calm line and does not reflow or truncate.
- Spacing and layout rhythm: the effect stays inside the court stage and clears the step rail, header, caption, and playback controls at 393 × 852.
- Colors and visual tokens: landing, ball, ghosts, and outgoing trace use the established bright tennis-lime on forest green. The result uses the existing finished-caption token rather than a new success card.
- Image quality and asset fidelity: the effect is rendered on the existing high-DPI court canvas, so the trajectory, impact ellipses, and ball silhouettes remain crisp at device scale factors 1–3. No visible image asset was replaced or approximated.
- Copy and content: the result appears only after completion and reads `落地后继续向外弹开，对手无法触球`. There is no `+1`, check badge, trophy, star, or confetti.
- Accessibility and interaction: the live caption and canvas label announce completion only in the scored state. Scrubbing backward removes both the visual and announced result; an ordinary, unmarked tactic never infers a score from coordinates.

### Comparison history

- Initial P2: the outgoing trace was too faint and old red path nodes competed with the yellow landing/ghost sequence.
  - Fix: nearby historical nodes and the normal hit pulse are suppressed only during the authored score transition; the outgoing trace contrast and three ghost spacings were strengthened.
- Review P2: entering the score transition dimmed the final incoming segment and kept the now-incorrect `圆环＝下一落点` legend visible.
  - Fix: the complete incoming segment remains at normal lime contrast throughout impact and bounce; the visible legend changes to `落地→弹出得分`, then `已弹出触球范围`, and the canvas accessibility label describes the same state instead of announcing a hidden target ring. Regressions check three points along the bright incoming line and both accessibility states.
- Post-fix evidence: `docs/score-motion/design-qa-comparison.png` and the three deterministic state captures above.
  - Result: no actionable P0, P1, or P2 difference remains for the selected motion language.

### Verification

- Primary interactions tested: play, pause, final-step navigation, timeline landing/bounce/scored positions, rewind after score, and replay reset.
- Browser console: final in-app-browser review contained no errors or warnings.
- Automated coverage: the score-motion geometry, explicit opt-in, ordinary-tactic isolation, out-of-court plus 2.5 m opponent-reach gate, defended-exit negative case, result timing, rewind reset, incoming-line contrast, state-appropriate legend, absence of `+1`, settled FlowStack capture, and unscaled iPhone bounds all pass.

## Synchronized rally playback — 2026-09-11

- Playback now treats each shot and the receiver movement authored after it as one shared beat. Both use the same global progress, start together, and reach their endpoints together; the next beat begins from those exact end poses.
- The normal gesture order remains `球路 → 接球方跑位 → 下一条球路`, but receiver movement is stored with its incoming shot. The empty authoring tail is excluded from playback duration in both guided stages.
- Canonical version-1 guided drafts migrate conservatively and keep a manual pre-migration undo target. Ambiguous drafts retain every route and switch permanently to manual editing instead of being partially rewritten.
- Failure paths were exercised for overlapping actors, skipped receiver movement, deletion of an incoming route, conflicting movement, direct ball override, an empty starter beat, and the 60-frame ceiling. In each case the authored route remains saveable; invalid guided metadata is removed rather than corrupting the document.
- Browser evidence: the local in-app preview was paused halfway through the opening beat and visually confirmed the ball and receiver at simultaneous intermediate positions. The final reload produced no console errors or warnings.
- Automated gate: production build, runtime and content integrity checks, 56 serial Playwright tests, 4 Sites package tests, 3 Pages package tests, and `git diff --check` passed.
- Independent final review found no remaining P0, P1, or P2 interaction, migration, persistence, playback, responsive, or accessibility issues.

## Curve editing and local media sharing — 2026-09-12

- After a guided shot is released, the editor keeps the receiver-movement stage armed and adds one contextual `调弧度` action. Selecting it exposes the route's white diamond control plus endpoint handles; dragging the diamond changes only the curve, while `继续` returns directly to receiver movement. A straight route receives an implicit midpoint diamond, so it can become curved with the same gesture. No frame switch or tool-palette step is required.
- The selection carries its source-frame index. Direct canvas hit testing, precision controls, delete, keyboard nudge, undo, and redo therefore update the completed route in its original beat instead of the generated continuation frame.
- The preceding beat remains read-only until that explicit action is chosen. Adding a player or mark over a visible old route no longer selects the route. Deleting the just-completed shot removes its untouched generated tail and immediately restores the correct serve/next-shot gesture; complex authored tails fall back to the safe object mode.
- The save model is now explicit: the automatic local draft and JSON remain editable sources; PNG, video, and GIF are read-only sharing outputs. Media is rendered locally and is never uploaded by the editor.
- Video is the recommended output at 720 × 1280 and uses the browser's actual supported MP4/H.264 or WebM encoding. Its final pose is continuously emitted for 250 ms and verified from the finished file's metadata. GIF is 360 × 640 at 10 fps, loops automatically, preserves the authored motion duration with per-frame delays, and is encoded in a worker so the UI can report progress and cancel cleanly. Video is capped at 30 seconds and GIF at 12 seconds; an over-limit or zero-duration tactic is rejected rather than silently truncated or accelerated.
- Native file sharing is offered only when the browser confirms support. Generation and sharing remain separate user actions so iOS/Android share-sheet permission stays attached to a fresh gesture; download is always the fallback or backup.
- Desktop in-app-browser review exercised curve selection, free dragging, GIF generation, video generation, preview, format switching, and cancellation states. The final console contained only Vite connection and React development messages, with no errors or warnings. The 390 × 844 one-to-one capture remained unclipped and without horizontal overflow.
- Automated gate: production build and integrity checks, 72 serial Playwright tests, 6 dependency-free media-core tests, 4 Sites package tests, 3 Pages package tests, and `git diff --check` passed.
- Result: no actionable P0, P1, or P2 interaction, persistence, responsive, accessibility, export, or resource-cleanup findings remain.

## Follow-up device validation

- P3: before a production release, confirm native video/GIF sharing, large-file memory pressure, and the 8 ms haptic cue on one physical iPhone and one physical Android device. Browser automation validates the files and share contract but cannot validate the operating-system share sheet or hardware vibration.

final result: passed
