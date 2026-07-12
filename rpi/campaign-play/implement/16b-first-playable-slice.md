# Task 16B: first playable slice

Status: GLM-5.2 Coding Plan authority is verified; fresh live play is in progress.

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
- frozen billing authority, exact token accounting, and quota evidence before and after the run;
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

Metered runs derive each stage cost from the exact pricing frozen in that turn's durable selection. Subscription runs freeze the provider, plan, public list price source, and quota endpoint; capture quota before and after play; and record per-run attributable cost as `null`. They never turn an unknown per-token price into a zero-dollar claim. A second attempt or configured token overrun rejects either form of bundle.

## Verification so far

- Live session regressions prove pre-character eligibility freeze, one pending-decision boundary, exact freeform binding, and duplicate rejection.
- Bundle regressions prove signed browser evidence, manual notes, screenshots, and reload probes merge into a promotion-eligible first-playable bundle.
- Deterministic replay regressions remain byte-identical after extracting the shared read-only report capture.
- E2E typecheck, focused live/bundle/replay tests, capture-script syntax, and diff check pass.
- GitNexus reports LOW impact for the E2E report, writer, and runner seams with no affected production execution flow.
- A saved campaign without loadable Campaign Play state exposed a recursive error-contract failure: `service_unavailable` required state fields that the failing state load could not supply. The contract now admits either a complete versioned context or no context for that code, rejects partial context, and returns a schema-valid retryable `503` without logging a second Zod failure.
- Role configuration carries optional strict USD pricing for metered models. Live preparation requires one matching provider, exact Generator/Judge/Storyteller model names, credentials, and billing authority from both Settings and the immutable run config.
- Z.AI Coding Plan Pro is frozen as subscription authority for this lane with `glm-5.2` in all three roles. The runner records the published monthly list price as plan context, captures the official five-hour, weekly, and monthly-tool quota response before and after play, and leaves attributable run cost unknown.
- Subscription regressions prove exact provider/model matching, quota capture, nullable stage costs, budget/probe consistency, and rejection of invented metered accounting. The focused runner suite passes 20 tests and the Campaign Play E2E typecheck passes.
- The pricing change had CRITICAL transitive Settings impact. Full shared, backend, frontend, E2E typechecks/tests and the production build pass; absent pricing keeps the previous serialized settings shape.

The configured Coding Plan provider is authenticated and resolves Generator, Judge, and Storyteller to `glm-5.2`. The provider reports plan `pro`; the evidence lane uses subscription quota accounting because Coding Plan does not expose a truthful per-token charge for this run. Deterministic narration and zero-cost accounting are not accepted as substitutes.

Prose review: humanizer/deslop review kept the note and seeded action details concrete, direct, and free of promotional or formulaic language. The review removed no domain facts.
