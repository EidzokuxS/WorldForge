# Task 18: human playtest contract

Status: all three reusable current-contract lane bases remain frozen and eligible. The earlier Lane A materialization remains frozen as rejected evidence. Replacement Lane A materialization `opening-possession-lowwater-r03` completed its first signed ten-action sitting and may continue after a break; Lane B and Lane C have not started.

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

### Frozen repair contract: performing-actor authority

Outcome: every player-visible dialogue or actor-led interaction is performed by one canonical nonplayer person who is present at the event's directly perceived location. A person mentioned only in prose cannot speak, decide, transact, disclose information, or become a contact target.

Acceptance criteria:

1. A deterministic or uncertain Judge `contact` ruling targets at least one visible nonplayer actor. Actorless contact may survive only as `impossible` or `clarification_required`. This is required by the rejected Lane A Warden exchange and the existing visible-target contract.
2. GM `record_world_event` proposals carry a required nullable `performingActorHandle`. `dialogue` and `interaction` require one exact actor handle from the ruling's actor targets; `discovery` and `scene` require null. The compiled command adds the actor to affected/read scope. This is required to keep model authorship while removing prose-only authority.
3. Rulebook commands and durable `scene_recorded` events carry nullable `performingActorId`. Dialogue/interaction denote nonplayer-performed events and require a canonical `kind=person`, `controller=agent` actor included in affected refs; when directly perceived, that actor must have a current `present` placement at the event location after earlier batch commands. Discovery/scene require null. A player's actorless physical attempt compiles to its typed effect or an actorless discovery/scene instead of inventing an agent performer. Invalid identity, class, scope, or placement produces zero writes. This is required by Rulebook and spatial-authority invariants.
4. Autonomous actor proposals identify their own actor for contact/attempt dialogue or interaction and null for observe/wait scene content. Existing protected, aftermath, route, and witness exposure semantics remain unchanged. This preserves the affected living-world actor loop.
5. Public consequences and the frozen narrator packet retain nullable performing-actor handle and name only when existing exposure independently makes that identity player-visible. Direct perception carries the typed attribution even if later actor settlement moves the performer. Protected, local-aftermath, and route-state consequences do not disclose it; witness reports keep it null unless another typed authority already exposes the identity. Backend/frontend parsers agree, and prose cannot substitute a new identity. This is required by the user's narrator outcome and the existing public-packet boundary.

Included scope: Judge semantic compilation, GM proposal schema/compiler/instruction, `record_world_event` command and `scene_recorded` event contracts, Rulebook preflight/scopes, actor proposal compilation, visibility/public consequence projection, frontend parsing, focused fixtures, and one fresh manual contact playtest after a completed opening becomes available. Non-goals: generating support NPCs, renaming existing actors, changing actor capacity, dialogue memory, voice quality redesign, semantic prose parsing, backend-authored replies, retries, fallback, compatibility adapters, or repairing the frozen Lane A database.

Architecture delta: current actor and placement rows remain the truth owners. The minimal change adds a typed performer reference through proposal → Rulebook command → event, then projects that identity into the visibility consequence and narrator packet only when the existing exposure permits it. The displaced path is accepting a dialogue/interaction summary whose only apparent performer exists in prose. Ambient discovery/scene summaries remain actorless but carry no actor authority.

Validation budget: focused Judge, GM, contracts, Rulebook, actor-proposal, visibility, public projection/API, narrator-packet, and turn-runtime checks; changed-file lint/typecheck; at most two repair cycles. Projection fixtures must prove direct-perception attribution survives later actor movement while local-aftermath, route, and witness exposure do not gain identity. One fresh manual contact probe uses a reusable pristine world only after turn zero completes without recovery. No smoke suite, full regression, world generation, or sixty-action lane belongs to this repair. Stop if correctness requires a new actor store, prose parser, automatic NPC materialization, or compatibility path.

Independent plan review returned `REVISE`. The accepted correction keeps performer identity canonical in the event ledger while preventing protected or indirect events from leaking that identity through the public packet. It also distinguishes nonplayer-performed dialogue/interaction from an actorless physical attempt by the player.

Implementation evidence: actionable Judge contact now requires a visible nonplayer actor target. GM dialogue and interaction proposals bind `performingActorHandle` to one of those targets; Rulebook preflight resolves the durable `performingActorId`, requires an affected canonical agent person, and rejects direct perception when that person is not present at the event location after earlier batch commands. Autonomous actor interaction binds the source actor. Contact-derived witness authority now follows only this performer instead of every actor named in generic affected references.

Direct-perception visibility carries the performer's public handle and name into the consequence and frozen narrator packet even when a later command moves that actor. Protected, local-aftermath, route, and witness projections keep both fields null. Backend and frontend enforce the paired nullable fields. Focused contract, Judge, GM, Rulebook, actor-proposal, visibility, projection, Narrator, and frontend API/UI checks passed, along with shared/backend/frontend typechecks. A turn-runtime regression was prepared, but its fixture cannot reach player-action admission because the existing opening preparation is independently denied by Rulebook as `invalid_frame`; the repair did not change frame validation. No opening repair or additional retry was added to this task.

The fresh manual contact probe remains gated exactly as planned: neither the frozen live lane nor the test fixture currently supplies a normally completed opening. Humanizer/deslop review: the two new GM instructions use concrete actor, handle, and event-class terms; they assign model authorship without repeating the same warning, parsing prose, or letting backend code write a reply. This note separates mechanically verified authority from the still-unverified play experience. Verdict: acceptable to land as a bounded authority repair; prose quality and interest remain owned by the next fresh manual lane.

### Frozen repair contract: bootstrap version authority

Outcome: one fresh copy of an accepted pristine world with materialized starting possessions completes turn zero without Resume. The opening must use one GLM 5.2 attempt per model stage, commit through Rulebook, and render a coherent local situation.

Acceptance criteria: an `opening_required` frame is valid only when its exact world version accounts for the player-creation command and every distinct positive starting-possession command; a pre-character frame cannot contain possessions; inconsistent ownership, quantity, or version remains invalid. These criteria follow from the requested playable turn zero and the existing receipt-bearing Rulebook version contract. The live gate additionally requires a normally completed opening, unchanged accepted-world content, public possessions, and prose that establishes a specific situation without making the player the centre of the world.

Included scope: the Rulebook setup-shape invariant, focused Rulebook and opening-runtime fixtures, this evidence note, and one disposable materialization of the existing pristine Lowwater template. Non-goals: repairing or resuming any frozen campaign, changing world generation, model selection, prompts, schemas, retry or fallback policy, provider timeouts, broader opening design, or starting a sixty-action lane.

Architecture remains unchanged. The accepted world, mechanical rows, receipts, and `worldVersion` in `state.db` remain authoritative. The minimal change replaces the obsolete character-only opening version constant with the version implied by the already-authorized bootstrap commands; no compatibility path or new state is added. Baseline evidence is shared by the failed live r02 opening and the focused runtime fixture: both reach a valid compiled opening artifact and are then denied by Rulebook as `invalid_frame` because starting possessions advanced `worldVersion` beyond `acceptedWorldVersion + 1`.

Validation budget: focused Rulebook and opening-runtime tests, backend typecheck, and one fresh live opening from the reusable pristine template. One evidence-based repair and rerun is allowed after the live gate. Stop if the repair requires reconstructing history from prose, changing provider behavior, mutating a frozen lane, or adding recovery or compatibility machinery.

#### Fresh live gate and contact probe

The repair derives the opening base version from the one player-creation mutation plus the exact set of distinct positive player possessions. It also rejects possessions before character creation and possessions owned by another actor during `opening_required`. Focused Rulebook and opening-runtime validation passed `42/42`, backend typecheck passed, and the previously blocked turn-runtime contact regression passed after its assertion was aligned with the durable external error code. GitNexus impact analysis was attempted before the edit, but the existing Ladybug WAL assertion left risk unknown; direct inspection found one production caller, Rulebook preflight, and the focused runtime suite exercised it.

The disposable `opening-possession-lowwater-r03` run copied the unchanged `lowwater-ledger-pristine-fb2c7074` template; it did not generate another world. Its accepted content hash remained `fb2c7074e89df263b0bf308f0d47aadcd5f246b6832c8274506c8f1dc26855d9`. Lenna Vey's bootstrap created three current possessions and advanced world version `1 -> 5`. Opening Planner then completed one strict GLM 5.2 attempt in `352541 ms` with `23244` input and `20143` output tokens. Narrator completed one strict GLM 5.2 attempt in `240274 ms` with `2889` input and `10166` output tokens. Both schema outcomes were valid, no Resume was offered or used, and turn zero completed at world version `12` with setup phase `ready`. SQLite integrity was `ok`, foreign-key check was empty, and all three possessions rendered in `Carrying`.

The opening placed Lenna in Debt-Ward Tenements beside a sealed doorway, a posted illumination-debt notice, and two locally present people. The first beat was concrete, readable, and did not announce Lenna as the centre of the wider crisis. The second beat was weaker: it restated the lock, notice, and corridor instead of adding pressure or a sharper handoff. Four materially different actions remained available.

Before action 1, the operator signed the exact visible suggestion `Ask Alderman Thessha Aqueli about the Compact seal and its figures` against public projection `57c06dc4077c9df002c5f5f0fb9acd928d062b3a8ebfbe27b9cfb29d7b4abdfb`. Judge, Game Master, and Narrator each completed one strict GLM 5.2 attempt with valid schema outcomes and no retry, fallback, provider change, interruption, or Resume. Rulebook advanced time by two minutes and recorded one dialogue event, moving world version `12 -> 13`. The command's `performingActorId` resolved to canonical present agent person Alderman Thessha Aqueli and its affected references included Thessha, Lenna, and Debt-Ward Tenements. The rendered reply came from Thessha, directly explained the notice, figures, seal, lock, and review path, and disclosed no distant event. The final handoff again repeated established objects. Thessha addressed Lenna by name without an explicit on-screen introduction; her ongoing local rounds make this plausible, but longer play should test whether familiarity is earned consistently rather than inferred from player profile access.

Humanizer/deslop review: the record keeps observed state, mechanical proof, and taste judgment separate. It names the repetitive handoff and familiarity risk directly, without turning one successful action into a claim that the long game is proven. Verdict: the bootstrap-version gate and canonical-performer probe are accepted; prose momentum and relationship knowledge remain live playtest questions.

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

## Current Lane A action-5 formative checkpoint

Decision: revise the narration handoff and generated follow-up choices before continuing the sixty-action lane. The selected method was an internal formative playtest through the rendered Play UI. One informed operator played Lenna Vey as an ordinary itinerant lamp-glass mender. This sample can expose failure mechanisms but cannot estimate player prevalence. Recruitment, recording, personal-data, minors, multiplayer, monetization, and mod gates do not apply.

The evidence hypothesis was that a reasonable action would resolve visibly and leave a distinct next decision. Opening plus five signed actions disproved that hypothesis for the current scene. Lenna questioned Thessha, left the opening hook, searched the corridor for a household that owed her, examined the door marks, asked Thessha for help, and knocked on a nearby door. The rules preserved agency and limited knowledge. They did not invent a debtor, turn Thessha into an omniscient guide, or force Lenna back to the opening hook.

The repeated structure still made the scene drag. All five player actions produced two narrative beats. The second beat restated the first result or the same stalled goal. Suggested actions returned to chalk marks, the nearest door, and the same question after those lines had already resolved. World versions advanced from `12` to `17`, one version per player turn, without a separate actor act in this five-action window. The observed failure was not that Lenna failed. The failure was that failure produced little recovery information and the choice surface cycled through spent actions.

Severity is `REVISE`, not lane rejection. A single authority leak, false possession, impossible transition, or hidden-scene disclosure would still reject and freeze the lane. This checkpoint found none. The decision rule was to change one shared contract, retest three signed actions, and stop repairing if the same mechanism remained dominant.

## Optional handoff repair and action-8 retest

The Narrator compiler had required a final `action_handoff` whenever choices existed, even when the packet contained no separate supported edge. The model had to fill that beat without adding facts, so it summarized the result. The packet already carried prior observations in `continuity`, but the action-detail instruction did not treat them as spent lines of inquiry.

The repair removes the unconditional handoff requirement. A player-action narration may stop after one consequence beat; clarification still requires its exact final handoff. The prompt now uses `actionContext` and `continuity` as a record of tried actions and asks for a changed condition or a different visible detail instead of synonymizing the old action. No schema retry, semantic prose grader, backend rewrite, fallback, provider change, or compatibility path was added. Architecture ownership is unchanged: Narrator authors visible prose and labels from the frozen packet, while code keeps identifiers, intents, effects, and world mutation authoritative.

The focused Narrator gate passed `12/12`, and backend typecheck passed. The live backend restarted against the same isolated campaign root and restored world version `17`, runtime revision `249`, and projection hash `3125b6a1586d22f3a21e5e948086004c8123b2ca2d608d55829f1ca1e07597d6` before the retest.

Actions 6 through 8 completed through the Play UI. Each produced one useful beat instead of a consequence plus recap. Thessha distinguished two far doors with five-cycle and six-cycle light debts. Lenna inspected them and closed the false lead without finding a convenient debtor. She then left for Winch-Shaft Station, where a rope barrier and sawhorses created a new local problem beside Dessek. Agent events for Thessha and Vassara remained at the tenements and did not leak into Lenna's new scene. Dessek's local act became visible at the station. The current cast showed only Dessek, while Lenna's three possessions survived the move.

The three retest turns advanced world version `17 -> 21` and journal cursor `6 -> 10`. Their wall times were `332409 ms`, `309386 ms`, and `386658 ms`. Every Judge, Game Master, Narrator, and Actor Replanner stage used one accepted GLM 5.2 strict-object attempt. No requested or actual provider, model, or strategy changed. SQLite integrity returned `ok`, and foreign-key check returned no rows.

The repair is retained. It removed the repeated second beat in `3/3` live turns and improved forward choice in the contact and movement scenes. One residual failure remains: after Lenna inspected the two far doors, the contact choice again suggested asking Thessha about the debtor. The repair reduced the loop but did not eliminate every repeated suggestion. Per the frozen budget, this does not start a second prompt repair. Lane A continues from action 9 with that defect recorded.

Humanizer review: the new instruction uses direct technical language, names the exact prior-action evidence, and does not ask the model to manufacture drama. Deslop review: it removes the forced fractal summary instead of adding style rules, avoids a prose-grading loop, and keeps the action-detail rule specific. Verdict: retain the prompt and compiler change; let later manual actions determine whether residual choice repetition needs a separate design task.

## Replacement Lane A sitting-1 action-10 checkpoint

Disposition: `CONTINUE_LANE_AFTER_BREAK`. The optional-handoff repair remains accepted. No hard state failure, authority mismatch, impossible transition, false possession, protected disclosure, retry, provider switch, or model switch occurred in the first ten player actions. The lane pauses because the protocol caps one sitting at ten completed actions, not because the campaign failed.

Action 9 was signed as the exact visible choice `Ask Dessek Holvar Brunne about the blocked shaft access` against projection `2690c05c5b9bf7f00eb87e8a46c003e04efba009944ab7bbc9fec19e9f36eff4`. Dessek explained the blockade as leverage against lower-ward quota cuts. Action 10 was signed as the freeform question `Ask Dessek whether the chimney order and sealed debt notices in the tenements are part of the quota seizures, and whether delivering these chimneys would help those families or the collectors.` against projection `386bf2ad79439d1bd564b455894b4db975c73af2253bd424797f7c27bdba6c83`. He linked the unpaid repair work to the seizure system and argued that restoring quotas, rather than delivering the glass, would restore household payment capacity.

Both actions used one valid strict-object GLM 5.2 attempt per Judge, Game Master, and Narrator stage. They advanced world version `21 -> 23`, world time `47 -> 53`, and journal cursor `10 -> 12`. The campaign finished the sitting at runtime revision `476` and projection `1e852f3bd8f9204c1eb62f13f4d530172ba37be1991359acb82f5d058088c7d3`. SQLite integrity remained `ok`, foreign-key check remained empty, Lenna stayed at Winch-Shaft Station with Dessek, and all three starting possessions remained current Rulebook truth.

Across all ten player actions, mean wall time was `242600 ms`, median was `224371.5 ms`, minimum was `146178 ms`, maximum was `386658 ms`, and total turn wall time was `2426000 ms`. Five pressure states remained active at progress zero through world minute `53`. The eighth action produced three independent actor-sourced scene events: Dessek at the station and Thessha and Vassara at the tenements. Only Dessek's locally eligible trace entered Lenna's scene. Actions 9 and 10 produced no further autonomous actor turn.

The player developed a coherent goal without being assigned a quest: recover payment for honest lamp work without helping the Compact take a household's last light. The failed tenement search did not manufacture a debtor. Dessek's blockade then gave the crate a political and moral meaning that changed the next decision. The player now wants to hear the Warden side and determine who ordered the chimneys before choosing delivery, refusal, or bargaining.

Taste verdict: comprehension `4/5`, prose readability `3/5`, agency `4/5`, world aliveness `3/5`, desire to continue `4/5`. The game is playable and the player has a reason to return. The last two conversations are too long and too certain: Dessek delivers a complete political explanation instead of a partial, situated answer with a recognizable personal voice. The Play screen also presents the Game Master consequence card and the Narrator beat back to back with nearly the same information. This is separate from the removed synthetic second beat and needs its own later presentation task. One repeated Thessha suggestion after action 7 remains recorded. None of these findings starts another repair inside this sitting.

Humanizer/deslop review: the checkpoint separates observed mechanics, player interpretation, and taste judgment. It quotes only the two signed inputs needed to prove intent, avoids promotional language, and does not convert one coherent dilemma into a claim that long-play quality is proven. Verdict: retain as evidence and resume with a fresh sitting rather than extending the current one.

## Current replacement Lane A r06 sitting-1 checkpoint

Disposition: `CONTINUE_LANE_AFTER_BREAK`. Clean r06 reused the accepted Lowwater Ledger template and reconstructed Lenna through the normal player API before Opening. No world-generation or character-generation call ran. The operator chose and signed all ten player actions from the rendered Play UI before submission. The sitting stopped at the protocol boundary, not because of a hard failure.

Lenna refused to treat the clinic as an easy debtor, inspected its supply tallies, and asked Vassara what was actually missing. She chose a nearby labor-based lead instead of accepting an assigned quest. Noro Kaiyu Tarama permitted only loose breaker's moss to be gathered from the tidal seep. The tide returned early, Lenna's established knee brace mattered, and the result was one persisted bundle rather than unlimited resource loot. The bundle later left player inventory in a visible handover to Vassara, who could split it into two sulfur compresses and retained the promised debt credit.

Autonomous world behavior was visible and causally useful. A rope line and chalk roster marked an existing blockade at Winch-Shaft Station. Ostane Grafton came up the coastal path behind Lenna. Vassara independently travelled from the clinic to the station because Dessek had asked her to tend the families holding night watches. Her explanation also tied the blockade to the clinic's lung-wort shortage: the crews who normally bring it cannot surface. Lenna did not cause the blockade, the medical shortage, Vassara's summons, or Ostane's movement.

No hard state failure, spatial contradiction, false possession, protected disclosure, remote-scene leak, retry, provider switch, or model switch appeared in this sitting. The moss acquisition and transfer were reflected in Rulebook-backed inventory. The player finished at Winch-Shaft Station with the original knee brace, padded chimney crate, and lamp-glass tools. World version reached `28`, runtime revision `499`, and journal cursor `16`.

Taste verdict: comprehension `5/5`, prose readability `4/5`, agency `5/5`, world aliveness `4/5`, desire to continue `4/5`. The clinic problem developed into a political and medical dilemma without making Lenna the world's center. Kaiyu's presence was initially a mild seam: arrival prose said no one answered while the UI listed her nearby, and only the next exchange explained that she had deliberately ignored the general call. One Dessek choice label repeats his name awkwardly. His last two answers are too comprehensive, and action 10 repeats the previous answer's closing line about each watch taking more than Vassara can restore. The UI also displays the consequence card and Narrator beat with nearly the same content. Multi-minute turn latency remains a serious product risk.

The action-10 full backend restart preserved normalized public-state hash `dedd91dfded254e71a1c554dbf7501eb5d8321aee321acdafb4ddc60f98adcad`, replay hash `905e12ccdbd859205f7260a4301694e245a227371fb3fc17b0a4a7997b5e307f`, and checkpoint hash `ebf27db4dea0a431080da771df77f70864300e16e8557ba4574993e743fea939`. Reloaded UI showed the same location, visible actors, possessions, last narration, and choices. Browser console and network-error captures are empty.

Humanizer/deslop review: the checkpoint uses concrete events and distinguishes mechanical evidence from taste. It does not hide the prose repetition, presentation duplication, or latency, and it does not promote one sitting into long-play acceptance. Sitting 2 begins with unaided recall and intended action before the operator rereads the UI.

## r06-r09 game-loop repair and clean live gate

r06 resumed with an unaided player recall and then completed action 11, an inspection of the Winch-Shaft chalk roster. Action 12 was the signed visible route to Warden Tollhouse. Rulebook committed four minutes and Lenna's canonical move before an actor replanning job interrupted. The public packet therefore remained on the previous Winch-Shaft scene while canonical placement had advanced. The campaign is frozen without Resume. Its model-stage record proves one successful GLM 5.2 transport followed by `model_contract_invalid`; interrupted stages intentionally retain no rejected artifact, so the exact invalid field cannot be recovered.

The verified Actor Replanner gap was narrower than a settlement redesign. Its native schema accepted arbitrary bounded strings for `goalHandle` and every `targetHandles` member, while post-provider compilation required an active goal and references from the frozen frame. Commit `40e7af36` derives exact enums from that frame and applies them to the main intent and every step. A frame without an active goal fails locally before provider invocation. The append-only primary settlement, explicit interruption protocol, and public packet owner remain unchanged.

Clean r08 was prepared from the same zero-character, zero-turn template and completed Opening with one GLM 5.2 attempt. Its first signed action was a visible suggested wait. Judge transport and schema validation succeeded, but semantic compilation stopped exactly at `judge.ts:366`: the proposal did not match the frozen choice's kind and empty target list. r08 was frozen without Resume. Commit `37f1d129` now fixes suggested kind, ordered targets, and movement route in the native request schema. This preserves player authority over the selected button while leaving feasibility, time, uncertainty, and outcome to Judge.

The focused combined gate passes `26/26` Judge and Actor Replanner tests, and backend typecheck passes. Tests cover visible frame handles, foreign actor-replan goals and targets, and the exact r08 suggested-wait shape. No retry, repair, fallback, provider or model switch, backend-authored result, compatibility path, or standalone smoke test was added. Required GitNexus impact and change detection calls still return `Transport closed`; direct caller and changed-file inspection bounds the patch to the two model-contract seams.

Clean r09 reused Lowwater Ledger content hash `fb2c7074e89df263b0bf308f0d47aadcd5f246b6832c8274506c8f1dc26855d9` and reconstructed Lenna through the normal player API. No world or character model call ran. Opening placed her at Debt-Ward Tenements and completed with one Opening Planner attempt in `305630 ms` and one Narrator attempt in `116309 ms`.

The operator signed `Wait and listen for footsteps in the corridor` against projection `9f8846754a36fd280b18a93f6bc94bbc19c1bda2cc6a3a5e5dbe241f1eeadaea` before clicking. Judge accepted one GLM 5.2 attempt in `30681 ms`; Game Master accepted one in `71739 ms` and advanced the world clock by twenty minutes. Four scheduled actor jobs settled. Novice Niruko's exhausted plan entered `plan_retry`, and Actor Replanner accepted a new active plan in one `73851 ms` attempt. Vassara's separate retry remained deferred by the bounded due set. Narrator accepted one attempt in `115827 ms`. The turn completed at world version `14` with no interruption, Resume, duplicate player submission, or second model attempt.

The rendered result gives the wait a concrete payoff: family voices and a child's cough continue behind doors, methodical rounds approach, and a red-sealed delinquency list appears as a new inspectable object. It is readable and supports a next decision without exposing Niruko's remote work. Three advisories remain. The consequence card starts with the awkward fragment `Twenty minutes pressed still`; the Narrator paragraph is rendered twice; and the cast panel already lists Thessha as present while unidentified patrol footsteps approach and the next contact option names Thessha. That spatial handoff is ambiguous even though the prose never explicitly assigns the footsteps to her.

The action-1 backend restart preserved normalized public-state hash `3b9a98cd71f34caaaf3858058f482f97f451dae6a8a949545b59bd214c92c5da`. SQLite integrity returned `ok`, foreign-key check returned no rows, and the inspected backend logs contain no warning or error. The targeted repair verdict is `PASS`; r09 remains the active long-play lane rather than a completed sixty-action claim. Taste scores are comprehension `4/5`, prose readability `4/5`, agency `4/5`, world aliveness `4/5`, and desire to continue `4/5`.

Humanizer/deslop review: the note states what the stored evidence proves, marks the unavailable rejected r06 object explicitly, and separates contract success from presentation and prose defects. It does not promote one repaired turn into long-play acceptance.

## r09 actions 2-9 and ambient-contact repair

r09 completed seven additional signed manual player actions after the clean repaired wait. Reading the delinquency writ exposed a content limit: the prose repeatedly called its household names legible but did not render any name. Thessha then answered the parts supported by actor/world authority, said Vassara was not on the writ, admitted posting it, and disclosed why enforcement troubled her. She could not exchange repairs for a current token quota, but functioning ward lamps could reduce the next quarter's seizure rate. That answer converted Lenna's established craft into an indirect, bounded player goal rather than a granted quest solution.

The corridor inspection exposed intact, cracked, empty, and recently hand-fitted lamps. Lenna opened her padded chimney crate and tested a pane against an empty fitting. Judge and Game Master did not manufacture compatibility: the pane was too tall, its bolt holes did not align, and the existing tools could not recut it. Ten minutes elapsed, one autonomous actor replan completed, and Dessek Holvar Brunne arrived in the scene. The Narrator described the arrival correctly and the cast added Dessek, but the visible consequence card said `Dessek Holvar Brunne left for Debt-Ward Tenements`. This is a reproducible direction-label defect at an arrival boundary, not a canonical placement error.

Dessek denied having fitted the fresh panes, grounded his own recent work at the shaft, and pointed Lenna toward residents maintaining private light. He also offered an optional shaft line without claiming the player had accepted it. During that conversation Vassara independently left for Tide Shrine Sanctuary and disappeared from the local cast. Lenna knocked at a lit door; the unnamed resident dimmed the light and stayed silent. The sequence is a human `PASS` for bounded failure, NPC premise resistance, and visible autonomous movement. The remaining household-name/content gap is `REVISE` rather than authority for the model to invent a roster.

The ninth signed input identified Lenna, denied Compact affiliation, did not demand that the door open, and offered to fit a supplied pane. Judge made one provider/schema-valid GLM 5.2 call in `48001 ms`, then semantic compilation failed at the requirement that every actionable contact target a named visible nonplayer actor. The immediately preceding packet had already represented `Try to call out to whoever holds still inside` as an `attempt` against the current location. Freeform interpretation reasonably chose `contact`, but the existing domain postcondition could not represent the same communication with an established unnamed recipient. The turn stopped before Game Master or mutation. r09 is frozen at eight completed actions; action 9 is not bound and Resume was not used.

The repair keeps the current spatial truth owner. An actionable contact may now target the exact current location when source moment or cited observation establishes an unnamed or collective recipient. It may not use an empty target, a hidden handle, a different visible location, or an invented actor. The Judge instruction states that this authorizes only delivering words into the established scene; it supplies no identity, trust, knowledge, compliance, or reply. The model and Game Master still author feasibility and response. No retry, repair, fallback, backend response, compatibility shape, provider switch, or model switch was introduced.

Focused Judge verification passes `18/18`; backend typecheck passes. GitNexus impact calls for the touched Judge symbols returned `Transport closed`. Manual caller review places the change in `createCampaignPlayJudge().judge` and the player-action interpretation process; storage, Game Master commands, Rulebook mutation, and UI contracts are unchanged. Humanizer/deslop review found the instruction direct, mechanical, and free of prose imitation or repeated grading language. The next proof must use a fresh pristine clone; the frozen r09 campaign remains diagnostic only.
