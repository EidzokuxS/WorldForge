# Task 14B: action loop and journal

## Delivered surface

- `ActionDock` submits suggested choices by opaque `choiceHandle` and freeform actions by text. Enter submits, Shift+Enter inserts a line break, and the draft clears only after accepted admission.
- `TurnProgress` presents accepted admission, durable progress, reconnecting, interruption, and Resume from public turn state.
- `ConsequenceCard` exhaustively maps the public consequence cues and renders only player-visible fields.
- `JournalDrawer` loads earned observations on demand, follows `nextCursor`, retries the failed cursor, traps focus while open, closes on Escape or backdrop, and returns focus to Journal.
- `CampaignPlayPage` keeps server state authoritative, routes each public error to a concrete next action, and moves focus to progress after admission, Resume after interruption, the error action after failure, and narration or choices after completion.
- `turn_state_invalid` now maps to `service_unavailable`. Equal world and runtime versions no longer misreport a runtime-construction failure as stale authority.
- Terminal runtime failures now publish the non-resumable `turn_failed` code. Request and transport availability retain the resumable `service_unavailable` contract.

## Real persisted playtests

Ready campaign `4f52a9b9-3f7e-4f17-8c5e-6934b72bd731` proved the Bell Island scene, current consequence, four opaque suggested actions, freeform dock, and earned Journal at desktop and narrow widths. The rendered DOM exposed no private entity IDs or protected state. Journal focus began on Close; Escape returned it to Journal.

Opening campaign `c12683d6-c817-4c3c-9bc2-6b2a3e40f172` proved the live recovery path with a deliberately unavailable local Ollama endpoint. The mounted application persisted these public events:

1. `turn.accepted`
2. `turn.progressed: interpreting`
3. `turn.interrupted`
4. `turn.progressed: interpreting` after Resume
5. `turn.interrupted`

The UI showed `Action received`, then the durable interruption and Resume control. The second interruption proves that Resume created a fresh external attempt instead of clearing the first error locally. The temporary Ollama role selection and dummy local key were removed after the run; the local roles point to OpenAI again, and the removed GLM provider remains absent.

The older ready campaign cannot admit a new model-backed player action because one stored public fact lacks an exact protected-entity binding. The UI reports the resulting `service_unavailable` response with a usable next action. This is persisted campaign-data debt rather than a Task 14B presentation defect. The mounted route playtest still completes a migrated accepted campaign through opening and one player action with real SQLite authority.

Four isolated persisted campaigns were created from that same mounted-route fixture and read through the real Campaign Play HTTP/SSE route. They froze the player action after the durable Judge claim, after the durable Narrator claim, after an authoritative external interruption, and after an authoritative terminal failure. The failed lane exposed and verified the `turn_failed` contract fix: its live SSE transition retained the committed scene, unlocked the action dock, focused `Return to scene`, and returned a schema-valid failed turn read. The temporary campaign folders and operator harness were removed after capture.

## Visual evidence

- `evidence/task14b/ready-action-consequence-desktop.png` (1440x900)
- `evidence/task14b/ready-action-narrow.png` (390x844)
- `evidence/task14b/journal-desktop.png` (1440x900)
- `evidence/task14b/journal-narrow.png` (390x844)
- `evidence/task14b/opening-interrupted-narrow.png` (390x844)
- `evidence/task14b/public-error-narrow.png` (390x844)
- `evidence/task14b/turn-active.png` and `turn-active-narrow.png` (1440x900 and 390x844)
- `evidence/task14b/narration-pending.png` and `narration-pending-narrow.png` (1440x900 and 390x844)
- `evidence/task14b/turn-interrupted.png` and `turn-interrupted-narrow.png` (1440x900 and 390x844)
- `evidence/task14b/turn-failed.png` and `turn-failed-narrow.png` (1440x900 and 390x844)

## Verification

- Focused Task 14B frontend and API: 52/52.
- Complete frontend: 548/548.
- Mounted Campaign Play route: 1/1.
- Campaign Play backend, serial: 322/322.
- Complete backend: 3,886/3,886 with 30 existing todo tests.
- Frontend and backend typechecks passed.
- Scoped ESLint passed without warnings.
- Shared, frontend, and backend production builds passed.
- GitNexus change detection reported MEDIUM scope, 17 indexed change entries (15 code symbols and two task sections), five affected CampaignPlayPage processes, and no HIGH or CRITICAL risk.
- One concurrent Windows/SQLite admission race hit its five-second timeout during the first parallel Campaign Play run. The isolated retry passed in 1.55 seconds, and the complete serial Campaign Play run passed all 322 tests.
- Fresh Sol verification passed with zero P0/P1 findings. Its narrow-layout P2 records that translucent gaps in the fixed action dock can reveal scene text beneath the controls; the controls remain usable, and Task 15 can give the dock one unified backdrop during navigation cutover polish.

## Copy and test review

Humanizer and deslop review found the visible copy short, direct, and grounded in an immediate player action. `Open World Review` became `Open world review`; `The turn could not be completed.` and `Return to scene` expose the terminal outcome and next action without internal terminology. No further rewrite improved clarity. New permanent smoke tests: zero. Component tests cover keyboard, focus, pagination, public-field rendering, input locking, terminal focus, and typed next actions. The mounted route integration and terminal read-model assertion own the SQLite and HTTP boundaries.
