# Task 22: actor obligation authority

Status: implemented and verified through focused contracts, Rulebook persistence, reload, and four manually played GLM 5.2 actions in the rendered product.

## Contract change

Campaign Play now owns a separate typed actor-obligation state:

- Judge declares either `none` or one required `incur_actor_obligation` result with a visible nonplayer creditor, exact copper amount, and minimum result tier.
- Game Master must emit exactly one matching typed effect when the resolved tier reaches that boundary. A price, warning, request, possible charge, `record_world_event`, or prose is not debt.
- Code derives the obligation identity from campaign, debtor, creditor, and unit; fixes scopes and order; and commits one receipt, `actor_obligation_incurred` event, persisted balance, mechanical hash transition, and public handle.
- Repeated incurrence for the same tuple accumulates principal and outstanding amount. Possession receipt and debt receipt remain separate correlated mechanical transitions.
- The public state and Narrator packet expose only creditor, unit, and current outstanding amount. The Scene card renders `Owed` separately from `Carrying`.
- Visibility presents the stored model-authored obligation summary. It does not replace it with backend-written scene prose or the generic nearby-change copy.

Payment, settlement, deadlines, interest processing, creditor inventory, and a general economy remain outside this slice. The current positive-balance row cannot represent settlement to zero; that requires a later typed contract and migration rather than an implicit update.

## Verification

- Shared, Judge, Game Master, Rulebook, database, projection, repository, visibility, Narrator, runtime, API, and frontend fixtures were updated to require the new closed union and public collection.
- Rulebook tests prove deterministic identity, exact player-action authority, same-creditor accumulation from 8 to 16, receipts, events, and rejection boundaries.
- Repository tests prove an 8-copper obligation changes the mechanical hash, persists in SQLite, reloads into the Rulebook frame, and appears in the public projection with only opaque handles and creditor display data.
- Visibility integration now commits a real typed obligation and proves its stored summary is the public consequence rather than `You witnessed a change nearby.`
- Backend and frontend typechecks pass. Focused verification passes: 129 database/projection/Rulebook/Judge/GM tests, 24 visibility/Narrator/API tests, 50 shared-contract/repository tests, 40 frontend/API/component tests, 87 core mechanics tests, 72 Judge/GM/Narrator tests, and the final six-test visibility suite.
- GitNexus impact and change detection were attempted with bounded calls, but the existing index did not return before termination. Earlier re-analysis failed on invalid UTF-8. No risk result was available, so touched callers and focused product paths were verified directly instead of treating the unavailable index as a gate.

## Clean rendered campaign

The immutable zero-character, zero-turn template `bellglass-tides-pristine-46bd6f32` was materialized as run `pristine-natural-r30-actor-obligation`; no world generation ran. A saved post-Opening checkpoint was considered first, but the hard-cutover mechanical hash correctly rejected its pre-obligation runtime. No compatibility adapter or stored-hash rewrite was added.

Mara Venn was created through the rendered Character UI. Opening placed her at `marrowfen-toll-bridge`, where Collector Kael Mirrus quoted an exact three-copper toll and explicitly refused credit. The first player action asked about the toll; the second used the open route to `shrine-steps` instead of inventing a debt against Kael's refusal.

At Shrine Steps, Mara asked Sestra Olo for three copper against a signed promise to repay four before sunset. Judge took the persuasion seriously: `uncertain`, result `limited`, no established trust, and separate required effects for acquiring three coins and incurring four copper. Game Master committed both typed effects. The rendered page showed `Copper coins ×3` and `Owed / Sestra Olo / 4 copper`; reload preserved projection hash `611394921116e9b6f2d298249724ddbefd95148ac0a5ab3d8bc17fb3469c775a`.

The live result exposed one presentation defect: the first obligation consequence used the generic nearby-change copy. After the visibility repair, Mara asked for two additional food coins and offered to add three copper to the same IOU. Judge, Game Master, and Narrator again accepted one GLM 5.2 attempt each. The Rulebook accumulated the same obligation from four to seven and the same coin possession from three to five. The rendered consequence now reads: `IOU amended from four to seven copper owed to Sestra Olo before sunset. She struck the old figure and wrote the new total in the ledger margin beside her mark.` The UI shows `Owed / Sestra Olo / 7 copper` and `Copper coins ×5`.

Final reload/API readback is world version `22`, runtime revision `236`, projection hash `506700ec766a2ea487565d4c8d092c9e65816a2433b8c6083e1eedf89e4cf451`, mechanical world hash `e55b5eb557bfba9cc936f85520f371d82df105cf8e77f49790f18a35a2dd4cf8`, integrity `ok`, and zero foreign-key violations. The latest obligation receipt advances world version 21 to 22 and correlates command, receipt, event, persisted balance, and public presentation under the same deterministic obligation identity.

All four player turns completed without retry, resume, fallback, provider switch, or interruption. Every Judge, Game Master, and Narrator stage used `glm-5.2`, attempt 1. The two debt turns were allowed to think for 259/128/127 seconds and 175/98/168 seconds across Judge/GM/Narrator respectively; leases renewed normally and no artificial model deadline fired.

## Semantic and game-quality review

Humanizer/deslop verdict: the new prompt clauses are dense because they define a strict mechanical boundary, but use direct domain language, contain no promotional filler, and do not author scene prose for the model. `Owed` is shorter and clearer than an accounting label and remains visually distinct from possession.

The manual sequence is coherent and worth continuing. Kael retains toll authority and refuses credit; Mara takes a legal alternate route; Sestra decides independently to lend, records her own terms, and tightens the second agreement with a delinquency consequence. The debt gives Mara a concrete before-sunset reason to seek work without turning her into the world's central figure. The scene prose preserves exact amounts and physical actions, while current state remains visible and reload-safe.

One pre-existing UI defect remains: `The moment` renders its narration paragraph twice in the DOM. It is visible in every action but was not caused by obligation authority and was not folded into this mechanical slice.

ProjectGameGod marker `pgg:knowledge:found-004` supplied the evidence boundary. The r30 field result confirms its refinement: an agreement becomes possession and debt only when typed proposals cross Rulebook authority, receipts, persistence, reload, and correlated presentation. Prices, refusals, object handling, and narrative mentions remain non-authoritative.
