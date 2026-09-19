# Mobile Prototype Agent Guide

## Current Pace And Court Display Direction — 2026-09-16

- The selected ball-speed interaction is the landing-point segmented charge ring from visual direction 1. Do not reopen the three-choice popup during normal line drawing.
- A single continuous gesture draws and sets pace: drag from the tennis ball to the landing point, let the endpoint become stable, keep holding to charge, and release to commit. The order is `Control` at minimum charge, `Drive` after charging, and `Put away` at maximum charge. The sequence stops at `Put away` and never loops.
- Pace feedback on the court uses only the English labels `Control`, `Drive`, and `Put away`. Do not add Chinese translations, seconds, speed values, sliders, or gauges to the primary gesture.
- Preserve internal frame duration as the playback source of truth. A released gesture must commit route geometry, pace, and duration as one undoable edit, then resume the existing synchronized receiver-movement flow.
- Remove the manual per-frame duration field from the product UI. Duration remains in the board model for playback, legacy compatibility, home preview, video, and GIF output, and is now derived from route length plus the selected pace.
- Hard, Clay, and Grass are visual-only, device-level display preferences. Select them directly on the board through a compact icon control; do not bury theme selection in the overflow menu or serialize it as tactic content. Themes must never silently change ball speed, frame duration, bounce, or player movement.
- The positioning layer follows mirrored tennis positioning bands—Defense, Rally, Pressure, Attack, and Net—with translucent, theme-aware colors. Keep it below court lines and all tactical objects, and show the colored regions by default. Region names are hidden by default; the overflow menu may independently toggle region colors and region-name visibility. These are device display preferences, not tactic content.
- Keep the board's permanent top and bottom controls icon-only. The top bar exposes back, undo, direct court-theme selection, help, and overflow; the bottom dock exposes only the context-relevant edit, play, history, or delete icons. The help icon opens the complete operation and icon guide, so explanatory copy does not occupy the court during normal use.
- Pace, court themes, and tactical-zone display are part of the current implementation scope, not deferred future-version work.
- `PRODUCT_VNEXT.md` is the source of truth for the detailed scope, menu logic, exclusions, and acceptance criteria.

## Current Input Direction — 2026-09-15

- RallyPath is now used directly in a phone or desktop browser. Do not render the simulated iOS or Android keyboard in any product flow.
- Text and numeric fields must use the browser and device's native input behavior. On phones this means the system keyboard; on computers it means direct physical-keyboard input.
- Keep `KeyboardInput`, `KeyboardTextarea`, and the keyboard context as compatibility wrappers for shared focus cleanup, but keep `KeyboardDock` visually disabled and all simulated keyboard height/inset values at zero.
## 唯一開發來源 — 2026-09-19

- **唯一倉庫：`demonyang885/tennis-tactics-interactive-preview`；唯一整合／發布分支：`main`。** 名稱中的 interactive-preview 是歷史命名，現在承載正式 RallyPath。
- 新工作從該倉庫最新 `origin/main` 建立短期分支，PR 只合回同一個 `main`。不要從舊 feature、preview 或 release 分支續作。
- 先讀 [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)，核對 remote、分支、HEAD、工作區狀態；資料夾名稱、埠號及舊 Mac mini 路徑不能證明版本。
- `24fa57112728cad53e1792fe6df15999964f6e94` 是本次核查的 v0.1.0 發布基準，不是要求將未來 main 重設回此提交。
- 下方 9/8 產品方向、`PRODUCT_VNEXT.md` 及歷史 QA 是功能背景；畫板優先首頁、用途分類與已發布程式／測試是目前基準。不要把歷史分支描述當作待合併工作。
- 已發布的 `PhoneFrame.tsx` 是 frameless 容器，並已有沉浸畫板及行動裝置原生輸入適配。下方較早模板中要求恢復 device picker／bezel 的文字不適用於已發布外觀；保留目前受 lock 保護的 runtime，不要為符合舊文字回退它。
- [分支審核](./docs/maintenance/BRANCH_AUDIT_2026-09-19.md) 記錄保留、取代與待考慮內容；`docs/archive/` 是歷史證據，內含的舊發布／交接命令均不可當作現行指令。


## Current Home History Direction — 2026-09-15

- Keep the live portrait board, primary action, and two intent actions as the entire first-screen focus. Do not place board-history rows or knowledge content in that initial viewport.
- Add one quiet first-screen cue, “上滑看我的画板”, so young players can discover content below. It may scroll to the history area when tapped and should disappear after the user starts scrolling.
- The second screen of the same vertical homepage is the board-history hub. Do not add a tab bar or another navigation level.
- Every saved board has one user-facing purpose label: “战术”, “练习”, or “比赛回顾”. Assign the purpose from the entry context and preserve it through rename, duplicate, clear, restore, export, import, and later edits.
- Existing unlabelled boards remain compatible. Infer only an unmistakable old review starter as “比赛回顾”; otherwise default old boards to “战术”. Do not infer “练习” from `drillId`, because a tactic can merely have related practice guidance.
- The homepage history hub must let the user filter by those three purposes, open the exact saved board, start a board in the selected purpose, and reach the full board library. Keep “找个打法” below the history hub.
- Opening a template or a new purpose entry must still not create a saved draft until the user makes a real committed edit. Storage remains local to the current browser.

## Current Product Direction — 2026-09-08

- The user now asks for an appropriate original UI; external mini-program UI references are deferred. Use the existing prototype as the working starting point, not as a strict visual clone.
- Keep one core journey: select a match situation, open a tactic, watch the animation, and expand explanations as needed.
- Prioritize readable tactic names and purposes outside the immersive editor, an unobstructed court, intuitive icon-only board controls, and explanations available from the help button. Do not reintroduce course routes, multiple difficulty filters, accounts, or scoring workflows.
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
- Keep `App` composed around `PhoneFrame` -> `KeyboardProvider`, with `StatusBar`, app content, and `HomeIndicator` mounted inside the phone frame. `KeyboardDock` remains only as a no-render compatibility export. `StatusBar` and the iOS home indicator are overlaid device chrome. Android continues to reserve its protected navigation-bar region; iOS screens continue to paint behind the home-indicator area and own their safe-area content padding.
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
- Do not add simulated keyboard height to screen or content padding. Let the browser's native visual viewport handle the system keyboard. `useKeyboardInsets().bottomInset` now represents only the app's closed-state safe-area behavior.
- Prefer `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so shared close actions can blur the active native input consistently.
- Use `BottomSheet` for phone-scoped sheets. Its props are `open`, `onOpenChange`, `title`, optional `description`, optional `snap`, and `children`; it renders through the phone screen portal and dismisses the keyboard before opening.

## Horizontal Carousels

- Use `Carousel` for horizontally draggable cards, images, media, chips, or other horizontal collections. Do not recreate these with `overflow-x`, custom pointer handlers, or a generic div.
- `Carousel` can be nested directly inside `MobileScroll`. It owns horizontal gestures and automatically yields vertical gestures to the parent.
- Never put `data-scroll-drag="ignore"` on or around a `Carousel`; doing so prevents vertical parent scrolling when a gesture begins inside it.
- Do not add CSS scroll snapping to `Carousel`; its runtime owns momentum and release motion.
- Use `data-scroll-drag="ignore"` only when a control must prevent parent scrolling in every drag direction.

See `src/mobile/COMPONENTS.md` for the full component and gesture contract.

## Native Input Rule

The app no longer renders a simulated keyboard. Before presenting navigation or modal UI, clear native input focus so the browser or system keyboard can close.

Call `keyboard.hide()` before:

- pushing, popping, or replacing FlowStack routes
- opening bottom sheets, action sheets, dialogs, menus, or navigation sheets
- starting transitions where the destination should not inherit text-input focus

`FlowStack` already hides the keyboard for `push`, `pop`, and `replace`. `BottomSheet` already hides it before opening. If you add new modal/sheet/navigation primitives, follow the same rule.

When a composer, search surface, or other input surface closes, call `keyboard.hide()` in the same event before changing that component's open state. This now blurs the active native field; it does not render or size a keyboard layer.

## Interaction Rules

- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so close actions can clear native input focus consistently.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.
