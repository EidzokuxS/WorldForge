# Task 23: actor obligation payment

Status: implemented and verified through focused contracts, atomic Rulebook persistence, reload, and one manually played partial payment in the rendered product.

## Contract change

Campaign Play now owns one typed `pay_actor_obligation` transition:

- Judge may bind a payment only to one cited visible obligation and one cited visible player possession. A request, offer, promise, cargo movement, or prose is not payment.
- Game Master must emit exactly one matching typed effect. Code resolves debtor, creditor, obligation, payment possession, the creditor's same-key possession, scopes, order, and exposure; the model authors only the semantic selection and visible summary.
- Rulebook accepts the command only for the human player's action, for a positive amount no greater than both owned quantity and outstanding debt. One receipt atomically debits the player, credits the creditor under the same possession key and name, and reduces outstanding debt while preserving historical principal.
- Full settlement retains the zero-outstanding obligation in mechanical state and `worldHash`; public state, visibility, and Narrator packets omit zero balances.
- `0038_campaign_play_actor_obligation_payments.sql` widens the current command/event constraints, permits zero outstanding, and allows the two possession rows changed by one payment receipt without weakening receipt/event correlation.

This slice does not add shops, wages, interest, deadlines, automatic default, keyword parsing, prose-derived settlement, fallback, or compatibility handling.

## Verification

- Backend typecheck passes.
- Focused contracts, migration, projection, state repository, Rulebook, Judge, Game Master, visibility, and Narrator suites pass: 204 tests across nine files. The final Judge/Game Master contract repair suite passes 59 tests.
- Rulebook tests cover partial and full settlement, exact authority and scope, insufficient possession, excessive payment, and atomic derived creditor possession.
- Repository reload proves a settled zero row remains in the mechanical frame and hash while public obligations is empty.
- An independent read-only Sol review found no blocking correctness or invariant defect. It checked the exact Judge/GM binding, authority, derived identity, atomic storage, zero-row projection boundary, and model-authored visibility path.
- GitNexus returned low-risk impact for the core Rulebook/storage/projection symbols. Bounded impact calls for the parent-owned Judge, Game Master, and visibility symbols and the final `detect_changes` call did not return before termination, so their direct callers, focused paths, and final diff were verified instead.

## Rendered partial-payment playtest

The existing clean-world run `pristine-natural-r30-actor-obligation` was reused; no world generation or campaign copy was needed. Campaign `d76ce637-7536-47ff-9a7c-8b4ff09f8747` began this action at Shrine Steps with Mara Venn holding five `Copper coins` and owing Sestra Olo seven copper.

The manually chosen action was:

> I count two of the five copper coins into Sestra Olo's hand and ask her to mark two copper paid against the existing seven-copper IOU, leaving five owed. I keep the remaining three for the bridge toll.

The first Judge attempt exposed a new-schema wording defect: GLM returned `copperPossessionHandle` instead of the required possession field and an invalid result tier. No world mutation occurred. The Judge contract was repaired to share the explicit `paymentPossessionHandle` name with Game Master and to include one exact example shape. Explicit UI Resume then produced a valid Judge artifact.

The first Game Master attempt selected the correct payment but included `affectedHandles`, matching the established neighboring effect convention that the new schema had unnecessarily forbidden. No world mutation occurred. The payment effect was aligned with that convention while code retained ownership of the exact mechanical affected refs. A second explicit UI Resume accepted the Game Master artifact and completed Narrator normally. These were visible repair/resume cycles, not hidden retry, fallback, provider switch, or backend-authored repair.

Final provider evidence:

- Judge: GLM 5.2 attempt 1 invalid after 255,376 ms; explicit-resume attempt 2 valid after 86,070 ms.
- Game Master: GLM 5.2 attempt 1 invalid after 47,834 ms; explicit-resume attempt 2 valid after 101,520 ms.
- Narrator: GLM 5.2 attempt 1 valid after 111,717 ms.
- Every call used Z.AI Coding Plan `glm-5.2`, native JSON, with no text fallback or provider substitution.

The rendered result shows `Copper coins ×3` and `Owed / Sestra Olo / 5 copper`. The public consequence states that two coins were counted into Sestra's hand, the seven-copper IOU was marked down to five, and three remain for the bridge. The narration reads:

> Two coppers pass into Sestra Olo's hand. She marks a partial payment beside the seven-copper figure in the shrine ledger. 'Five remaining before the evening tide mark,' she says quietly, returning the notebook. 'Cross the bridge. Earn your settlement.' Three coins remain in your hand — the toll, and nothing to spare.

Reload preserved the same rendered quantities and narration. Final API state is world version `23`, runtime revision `313`, projection hash `5e13e260927b819b921355c1b2d70f08d25f29e6b217c07edd5ecdfa8647798b`. SQLite records one applied `pay_actor_obligation` receipt from world version 22 to 23, one correlated `actor_obligation_payment_applied` event, principal `7`, outstanding `5`, player quantity `3`, creditor quantity `2`, and world hash `df62e9321e1cc2f43274485ba81f2139f10cac9bfc70f681dd3b1f9ab6c7cace`. Integrity is `ok` with zero foreign-key violations.

## Semantic and game-quality review

Humanizer/deslop verdict: the new prompt clauses are intentionally strict but direct, use consistent domain names, and contain no promotional filler or backend-authored scene language. The explicit JSON shape removes ambiguity without teaching the model a canned narrative.

The final prose is coherent, concise, and worth continuing. The physical transfer, ledger mark, exact remainder, and bridge-toll constraint agree across consequence, narration, choices, UI state, and persistence. Sestra remains a person with her own ledger duty and imperative rather than a passive vending interface. The updated choices make the payment matter immediately: Mara can ask for work or spend her last three copper at the bridge.

The pre-existing `The moment` duplicate paragraph remains visible in the DOM. It was not caused by payment authority and remains outside this mechanical slice.

ProjectGameGod marker `pgg:knowledge:found-004` supplied the evidence boundary. This field result further confirms that payment exists only when the exact semantic proposal crosses Rulebook authority, one atomic receipt, both possession rows, the obligation row, persistence, reload, and correlated presentation.
