# Turbo r06 ten-action hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r06` began from the frozen zero-turn Lowwater Ledger template on commit `d58981f8`. Eligibility was frozen before character creation, and the rendered Campaign Play UI produced one completed Opening and exactly ten signed player actions.

The run is not a Task 18 pristine promotion lane. The first Game Master attempt for action 4 ended with `model_contract_invalid`. The normal Resume control completed the same durable action without resubmitting player input, but a model-contract interruption is outside the lane's permitted transport or worker-authority interruption boundary. r06 stops at the action-10 checkpoint, and the next formal attempt must start again from the zero-turn template.

## Player journey

Vessa Keld entered at `alderman-hallway` as a local already present and looking for work. She challenged Vedris Kast's questions, inspected the household levy board, learned the meaning of its red marks, and moved to `dim-ward-market`. There she asked Kellin Marsh how dark households and tokens were connected. When he named grind-work as a token-earning trade, Vessa used freeform input to offer lens-grinding and repair work with the kit already visible in her inventory. No customer accepted. She then followed Pira Senn's attention to the darkened upper doorways, learned that three households had gone dark since the previous market day, and asked about Pira's pocket gesture and claimed work list.

At action 10, Vessa's self-chosen goal was to learn why tokens were being pulled faster and whether Pira's work list connected her to the board's collection work, while still looking for a practical way to earn tokens. The expected next consequence was that pressing Pira or checking her claim with Kellin would reveal whether she worked for the board. Visible evidence supported both the goal and expectation: Pira counted three newly dark households, forecast that half the upper row would go dark, touched her pocket, and defensively claimed she was checking a work list.

The player wanted another turn because Pira's response created a specific local question with two visible ways to pursue it.

## Frozen provenance and UI evidence

- Template: `lowwater-ledger-pristine-93a09e46-20260719`.
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`.
- Accepted world version: `1`.
- Accepted content hash: `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717`.
- All role selections remained Z.AI Coding Plan `glm-5-turbo`; there was no provider or model switch.
- Every player action was signed before submission. The ledger contains nine suggested choices and one freeform action, with ten distinct durable player-turn ids.
- The rendered UI was inspected after every completed action. Screenshots were captured at actions 0, 1, and 10.
- The action-1 reload hash matched at `5ef5ac8740fb8d5f83b4fd4e95489025b3ac59e99fd46d4268fd1e74a58c18a6`.
- The action-10 reload hash matched at `4f205e355a1d1d388e581aba4ade6d5adf4fd2a8842409a75c5a588bfc6bf9dc`.
- After the action-10 restart, the UI remained at `dim-ward-market` with the same consequence, narration, cast, inventory, routes, and suggestions.

## Recovery evidence

- Opening planner attempt 1 ended with `provider_unavailable` after `296,972 ms`; attempt 2 completed the same opening turn in `274,184 ms`.
- Action 4 Game Master attempt 1 ended with `model_contract_invalid` after `18,495 ms`; attempt 2 completed the same player turn in `16,655 ms`.
- Action 7 Narrator attempt 1 ended with `provider_unavailable` after `134,574 ms`; attempt 2 completed the same player turn in `152,878 ms`.
- Each recovery used the rendered `Resume` control and only `POST /api/campaigns/:id/play/turns/:turnId/resume`. No action was resubmitted through `/play/turns`, and no checkpoint was rewound or edited.
- The final ledger contains `34` accepted model stages, two interrupted transport stages, and one interrupted model-contract stage.

## Ten-action truth audit

- Campaign Play is `ready` at `worldVersion=24`, `runtimeRevision=420`, world time Day 1 `00:10`, replay hash `b5dc475db71ee7472f66e4830beb4cab221d1201a9460ff7a239b09007b7d5aa`, and public projection hash `086996eb6c8014c90df103070c342ae2bec9d8505bedb8532225813684151fd5`.
- The ledger has one completed Opening and ten completed player actions, with no unfinished turn.
- Runtime event sequences and revisions are contiguous from `1` through `420`.
- The Rulebook ledger contains `42` commands and `42` receipts. All `23` receipt-marked world mutations have causal event ids and event rows.
- Every one of the eight agent-controlled people has active goals, one present placement, one active plan, and one schedule.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows; donor-call count is zero.
- Accepted Campaign World authority remains version `1` with the original accepted content hash.

## Disposition

The explicit recovery path preserved input identity and durable state through all three interrupted model calls. The two `provider_unavailable` interruptions are correctly classified transport evidence. The action-4 `model_contract_invalid` is a pristine-lane hard stop rather than a reason to add fallback behavior, retry policy, or speculative prompt rules.

r06 remains a failed acceptance avenue and ten-action diagnostic checkpoint. The next attempt must materialize the same frozen template under a new run id, freeze evidence before character creation, and run on one committed GLM-5-Turbo configuration.

Humanizer review kept the report in concrete player and evidence language. Deslop review removed no uncertainty or boundary; the note distinguishes rendered observations, SQLite authority, recoverable transport failures, and the disqualifying model-contract interruption.
