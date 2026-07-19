# Observation actor attribution

## Outcome

Narration cannot identify a visible person as the source of an actorless observation. A named actor in a current observation now requires the code-owned performing-actor or observation-subject binding for that same observation.

## Field evidence

The diagnostic campaign `b4163989-7ed6-48cf-9dbc-f4e1d45c3a66` reached 24 completed player actions through the normal `/campaign/:id/play` UI with GLM 5.2.

At action 24, Mara waited five minutes at the Cinderwatch Undercity corridor bend. The accepted player observation was actorless and reported receding heavy footsteps plus a lighter cadence. No `move_actor` command existed, and SQLite still placed Renzo Malfatti and Lucia Cordeglio in Cinderwatch Undercity. Narrator nevertheless changed the anonymous evidence into `Renzo's heavy boot-falls recede westward`, while the same rendered page kept both actors under `Present here` and offered contact actions for both. Turn `turn-player-action:e9975f99f07d5a23e8b70d098886e5e512581f9c`, world version 41, runtime revision 952.

This is a presentation-authority defect, not proof that either actor moved. The Game Master event established only unidentified sound. Actor placement remained Rulebook truth.

## Contract

- Each beat assigns every current observation index exactly once as before.
- For a beat that carries current observations, Narrator may name a visible actor only when one of those observations names the actor as performer or `observationSubjects` binds the actor to it.
- The deterministic compiler recognizes an actor's full canonical name and any unique name component of at least three characters, unless that alias also occurs in the visible current or route-destination place name. This covers natural references such as `Renzo`, `Malfatti`, and `Cordeglio` without mistaking a location such as `Bell Island Tower` for actor `Sel Bell`, interpreting movement verbs, or rewriting prose.
- Anonymous sounds, traces, silhouettes, and motion remain anonymous. A real location change still requires `move_actor`, Rulebook preflight, a receipt, placement persistence, and the resulting public projection.
- Invalid prose interrupts the narrator stage. It does not retry, fall back, change provider, rewrite text in code, or replay settled mechanics.

## Validation

- The focused regression rejects an actorless observation rendered as `Mara's heavy footsteps`, accepts the same sound without attribution, accepts the named form when a typed subject binding exists, and preserves a place-name collision such as `Mara Quay` as location text.
- The stored action-24 packet plus its published text recompiles to `narration_invalid` under the new compiler.
- Narrator, visibility, and turn-runtime checks passed: 61 tests. Backend typecheck and `git diff --check` passed.

Action 25 repeated a five-minute wait through the real UI after a controlled backend restart. The first GLM 5.2 narrator proposal attempted an unauthorized name and was rejected as `narration_invalid`. Explicit `Resume` created worker epoch 10 and reran only Narrator. Judge, Game Master, one `advance_world_time`, two `record_world_event` commands, their receipts, and Lucia's settled actor job were not duplicated; world version stayed 42.

The accepted narration kept the western silence and footsteps unattributed, then named Lucia only for her separate typed direct-perception event at the advocates' document. Reload preserved the complete turn, world version 42, runtime revision 1026, both actor placements, projection, and available actions. The rendered prose remained readable scene prose rather than an audit explanation.

## Semantic review

`humanizer` and `deslop` review kept the Narrator instruction concrete and short: a current observation may name an actor only through its typed performer or subject binding; resemblance is not identity. The review added no case-specific names, backend-authored prose, fallback, retry, or provider switch.

## Limitation

The deterministic check protects explicit canonical full names and unambiguous name components. Pronouns, roles, clothing, gait, and other metonyms remain a model-semantic boundary. The live recovery proves this field journey and model configuration, not general long-horizon reliability or player comprehension.
