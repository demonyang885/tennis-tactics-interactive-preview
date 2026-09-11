# Mobile Prototype Agent Guide

## Current Product Direction — 2026-09-11

- Keep Theme 1 as the current Court Canvas direction. Preserve its dark-green court, blue/red player roles, bright ball path, dashed movement path, compact frame rail, and large green playback action. This iteration intentionally simplifies hierarchy rather than pixel-cloning every reference control.
- The primary `战术画板` entry is immediate: reopen the newest valid local draft, or open a ready-to-draw starter board containing `我方`、`对手` and `网球`. Keep the draft/template library and a genuinely empty board as secondary choices inside `画板文件` → `草稿与模板`.
- Follow the Court Canvas control hierarchy directly: keep one persistent five-tool rail — `选择`、`球员`、`球路`、`跑位`、`标记` — with a separate full-width `播放战术` action. Do not restore the contextual command row or the abstract `对象` / `添加` pair. Keep a selected-object adjustment entry in the existing canvas meta area instead of adding another bottom row.
- `球路` and `跑位` act immediately and remain active until the user chooses another tool. `球员` opens the role/ball picker; `标记` opens target, equipment, text, freehand, and feed-path choices. When `选择` is already active it opens either the selected-object adjustment sheet or the semantic object list, preserving precise touch and screen-reader access.
- Match Court Canvas's visible `下一拍` add control, but expose it to assistive technology as `新建下一拍`; playback `下一拍` remains scoped to the preview dock. Keep `沿用布置到下一拍` for explicitly copying marks into another frame.
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

- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so the simulated keyboard and safe-area insets stay connected.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the keyboard below the home indicator/safe area layer in z-index, and above ordinary app UI while visible.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.
