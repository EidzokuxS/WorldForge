# Turbo ten-action Campaign Play checkpoint

## Run

- Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r03`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Runtime code: `bb65abe9`
- Reused accepted world: `lowwater-ledger-pristine-93a09e46-20260719`
- Model: `glm-5-turbo` for generator, Judge, Game Master, Actor Replanner, and Narrator
- Checkpoint: opening plus ten manually read and signed player actions

The run remained on one isolated materialization of the accepted world. No code changed while these ten actions executed. All ten player turns completed on their first model-stage attempts without interruption, Resume, model substitution, or accepted retry. Reload checks after actions 1 and 10 reproduced the exact public-state hashes.

## Player journey

Therrin Vask entered as a world-selected bridge worker at the alderman hallway. He inspected the public delinquency board, asked Dren Vask what its red marks meant, then deliberately left that opening hook for the Dim Ward Market. At the market he asked Pira Senn about local trade, followed her gaze without approaching or speaking, inspected the dark upper shutters, waited ten minutes, accepted her refusal to explain herself, and moved by freeform input to the Winch Shaft Entrance. The tenth action inspected the locked winch without touching its controls.

This path exercised suggested observation, contact, wait, and movement; freeform bounded observation; freeform route movement; an explicit NPC refusal; a ten-minute background-actor boundary; a local aftermath discovered only after travel; and two reload checkpoints.

## Product observations

- The first freeform agency probe stayed inside the signed action. Therrin only followed Pira's gaze; he did not approach, speak, move her, or learn which shutter mattered. The result preserved uncertainty.
- Pira behaved like a person with an independent concern. She rejected the trade framing, continued scanning the upper fronts, and later refused to explain herself while visibly considering an exit.
- Leaving the market did not pull the opening delinquency hook after the player. Arrival at the Winch Shaft instead exposed an earlier actor-sourced cooking-pot aftermath at its own time and place.
- Dren's explanation, Pira's guarded replies, the shutter observations, and the winch inspection were readable, spatially coherent, and perception-bounded.
- The opening projected Dren's initial pike movement twice as separate change cards. This is a presentation-correlation defect, not two mechanical actions.
- The generated player and the opening guard both use the surname Vask without a presented relationship. The coincidence makes the opening feel authored toward the player even though no relation is established.
- Narration described Pira's scan as having `deliberate purpose`; that is a slightly stronger inference than the visible evidence established, but it did not mutate state or appropriate an action.
- `Examine look for access to upper levels` is malformed suggested-action copy.
- One mechanical observation used `A iron pin`; the Narrator corrected the rendered sentence, but the stored player-visible consequence retains the grammar defect.
- A ten-minute wait advanced durable actor work but showed no local actor consequence. One quiet interval is plausible; repeated static waits would weaken the living-world claim and remain under observation.

## Measured evidence

- Completed turns: one opening and ten player actions; zero interrupted turns.
- Model stages: 35 accepted, zero non-accepted, zero attempts above one.
- Opening Planner: `242,533 ms`.
- Judge: median `17,711 ms`, range `7,258–180,784 ms`.
- Game Master: median `22,176 ms`, range `7,263–39,600 ms`.
- Actor Replanner: median `75,965 ms`, range `58,505–99,000 ms`.
- Narrator: median `29,791 ms`, range `16,383–102,709 ms`.
- Reload after action 1: `d266f4ce3061064e6afcfaccd8bf207e31b024df58762b687a9d66e0321a78d6`, exact match.
- Reload after action 10: `353a7b7f8dbfdf3eb601e7823b145890aaf76d3aa89a055d4256142f58a87982`, exact match.
- SQLite integrity: `ok`; foreign-key violations: zero.

Turbo materially improves the ordinary-stage median, especially Judge and Game Master, but it does not remove the latency tail. The opening took about four minutes, one Judge call took about three minutes, one Narrator call took about one hundred seconds, and Actor Replanner calls remained roughly one to one-and-a-half minutes. This checkpoint supports faster iteration, not a claim that turn latency is yet player-ready.

The run remains active. This checkpoint does not promote the sixty-action lane or establish long-horizon narrative quality.
