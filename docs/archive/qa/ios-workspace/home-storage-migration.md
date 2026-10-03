# Home storage acceptance migration

The iOS workspace request replaces the landing page with a directly editable board and icon navigation. The adjacent `*.pre-ios.ts.txt` files retain the prior test source as historical evidence; they are not active tests.

Superseded presentation requirements: an introductory heading and intent buttons, a help icon beside the brand, a first-screen playback preview, a below-the-fold home-history hub and its scroll cue, and purpose filters that created new boards from home. Those controls are intentionally absent; adding them to satisfy old selectors would contradict the requested UI.

Active replacements remain in `tests/homepage-board-first.spec.ts` and `tests/home-history-hub.spec.ts`: direct blank/latest-board entry, icon-only navigation, secondary help/build identity, no save before editing, exact saved route restoration, first-read failure and retry, library read failure and retry, malformed import/reselection, empty-library import, confirmed deletion retry, tactic/combination structure preservation, inactive-screen accessibility isolation, history access across phone/tablet widths, purpose-label compatibility, and preservation of review/practice purpose through rename and reload. These data and recovery cases were migrated, not skipped.
