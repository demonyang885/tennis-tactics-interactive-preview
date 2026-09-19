> 歷史功能設計／QA 記錄：不代表目前完整產品狀態或下一輪總路線。唯一版本入口見 [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)；目前以 main 的畫板優先流程及最新 AGENTS.md 為準。

# Tennis tactics reproduction — visual and interaction QA

## Visual source
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/video-frames/opening.png` (720 × 1386)
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/video-frames/frame-003.jpg` (600 × 1155)
- User-supplied six-second video. Only the front/back animation is visible; the other seven animations are illustrative reconstructions from the visible card names, not recovered original behavior.

## Implementation evidence
- Browser: Codex in-app browser, `http://127.0.0.1:5173/`.
- Browser viewport 1400 × 1200, devicePixelRatio 1.
- iPhone content viewport measured 393 × 852 CSS pixels, scale 1.
- Pixel 10 content viewport 427 × 952 CSS pixels.
- Full captures are 1400 × 1200; iPhone content was cropped at x=504,y=174,w=393,h=852. Browser clipped screenshots were unreliable, so full browser screenshots were cropped without rescaling.
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/list-screen-v2.png`
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/detail-screen-v3.png`
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/list-compare-v2.png`: source and implementation side by side, matching the complete second/third card rows. Source starts partway down its list; implementation starts at the first full row.
- `/Users/eric/Documents/Codex/2026-09-04/xia/work/detail-compare-v3.png`: full app-content comparison at the completed front/back animation, source normalized to width 393. Removed the implementation's 54px system safe area for comparison; did not include the external device bezel.

## Youth-match expansion QA — 2026-09-07
- Added ten youth-match tactics, bringing the catalogue to 18. The new set covers serve +1, body serve, safe second serve, first-serve return, second-serve attack, crosscourt construction, short-ball approach, defensive reset, and high-pressure points.
- Added four situation filters. Verified counts: 先稳住 6, 拉开空档 6, 改变节奏 2, 把握机会 4, 全部 18.
- Opened every new card in the in-app browser and verified its title, court animation, duration, navigation, and return to the filtered list.
- Opened and inspected the new tactical guide on iPhone and Pixel 10. Each guide shows goal, use case, memory cue, and common mistake; the control is visibly labelled “锦囊”.
- Reordered the first screen so serve, return, rally, defense, and pressure-point lessons appear together instead of grouping all serve lessons first. Long card titles can wrap to two lines.
- Found and resolved a composited keyboard layer that could cover the playback controls after navigation. The inactive keyboard dock is now removed from layout; replay, step, speed, progress, and guide controls remain fully visible.
- Created a temporary same-viewport, side-by-side browser comparison with `opening.png` and the current catalogue. The shared header, two-column cards, pale-green thumbnails, white copy panels, gutters, and typography remain visually consistent with the supplied video. The new heading, filters, badges, and taller two-line copy panels are intentional extensions. The temporary QA route was removed after inspection.
- Final iPhone and Pixel 10 list, player, and guide states were visually inspected. No clipped controls, overlapping content, horizontal page overflow, or unreadable card title remained.

## Findings and fixes
1. [P2, resolved] Visible dark square behind the extracted tennis icon. Replaced multiply blending with darken and matched the thumbnail background. Post-fix evidence: list-compare-v2.png.
2. [P2, resolved] Card columns were too wide; adjusted right padding to reproduce the source's asymmetric outer gutter. Post-fix evidence: list-compare-v2.png.
3. [P1, resolved] Retained focus on an outgoing card caused the simulated phone viewport to scroll during navigation. Blur the tapped card before pushing its detail view. Tested navigation through all eight cards; settled device scroll offset returned to 0. Keyboard, device shell and runtime source files remain intact.
4. [P2, resolved] Court was 14px too short and 6px too high because of the added playback footer. Reduced footer height and adjusted court inset. Full field now matches source geometry: approximately 291 × 623px with 30px top margin below the app header. Post-fix evidence: detail-compare-v3.png.
5. [P2, resolved] Browser-rendered court color differed visibly. Tuned rendering after sampled screenshot comparison. Final green differs by approximately 6/255 in red, with matching green/blue; retained as P3 color-management variation.

## Required fidelity surfaces
- Typography: system/PingFang Chinese stack, 18px bold navigation, 14px semibold card names, 11px duration; copy and truncation checked. A small difference in long header truncation and font antialiasing remains P3.
- Layout: two columns, 106px thumbnail, 60px label area, 9px row spacing; court singles/doubles/service lines and net match source proportions. Full final source/implementation comparison opened and inspected.
- Colors: pale-green thumbnails, white cards/header, dark navy stage, deep-green field, red opponent, blue player, neon-yellow ball. Court color sampled and adjusted.
- Assets: tennis icon extracted from the supplied video, not redrawn. Radix UI supplies standard control icons. The court/players/ball form the functional animated Canvas diagram. No fabricated brand logos or decorative substitutes. Source video watermark is intentionally omitted.
- Copy: all eight visible names and durations preserved. Longer display name expanded to “前后调动（Drop Shot + Lob）”. The source only exposes a truncated name. Ten new lessons use short, youth-friendly names and large-target decision cues. Playback captions and other tactics' sequences are reconstructed and marked as simplified diagrams in the About sheet.

## Interaction validation
- The original eight cards and all ten new cards open the correct titled animation and duration and return to the list.
- Front/back animation autoplays to 3 seconds, stops, and displays its score message.
- Replay restarts; pause stops; 0.5× speed changes; step advances to the next keyframe; range seeking works; all clip endpoints inspected.
- Settings sheet opens; current-ball-path switch changes checked state; choose-another returns to the list.
- Both iPhone and Pixel 10 device layouts exercised. Rapid automated actions during route animation were repeated after the destination settled, to avoid browser-driven scrollIntoView artifacts.
- Console checked: no error/warning entries during core testing.
- Final production build passed; protected mobile runtime integrity passed for all 28 files.

## Accepted scope differences
- This is a local interactive web prototype in the mobile shell, not a registered WeChat mini program.
- Original six-second video lacks the full app and seven other animation sequences.
- Added pause/replay, speed, step, progress, and path controls are intentional usability additions.
- Added youth-match filters, lesson badges, tactical guides, and two-line titles are intentional content and usability additions.
- Template-owned device status bar, bezel, picker and home/navigation indicators are preserved.

## Follow-up polish
- P3: long navigation-title truncation and minor screenshot color/antialiasing differences.
- No actionable P0/P1/P2 issue remains in the captured final views.

## Senior product review and optimization QA — 2026-09-07
- Audit evidence: `/Users/eric/Documents/Codex/2026-09-04/xia/work/product-audit/01-before-home.jpg`, `03-before-player.jpg`, and `04-before-guide.jpg`.
- Final implementation evidence: `/Users/eric/Documents/Codex/2026-09-04/xia/work/product-audit/17-after-iphone-screen-1x.png`, `09-after-pixel-home-fixed.jpg`, `10-after-pixel-player.jpg`, `11-after-pixel-guide.jpg`, and `15-after-starter-route-complete.jpg`.
- Full-view source comparison: `/Users/eric/Documents/Codex/2026-09-04/xia/work/product-audit/18-source-final-comparison-1x.png`. Source is 720 × 1386; implementation was captured from a 393 × 852 CSS-pixel iPhone screen at devicePixelRatio 1, with the 54px template status area removed and the app region normalized to 720 × 1386.
- Focused regions: the source/final full-view comparison is readable at card and toolbar level; the separate 1× player and guide captures cover the new controls, so another crop was unnecessary.
- [P1, resolved] No novice entry path. Added a three-lesson route (safe second serve → deep middle return → large target on pressure points), ordered the first three cards to match it, and added a completion/next-lesson action after each animation.
- [P1, resolved] Filters named categories without explaining the decision. Added situation-specific guidance and an independent entry/advanced filter, including a recoverable empty state.
- [P2, resolved] Repeated “比赛新课” badges hid useful hierarchy. Only the three starter lessons now receive numbered badges.
- [P2, resolved] The guide entry and captions were too quiet. Enlarged touch targets, renamed the visible action “看锦囊”, added category/level context, and increased caption readability.
- [P1, resolved] Outcome language implied a tactic guarantees the point. Renamed “完成得分” to “把握机会”, conditionally presents legacy “得分！” endings as “形成机会：”, and added an explicit safety/non-guarantee note in every guide and About.
- [P2, resolved] The five situation chips could leave the selected first option offscreen after horizontal movement. Corrected button font specificity and fitted all five options within both supported screens.
- Interaction evidence: completed all three starter lessons in sequence; verified filter counts and the empty-state reset; replay, speed, seek, guide, and back actions; iPhone and Pixel 10 list/player/guide layouts; no browser console warnings or errors.
- Final production build and protected mobile runtime integrity both passed after the changes.

## Display-first simplification — 2026-09-07
- Removed the course route, numbered lesson badges, difficulty filter, empty state, and next-lesson actions. The catalogue now has one situation filter and the original two-column card grid.
- Ball paths are visible by default: completed segments fade, the current segment is highlighted, completed hit nodes stay marked, the latest hit pulses, the next target has a pulsing target ring, and the moving ball has a short trail.
- Added discrete step progress synchronized with the animation caption. Kept replay, play/pause, speed, step, seek, and a clearly labelled guide action; primary playback targets are approximately 44 CSS pixels.
- Production build passed and all 28 protected mobile runtime files passed integrity verification.
- Root in-app-browser QA covered the iPhone and Pixel 10 catalogue, single situation menu, card navigation, playback, replay, 0.5× speed, step, seek, guide, and conditional outcome. “全部” shows 18 cards and “改变节奏” shows 2.
- Neither viewport has horizontal overflow, cropping, control collisions, console warnings, or console errors. The category chips and primary playback controls have a 44 CSS pixel logical touch height.
- A temporary same-viewport comparison placed the source opening frame beside the live catalogue. The white navigation, pale-green cards, two-column rhythm, gutters, and type density remain aligned; temporary QA files were removed afterward.
- Final polish enlarged the next-target pulse, colored impact nodes blue/red by hitter, and made the ball trail fade naturally from the live ball position.
- The final production build passed after polish, including TypeScript, Vite, Sites build preparation, and all 28 protected mobile runtime integrity checks.

final result: passed

## Content-first tactics expansion — 2026-09-09

- Captured and inspected the live iPhone and Pixel 10 catalogue, the new net-play combination list, combination route, stage cards, expanded opponent-response state, focused response animation, single-tactic player, and full guide in the Codex in-app browser.
- The catalogue now contains 21 single tactics, 8 combinations, and 16 response variants. Three new single tactics and two combinations form a clearly labelled net-play series.
- The single-tactic player now pairs the animated step with a persistent current decision and memory cue. Step navigation was checked mid-animation; the decision changed with the displayed phase without clipping either device.
- Combination details now show a compact match path, then separate each stage into an execution cue and a visible signal for continuing. Response variants expand in place and open a focused excerpt of the relevant base animation.
- [P2, resolved] A focused response animation initially reused the first decision from its full source tactic while the court caption showed the later excerpt. Preview decisions now derive from the rewritten excerpt frames, so the court caption and current-decision card describe the same moment.
- Replaced eight legacy “完成！” endings with continued preparation or observation cues so the animation does not imply the rally or decision process ends with the pattern.
- Added a typed future-content entry file, authoring standard, and build-time validation for complete guides, animation timing and coordinates, combination references, transition signals, and response variants.
- Final iPhone and Pixel 10 captures showed no clipped header, route labels, playback controls, decision content, or bottom navigation overlap.

## Interactive combination rally branch — 2026-09-09

- Branch: `feature/interactive-combination-rally`. The public `main` build remains unchanged while this interaction is reviewed.
- Replaced the linear combination handoff with a 19-node rally network. Every segment auto-plays, freezes on its final court state, then presents 2–3 full-width choices in “signal + action” form directly below the court.
- The serve opening now stops as the return becomes visible, before the +1 action, so the first decision is made at the correct match moment. Every later choice inserts a short opponent-return bridge from the exact previous end positions into the selected tactic; the court no longer remounts or jumps between unrelated starts.
- Verified a four-segment attacking route: serve +1 → deep approach → first volley deep → second volley to open court. The same court view continued immediately, and the route history retained all four choices.
- Verified a separate three-segment net-defense route: dip at the net player's feet → lob behind → return to crosscourt rally. The next choice appeared again after each segment, confirming that the rally can loop instead of ending at a fixed stage.
- “再看本段” replayed only the current segment without deleting history. Opening the secondary “思路” view paused the rally; returning kept the four-segment path and paused progress.
- Choice focus moved to the decision heading when playback ended, and buttons exposed complete signal/action labels. A deliberate double-click advanced the route from segment 3 to segment 4 only, confirming that the next node cannot be added twice.
- [P1, resolved] The iPhone home indicator initially covered the last choice because the app-specific FlowStack screen did not inherit a safe-area variable. The app root now owns the device safe-area value; all three buttons sit above the home indicator, while Pixel 10 continues to use its reserved navigation region.
- Visually inspected completed choice states on iPhone and Pixel 10. Both show the court, decision prompt, full choice list, path history, replay, plan, and restart controls without clipping or overlap. Secondary controls reach at least 44 CSS pixels, and signal copy can wrap to two lines.
- Browser console produced no warnings or errors through the tested paths. Content validation, runtime integrity, TypeScript production build, and Sites worker tests passed.
