# Actor-capacity fairness clean playtest

## Outcome

Agency debt now decides which due actors receive bounded scheduler opportunities before player-turn participation, due time, plan priority, and actor ID break ties. The scheduler still wakes at most three actors, executes them serially, persists the complete due-set decision ledger, and never sweeps the cast. A repeatedly deferred actor can now outrank fresh actors and receive a finite opportunity instead of moving its due time forward forever.

The same clean support-actor campaign reproduced the old starvation path and then proved the correction. Dario Calvo was deferred on consecutive due turns while his debt rose from one to four. After the ordering change, the first turn correctly gave a higher-debt actor the single replan slot. On the next due turn Dario ranked first, replanned, settled an actor-owned dialogue event, and independently approached the player with the still-damaged satchel gusset.

## Root cause and contract

The old query ordered due actors by `currentTurnPerformer`, then `nextActAtWorldTimeMinutes`, and only then `agencyDebt`. Deferral advanced an actor to `settled clock + cadence`, so three short-cadence actors with older due times could permanently remain ahead. Repeated player contact could create the same starvation because current-turn performers also outranked every debt-bearing actor.

The corrected deterministic order is:

1. `agencyDebt DESC`;
2. `currentTurnPerformer DESC`;
3. `nextActAtWorldTimeMinutes ASC`;
4. `priority DESC`;
5. `actorId ASC`.

Debt is mechanical fairness state, not narrative importance. A directly involved actor still wins among actors with equal debt, but the player cannot use repeated contact to consume every world-action slot indefinitely. No schema, migration, compatibility path, model prompt, fallback, or new state layer was added.

## Real campaign reproduction

- Campaign: `cde67b5c-e6da-49b0-86d1-ffc7ec64786d`.
- Runtime support actor: `support-actor:6ee532470ffcc978e198cffa3ab1f29f`, Dario Calvo.
- Model: GLM 5.2 through the configured Z.AI Coding Plan provider.

| World time | Turn | Dario result | Debt after turn | Reading |
| --- | --- | --- | --- | --- |
| 00:38 | `turn-player-action:01be52efe976d0a3061e64c6251977c238c152a7` | `actor_capacity` defer | 1 | The player watched Dario, but his scheduler job did not run. |
| 00:58 | `turn-player-action:18b8bbf89d1c45dd81fb48f603a7ecdb9ebba98c` | `replan_capacity` defer | 2 | Dario entered the due set; another actor consumed the replan slot. |
| 01:18 | `turn-player-action:1452b417db4360781c151c84c3413547c8995408` | `actor_capacity` defer | 3 | Earlier due times again filled all three opportunities under the old order. |
| 01:38 | `turn-player-action:44180236ad5bd0e41d42a49b4f38e2ab0b080bb5` | `replan_capacity` defer | 4 | Under debt-first order, Aldo's debt 4 correctly preceded Dario's debt 3 and used the replan slot. The result was delayed, not starved. |
| 01:58 | `turn-player-action:8811717e0f3060d0a2df3cd70b9e5f73e0557f8f` | settled | reset | Dario ranked first, replanned, and committed his own co-located action. |

The final Dario proposal stored `performingActorId = support-actor:6ee532470ffcc978e198cffa3ab1f29f`. Its event had Dario approach the resting cobbler, set the rain-stained satchel on the basalt with the bottom gusset upward, and expose the softened seam under the corridor light. Nico Bardini and Poldo Gavotti also settled, but their remote work did not leak into the rendered scene.

## Play and prose reading

The player spent the fairness probe resting and watching the public corridor without addressing anyone. At 01:58 the rendered narration changed the rhythm instead of fabricating another player initiative:

> Then Dario Calvo sets his rain-stained satchel on the stair beside your closed toolkit and turns the bottom gusset upward. Dark watermarks trace the softened seam under the corridor lamplight.

This is a clean living-world beat. Dario acts because his own persisted goal and replanned step reached authority, not because the player selected a Dario choice. The action remembers the repaired buckle and the still-soft gusset, remains local and sensory, and hands the next decision back to the player. Suggested actions then offer asking Dario about the seam without treating that conversation as already accepted.

The wait prose across the preceding turns is coherent but repetitive; three consecutive twenty-minute waits were a diagnostic load rather than a recommended play pattern. A separate presentation defect remains: actor-owned discovery/dialogue consequences render in `What changed` under the generic label `You notice` even though their stored performer is typed and Narrator names the actor correctly.

## Validation

- Scheduler regression: a debt-bearing actor with a later due time outranks a current-turn performer and earlier debt-free actors before capacity is consumed.
- Focused backend suite: actor scheduler plus complete player-action turn runtime, 57 passed across 2 files.
- Backend typecheck passed.
- Real UI: four additional completed player actions across the reproduced starvation and corrected fairness path; reload preserved Dario, clock, debt transitions, proposals, and final narration.
- Final campaign state after the proof: world version 24, Day 1 01:58, Dario present and settled through proposal `actor-proposal:7f8ed8b1ddd314a5aad3b3d56c5e3229`.

## Review

GitNexus reports `dueRows` as LOW risk: one direct caller and the Campaign Play scheduler module. Independent read-only review reproduced the infinite-starvation counterexample and identified the stronger player-centering case, which is why debt precedes `currentTurnPerformer` rather than merely moving ahead of due time.

No prompt or player copy changed. The implementation is a two-key ordering correction plus focused contract expectations; it adds no prose, retry, fallback, timer, or compatibility behavior.

`humanizer` and `deslop` review kept the note evidence-led: it separates bounded scheduler fairness, one campaign's prose quality, the remaining presentation defect, and broader claims that this playtest cannot support.
