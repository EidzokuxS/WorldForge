# Directed obligation authority playtest

## Outcome

Campaign Play now treats debt as a directed Rulebook obligation rather than an implicit debt owned by the human player. A completed definite unpaid service may create a nonplayer-to-player receivable; an accepted definite charge may create a player-to-nonplayer payable. Both directions carry explicit debtor and creditor handles through Judge authority, Game Master compilation, Rulebook commands, receipts, events, SQLite state, public projection, and reload.

Player-action payment remains intentionally narrower than incurrence. The player may settle only the player's own payable obligation from one visible player-owned copper possession. A nonplayer cannot pay from inventory that is absent from the authoritative frame. Such a service remains an outstanding receivable until that actor's own scheduled work has a persisted copper possession and a co-located creditor.

Actor plans now carry mandatory `obligationOutcome` beside `possessionOutcome`. Opening steps always declare `none`. A replanned non-move step may incur only the acting actor's own debt or pay only that actor's supplied debt from its own supplied copper possession. Move steps change neither possessions nor obligations, and one step cannot combine independent possession and obligation outcomes.

## Presentation boundary

Public state projects an obligation only when the human is its debtor or creditor. The presentation uses one direction and one counterparty:

- `payable`: `You owe <counterparty>`;
- `receivable`: `<counterparty> owes you`.

The Narrator receives the same direction. It may describe the accepted consequence, but it cannot create, reverse, increase, reduce, pay, or settle the obligation in prose.

## Contract verification

- Backend typecheck passed.
- Shared build passed.
- Frontend typecheck passed.
- Campaign Play affected suite passed `347/347` across sixteen files, including the mounted opening-plus-player-action route.
- Frontend account and API parsing checks passed `13/13`.
- The mounted route completed character bootstrap, opening turn zero, one player action, Rulebook settlement, journal projection, and restart in one integration run.
- Directed Rulebook checks cover actor-owned payment, source possession transfer, outstanding reduction, and remote-creditor rejection.
- Visibility checks cover payable and receivable projection plus reload identity.
- `git diff --check` reported no whitespace error; repository line-ending warnings remain unchanged.

One accidental whole-backend Vitest invocation ran `3,954` tests: `3,904` passed, `30` remained todo, and `20` failed across legacy AI mocks, stale Campaign World fixture expectations, an unrelated migration timestamp expectation, and five-second concurrency tests under the overloaded run. No timeout, compatibility adapter, fallback, or unrelated repair was added in response. The scoped Campaign Play suite then passed in a single-worker run.

## Semantic review

`humanizer` and `deslop` review preserve the literal authority terms because they are schema vocabulary, not player-facing prose. The prompts state debtor direction once at each model boundary and distinguish unpaid service from payment. Game Master now receives a per-turn effect vocabulary and only the resource instructions that match current typed authority; unavailable resource effects are absent rather than explained repeatedly. The UI copy is short and concrete: `Accounts`, `You owe …`, and `… owes you`. No backend-authored narrative result, hidden retry, provider switch, text fallback, compatibility reader, or keyword-based debt inference was introduced.

## Live UI campaign

- Clean-start source: `e5e41b51-d60f-44e2-90c6-202dae12a74f`.
- Clone: `233e8050-f7fd-4cd6-b23a-d8227d97e625`.
- Campaign root: `output/playtests/campaign-world-runs/task18-lane-b-black-rain/campaigns`.
- Character: Nessa Vale, a travelling leatherworker looking for ordinary paid work.
- Starting conditions: Cinderwatch, outsider, already present, looking for work.

Opening Planner accepted one GLM 5.2 attempt in `805,909 ms`; Narrator accepted one in `88,865 ms`. Nessa started on Cinderwatch Beacon Terrace with Nessa, Aldo Zecchini, and Renzo Malfatti visible. Aldo declined a deferred six-copper repair because he could not authorize personal debt and his gear still held. That refusal was coherent, preserved his authority, and did not create an obligation.

Nessa travelled two units into Cinderwatch Undercity. Aldo and Renzo remained on the terrace; only Lucia Cordeglio was present below. Lucia first asked what work Nessa meant, then accepted a concrete pack-strap restitch for six copper while refusing deferred terms. Nessa completed the repair with her visible leatherworking tool roll. Rulebook created receivable `obligation:8e11213424c3df2ed6bc57d701163d51d2303be59b8dd4ec` with Lucia as debtor, Nessa as creditor, and outstanding amount `6`. The rendered Accounts panel showed `Lucia Cordeglio owes you / 6 copper`.

The service prose then created a consistency trap: Lucia said, `Six copper's yours — give me a moment to count it out`, although authoritative state contained no Lucia-owned copper. Nessa selected the offered `collect the six copper payment` action. Judge accepted one attempt in `89,967 ms`, but incorrectly supplied player acquisition authority based on the promise rather than sourced inventory.

Four explicit Game Master attempts were retained as diagnostic evidence:

1. attempt 1, `52,752 ms`: proposed both an invented six-copper acquisition and prose claiming payment;
2. attempt 2, `142,252 ms`: repeated the invented transfer after the Judge authority was normalized to contact-only;
3. attempt 3, `103,312 ms`: the per-turn schema excluded every resource effect, but the event prose still claimed Lucia passed six coins;
4. attempt 4, `77,974 ms`: the prompt and schema listed only effects permitted for this turn, but event prose still placed six coins on the crate and slid them toward Nessa.

Every attempt was authored by GLM 5.2. Each used one native structured call and, when reached, one independent mechanical-authority review. No automatic retry, repair, text fallback, provider switch, model switch, deadline, or backend-authored replacement ran. The compiler or reviewer rejected each attempt before Rulebook execution. No fifth Resume was used because the same contaminated source moment had reproduced the same convergence mechanism with no new hypothesis.

After full page reload, the campaign remains at world version `19`, runtime revision `370`, and projection hash `bb193e793a20f8d9fcc0d7b40281608e0b80e33bdabda69cba7c69fa711818ba`. The turn is `interrupted/model_contract_invalid`, final world version is null, and mutation audit is `{}`. The obligation remains exactly six copper. Nessa still carries only her tool roll and cloak; neither Lucia nor Nessa has a copper possession. SQLite integrity is `ok`, foreign-key violations are zero, and the rendered Resume state preserves the same location, actor, receivable, narration, and choices.

Manual verdict: `PASS` for atomic authority and reload safety; `REVISE` for game quality. The engine no longer invents payment, but a model-authored promise unsupported by actor capacity can trap the following action in semantic convergence. This diagnostic does not prove live actor payment. A later clean campaign must demonstrate payment only after the debtor independently owns copper and acts while co-located with the creditor.

## Limits

The focused contract evidence proves direction, authority, atomic settlement, presentation shape, and reload behavior. The live campaign proves that an unsupported payment claim cannot mutate possession or debt state across repeated explicit attempts and reload. It does not prove that an actor will later source and pay copper, that ordinary suggestions avoid capacity-inconsistent promises, or that the service thread is enjoyable over a longer sitting.
