# Task 18: human playtest contract

Status: Lane A r04 frozen before action 1; Narrator opening repair verified locally and awaiting a fresh r05 live gate.

## Decision

Decide whether Campaign Play already works as a game people can inhabit for sixty actions, rather than only as a correct narrative transaction system.

The claim under test is narrow: from a player-visible scene, a player can form their own intention, act, understand the result, notice that other people and places continue without them, revise their plan, and still want another turn. The test does not establish population-wide appeal or final accessibility.

## What counts as play

The repeated loop is:

1. Read the immediate situation and notice one or more possible tensions, opportunities, people, places, or unanswered questions.
2. Form an intention for the character. The intention may follow, reinterpret, or reject an offered hook.
3. Choose a suggested action or write a freeform action because it serves that intention.
4. Read the resolution and identify what changed, what remained uncertain, and why the result appears to have happened.
5. Update the player's mental model of the world and choose whether to persist, adapt, withdraw, investigate elsewhere, or do nothing.

A turn is not successful merely because it terminates. It must protect the player's stated action, provide readable feedback, leave a durable consequence when appropriate, and create or preserve a meaningful next decision. Background simulation matters only when its effects can eventually become legible and change how the player thinks or acts.

## Evidence contract

Hypothesis: a non-central player can develop a self-chosen goal within ten actions and pursue it through understandable consequences while independent actors create discoverable changes that alter later decisions.

Retain the loop when the player can explain their goal, expectation, result, causal model, and next intention from the public UI; prose remains readable; mechanical state matches the explanation; and the player rates desire to continue at least 4/5 at the action-30 and action-60 checkpoints.

Revise when intention repeatedly fails to survive adjudication, prose obscures the consequence, background activity is mechanically real but experientially inert, choices do not support self-directed play, or the player continues only to satisfy the protocol. Reject the current lane after a hard contradiction, hidden-fact leak, lost or duplicate input, partial commit, reload divergence, or another severe failure that contaminates later interpretation.

## Participant and limits

The initial participant is the main Codex operator acting as a real player through the rendered UI. This is a formative expert playtest: one participant can expose mechanisms and severe failures but cannot estimate prevalence or represent a market audience. No external participant, personal identifier, audio, video, or behavioral telemetry is collected.

The operator reads every rendered beat, records an intention before input, and chooses from current player knowledge only. The operator does not inspect protected truth until the declared audit checkpoint and does not choose actions for coverage. When a mechanic is not naturally attractive, that absence is evidence.

Before opening, sign a compact character contract from player-visible world material: who the character is, why they are present, one ordinary capability, one limitation, and two values or appetites that can genuinely conflict. Do not revise the contract to justify a convenient action. The character may change through play when the rendered events support that change.

## Three-lane structure

- Lane A uses the current-contract clean-world template `Lowwater Ledger`. The player begins as an outsider with an ordinary reason to be in Craghold and no institutional authority.
- Lane B builds and accepts one distinct current-contract world from edited DNA plus saved research, snapshots it before character bootstrap, and then plays the materialized template. The player begins with a concrete personal need but remains outside the world's ruling structures.
- Lane C uses the product clone operation on an accepted zero-turn world. The player may refuse the opening hook and pursue ordinary life, opportunism, travel, or another self-chosen direction.

Actions 1-20 cover discovery and goal formation. Actions 21-40 cover pursuit, return, and adaptation. Actions 41-60 cover payoff, escalation, or a new commitment. These phases describe what we observe and do not prescribe actions.

Before turn zero, verify the template manifest and database hash, apply current migrations without modifying accepted world content, prove that character and turn history are empty with setup phase `character_required`, and freeze lane eligibility. Lane C must use the product clone operation rather than a filesystem copy after its eligible source exists.

Each lane is played in sittings of at most ten completed actions. End a sitting sooner if the operator starts skimming prose, forgetting what was actually visible, feeling pressure to make progress, or selecting actions for protocol coverage. At the next sitting, record the remembered situation and intended next action before rereading the UI, then record what the interface made easy or hard to recover. Fatigue is not evidence about the game's prose or agency, but the product's support for returning after a break is evidence.

## Per-action notes

Record behavior before evaluation:

- what the player is trying to do;
- what result they expect and why;
- options they considered;
- exact submitted action and control type;
- visible result and new uncertainty;
- whether the action was preserved, clarified, denied, or seized;
- whether another actor or place changed independently;
- what the player wants to do next;
- prose or causality finding, if any.

At actions 10, 30, and 60, ask: What are you trying to achieve? What do you expect next? Why do you think the last important result happened? Which world changes were not caused by you? What would you do next if the test ended now?

Rate comprehension, prose readability, agency, world aliveness, and desire to continue from 1 to 5. The rating follows the behavioral account; it does not replace it.

Use shared anchors: `1` means the experience is blocked or actively drives the player away; `3` means usable but dependent on effort, patience, or charitable interpretation; `5` means clear and compelling without protocol pressure. A continuation score of `4` or `5` means the player would voluntarily take another turn if the formal test stopped now. A `4` is not earned merely by wanting to diagnose a defect.

## Facilitator boundaries and severe failures

Do not hint at hidden goals, optimal routes, scheduled actors, exposure seeds, or test quotas. Do not rescue a dull scene by selecting a more diagnostic action. A player who cannot find a reason to act has discovered a game-design problem.

Stop the pristine lane on a hard state or authority failure, a hard narrative contradiction, a protected fact presented without a valid exposure path, or an accidental unsigned or duplicate submission. Three consecutive turns that leave the player unable to identify new information, changed stakes, progress, or a meaningful choice trigger a pause and design review; intentional quiet play is exempt only when the player can explain its value.

Promotion observations such as a player-caused chain, a player-independent chain, return visit, or refusal count only when they arise from the signed intention and visible scene. Do not consult a missing threshold and then manufacture the required behavior inside the pristine lane.

## Accessibility disposition

Disposition: `CLEAR_WITH_CONDITIONS` for this expert formative pass. Before action 1, verify that essential state remains available in text, keyboard focus can reach the scene and action controls in a sensible order, critical effects do not carry unique information through animation alone, and consequences remain available for rereading after beat transitions. This pass records readability, cognitive load, focus loss, and recovery problems. Claims about broad accessibility require later participation by affected players and assistive-technology checks.

## Diagnostic separation

The pristine lanes report the natural action mix. They do not force fixed counts of freeform, impossible, adversarial, or secrecy-probe actions. Missing boundary evidence is collected afterward on a disposable clone with a separate diagnostic label, so stress behavior cannot masquerade as ordinary play or contaminate the sixty-action history.

Humanizer and deslop review: the contract uses direct player language, separates observation from inference, and avoids treating completion counts as evidence of engagement.

## Frozen Lane A diagnosis: actor commitment continuity

The first `Lowwater Ledger` sitting stopped after action 10. Mara Venn had accepted shelter in exchange for writing patient labels at Cable Span. Magda Sprat remained visibly present at second bell and called for the dressings, while the same settled turn moved her to Glasswater Terrace. Reload reproduced the exact canonical hash, so the lane remains frozen as failed evidence rather than being repaired in place.

SQLite inspection showed that Magda's knowledge contained the accepted bargain, the completed labels, their review, and the second-bell dressing scene. The scheduler loaded those event rows, but the replanner converted each one to only its event kind and learned-at timestamp. The model therefore received `scene_recorded` without the scene and could not preserve the immediate obligation.

The minimal repair keeps truth ownership and data flow unchanged. The actor frame now carries the bounded summary of the latest accepted `record_world_event` rows known to that actor. The replanner receives the exact summary and its occurred/learned times. Its instruction permits changing course, but requires an immediate witnessed commitment to be completed, handed off, postponed, or abandoned for a grounded frame-supported reason instead of being silently forgotten. No retry, fallback, provider switch, semantic regex, or code-authored narrative outcome was added.

Humanizer review: the instruction names the actor's decision in concrete verbs and preserves agency instead of forcing obedience. Deslop review: removed abstract continuity rhetoric and avoided repeated warnings, faux quotations, grading language, and prose-policing rules. Verdict: acceptable as a compact behavioral contract; the live disposable-clone retest still owns the experiential decision.

## Action-10 diagnosis: prose-only possessions

The replacement `Lowwater Ledger` sitting completed ten signed actions without a visible contradiction. Mara Venn earned two copper chits for each of two copied manifests, kept all four when no shared cot was available, and voluntarily followed a separate dock trace. The public projection survived a backend restart byte-for-byte. Human checkpoint scores were comprehension `5`, prose readability `4`, agency `5`, world aliveness `4`, and desire to continue `4`.

The protected audit confirmed three real autonomous causes: Harriet sealed debt writs, Vittorio inspected unmetered glow at the cable anchor, and Piero inspected the lift winch. Actor knowledge contained full accepted scene summaries before live replanning, so the commitment-continuity repair held. Every model stage used Z.AI `glm-5.2` on attempt one.

The same audit found that both payments and Mara's retained four chits existed only in `record_world_event` summaries. No Rulebook command changed an item, currency, resource, or actor holding; the displaced `items` table remained empty. The lane pauses before action 11 because spending a prose-only resource would make later interpretation untrustworthy.

### Frozen repair contract

Outcome: ordinary possessions acquired or spent during Campaign Play become canonical Rulebook truth, remain stable across reload, and are visible to the human player.

Acceptance criteria and provenance:

1. A positive acquisition and a permitted spend change actor possession quantity in mechanical state. This is required by the user's Rulebook outcome.
2. Each adjustment passes frozen preflight, exact authority/scope, receipt/event, world-version/hash, idempotency, clone/store coverage, and reload invariants. Insufficient quantity produces zero writes. These are affected pre-existing Rulebook and store contracts.
3. Only positive holdings of the human actor enter the narrator packet, frozen action authority, public state, and rendered Play UI. This is required to let the player verify a consequence; NPC and zero holdings remain protected.
4. The GM proposes a typed acquire or spend effect that compiles to one `adjust_actor_possession` command. That command's typed event owns the public possession consequence; a freeform `record_world_event` does not mutate holdings. No retry, fallback, prose parser, semantic regex, or backend rewrite is added. This prevents recurrence of the task-caused prose-only resource defect while preserving model authorship.

Included scope: a dedicated current-contract possession table; strict command/event/entity contracts; Rulebook preflight, simulation, execution, receipts, events, exposure, sorted mechanical hashing, and durable loading; canonical store registration; human-only public projection and a compact `Carrying` UI region; focused tests; one disposable-clone GLM 5.2 acquire/restart/spend playtest.

Non-goals: economy, shops, pricing, weight, equipment, crafting, transfers or conservation between counterparties, NPC inventory UI, legacy compatibility, smoke tests, and reuse of CharacterRecord inventory, old `items`, or faction resources.

Architecture delta: `campaign_play_actor_possessions` becomes the current truth owner. A deterministic actor/name key identifies one retained row; quantity may reach zero but never become negative. The GM emits a structured acquire/spend proposal, code binds or derives the possession ID and exact scopes, Rulebook applies the delta transactionally, and visibility derives the public holding and consequence from the typed event's before/after state. The displaced path is a possession change narrated only by `record_world_event`.

Alternatives rejected: CharacterRecord inventory is immutable profile data; actor conditions are boolean closed-enum state; pressures are global bounded progress; observations and knowledge are derived epistemic records; old item and faction-resource stores belong to the displaced gameplay path.

Validation budget: targeted contract, migration/store, Rulebook, GM, state/hash/reload, read-model/API, and SceneCard tests; at most two evidence-based repair cycles; one expensive live disposable-clone playtest and one rerun only after an in-scope repair. No full suite or smoke run unless a targeted failure proves a named shared invariant otherwise lacks evidence.

Independent plan review returned `REVISE`. The accepted corrections register the table in the canonical store manifest, carry holdings through the frozen narrator/admission packet, and make the typed possession event—not a neighboring freeform scene record—the source of public mechanical consequence.

### Possession implementation evidence

Migration `0035` widens the immutable command, receipt, event, and affected-reference contracts without rewriting existing ledger rows. `campaign_play_actor_possessions` owns actor-scoped quantity, deterministic identity, causal receipt, world version, and guarded insert/update transitions. Rulebook simulation and the mechanical hash include the sorted possession state. A typed adjustment event cites both the human actor and the possession, so the visibility layer can identify it as the player's action instead of publishing a generic nearby change.

The targeted gate passed `192` backend tests across contracts, migration/store, Rulebook, GM, state/reload/hash, projection, visibility, narration, turn runtime, route API, and store manifest. The targeted frontend gate passed `15` API/Stage/SceneCard tests; the affected page fixture passed another `24`. Shared build and backend/frontend typechecks passed. The populated-ledger migration test preserves command, receipt, event, and exposure bytes and returns clean SQLite integrity and foreign-key checks. The atomic repository test executes both acquisition and a later negative delta, verifies quantity `2 → 1`, and verifies the event's actor-plus-possession references.

Humanizer/deslop semantic review: the player-facing label `Carrying` and compact `name × quantity` rendering are ordinary interface language with no audit jargon or decorative prose. The GM instruction is necessarily strict technical language, but assigns model authorship in direct verbs, states one authority boundary once, and adds no fallback, retry, semantic parser, or backend-authored outcome. Verdict: land unchanged and let the live playtest decide whether the resulting prose makes the exchange intelligible and worth continuing.

### Disposable-clone possession playtest

The current-contract `Lowwater Ledger` template was materialized and cloned through the product operation; no new world generation was required. Sorel Vane followed a visible work lead, accepted a lower Cable Span re-lashing contract, and acquired a stamped work chit through a typed possession command. Before and after a backend restart, world version `19`, runtime revision `279`, projection hash `b888c8ff58dd877f0a91fcd86bbe156bae3cdfcc31558b1e4e95174b7d37cb5a`, and the rendered chit quantity remained identical.

The job then produced issued tools and material. A failed repair exposed a salt-glazed ridge; a later request to the span chief produced sail-canvas padding and fresh cord. The successful repair consumed sail-canvas `1 -> 0` and cord `2 -> 1` through typed negative adjustments, removed the zero holding from the public projection, and left the tools and work chit available for return. The possession acceptance criterion is therefore satisfied in a live rendered campaign without prose parsing, fallback, provider substitution, or backend-authored exchange.

The game-quality disposition is `REVISE`, not promotion. Twelve player actions completed; the thirteenth stopped at Judge with `model_contract_invalid` before the promised tool return and forty-mark payment. Completed actions averaged `208.1s`, with a `92.3s` minimum and `354.1s` maximum. Suggested actions repeatedly failed to represent the active work commitment, forcing freeform input for signing, travelling to the lower anchor, repairing, asking for proper gear, and returning equipment. The repair was coherent and responsive, but took more resistance cycles than its dramatic weight justified. A damaged remainder and a fresh cord cut also merged under one name into quantity two, exposing the limit of fungible name-keyed possessions.

The action-10 human checkpoint rated comprehension `5`, prose readability `4`, agency `4`, world aliveness `4`, and desire to continue `3`. Aldo and Magda moved independently to other locations and their departures became visible without crowding Sorel's moment. Rendered inspection disproved an apparent duplicate-paragraph bug from the accessibility tree: transition layers duplicate nodes, while the visible scene renders each beat once. Detailed per-action and mechanical notes are retained under the ignored playtest session output.

Humanizer/deslop review: the playtest note separates observed behavior, mechanical evidence, and interpretation; uses direct verbs; does not inflate a successful possession transaction into a claim that the whole game loop is ready; and records the latency, interrupted payment, suggestion drift, and coarse item identity without euphemism. Verdict: acceptable as diagnostic evidence.

## Frozen Lane A r04: opening narration contract

The next pristine materialization preserved the accepted `Lowwater Ledger` snapshot and began with Iona Pell, an itinerant leather and canvas repairer stranded by a cancelled ferry. The planner placed her on Glasswater Terrace beside a lift cage whose salt-iced canvas hatch-cover had split along a frayed seam. The situation was specific, relevant to her signed capability, and did not make her the centre of the world.

Turn zero then interrupted at `visibility_projected` before any player action. Opening Planner completed one GLM 5.2 native-JSON attempt in `223164 ms`. Narrator completed one provider/schema-valid GLM 5.2 attempt in `45167 ms`, but `assertProposalForPacket` rejected the proposal as `narration_invalid`. No narration beats or suggested actions committed. The UI retained the visible consequence and recovery control in text, but disabled action submission. The operator did not use Resume; r04 remains frozen at zero completed actions.

This was the second fresh opening in succession with the same semantic rejection. The Narrator instruction contained a direct conflict: the compiler requires the first opening beat to use `orientation`, while the prompt told the model both to put a visible consequence first and to use `consequence` for every visible result. The repair changes only the instruction. An opening consequence now belongs inside the required orientation beat; `consequence` remains the label for non-opening results. The semantic compiler, structured schema, one-attempt policy, provider selection, and recovery behavior are unchanged.

The focused Narrator gate passed `11` tests and backend typecheck passed. Humanizer review kept the instruction literal and technical. Deslop review removed the competing generalization instead of adding explanation or repeated warnings. Verdict: the prompt is direct enough to retest unchanged in a new pristine r05; live completion still owns acceptance.

### r05 live gate and exact second repair

r05 preserved the same accepted template and began with Iona Pell on Glasswater Terrace. The player-visible change was a winch cable whose worn hemp wrapping exposed bright steel-wire burrs and scattered fresh shavings across the dock. This was another concrete, dangerous problem relevant to Iona's craft. Turn zero still interrupted at `visibility_projected` before action 1. Opening Planner completed one GLM 5.2 attempt in `181196 ms`; Narrator completed one provider/schema-valid attempt in `102497 ms` and then failed semantic compilation.

Because the rejected proposal is not part of campaign truth, the frozen r05 database could not identify the remaining condition. After the backend stopped, a byte-identical disposable copy resumed only the Narrator stage with a temporary safe proposal log. The proposal contained one correct `orientation` beat and four action details, but no separate final `action_handoff`. The compiler therefore rejected it exactly as designed: the packet exposed four available intents, so its final beat had to hand control back to the player.

The second repair makes that structural rule literal. Whenever `availableIntents` is non-empty, Narrator must append a separate final `action_handoff`; an actionable opening has orientation first and action handoff last. The temporary log was removed. The compiler, schema, attempt policy, provider, and recovery path remain unchanged. The focused `11` Narrator tests and backend typecheck passed.

Humanizer/deslop review: the new instruction states the persisted condition once in ordinary technical language. It removes the inferential phrase `whenever the scene awaits another action` and adds no grading language, retries, fallback, prose parser, or backend-authored beat. Verdict: acceptable for one final fresh pristine opening gate.

## r06 opening pass and first-action Judge stop

r06 completed turn zero on the second Narrator repair. Iona arrived beside an unraveling lift-cage winch cable on Glasswater Terrace. The first beat established the place and concrete danger without gathering the visible cast around her. The second handoff repeated the damaged-cable fact instead of sharpening the choice, which remains a prose-quality issue rather than a contradiction. Four actions and freeform input were available.

The player's first signed intention was to inspect the cable closely without touching it, determine how far the damage ran, and assess immediate danger. This followed Iona's craft and safety instinct more naturally than the generic observe suggestion. Judge returned provider/schema-valid GLM 5.2 output in one `33624 ms` attempt, then failed semantic compilation at the check that every target and citation handle belongs to the frozen visible-fact map. The turn interrupted at `admitted`; no player action completed and no decision evidence was bound. r06 remains frozen.

The admitted frame included the exact cable observation as a visible fact. A byte-identical disposable copy passed the same Judge stage on its next single attempt, proving that the static proposal schema made handle adherence probabilistic: it allowed any string even though the prompt and post-compiler required supplied handles. The repair derives the native JSON schema from the parsed frame. Target handles are limited to visible targetable facts, citation handles to all visible facts, and movement handles to visible routes or null. The model still authors every semantic choice; code performs no retry, handle substitution, fallback, or outcome rewrite. Existing compiler checks remain in place.

The focused gate passed `16` Judge tests and backend typecheck. Tests prove the request schema accepts visible fixture handles and rejects hidden target, citation, and movement handles before semantic compilation. This is a model-contract repair, not broader Judge redesign.
