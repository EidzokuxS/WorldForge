# Task 16B: first playable slice

Status: live evidence path ready; real-provider play is waiting for a configured provider.

## Outcome and gate

This lane uses one fresh accepted Campaign World and the rendered product path. The main operator reads the current scene and chooses every action from player-visible information. Automation may type or click that already chosen action and capture evidence; it cannot select an action or generate an action batch.

The first playable bundle requires:

- eligibility frozen while the campaign is still `character_required` and has zero turns;
- normal Character and Opening navigation;
- one signed non-menu freeform action and one signed peripheral wait or leave action;
- one sourced non-local actor consequence visible through an eligible channel;
- identical public state before and after browser reload;
- one browser action per durable completed player action;
- exact network methods, paths, statuses, and request-body hashes captured while the UI is active;
- known frozen input/output pricing for every accepted model stage and truthful aggregate token/cost accounting;
- manual answers for location, current pressure, present actors, available attempts, and player-independent change.

## Live evidence flow

`live-session.ts` owns the evidence staging boundary. `prepare` freezes accepted provenance and topology before character creation. `decide` records the human choice, its visible-state hash, and the reason for choosing it before submission. `bind` accepts that decision only when the next and only next durable player turn completed with the exact same input. A second pending decision, a mismatched control or text, a post-submission signature, or more than one unbound turn fails closed.

The supported runner phases are:

```powershell
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config> --live-phase prepare
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config> --live-phase decide --control freeform --chosen-text <text> --decision-note <note>
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config> --live-phase bind
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config> --live-phase reload-before
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config> --live-phase reload-after
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <config>
```

The browser collector attaches to the already open exact campaign URL. With `--watch-actions 2`, it records CDP request and response evidence until two player-action admissions and the following settled state refresh have occurred. It captures the resulting public DOM, screenshot, browser errors, failed requests, and inventory without clicking or submitting controls.

Finalization reopens SQLite read-only, compares accepted snapshot, content, and eligibility hashes with the pre-character freeze, requires the configured action count and reload proof, merges signed browser/network evidence, writes the bundle, and runs the standard validator.

The writer derives each stage cost from the exact model pricing frozen in that turn's durable selection. Unknown pricing, a second attempt, or a configured aggregate token/cost overrun rejects the bundle instead of recording zero cost.

## Verification so far

- Live session regressions prove pre-character eligibility freeze, one pending-decision boundary, exact freeform binding, and duplicate rejection.
- Bundle regressions prove signed browser evidence, manual notes, screenshots, and reload probes merge into a promotion-eligible first-playable bundle.
- Deterministic replay regressions remain byte-identical after extracting the shared read-only report capture.
- E2E typecheck, focused live/bundle/replay tests, capture-script syntax, and diff check pass.
- GitNexus reports LOW impact for the E2E report, writer, and runner seams with no affected production execution flow.
- A saved campaign without loadable Campaign Play state exposed a recursive error-contract failure: `service_unavailable` required state fields that the failing state load could not supply. The contract now admits either a complete versioned context or no context for that code, rejects partial context, and returns a schema-valid retryable `503` without logging a second Zod failure.

The current Settings state has no authenticated model provider. A control Generator request reaches the configured remote endpoint and is rejected for missing credentials. The default application selection also records unknown model pricing, so provider setup must establish real pricing authority before this lane can promote. Deterministic narration and zero-cost accounting are not accepted as substitutes.

Prose review: humanizer/deslop review kept this note direct, removed no domain facts, and found no promotional or filler language.
