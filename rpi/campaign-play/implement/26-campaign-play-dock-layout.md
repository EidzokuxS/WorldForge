# Task 26: Campaign Play dock layout

Status: implemented and verified in the rendered Campaign Play surface.

The fixed Campaign Play action dock covered the lower half of the world-state card at the in-app browser's normal 1280×720 viewport. The large reserved bottom padding made the hidden content eventually scrollable, but the initial rendered composition still placed choices and input on top of possessions, obligations, routes, and consequences.

The Campaign Play page now owns two real viewport rows: a bounded, independently scrollable stage and the action dock. The dock remains available while the stage scrolls, but it no longer overlays stage content. The narrow layout uses the same ownership instead of compensating with `56dvh` of hidden stage padding. This follows `docs/UI Concept.html`: scene content occupies the upper stage and choices/input occupy a separate lower dock.

Verification:

- focused `CampaignPlayPage`, `CampaignPlayStage`, and `ActionDock` suites: 31 tests passed;
- frontend/shared typecheck passed;
- at 1280×720, the stage ends at y=443 and the dock begins at y=443; scrolling the stage to 620 reveals possessions, the five-copper obligation, routes, and the latest consequence while the dock remains at y=443–702;
- at 390×844, the stage ends at y=401.8125 and the dock begins at y=401.8125; all four choices and the action entry remain usable without overlap;
- the temporary viewport override was reset to the normal 1280×720 browser size;
- Journal opened from the dock, loaded durable campaign entries, and closed through its visible control;
- reload preserved the completed Brackish Crossing turn and the corrected layout.

No prompt, player-facing copy, backend contract, gameplay state, compatibility path, or graphic changed. Prompt/copy `humanizer` and `deslop` review is therefore not applicable to this CSS-only repair.

GitNexus impact analysis was attempted with a bounded wait and did not return. The touched selectors are scoped to the mounted Campaign Play page, stage body, and action dock; the focused component tests and real desktop/mobile product passes cover that surface.

During validation, Turbopack continued serving its cached pre-edit stylesheet after a clean dev-process restart. The product pass used a fresh Next webpack dev process, whose served CSS and computed styles matched the edited source. No cache fallback or production code path was added.
