# RallyPath iPhone / iPad compatibility

Baseline: `cce77569fdfe013a40a145b5b0408c18acac3686`, branch `feature/immersive-zones-pace`.
Preview: existing Vite server on port 4176 (PID 58883). No server restart, branch switch, merge, or deployment.

## Changes

- Touch devices, including iPads in both orientations, use the viewport instead of the desktop 393px content width.
- Tablet home preview height follows the available screen height while preserving court proportions.
- Board exit hides the outgoing scene until it is removed. The destination is pinned to its final position; there is no fixed 600ms timer that can reveal unfinished spring motion.
- Remove deferred fullscreen-style cleanup, avoiding a callback that could clear a newly opened board's immersive state.
- Board menu and share drawer minimum height respects the 62.5dvh maximum in short landscape viewports.

## Verification scope

Playwright CLI, isolated browser contexts: Chrome and WebKit 26.6, touch-enabled viewport emulation at 2x pixel density.

| Viewport | Intended coverage |
| --- | --- |
| 375 × 667 | Small iPhone |
| 390 × 844 | iPhone |
| 430 × 932 | Large iPhone |
| 844 × 390 | Landscape iPhone |
| 768 × 1024 | iPad |
| 820 × 1180 | iPad Air |
| 1024 × 768 | Landscape iPad |
| 1180 × 820 | Landscape iPad Air |

Checks: full-width layout, horizontal overflow, drawing a shot through pointer input, menu touch taps, theme and zone-label toggles, renaming, local persistence and reload, playback progression, resizing during playback, return-to-home frame geometry, and JavaScript page errors.

Final result: all 16 engine/viewport combinations passed the listed checks. Each saved and reloaded one authored shot, advanced playback, retained viewport width after rotation, respected the drawer height limit, and reported zero page errors and zero sampled misaligned return frames. Chrome's initial development-page request for `/favicon.ico` returned 404; it did not affect the tested flows.

The 390px-high landscape drawer initially measured 260px, violating the 5/8 limit. After the minimum-height fix, WebKit measured 243.75px (exactly 390 × 0.625); theme controls remained operable through the drawer's scrolling content.

Screenshots are in `output/playwright/compat-20260919/` (local QA artifacts, not release assets). The repeatable CLI scenario is now tracked at `scripts/qa/compatibility-matrix.js`; run it with Playwright CLI `run-code` in an opened Chromium or WebKit session against port 4176. Create the screenshot output directory before a fresh checkout run.

The 16 engine/viewport checks were rerun after v0.2 code cleanup and the empty-court deselection fix. All passed again with no page errors in their isolated contexts. Prior long-lived dev tabs contained temporary HMR errors during merge/edit operations; these were not counted as clean validation sessions.

## Limits

These are browser-engine and viewport checks, not physical iPhone/iPad certification. Native iOS keyboard occlusion, Safari browser-bar resizing, actual finger/Apple Pencil dragging, safe-area insets on hardware, and device-level rendering performance still require physical-device verification. Return checks sample DOM geometry; they do not prove absence of every compositor-level flash.

Build, runtime integrity, content validation, and diff whitespace checks pass. Production build retains the existing large-bundle warning.
