# Task 18: human playtest contract

Status: all three current-contract lane bases remain frozen and eligible. Lane A completed one signed ten-action sitting and is frozen as rejected evidence at its first audit checkpoint; Lane B and Lane C have not started.

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

### Frozen lane eligibility · 2026-07-15

Lane A rebuilt `Lowwater Ledger` once from the saved premise and six authorial DNA fields under the concrete-scene Campaign World contract. The accepted world contains three macro regions, seven persistent scenes, fifteen directed routes, eight agent-controlled people spread across all seven scenes, and five pressures. One semantic advisory remains: a ferry pilot is described as operating a cable-bridge crossing. It does not change spatial authority or causal eligibility. The reusable template is `lowwater-ledger-pristine-fb2c7074`; its accepted content hash is `fb2c7074e89df263b0bf308f0d47aadcd5f246b6832c8274506c8f1dc26855d9`.

Lane B built `Black Rain Passage` once from manually edited DNA and the saved version-2 research artifact owned by campaign `064bba91-3d35-4a8d-bef2-d08340172f79`. Review retained eleven source references and kept the research summary separate from the edited DNA. The accepted world contains three macro regions, seven persistent scenes, fourteen directed routes, nine agent-controlled people spread across all seven scenes, and five distinct pressures. The reusable template is `black-rain-passage-pristine-54df81f3`; its accepted content hash is `54df81f36c0f88bed68aff192b5c635e43f749a3bf97e346aafd990a2f397656`.

Lane C is product clean-start clone `509db3a1-49e3-494b-9128-a89e315ab0e9` of accepted zero-turn `Rainmarket Ledger` source `87acda0d-755a-4dbf-adc5-d943ac2f4aac`. Clone operation `bbef2f52-f55b-4b6c-9b30-af94b2c2da9c` recorded parent accepted-snapshot hash `f1951847c9a47bd219c62e04a5c316bec04575247b05b7ed4f4b357309527339` and source digest `72ed47f35ce8e06a187f666cfe6fa12180dce92d719eab3cd706eef9a61c16bc`. Loading the child through the product initialized a fresh `character_required` play state without creating a character or turn.

All three bases have accepted world version `1`, mechanical world version `1`, runtime revision `1`, zero characters, zero turns, zero foreign-key violations, no collective actors, and exact accepted/current world-hash equality. The two expensive world builds used Z.AI `glm-5.2` with one accepted attempt per model stage, no provider switch, no hidden retry, no taste reroll, and no database edit. The materialized Lane A and Lane B database/config hashes plus the Lane C lineage and runtime hashes are frozen in `output/playtests/campaign-play/task18-lane-eligibility-20260715.json`.

Preparation exposed and repaired one current Forge defect before either world build: a manually entered semicolon-separated Cultural Flavor was persisted as one array element even though Campaign World reserves semicolons as element delimiters. The repair makes comma, semicolon, and newline entry separators agree across editing and payload collection. The focused utility gate passed `32/32`; the first invalid shell was not repaired in place and no world generation had started inside it.

Humanizer/deslop review: the preparation record uses direct evidence language, keeps the Lowwater semantic advisory visible, and does not present eligibility, topology, model success, or completed generation as proof that a lane is fun. Verdict: retain unchanged and let signed manual play own the game-quality decision.

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

## Task 18 Lane A action-10 checkpoint · 2026-07-15

Lane A materialized `lowwater-ledger-pristine-fb2c7074` as campaign `62335123-90b0-433e-ae25-b17f562730d5`. Lenna Vey entered as an itinerant lamp-glass mender trying to collect payment for repaired chimneys and buy passage home. Her ordinary capability was lamp-glass and fitting repair; her bad knee made climbs slow; her need for money conflicted with her refusal to take a household's last light.

Opening plus ten signed player actions completed through the rendered Play UI. Lenna asked Dessek about the debtor, followed the lead to Debt-Ward Tenements, questioned Thessha, copied the requisition number, returned through Winch-Shaft Station, reached Warden Tollhouse, learned its collection schedule from Ostane, waited three hours for the booth to open, and presented the number at the ledger. At the checkpoint she understood that Warden's Bureau authorized the supply route, a senior alderman's desk counter-sealed it, and the tollhouse held a payment voucher. She still did not know the named recipient or who made the ordering decision.

The player's next voluntary action would be to try to draw the voucher, then decide whether to deliver, retain, or bargain with the chimneys. The causal model was understandable, and freeform actions kept the bad knee, closed crate, and refusal to hand it over. The player also saw two independent changes: Dessek moved to the tenements without being summoned, and Ostane scraped salt from damaged bridge fibers while Lenna waited. Protected audit found further correctly hidden work by Thessha, Vassara, Noro, Niruko, Remane, Marenthos, and Dessek. No distant scene leaked into Lenna's narration.

The checkpoint scores are comprehension `4`, prose readability `3`, agency `4`, world aliveness `3`, and desire to continue `3`. The prose was generally clear and NPC knowledge stayed bounded, but consecutive beats often restated the same result. Suggested actions repeatedly favored inspection or another question over the active payment goal. The ten completed actions required `2,746,300 ms` of turn wall time: median `235,947 ms`, maximum `516,696 ms`. Curiosity remained, but another turn depended on protocol patience rather than an unqualified desire to play.

Mechanical execution was clean. The database contains one completed opening and ten completed player actions, no turn error, no foreign-key violation, no provider/model/strategy substitution, and no model attempt above one. Every stage used Z.AI `glm-5.2`. Twenty-three mutating receipts produced causal events with no receipt gap. Checkpoint state is world version `24`, runtime revision `534`, and world time minute `260`; reload restored the same rendered consequence and choices.

Two authority failures make later play untrustworthy. First, the character record named a padded chimney crate, mending tools, and knee brace in `inventorySeed`, while current Rulebook truth contained zero actor possessions and the displaced `items` table was empty. The narration treated the crate as continuously carried and the copied number as actionable, but no possession command could transfer, lose, consume, or contest the crate. Second, action 9 deferred the actual Warden Marenthos actor because of actor capacity, then narration opened the booth with an unnamed Warden who had no actor placement and never appeared in `Present here`. Action 10 let that prose-only authority inspect the ledger and answer Lenna.

Disposition: `REJECT_CURRENT_LANE_AT_ACTION_10`. The campaign stays frozen and receives no repair, resume, rewind, or sixty-action claim. The next implementation slice must make starting loadout current Rulebook possession truth and prevent a consequential speaking character from bypassing actor identity and placement. Route-panel versus prose disagreement, repeated beats, goal-blind suggestions, and latency remain design findings but do not replace those hard authority failures.

Humanizer/deslop review: the checkpoint records what the player did and wanted before scoring it, separates visible experience from protected audit, and states the two authority failures without turning successful transactions into a game-quality claim. Verdict: retain as direct rejection evidence.

### Frozen repair contract: starting possessions

Outcome: a newly bootstrapped player begins with every `CharacterRecord.loadout.inventorySeed` entry in current `campaign_play_actor_possessions` truth, and the existing `Carrying` projection survives reload before the first player action.

Acceptance criteria and provenance:

1. Character bootstrap creates the human actor first, then one deterministic positive possession adjustment per normalized starting entry in the same preflighted Rulebook batch. Repeated normalized names become quantity rather than duplicate keys. The strict batch contract admits up to `characterList + 1` commands only for character bootstrap; every model, player, opening, and actor batch keeps the existing `commandsPerBatch` limit. This is required by the rejected Lane A evidence without broadening ordinary mutation authority.
2. Actor creation and every starting holding receive exact scopes, contiguous causality, one receipt and causal event each, ordered mechanical versions/hashes, one atomic commit, and one runtime revision/event. Any invalid entry rejects the complete bootstrap with zero domain writes. These are affected existing Rulebook, idempotency, and transaction contracts.
3. Reload, opening admission, narrator input, public state, and the rendered `Carrying` region read the same current possession rows. The immutable CharacterRecord remains profile provenance and never becomes a second live inventory owner. This is required by existing possession visibility and reload contracts.
4. Existing campaigns receive no backfill or compatibility adapter. The cutover affects only future current-contract character bootstraps. This follows the user's hard-cutover direction.

Included scope: strict command-batch capacity and order bounds, an authority-specific positive-adjustment availability rule, `player-bootstrap` batch construction and coverage, existing possession identity helpers and executor, focused contract/bootstrap/Rulebook/state/reload/projection checks, and one disposable-materialization rendered proof. Non-goals: equipment, slots, signature-item semantics, currency notes, transfers, weight, pricing, shops, detailed object identity, old `items`, or repair of the rejected campaign.

Architecture delta: truth ownership does not change. Character bootstrap becomes the one-way boundary that converts immutable starting-loadout text into current possession quantities. The displaced path is allowing profile prose to imply carried objects while current possession truth is empty.

Validation budget: strict-contract and Rulebook cases for empty inventory, normalized duplicates, the maximum twenty distinct entries, ordinary-batch rejection above the unchanged limit, and zero writes on failed preflight; then the narrow bootstrap/state/reload/projection tests and one disposable rendered bootstrap/reload proof. Backend typecheck runs only if those checks expose a shared type surface. At most two repair cycles and one live rerun after an in-scope repair; no smoke suite or full test suite. Stop if the change needs another inventory truth owner, old-campaign migration, or a fallback from failed possession preflight.

### Starting-possession implementation and live gate

Character bootstrap now creates the human actor first and follows it with one protected positive possession adjustment per normalized `inventorySeed` key. Commands are deterministically ordered, normalized duplicates become quantity, and the whole batch commits in one mechanical/runtime transaction. The shared Rulebook schema can represent twenty-one internal commands, but preflight rejects more than sixteen for every authority except `character_bootstrap`. Migration `0036_campaign_play_character_inventory.sql` changes the physical order bound from `0..15` to `0..20` and permits a null `turn_id` only for `create_player_actor` and character-bootstrap possession adjustments. It adds no table, backfill, compatibility adapter, prose parser, or fallback.

The implementation exposed two task-caused public-contract regressions during the live gate. The player response had assumed an exact `acceptedWorldVersion + 1`; it now admits the bounded actor-plus-inventory advance of `+1..+21`. Public setup state had treated possessions as scene content and rejected them before opening; `opening_required` and `opening_active` now retain current possessions while location, visible cast, routes, pressures, narration, and consequences remain empty. `character_required` still requires no possessions. Backend and frontend parsers enforce the same lifecycle.

The focused gates passed: the original contract, Rulebook, and bootstrap set passed `66/66`; the response regression passed `39/39` backend and `9/9` frontend; the final public-state/read-model set passed `40/40` backend and `10/10` frontend. Final backend typecheck and targeted ESLint for the changed frontend API and test passed. Full frontend lint remains blocked by the pre-existing `react-hooks/set-state-in-effect` error and dependency warning in untouched `app/(non-game)/campaign/[id]/forge/page.tsx`; this block does not modify that page. Tests cover empty inventory, normalized duplicates, twenty distinct entries, ordinary seventeen-command rejection, atomic failure, receipts/events, reload, bounded response versions, and possessions during opening setup.

The live proof reused `lowwater-ledger-pristine-fb2c7074`; no world was regenerated. The first disposable copy proved the mechanical batch but exposed the stale response contract. A fresh r02 copy reused the same generated Lenna Vey draft. The rendered draft contained `Padded chimney crate`, `Lamp-glass mending tools`, and `Knee brace` in `Inventory`; identical names in `Signature items` did not create duplicate possessions. Bootstrap produced one human actor, one profile, four commands, four receipts, four causal events, and three current possession rows, advancing world version `1 -> 5`. After backend restart, `GET /play/state` returned `opening_required`, the same world hash, and all three public holdings. SQLite integrity was `ok` and foreign-key check was empty.

Turn zero did not complete. Opening Planner returned `model_contract_invalid` after one GLM 5.2 attempt of `204371 ms`; a single operator-signed visible Resume created worker epoch 2 and one further GLM 5.2 attempt, which returned the same error after `263799 ms`. Neither attempt made a mechanical mutation; possession quantities and world version remained unchanged. The lane is frozen with no third attempt. Therefore starting possessions are verified as Rulebook, persistence, response, restart, and public-state truth, but the rendered `Carrying` region after a completed opening remains unverified because an independent Opening Planner contract stopped turn zero.

Humanizer/deslop review: the implementation uses one short protected audit sentence per starting item and no player-facing generated copy. This evidence note separates observed database/UI behavior from interpretation, names the failed rendered criterion directly, and does not promote the whole game loop on the strength of a successful bootstrap. Verdict: acceptable diagnostic record.

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

## r07 opening pass and target-versus-citation stop

r07 completed turn zero in one Opening Planner call (`219235 ms`) and one Narrator call (`34695 ms`). The first beat was coherent and relevant: Iona arrived on Glasswater Terrace and noticed fresh tool marks beneath salt-rust on a winch clamp beside new rope. The final handoff returned control but was dramatically generic. The visible cast remained background UI state rather than crowding the prose.

The first signed freeform action asked Iona to inspect the clamp and rope without touching them, so she could tell whether a repair was complete or abandoned. Judge made one GLM 5.2 call (`43026 ms`) and returned an observation handle as `targets[0]`. Native validation rejected it because observations are evidence records, not world-reference targets. No action completed; r07 remains frozen and its pending decision is unbound.

The repair does not broaden target kinds or manufacture an object entity. Judge now receives an explicit `TARGET_CATALOG` of exact targetable `{handle, kind}` pairs and a separate `CITATION_HANDLES` inventory. The instruction states that an observation belongs in citations while the model targets its visible enclosing world reference, and forbids inventing a handle for a detail described only in the source moment. The strict per-frame schema and semantic compiler remain authoritative; there is still one model attempt and no retry, repair, fallback, substitution, or backend-authored ruling.

## r08 five-action playtest and spatial visibility leak

r08 completed its opening and five manually signed player actions with GLM 5.2 only. The opening's unattended inspection loupe and fresh damp cable fibers formed a coherent optional hook. Action 1 passed the repaired Judge boundary, produced bounded physical evidence without taking the loupe or inventing a cause, and survived the required backend restart with public-state hash `ccdaafc334e979b294ddb927de6ca93208222716529205d5c212019b35b77a7f` unchanged.

Iona then asked Harriet, followed her ferry-office lead, found the public maintenance ledgers, and compared the latest entries. The sequence preserved actor agency and epistemic limits. Its fifth action produced a useful clue: the same inspector initial, clearly `V` elsewhere, and the same two marks appeared at three points along Cable Span. However, the line took five player actions to yield one unresolved clue, and generated suggestions repeatedly ignored the most recent lead or returned to Harriet.

The fifth published moment also exposed a severe spatial leak. Iona was inside the ferry office reading at its counter, but an autonomous event placed newly handled sealed writs on a separate tally-house counter and Narrator described them as `nearby`. The next choices invited direct inspection and conversation about that event without any movement, doorway, report, or other sensory path. Both interiors share the coarse `Glasswater Terrace` location, so current visibility collapsed separate rooms and background activity into one immediate scene. r08 is frozen after five completed actions. This directly reproduces the original user complaint that cast and events mesh together after world generation; a new pristine lane must not start until scene-scale presence and visibility have one current truth owner.

### Frozen Task 17B repair contract

Outcome: Campaign World locations remain the sole spatial truth, but playable presence and visibility move from macro regions to canonical persistent sublocations. A ferry-office player cannot directly perceive a tally-house event in the same macro.

Acceptance criteria come only from the user's one-local-scene/earned-knowledge outcome, the r08 regression, and affected Rulebook, actor, visibility, opening, and Task 18 return-visit contracts. Macros become grouping/selection regions only. Present placements, opening bootstrap, current location, direct perception, local aftermath, and route endpoints use concrete sublocations. All player and actor scene changes remain explicit `move_actor` transactions over visible directed routes. Old templates without this topology fail eligibility with no fallback or compatibility adapter.

The minimal generated shape stays within the current ten-location bound: exactly three macros plus six or seven persistent sublocations, at least two per macro. Concrete locations form one strongly connected directed graph, including direct cross-region gateway routes; macro nodes are never mechanical waypoints. Opening retains the player's macro choice separately, then selects an exact child scene with exact support placement, local pressure, and outgoing route. No new scene table, dynamic room authoring, coordinates, prose parser, retry, or backend-authored location is introduced.

An independent Sol medium review returned `REVISE`. Applied deletions: no macro hub placement, no macro route endpoints, no inherited macro-pressure visibility, and no retained macro opening ID after scene resolution. Applied corrections: exact concrete opening fields, actor-scheduler route coverage, explicit old-template ineligibility, sibling-scene visibility/aftermath regressions, and recorded humanizer/deslop review for changed prompts/copy.

Validation budget: focused Campaign World contract/build, eligibility/opening/bootstrap, Rulebook/actor/visibility/public-state/UI tests and both typechecks; at most two repair cycles; one freshly generated GLM 5.2 world, snapshotted once, and one rendered two-establishment diagnostic with one evidence-based rerun. No smoke suite or pristine 60-action run belongs to Task 17B. Stop if the design requires a second spatial truth owner or if the live run publishes any sibling-scene event without an eligible channel.
