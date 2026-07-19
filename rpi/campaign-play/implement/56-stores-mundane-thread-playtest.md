# Stores mundane-thread playtest

## Outcome

Five manual actions in the exact `Beacon House Stores` scene produced a coherent mundane thread without inventory invention, convenient NPC spawning, or convergence on the earlier borrowed-shadow investigation. The player did not obtain a job, but the world supplied an honest dead end and later created a grounded chance to ask an independently moving actor.

## Journey

Diagnostic campaign `b4163989-7ed6-48cf-9dbc-f4e1d45c3a66`, actions 33–37:

1. Mara examined the mending trays and uniform stacks. The result described only visible stock; no possession transition, permission, or work assignment was invented.
2. Mara waited ten minutes for the stores keeper. No keeper or visitor arrived, the stock remained untouched, and the world settled two unrelated actor actions outside her view.
3. Mara checked for a bell. The observation found bare hooks and no signaling device rather than materializing a convenient prop.
4. Mara called down the corridor. No one answered, so she followed the known return route into the undercity. During the same settlement, Lucia Cordeglio independently moved into that exact scene through Rulebook.
5. Mara asked Lucia who runs the counter. Lucia preserved her established role and refusal: she is a courier, not shelter staff, and does not know who runs it.

## Mechanical evidence

| Action | Turn | World version | Primary commands | Actor settlement |
| --- | --- | --- | --- | --- |
| Examine stock | `turn-player-action:95b6154d9372b2d923af292da3eed4886db92305` | 56 → 57 | time, discovery | one actor event |
| Wait for keeper | `turn-player-action:1b3c47f3b4c5daabcdcea30a5845171f7032dd0b` | 57 → 58 | ten-minute time, scene | two actor events; four capacity deferrals; one invalid replan deferral |
| Check for bell | `turn-player-action:b8e0ec83a29af3b87bab86620be686a7c5b81957` | 58 → 59 | time, discovery | none |
| Call from corridor | `turn-player-action:29669b32d99b652d1dc776a5b9a16d2e5e0f7d8d` | 59 → 62 | time, call event, player return move, arrival event | Lucia move |
| Ask Lucia | `turn-player-action:16efe03774e765ce1596dd1ac097e6f3aff034d5` | 62 → 63 | time, dialogue | none |

Every primary and actor mutation has a command and receipt. Reload restored Mara in `Cinderwatch Undercity`, Lucia under `Present here`, the return route to `Beacon House Stores`, and Lucia's accepted reply.

Screenshot: `output/playtests/campaign-play/diagnostic-compound-local-scene-r31/action-37-lucia-grounded-refusal.png`, SHA-256 `0C4C68E2E4EAB305E360332628F983DB9FAC74EAB7FF2951F22DE47FB4F7B61D`.

## Playtest reading

The observation prose is concrete and readable. It notices thread colors, needle gauges, collar emblems, folded sizes, and shelf wear without converting stocked goods into player custody. Waiting remains uneventful because no accepted actor state places a keeper nearby. The missing bell is handled as an ordinary negative observation rather than a generated puzzle object.

The strongest moment is the corridor recovery. Lucia does not appear because the player needs help: her own actor job moves her into the scene while Mara returns there. The resulting contact respects both the current placement and her earlier statement that she is only a courier. Her final line keeps her own business alive without making it Mara's assignment.

The thread is deliberately not rewarding. It offers a plausible workplace that is currently unattended, then lets the player leave, trespass, wait, or ask a passing person. That supports a world-centered game better than spawning a quest giver, though repeated negative observations would become dull if the player refused every exit.

## Performance observation

Real completion times were approximately 261, 465, 117, 279, and 107 seconds. The ten-minute wait admitted seven due actor jobs, settled two, deferred four for capacity, and deferred one invalid replan. This proves background motion, but the resulting wall-clock latency is severe. It is recorded as product evidence, not repaired here: provider timeouts, hidden retries, fallback prose, and model switching remain forbidden, and no latency change is required to preserve the validated gameplay semantics in this packet.

## Semantic review

`humanizer` and `deslop` review kept this note factual and separated observed behavior from judgment. No prompt, visible copy, backend-authored prose, fallback, or compatibility path changed.
