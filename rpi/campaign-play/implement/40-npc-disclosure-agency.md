# NPC disclosure agency

## Outcome

Keep a contacted NPC's private knowledge available to the Game Master for roleplay without turning that knowledge into an automatic answer to the player.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority`
- Player action 26: `Talk to Renzo Malfatti: ask about the circled patrol entry`
- Turn: `turn-player-action:ee8bb989ec6405d7fb3ee633eb45f8839c7f4509`
- Screenshot: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-26-renzo-volunteers-hidden-mission.png`

Renzo had an independent order to intercept Lucia Cordeglio. A stranger's first question caused him to volunteer her identity, the stolen expedition coordinates, the intended buyer, his patrol orders, and his failure condition. The facts belonged to Renzo, but the turn had no trust, leverage, relationship, pressure, or other in-scene reason for him to disclose them.

## Architecture delta

The `procedural_conversation_outcome` GM profile now distinguishes speaker knowledge from intentional disclosure. Actor profile, traits, goals, orders, and private knowledge remain roleplay context. The GM chooses what the speaker says from the speaker's incentives and current relationship to the player, and may disclose private facts only when the scene supplies a reason.

This is a semantic decision boundary in the model-owned dialogue proposal. It does not add backend-authored dialogue, a deterministic content filter, a retry loop, a fallback response, or a new reviewer stage.

## Prompt review

- `prompt-craft`: patched the smallest owning prompt surface and stated the missing invariant once.
- `humanizer`: kept the instruction concrete and actor-centered; no ornamental role language or generic motivational prose.
- `deslop`: removed repeated framing; preserved the distinction between available knowledge and voluntary disclosure.

## Validation

- Targeted GM tool-loop contract test checks that the procedural conversation prompt carries the disclosure boundary.
- The existing `ai` test mock exposes `streamText` so the current traced AI wrapper can be imported and the suite reaches its assertions; this is test harness parity, not product behavior.
- Typecheck covers the touched backend prompt builder and adjacent test types.
- Live UI action 27 was only partial evidence because the prior leak remained in conversation history: Renzo withheld the buyer's name but repeated already disclosed mission facts.
- Live UI action 28 supplied a clean new boundary. Tomas explicitly refused involvement and asked for current patrol strength and exact deployment. Renzo withheld numbers, positions, and shifts because the stranger had no trust, leverage, authority, relationship, or need-to-know.
- Action 28 turn: `turn-player-action:f3daa7a41f0d6164b75509e83f4b3657decdcf25`
- Action 28 screenshot: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-28-renzo-protects-operational-details-lucia-arrives.png`
- The first narrator call was interrupted by `provider_unavailable`; explicit UI Resume reused the accepted Judge, GM, and actor work, then completed without a fallback response.
- During the same turn Lucia Cordeglio independently arrived at Cinderwatch Beacon Terrace. The next playtest must verify whether Renzo and Lucia notice and act on their co-presence without player mediation.
