> 歷史快照（2026-09-12），不是現行指令。本文的分支、部署、回滾、Mac mini 接手步驟及「尚未實作」敘述可能已過時；請從根目錄 SOURCE_OF_TRUTH.md 接手。
> 原文：[AGENTS.md](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/5224649d49f3f1c0c49b224d65bd2bee4df91265/AGENTS.md)。本檔只增加此警告，以下保留原文。

# Mobile Prototype Agent Guide

## Current Product Direction — 2026-09-12 Unified Board Entry

- Keep one user-facing board type: `战术画板`. Remove the separate `新建纯空白画板` entry; an empty canvas is the same editor after its starter content has been cleared, not a second workflow.
- Put a deliberately low-emphasis `一键清除` action inside the board file/options sheet. It clears all actors, paths, marks, extra frames, and source/drill attachments while preserving the current board identity and title.
- Clearing is one undoable editor action with no blocking confirmation. Close the sheet, return focus to the canvas, and state clearly that `撤销` restores the previous board.
- The cleared board keeps guided-rally provenance. Once exactly two players and one ball are added, it must arm the same `球路 → 接球方跑位 → 下一条球路` flow used by the default starter board. Keep legacy blank drafts readable, but do not expose a separate blank-board creation path again.

## Current Product Direction — 2026-09-12 Curve Editing and Local Sharing

- A just-completed guided ball route must remain directly editable after the flow advances to receiver movement. Expose the immediately preceding visible route without sending the user through frame history: selecting it shows its endpoints and curve control, dragging the white diamond adjusts curvature, and one explicit `继续` action resumes the same smart-rally phase. Preserve the source frame, following poses, smart cursor, and one-gesture/one-undo contract.
- The preceding beat remains read-only context by default; this narrow, explicit selection is the only exception. Do not duplicate the route into the empty editing tail or make every historical context object globally editable.
- Separate durable work from share output. Editable drafts auto-save locally; JSON is the editable backup; PNG is a still; video and looping GIF are read-only share artifacts. The saving surface should explain this distinction instead of presenting all formats as equivalent saves.
- Generate video and GIF entirely on the current device from the canonical board renderer and the same trimmed playback timeline. Never upload tactical content during export. Prefer video for clarity and publishing, GIF for short looping chat previews, and show an explicit duration limit rather than silently truncating or accelerating a tactic.
- Generate first, then present an in-app preview and a fresh `分享` action so the Web Share API receives a new user gesture. Detect the actual MediaRecorder container and keep its file extension accurate; fall back to device download when file sharing is unavailable. Cancellation, encoding failure, or closing the sheet must not change the draft, playback state, undo history, or saved JSON.

## Current Product Direction — 2026-09-11 Synchronized Rally Playback

- Treat each beat as one shared contact-to-contact time window. During playback, the outgoing ball route and every player movement assigned to that beat start together, advance from the same global progress, and reach their endpoints together; movement must not wait for the ball route to finish.
- Keep the guided editing gesture order `球路 → 接球方跑位 → 下一条球路`, but store the receiver movement in the preceding incoming-shot beat. The automatically generated current tail remains the start of the receiver's return, not a standalone movement segment.
- Trim an empty guided tail from playback in both the movement and shot stages so authoring scaffolding never adds a stationary beat or extra duration.
- Migrate only canonical documents carrying an explicit version-1 smart-rally cursor that points to the empty final authoring frame. Preserve a manualized pre-migration snapshot as the undo target. If the sequence, cursor, or destination is ambiguous, consume the old cursor, keep every authored route in place, switch permanently to manual editing, and explain that automatic synchronization was not safe. Never infer or rewrite manual, source-backed, template, or ambiguous boards.
- Pause, scrub, speed changes, and frame stepping must continue to use one global playback time so the ball and players cannot drift out of sync. Preserve boundary continuity: the prior beat's end pose is the next beat's start pose.
- If an edit, import, migration, or frame-limit edge case would break the synchronized-rally cursor, preserve every authored route, clear the cursor, and keep the board saveable in manual mode. A failed automatic continuation must never discard the just-drawn path.

## Current Product Direction — 2026-09-11 Directional Score Motion

- The approved scoring feedback is physical rather than gamified: a winning ball must visibly land, compress at contact, bounce, and continue away along its authored real-world direction before the point is treated as complete.
- Do not use `+1`, check badges, confetti, trophies, stars, or another static reward as a substitute for that motion. A calm result sentence may appear only after the ball has flown beyond the opponent's playable reach.
- Apply this only to explicitly authored scoring transitions. Ordinary tactical examples, rally continuations, excerpts, and board paths must not be guessed to be winners from coordinates alone.
- The first approved authored example is the final shot in `打回头球`. Keep the effect reusable so later scoring transitions can opt into the same global motion language without duplicating renderer logic.

## Current Product Direction — 2026-09-11 Smart Rally Authoring

- This direction supersedes the visible frame-rail and explicit `新增一拍` requirements in the submission-gate section below. Keep the underlying frame history, playback model, and advanced editing capability, but remove the always-visible row of frame cards from the normal authoring flow.
- A ready starter board opens with exactly two players and one ball. Its first action is immediately ready to draw the serve from the ball; the user must not select `对象`、`添加`、`画球路`, or `新增一拍` first.
- The ready starter board begins in a recognizable serve/return stance: server and ball at the near baseline, receiver at the opposite baseline. When the ball overlaps the server, the armed ball must still win hit testing so the opening drag remains the serve.
- A board cleared through `一键清除` explicitly records guided-rally provenance. After the user places exactly two players and one ball, arm the same guided rally so its first route persists and the second shot can continue. Conservatively migrate only the exact former default draft titled `我的空白战术`; arbitrary legacy drafts, renamed imports, source-backed boards, partial setups, and non-standard boards must remain manual.
- Completing a ball route commits that shot, creates the next frame in the background, alternates the hitter, selects the receiving player, and arms player movement. Completing that movement selects the ball and arms the next shot. Continue this `球路 → 对方跑位 → 下一条球路` loop for two-player boards.
- Smart progression is a default, not a lock. Directly selecting another actor must override the armed action, and advanced object/add/history controls must remain available as recovery paths. Existing non-standard boards, empty boards, and boards with more than two players fall back safely to manual editing.
- Automatic stage changes must be announced in visible text and an accessible live region, identify the active actor without relying on color alone, and remain reversible. Undo/redo must restore both the board document and the inferred active authoring stage.
- A completed ball route and the automatically created empty successor frame are one authoring action and one undo step. A short tap or a drag below the existing movement threshold must not advance the rally.
- After a ball route advances the smart flow, keep the complete preceding beat visibly on court while the receiver moves and prepares the next shot. The latest ball route must remain near normal visual strength, with same-beat movement still clearly legible. Treat these as read-only visual context: do not duplicate them into the successor frame, hit testing, object lists, exports, or playback.
- Remove blocking entry motion for the board surface. The tap should acknowledge within 100 ms and the court should be draggable within 300 ms on the desktop preview; validate perceived smoothness again on a real phone before production release.

## Current Product Direction — 2026-09-11 UX Submission Gate

- This direction supersedes the earlier five-tool-rail guidance below. The user reviewed the deployed preview, judged its usability below expectation, and asked that the next preview be shown only after it is genuinely submission-ready.
- Follow the supplied Court Canvas reference hierarchy directly: the persistent bottom dock is `对象`、`添加`、and a dominant `播放` action with visible `{N} 拍 · {X.X} 秒`. `选择`、`球员`、`球路`、`跑位`、and `标记` must not remain as five peer-level persistent modes.
- Keep direct manipulation on the court as the default object state. `对象` provides an explicit semantic list; `添加` owns actor, ball, route, movement, and advanced-mark entry points. One-shot placement/drawing returns to the object state and keeps the new item selected. Any repeat-add behavior must be an explicit choice rather than a hidden persistent mode.
- A selected ball exposes a clear `画球路` action and a selected player exposes `画跑位`; instructions must describe the actual press/drag gesture and visually identify valid starts.
- Match the reference frame controls: keep the active frame visibly scrolled into view, expose a separate edit button, use a prominent `新增一拍`, announce that the new frame starts from the prior frame's end, and return to the object state after creation.
- Disable playback until at least one route or movement exists. Playback boundaries must disable impossible previous/next actions, and entering/exiting playback must preserve a useful focus location and announce state changes.
- Public mobile URLs must render the app at 1:1 full-screen width. Preserve the protected mobile runtime and desktop device preview, but use app-owned responsive overrides so narrow real-device viewports do not show or rescale a second phone bezel, picker, camera cutout, or preview cursor.
- Submission-ready means: no open P0/P1/P2 items in `design-qa.md`; runtime integrity passes; production build and complete serial Playwright suite pass; Sites and Pages package tests pass; `git diff --check` passes; the primary flow is re-captured in the in-app browser at desktop preview and 390×844 real-mobile widths; browser console is clean; the isolated GitHub preview branch deploys successfully; the public URL and `version.json` match the deployed commit; and `main` remains unchanged with a documented rollback point.

## Supporting Product Context — 2026-09-11

- Keep Theme 1 as the current Court Canvas direction. Preserve its dark-green court, blue/red player roles, bright ball path, dashed movement path, compact frame rail, and large green playback action. This iteration intentionally simplifies hierarchy rather than pixel-cloning every reference control.
- The primary `战术画板` entry is immediate: reopen the newest valid local draft, or open a ready-to-draw starter board containing `我方`、`对手` and `网球`. Keep the draft/template library inside `画板文件` → `草稿与模板`; use the low-emphasis `一键清除` action when an empty canvas is needed.
- The interaction hierarchy is defined exclusively by the submission-gate section above. Do not restore the superseded five-tool rail or persistent repeat-add behavior. Keep `沿用标记到新增一拍` only as an explicit secondary copy action inside frame editing.
- Treat edit and preview as separate modes. Pausing, scrubbing, stepping, or reaching the end must retain the preview pose and dock; only `完成 · 回到编辑` returns to the editable frame. Playback state is transient and must never enter document history or saved JSON.
- All pointer geometry must stay in one CSS-pixel space. Convert pointer coordinates with `(client - rect origin) * clientSize / rectSize`, and use the same client dimensions for rendering and hit testing. Preserve actor/mark/handle grab offsets, require 5 CSS px movement before committing, restore the previous selection on `pointercancel`, and record one complete gesture as exactly one undo step.
- Continue publishing only to `origin` branch `preview/court-canvas-cad0d5f` in the independent test repository. Do not merge, force-push, or update `main`; the previous preview commit remains the rollback point. After each publish, dispatch the Pages workflow and verify the public URL plus `version.json`.
- Before handoff, keep `design-qa.md` current and run `npm run build`, the complete Playwright suite serially, `npm run test:sites`, `npm run test:pages`, and `git diff --check`. Desktop emulation does not replace real iPhone/Android touch, storage, and file-share checks.

## Current Product Direction — 2026-09-10

- Continue development on the user's Mac mini. `MACMINI_HANDOFF.md` records the transfer state and `docs/court-board/` contains the selected design, references, and implementation contract.
- The user authorized reproducing and adapting the Court Canvas Apple app's tactical whiteboard as the core of this product. Prioritize making editing, continuous playback, saved drafts, and tactic-to-drill usage work end to end.
- Theme 1 (`docs/court-board/theme-1-coach.png`) is provisionally selected. The user explicitly deferred final theme decisions and authorized implementation now; do not wait for another design selection or make three implemented themes.
- Training means systematic on-court tactic execution drills: fixed feed, next-ball continuation, variable feed, and conditioned live play. It does not mean a matching quiz.
- Work on `feature/court-canvas-tactics-board`, based on interactive-preview commit `5345230`. Keep the existing tactic library and interactive combinations working. Keep source `main` and the stable deployment unchanged; publish the independent preview only after the new version passes validation.
- Preserve the runtime boundaries below. UI belongs in `src/Prototype.tsx` and `src/prototype.css`; reusable board logic belongs in `src/board/`.

## Current Product Direction — 2026-09-08

- The user now asks for an appropriate original UI; external mini-program UI references are deferred. Use the existing prototype as the working starting point, not as a strict visual clone.
- Keep one core journey: select a match situation, open a tactic, watch the animation, and expand explanations as needed.
- Prioritize readable tactic names and purposes, an unobstructed court, labelled playback controls, and concise progressive explanations. Do not reintroduce course routes, multiple difficulty filters, accounts, or scoring workflows.
- Preserve the current 22 tactics, 8 combinations, and 16 opponent-response variants while adding individual context, decisions, alternatives, and practice guidance for young players who can already rally on a full court.
- Treat useful content and its presentation as the product core. Keep single-tactic displays synchronized around the ball path, current decision, memory cue, and full guide. Build combination displays around an explicit match path, execution cue, transition signal, and opponent-response variants.
- Add new content through `src/content/next.ts`, follow `src/content/TACTIC_AUTHORING.md`, and keep the automated content validation enabled in the production build.
- The `feature/interactive-combination-rally` branch changes combination cards into interactive rallies: play one segment automatically, pause for a signal-based choice directly below the court, then continue the same session and retain a visible choice history. Stop each segment before the viewer's next decision, and bridge the exact previous end positions into the selected tactic instead of remounting or jumping the court. Keep the linear combination explanation available as a secondary “思路” view.
- The `feature/signal-anchored-decision-practice` branch validates the next product direction in “发球后抢先手”: freeze one explicit court state, show ball/self/opponent observations once, then offer 2–3 tactics for that same state. Each selected action continues from the exact frozen positions and explains its benefit and caution during playback. After three decisions, show a compact signal → choice → consequence recap. Keep this as a focused slice; do not add scoring, right/wrong states, accounts, or new navigation. Product rationale and acceptance criteria live in `PRODUCT_VNEXT.md`.

## Prototype Instructions

In ChatGPT Work Mode, run `sites-preview start "$PWD"`, open `http://terminal.local:4173/` in the cloud browser, and verify the rendered app and its primary interactions. Keep that preview open and tell the user to inspect it in the cloud browser; do not present the local URL as a user-facing chat link. In Codex Desktop, run the local server yourself, open the preview in the in-app browser, and provide the clickable local URL. Do not deploy to Sites unless the user explicitly asks to share, publish, or deploy. Do not give the user server-start instructions when you can run it.

Before planning or implementing any mobile-app change, read this `AGENTS.md` in full. It is the source of truth for the template's runtime and component guidance.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Editing Boundary

- Build app-specific UI in `src/Prototype.tsx` and `src/prototype.css`.
- Treat `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/mobile/`, `public/assets/iphone/`, `public/assets/android/`, `public/assets/status/`, `vite.config.ts`, `worker/index.js`, and `scripts/prepare-sites-build.mjs` as protected runtime files. Do not edit, replace, remove, or recreate them unless the user explicitly asks to change the mobile runtime itself. For an explicit runtime change, update the affected lock hashes only after verifying the new runtime behavior.
- Run `npm run check:runtime` before preview or handoff. If it fails, restore the protected runtime instead of weakening or bypassing the check.
- `npm run build` preserves the mobile runtime and prepares the static Cloudflare Worker output required by Sites. Before a Sites handoff, confirm `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`, and source `.openai/hosting.json` exist, then run `npm run test:sites`. Do not replace this project with a Vinext starter.

## Runtime Contract

- Preserve the mobile device runtime unless the user's task explicitly asks otherwise. Do not replace it with a standalone page. Visual fidelity applies to app-owned content inside the device screen, not to template-owned device chrome.
- Keep `App` composed around `PhoneFrame` -> `KeyboardProvider`, with `StatusBar`, app content, `HomeIndicator`, and `KeyboardDock` mounted inside the phone frame. `StatusBar` and the iOS home indicator are overlaid device chrome. When the Android keyboard is closed, the app viewport reserves the protected navigation-bar region instead of painting behind it. When the Android keyboard is open, preserve the current full-screen keyboard layout: its asset includes the IME navigation strip and the separate black navigation bar is hidden. iOS screens continue to paint behind the home-indicator area and own their safe-area content padding.
- Preserve the `iPhone` / `Pixel 10` device picker and both calibrated device presets. The Pixel screen is `427 x 952`; its `32 x 32` camera circle and `public/assets/android/navigation-bar.svg` bottom navigation bar are protected device chrome, not app content.
- Preserve the device picker's intentionally lightweight Codex styling in the top-right corner: its trigger wrapper is borderless and transparent, its trigger sizes to content, and its right-aligned menu uses the compact 3px inset plus the specified hairline and elevation shadow layers. Keep the prototype root and default app screen white.
- Preserve `StatusBar` as live device chrome, including its platform-specific typography, source status-icon assets, and spacing. Pixel 10 uses Roboto, Android indicators, and 32px top, left, and right padding. iPhone uses its iOS indicators, system typography, and calibrated spacing. Do not hardcode screenshot times like `9:41` into the status bar, replace its real-time clock, or move status bar content into app markup unless the user explicitly asks for a fixed/mock device time.
- `PhoneFrame` owns the calibrated device frame, screen portal, device picker, camera cutout, and custom cursor. Keep device assets in `public/assets/iphone/` and `public/assets/android/`; if an asset fails to load, repair the asset path or restore the asset instead of removing the frame, keyboard, or image render.
- Use `MobileScroll` directly for simple single-screen prototypes. Use `FlowStack` for conventional multi-screen flows whose routes can own their fixed header and footer; when using it, define each route as a `FlowScreen`: `{ id, header?, headerHeight?, footer?, footerHeight?, render }`, and use `flow.push(screen)`, `flow.pop()`, and `flow.replace(screen)` from `FlowStack` render callbacks or `useFlow()` instead of introducing another router.
- Use `Carousel` for a carousel, horizontal rail, swipeable cards, image or media strip, horizontally scrollable cards, chip rail, or other horizontal collection.
- For a layered app shell—such as a persistent composer, independently presented sheet, pushed/peek sidebar, or app-wide transition—compose directly in `Prototype.tsx` rather than forcing it through `FlowStack`. Keep app-owned fixed chrome as sibling layers outside `MobileScroll`.
- When using `FlowScreen`, put route-owned fixed headers or footers in `FlowScreen.header` or `FlowScreen.footer`. Set `headerHeight` to the visible app-toolbar height; `FlowStack` adds the device's top safe-area/status-bar inset automatically. Do not include `StatusBar` or its height in the header. Set `footerHeight` to the full app-footer height. `FlowScreen.footer` is an overlay, not reserved layout space; screens using it must add their own bottom content padding such as `padding-bottom: calc(var(--flow-footer-height) + var(--mobile-safe-area-height) + 24px)` so final content can scroll above the footer while still painting behind it.
- Render only scrollable content inside `MobileScroll`; it is for content that should move with scroll and rubber-band overscroll. Keep app-owned headers, nav bars, tabs, composers, and overlays outside it. This keeps scroll physics, safe areas, keyboard insets, scrollbars, and drag click suppression active without letting content paint under fixed chrome.
- Buttons, links, cards, and images inside `MobileScroll` should still allow drag scrolling when the pointer moves beyond tap slop. Use `data-scroll-drag="ignore"` only for rare controls that must own the drag gesture themselves.
- Do not add `var(--keyboard-height)` to ordinary screen/content padding inside `MobileScroll`; the scroll viewport already shrinks above the simulated keyboard. For custom fixed composers, search bars, or toast chrome, use `useKeyboardInsets().bottomInset`. It is relative to the app viewport: Android returns `0` while the closed-keyboard viewport already reserves navigation, then returns the keyboard height while open; iOS continues to clear the home indicator while closed and ride directly above the keyboard while open. Do not pin custom bottom chrome to `bottom: 0` or only `keyboardHeight`.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for every text-entry control. A raw `input` or `textarea` disconnects focus, keyboard animation, safe-area insets, and attached surfaces.
- Use `BottomSheet` for phone-scoped sheets. Its props are `open`, `onOpenChange`, `title`, optional `description`, optional `snap`, and `children`; it renders through the phone screen portal and dismisses the keyboard before opening.

## Horizontal Carousels

- Use `Carousel` for horizontally draggable cards, images, media, chips, or other horizontal collections. Do not recreate these with `overflow-x`, custom pointer handlers, or a generic div.
- `Carousel` can be nested directly inside `MobileScroll`. It owns horizontal gestures and automatically yields vertical gestures to the parent.
- Never put `data-scroll-drag="ignore"` on or around a `Carousel`; doing so prevents vertical parent scrolling when a gesture begins inside it.
- Do not add CSS scroll snapping to `Carousel`; its runtime owns momentum and release motion.
- Use `data-scroll-drag="ignore"` only when a control must prevent parent scrolling in every drag direction.

See `src/mobile/COMPONENTS.md` for the full component and gesture contract.

## Keyboard Rule

The simulated keyboard is a separate top-layer component. Before presenting anything that behaves like iOS navigation or modal UI, dismiss it first.

Call `keyboard.hide()` before:

- pushing, popping, or replacing FlowStack routes
- opening bottom sheets, action sheets, dialogs, menus, or navigation sheets
- starting transitions where the destination should not inherit text-input focus

`FlowStack` already hides the keyboard for `push`, `pop`, and `replace`. `BottomSheet` already hides it before opening. If you add new modal/sheet/navigation primitives, follow the same rule.

When a composer, search surface, or other keyboard-attached component closes, call `keyboard.hide()` in the same event before changing that component's open state. Position attached surfaces from `useKeyboardInsets()` rather than a separate timer or visibility flag so both dismiss together.

When any text-entry control loses focus, dismiss the simulated keyboard. If the control is custom or does not use the runtime's keyboard-aware fields, handle its blur event and call `keyboard.hide()` explicitly. Keep the keyboard open only when focus is moving directly to another text-entry control that should share the same keyboard session.

## Interaction Rules

- When a smart-rally shot ends on the receiver and the ball and player share a frame-start point, prefer the actor armed by the current guided stage during hit testing. Keep direct selection of a different actor available when the targets are spatially distinct.
- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so the simulated keyboard and safe-area insets stay connected.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the keyboard below the home indicator/safe area layer in z-index, and above ordinary app UI while visible.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.
