# Turbo r09 Narrator hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r09` materialized the frozen zero-turn Lowwater Ledger template on commit `5118df78`. Eligibility evidence was frozen before character creation. The real UI created Sere Venn, completed Opening and two signed player actions, and admitted a third signed action.

r09 is not a Task 18 pristine promotion lane. Action 3 recovered from one permitted Judge transport interruption on the same durable input, then its first Narrator attempt failed semantic compilation as `narration_invalid`. No second Resume was used, and the lane stopped before action 4.

## Player journey

Sere entered the Drowned Gallery as a hired well diver already caught in local trouble. Oksan Trell was testing the faint bioluminescent channel with her bare hand. Sere first asked why, then asked what had caused the dimming. Oksan described the glow as a tidal safety signal, gave a six-month timeline of decline, and explicitly said she did not know the cause. Sere's third action pressed only Oksan's visible claim that the Wardens were withholding information.

The UI was inspected after Opening and every terminal boundary. Action 1 survived a full backend and browser restart with projection hash `a19e1b401ed9c91823fd86c3d59dca3844b1e909b578079005d09ade3a2ff5f9`. The action-3 interruption page shows the accepted consequence in `WHAT CHANGED`, retains action 2 in `THE MOMENT`, and offers Resume without unlocking new input.

## Evidence

- Completed durable turns: one Opening and two player actions; action 3 remains interrupted.
- Opening Planner and Opening Narrator each accepted attempt 1 in `496,027 ms` and `50,967 ms`.
- Action 3 turn: `turn-player-action:dd5e207102a43ff57dac0fdabe84c66e805cbb80`.
- Judge attempt 1: `provider_unavailable`, `schema_outcome=transport_error`, duration `179,474 ms`.
- The rendered Resume issued one `/resume` POST and zero additional `/play/turns` submissions. Judge attempt 2 accepted in `50,665 ms` on the same turn.
- Game Master attempt 1 accepted in `76,916 ms`; the committed consequence advanced world version `15 -> 16`.
- Narrator attempt 1: `interrupted`, `schema_outcome=invalid`, `error_code=narration_invalid`, duration `80,267 ms`.
- Final state: `setupPhase=ready`, `worldVersion=16`, `runtimeRevision=185`, twenty commands and twenty receipts.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.
- Screenshots cover action 0, action 1 before and after restart, and `screenshots/hard-stop-action-3-narrator.png`.

## Disposition

The first action-3 interruption is valid Task 18 transport evidence. The later Narrator semantic interruption is a pristine hard stop, even though normal Campaign Play recovery could resume it. It is not evidence for hidden retry, fallback narration, database repair, or speculative prompt work. The next Lane A attempt must return to the unchanged zero-turn template under a new run id.

Humanizer review kept the note tied to the player's visible journey and exact ledger stages. Deslop review preserved the distinction between allowed transport recovery and the disqualifying Narrator interruption.
