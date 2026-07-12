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
- The first fresh Character submission exposed `active_actor_placement_invalid`: two active people were validly present in persistent sublocations beneath the reachable starting macro, while eligibility checked only route-reachable macro IDs. Eligibility now inherits reachability from the parent macro, the real Saltglass topology passes, and live evidence preparation rejects any remaining unmet topology code before it writes a session.
- The sublocation regression passes with the 16-test projection suite; the live evidence suite and backend typecheck also pass. GitNexus impact was attempted before the repair, but its Ladybug index failed with `UNREACHABLE_CODE`; direct caller inventory found only the state repository and projection tests.
- Three live `glm-5.2` opening proposals passed strict `native_json` shape but exposed two semantic compiler gaps. Route validation could not lift a sublocation to its parent macro, and the prompt described exposure support without naming the exact first-step target required for each channel. Routing now normalizes location ancestry. The opening prompt now binds `route_state`, `witness_report`, and `local_aftermath` to exact copied IDs while preserving the fail-closed compiler.
- The 27-test opening planner suite and backend typecheck pass. Prompt-craft review kept the patch to the missing executable invariants; humanizer/deslop found no filler, promotional language, or vague instruction left in the changed paragraph.
- The first freeform action reached Judge acceptance, then two live `glm-5.2` Game Master proposals failed semantic compilation because `record_world_event.affectedHandles` contained an invented value. The fail-closed compiler remains unchanged. The GM prompt now provides one explicit `ALLOWED_HANDLES` list and requires every handle-valued field, including `affectedHandles` and exposure `anchorHandle`, to copy from it character-for-character.
- The 17-test Game Master suite and backend typecheck pass. Prompt-craft review made the missing value-binding rule executable without adding examples that could leak into output. Humanizer/deslop found the changed instruction direct, concrete, and free of filler or promotional wording.
- The diagnostic Saltglass campaign completed two manually chosen player actions through the rendered UI: one craft-based freeform offer and one peripheral wait choice. Both results were causally coherent and readable, while the two turns let scheduled actors produce three accepted independent proposals. The apparent repeated current beat existed only in the accessibility snapshot's intentional `aria-live` copy; a rendered screenshot confirmed one visible paragraph. None of the remote actor consequences was earned by the player's chosen path, so this run is diagnostic, not promotion evidence.
- Binding the second signed action exposed a vocabulary mismatch in the evidence lane: the UI and durable request use `suggested`, while the human evidence schema intentionally calls the control `choice`. The binder now maps those two canonical terms explicitly. Focused regression coverage proves both freeform and suggested-action turns, and the four-test live-session suite plus E2E typecheck pass.
- The diagnostic audit also showed that an earned opening consequence would have rendered as the safe but uninformative sentence `Something changed here before you arrived.` Opening proposals now separate protected causal `summary` from an exposure-gated `observableTrace`. The compiler rejects a trace that names the hidden actor; visibility releases it only when actor source, channel, and typed anchor all match the accepted opening seed. Other events retain the generic safe cue.
- Related opening, runtime, mounted-route, actor-proposal, and visibility verification passes 84 tests; focused opening verification passes 28 tests; backend and Campaign Play E2E typechecks pass. Prompt-craft review kept protected truth and public evidence as separate executable instructions. Humanizer/deslop removed an ambiguous sensory phrase and approved the final direct wording.
- The apparent stale Resume screen was sampled before the durable `turn.completed` event; the ledger subsequently reached completion and the next normal action updated live. The existing Resume component regression now follows progressed and terminal SSE events, refetches exact turn/state authority, and proves the input unlocks. All 24 page tests and frontend typecheck pass; no product fallback or polling path was added.
- The first Cinderwake opening attempt passed strict `native_json` after 204 seconds but omitted one required collective plan, so the fail-closed compiler interrupted the untouched opening ledger. The prompt now binds `actorPlans` to the exact `openingConstraints.plannedActors.length`, requires every listed actor ID exactly once, and explicitly keeps background collectives in scope while excluding only background people. A structural protected log records expected and proposed actor IDs for future semantic failures. The 28-test opening suite and backend typecheck pass; prompt-craft and humanizer/deslop review found the revised instruction explicit and free of filler.
- Cinderwake Caravans then completed a clean opening and one peripheral wait on `glm-5.2`; its signed freeform move toward Caldera Gate reached an accepted Judge before the GM used an existing handle with the wrong entity kind for an exposure anchor. The GM prompt now supplies canonical `HANDLES_BY_KIND` alongside the allowed list and binds every exposure channel and effect field to its required kind. The 17-test GM suite and backend typecheck pass. The compiler remains fail-closed, and this interrupted lane is diagnostic rather than promotion evidence.
- After the corrected GM moved Nera to Caldera Gate and revealed physically grounded evidence of the missing medicine, the Storyteller produced 278 visible words but the budget gate counted 5,654 private reasoning tokens as narration and interrupted the turn. Narrator admission now subtracts reported reasoning tokens only for visible-output and content-total limits while preserving full provider-token cost accounting. The focused nine-test narrator suite and backend typecheck pass; the current Cinderwake lane remains diagnostic because it required retries.
- The pricing change had CRITICAL transitive Settings impact. Full shared, backend, frontend, E2E typechecks/tests and the production build pass; absent pricing keeps the previous serialized settings shape.

The configured Coding Plan provider is authenticated and resolves Generator, Judge, and Storyteller to `glm-5.2`. The provider reports plan `pro`; the evidence lane uses subscription quota accounting because Coding Plan does not expose a truthful per-token charge for this run. Deterministic narration and zero-cost accounting are not accepted as substitutes.

Prose review: humanizer/deslop review kept the note and seeded action details concrete, direct, and free of promotional or formulaic language. The review removed no domain facts.
