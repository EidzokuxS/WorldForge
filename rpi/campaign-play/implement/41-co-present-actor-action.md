# Co-present actor action

## Outcome

Show a settled autonomous actor action as that actor's visible action when the player directly perceives it, and compose it after earlier same-turn observations instead of preserving a stale claim that nothing changed.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority`
- Player action 30: wait silently from world minute 81 through minute 91 without alerting or assisting either actor.
- Turn: `turn-player-action:15af73290df2ef2608f9e595cba70ebe91855ae9`
- Screenshot: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-30-actor-step-contradicts-current-moment.png`

Renzo Malfatti woke with agency debt at minute 91, recognized that a co-present hooded figure matched the courier description, accepted a six-step version-two plan, and settled its first step. The direct-perception observation exposed only pivoted wet boot prints and omitted the performing actor. Narrator therefore repeated the earlier Game Master wait summary that Renzo did not turn and nothing changed, then described the contradictory prints in the same moment.

Lucia Cordeglio was due at minute 91 but deferred under `actor_capacity`, receiving agency debt 1 and a next due time of minute 106. Her non-reaction is therefore scheduler state, not evidence that her model ignored Renzo.

Action 31 preserved the fresh Renzo event but exposed two further defects. Game Master froze Renzo at the railing in the earlier player-action summary, and Narrator merged Tomas with the hooded target as `you—the hooded figure`. Screenshot `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-31-player-identity-merge-second-beat.png`; SHA-256 `D46CA49655D8B22A9DC4F4EA7CE879F8CE5AD467201CFE3595E658B453564FB1`.

Action 32 proved that the Game Master wait boundary worked: the primary summary described only Tomas's wait and accepted sensory state, with no assertion about an autonomous actor remaining inactive. A Narrator-only second-person prohibition still merged Tomas with the hooded figure. This rejected another prompt-only repair and established the need for a typed presentation binding.

Action 33 accepted the repaired boundary. Renzo's authoritative interaction named Renzo as performer and Lucia as an affected co-present actor. Visibility bound Lucia to that observation from accepted affected references and the event-time placement snapshot. Narrator rendered Renzo crossing to `where Lucia Cordeglio stands`, kept the two nearly face to face, and left Tomas separately watching beneath the beacon. Turn `turn-player-action:1a8d4bc49c823d74638b92eddd8bf64761e509ff`; screenshot `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-33-renzo-lucia-typed-identity.png`; SHA-256 `1EDBCC37B078B9CAB1F67E205BCCAF062D8C89B03628B098812B5D5A940B4733`.

The same turn also exposed an actor-review transport defect. Three explicit Resume attempts through native JSON produced one semantic rejection and two unparseable reviewer results. The next explicit Resume kept the proposer on native object generation and invoked the binary grounding reviewer as one schema-bound GLM 5.2 tool call. Its accepted trace reported `strategy=tool_mode`, `primaryStrategy=tool_mode`, `requestedMode=tool`, `fallbackReason=null`, and `finishReason=tool-calls`; the actor job then settled.

## Architecture delta

- Visibility derives an autonomous event's acting actor from its authoritative actor source when the player receives it through `direct_perception`. The Rulebook's `performingActorId` contract remains reserved for dialogue and interaction; later local aftermath remains anonymous.
- Each Narrator packet receives `observationSubjects`, keyed by observation handle. A binding contains non-performing people from authoritative affected references whose event-time snapshot places them at the exposure scene, excluding the human and attributed performer. It is presentation identity, not mechanical authority.
- Game Master scopes a generic wait, watch, or untargeted passage result to the player action and accepted sensory state. It does not freeze autonomous actors before their later scheduler phase.
- Narrator treats a later current-turn attributed actor action as superseding an earlier negative observation from the player's wait, reserves second person for the player, and uses the typed subject binding for other unnamed figures.
- Actor Replanner keeps its proposer on strict native object generation and requests its binary grounding reviewer through strict `tool_mode`. Accepted telemetry must still prove the requested GLM 5.2, the primary strategy, and absence of repair, retry, text fallback, provider switch, or model switch.

The Rulebook still owns settlement and visibility. The model still writes the scene. This change adds no backend-authored narration, fallback prose, hidden retry, provider switch, new reviewer stage, or global structured-output transport change.

## Prompt review

- `prompt-craft`: separated the primary wait result from the later actor phase, added temporal supersession, and made typed observation identity the source for unnamed affected people.
- `humanizer`: kept the instructions concrete: do not freeze autonomous actors, later visible action replaces stale inactivity, and second person names only the player.
- `deslop`: removed case-specific names from reusable prompts and retained the authority and identity boundaries.

## Validation

- Actor proposal contract verifies the authoritative actor source while retaining the Rulebook's null performing actor for scene events.
- Visibility tests verify direct-perception attribution and the bound co-present non-performing subject. Narrator tests verify temporal supersession, second-person separation, and the typed binding instruction. Game Master tests verify the wait boundary. Actor Replanner tests verify strict tool review.
- Focused validation: seven files and 116 tests passed. `@worldforge/shared` build and backend typecheck passed.
- Root typecheck remains unavailable because the untouched Forge page already violates `react-hooks/set-state-in-effect` at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105` and reports a separate `followBuild` dependency warning.
- Product-use pass: action 33 through the normal `/campaign/:id/play` UI on the stable local backend rendered the accepted Renzo/Lucia interaction, preserved Tomas as a separate observer, settled the actor job, and bound the turn successfully. This is one formative campaign observation, not a general model-reliability claim.
