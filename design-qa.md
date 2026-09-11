# Court Canvas Theme 1 — Design QA

## Comparison target

- Source visual truth: `docs/court-board/theme-1-coach.png`
- Rendered implementation: `docs/court-board/implementation-theme-1-screen-1x.png`
- Current full-view evidence: `docs/court-board/design-qa-comparison.png` (source left, implementation right)
- Current focused controls evidence: `docs/court-board/design-qa-controls-comparison.png` (source left, implementation right)
- Earlier baseline evidence: `docs/court-board/theme-1-comparison-1x.png`, `theme-1-court-comparison-1x.png`, and `theme-1-controls-comparison-1x.png`
- Route and state: editable starter board, first frame active, curved shot route selected, endpoint and curve handles visible, Theme 1 coach-green treatment

## Capture and normalization

- Source pixels: 853 × 1844.
- Implementation CSS viewport: 393 × 852 on the protected iPhone runtime.
- Implementation screenshot pixels: 394 × 852 at `deviceScaleFactor: 1`; the one-pixel horizontal difference is the captured rounded screen edge, while the measured CSS content width is 393px.
- Density normalization: the source was downsampled to 394 × 852 before comparison. Both sides of the current comparison evidence are therefore 394 × 852 pixels.
- The implementation is an element capture of `data-testid="device-screen"`, not a browser-window screenshot. Protected live status-bar and home-indicator chrome remain visible by runtime contract.

## Findings

- P0: none.
- P1: none.
- P2: none remaining.
- Theme 1's dark-green court, blue/red role coding, yellow-green shot path, dashed movement legend, compact frame rail, and dominant green playback action are preserved.
- The reference's five persistent tools are intentionally reduced to one contextual action row plus `对象`、`添加` and `播放`. This is the approved hierarchy simplification, not an accidental mismatch.
- Court markings, net, actor labels, route direction, selected control handles, frame context, and primary controls remain legible without clipping or overlap at the target viewport.
- Icons come from the existing Radix icon library. No placeholder asset, emoji control, handcrafted SVG, or simulated raster asset was introduced.

## Required fidelity surfaces

- Typography: the product's existing system PingFang fallbacks preserve the compact coach-tool character. Title, phase label, frame label, contextual action, and playback hierarchy remain distinct; long labels truncate rather than colliding.
- Spacing and layout: canvas remains the dominant region. The persistent editor controls and the dismissible error toast meet a 44px minimum target; the play action remains the strongest control.
- Color and semantics: coach green (`#153e2e` / `#28684b`), lime shot, pale-blue dashed movement, off-white surfaces, soft green selection, red opponent, and blue player match the source intent and remain identifiable without relying on color alone.
- Image quality: court, routes, actors, marks, and selection handles render sharply at DPR 1. The physical court ratio remains correct rather than stretching to the stylized source court.
- Copy: concise Simplified Chinese follows the existing product localization. `＋新增一拍`、`下一拍` and `沿用布置到下一拍` are deliberately distinct.
- States and accessibility: selected, disabled, saving, saved, preview, paused, finished, and replay states are visible. Semantic labels, object-list fallback, focus rings, arrow-key nudging, Delete-key removal, and keyboard-aware fields remain available.
- Portal sheets retain the same Theme 1 button treatment and minimum targets outside the `.tennis-app` subtree. Closing a sheet dismisses its keyboard, and parked FlowStack pages are removed from the accessibility tree with `inert` and `aria-hidden`.

## Expected deviations from the source

- The source uses Traditional Chinese and omits operating-system chrome. The existing app uses Simplified Chinese, a live status bar, and a protected home-indicator area; those established runtime and localization choices are preserved.
- The source groups the example into three coarse coaching stages. The implementation uses document frames and starts with a safe first-frame starter board; numeric badges therefore do not need to match the concept image.
- Undo, redo, truthful save status, object access, file actions, and drill access add compact capabilities not shown in the concept. They use the same visual language and do not reduce the court below the accepted viewport.
- The source keeps five tools visible. The implementation's object-first flow shows only the action relevant to the selected ball, player, route, or mark and moves lower-frequency creation into `添加`.

## Comparison history

1. The first valid Theme 1 pass increased the court's usable height, matched the outgoing curved-shot state, and retained the physically correct court ratio.
2. A focused baseline pass raised header, contextual, nudge, canvas path/freehand/text, and other compact controls to 44px and restored scoped keyboard focus visibility.
3. The later workflow review found too many simultaneous bottom controls and a global tool-mode mental model. The current implementation uses one contextual row plus `对象`、`添加` and `播放`.
4. Interaction review found scaled-device pointer math mixing bounding-rect and client dimensions, actor snapping, tap jitter entering history, and ambiguous overlapping hit targets. Coordinate normalization, grab offsets, 5 CSS px slop, and control-handle priority fixed those issues.
5. Playback review found that pause, scrub, step, and natural completion left preview. The final state machine separates preview from active animation and preserves the paused or final pose.
6. A final portal/accessibility pass found unscoped sheet styles, a specificity conflict that made the primary play action look disabled, a lingering sheet keyboard, parked pages in the accessibility tree, and undersized target-mark hit regions. Device-screen scoping, a stronger play selector, synchronized keyboard dismissal, inactive-page isolation, and 44px target hit bounds resolved them.
7. The final current full-screen and bottom-controls comparisons were inspected together after all fixes; no actionable P0/P1/P2 finding remained.

## Interactions and runtime checks

- Direct starter-board entry and latest-draft reopen
- Actor selection, scaled drag, grab-offset preservation, tap slop, one-step undo
- Ball shot and opponent movement route ownership
- Curved path endpoint/control-handle editing, including overlap priority
- Add frame and carry-forward continuity
- Preview, pause, resume, scrub, previous/next frame, finish, replay, and explicit return to edit
- Object list, secondary draft/template library, save behavior, and drill entry
- Pure blank-board object creation, undo/redo restoration, pointer-cancel rollback, portal-sheet targets, keyboard dismissal, and inactive-screen accessibility isolation
- Automated result: `npx playwright test --workers=1` passed 29 / 29; `npm run build`, `npm run test:sites`, and `npm run test:pages` passed.
- Browser console and page errors: none observed during the final manual in-app-browser pass.

## Known validation boundary

Real iPhone/Android touch feel, browser storage limits, file download/share permissions, and cross-device JSON transfer remain physical-device checks; desktop emulation is not presented as equivalent proof.

## Final result

final result: passed
