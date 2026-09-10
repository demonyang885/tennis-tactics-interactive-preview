# Court Canvas Theme 1 — Design QA

## Comparison target

- Source visual truth: `docs/court-board/theme-1-coach.png`
- Rendered implementation: `docs/court-board/implementation-theme-1-screen-1x.png`
- Full-view evidence: `docs/court-board/theme-1-comparison-1x.png` (source left, implementation right)
- Focused court evidence: `docs/court-board/theme-1-court-comparison-1x.png`
- Focused controls evidence: `docs/court-board/theme-1-controls-comparison-1x.png`
- Route and state: editable tactic board, first authored outgoing-shot frame active, curved shot route and upward recovery route visible, shot tool active, Theme 1 coach-green treatment.

## Capture and normalization

- Source pixels: 853 × 1844.
- Implementation CSS viewport: 393 × 852 on the protected iPhone runtime.
- Implementation screenshot pixels: 394 × 852 at `deviceScaleFactor: 1`; the one-pixel horizontal difference is the captured rounded screen edge, while the measured CSS content width was 393px.
- Density normalization: the source was downsampled to 394 × 852 before comparison. Both sides of the comparison evidence are therefore 394 × 852 pixels.
- The implementation screenshot is an element capture of `data-testid="device-screen"`, not a browser-page screenshot. Protected live status-bar and home-indicator chrome remain visible by runtime contract.

## Findings

No actionable P0, P1, or P2 differences remain.

The following deviations are expected product constraints rather than defects:

- The implementation keeps the physically correct 23.77 / 10.97 full-court ratio, so the court is narrower than the stylized source drawing. Its height was increased during QA to improve legibility without distorting that ratio.
- The source uses Traditional Chinese and omits operating-system chrome. The existing product uses Simplified Chinese, a live status bar, and a safe home-indicator area; those established runtime and localization choices were intentionally preserved.
- The source groups the example into three coarse coaching stages, while the library conversion preserves all seven authored animation moments. The source's stage-two visual is therefore represented by the implementation's first outgoing-shot frame rather than by the same numeric badge.
- Undo, redo, truthful save state, feed/curve choices, object access, and drill access add compact controls not shown in the concept image. They use the same hierarchy and palette and preserve the source's canvas → frames → tools → playback order.

## Required fidelity surfaces

- Fonts and typography: system PingFang fallbacks preserve the source's compact coach-tool character. Title, phase label, frame label, tool label, and CTA hierarchy are distinct; long titles truncate rather than colliding with undo/redo/save.
- Spacing and layout rhythm: the source's five layers are retained. Header actions and all primary/secondary editor controls meet a 44px minimum touch target. The canvas remains the dominant region on both iPhone and Pixel 10.
- Colors and visual tokens: coach green (`#153e2e` / `#28684b`), lime shot, pale-blue dashed movement, off-white surfaces, soft green selection, and dark-green primary CTA match the source intent and keep readable contrast.
- Image quality and asset fidelity: the court, routes, actors, marks, and selection handles render sharply at the device pixel ratio; standard Radix icons replace no product imagery. There are no emoji, placeholder images, handcrafted SVG substitutes, or rasterized app chrome.
- Copy and content: controls use concise Simplified Chinese consistent with the existing product. Phase copy and drill copy are real tactic-library content rather than placeholders.
- States and accessibility: selected/disabled/saving/saved/playback states are visible; semantic button labels, an object list, 44px touch targets, visible focus rings, arrow-key nudging, Delete-key removal, reduced-motion handling, and keyboard-aware text fields cover non-drag alternatives.

## Focused comparison

- Court region: the final comparison shows the same red opponent, blue player, lime curved shot, pale-blue dashed recovery route, court lines, net, and legend. A focused crop was needed because route thickness and dash treatment are too small to judge reliably in a full-screen overview.
- Controls region: the final comparison confirms the same frame rail, five-tool anatomy, selected shot state, and full-width play CTA. The implementation's additional compact route-options row is intentional and does not hide or shrink a required control below its touch target.

## Comparison history

1. Initial capture was a scaled whole-Chrome-window image and therefore was not accepted as QA evidence. It also used the first drill frame instead of the source-like second-frame shot-editing state.
2. First valid 1:1 pass exposed a court that was too conservative in height and a source-state mismatch: the implementation showed a straight return toward the near player. The renderer's top/bottom allocation was tightened while retaining the correct court ratio; the comparison state was changed to the outgoing first shot with a curved route and dashed upward movement path.
3. The focused controls pass found subtool and header actions below the 44px touch target. Header actions, contextual actions, and nudge controls were raised to 44px and the iPhone and Pixel layouts were rechecked.
4. Final review found remaining undersized canvas hit regions and globally suppressed keyboard focus. Path/freehand/text hit areas and compact controls were raised to 44px, scoped focus-visible treatment was restored, and the canvas gained arrow-key and Delete-key operation.
5. Final full-view and focused comparisons show matching shot and movement direction with no remaining actionable P0/P1/P2 issue.

## Primary interactions and runtime checks

- Tested: open board home; create blank board; add player, opponent, and ball; create shot path; select from object list; curve a path; add a frame; undo and redo; save locally and reopen from drafts; convert a library tactic; open the four-stage on-court drill; play the continuous multi-frame timeline; switch iPhone/Pixel layouts.
- Browser console and page errors: none in the final screenshot route.
- Automated UI/model/runtime result: 22 tests passed in local system Chrome, including rapid-exit save and history frame-index boundaries.
- Runtime integrity and content validation: passed.

## Follow-up polish

- [P3] If Theme 1 becomes final rather than provisional, consider a slightly shorter translated title convention so more of the title remains visible beside the required history and save controls.

final result: passed
