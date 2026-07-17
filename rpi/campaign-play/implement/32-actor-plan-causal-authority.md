# Task 32: actor-plan causal authority

Status: implementation and rendered replay verified.

A fresh Black Rain Passage lane stopped after its second player action. Liora Venn asked Pia Servadio for permission, pay, and scope before touching the beacon burner. Judge correctly normalized the action as `contact`, and Game Master recorded only Pia's answer. Actor Replanner then authored Pia's next step as clearing corrosion while supervising the stranger's wick reseating. Its sensory trace stated that the assembly was already reseated square. The scheduler compiled that trace into an applied actor-owned `record_world_event`, visibility exposed it as `You notice`, and Narrator repeated it. No accepted player action had performed or accepted the repair.

The retained negative evidence is campaign `e5e41b51-d60f-44e2-90c6-202dae12a74f`, turn `turn-player-action:e2bdea6b3d6fd372865a1a3d8d2265c5b4fb0cd8`, event `event:4b5bfde66877be7777cf409bd5615b5e`, and `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r01-current.session/screenshots/action-02-terms-state-skip.jpg`, SHA-256 `D418D0D5B60C9E4B569A8C577ED294EB64CCA8F1C14B79D0423CA8711E48F945`.

Actor Replanner now has two required strict calls inside the same durable stage. The proposer still authors the plan. An independent grounding reviewer receives the frozen actor frame and exact proposal and returns only a typed accept/reject verdict. It rejects a step that states or requires another actor's response, work, movement, consent, payment, or completed outcome without an accepted event establishing that exact fact. It cannot rewrite the plan, provide replacement prose, invoke a repair, retry the proposer, switch providers, or fall back to backend text. A rejection interrupts as `model_contract_invalid` before plan persistence or actor proposal execution. Accepted proposer and reviewer usage is combined in the existing actor-replanner telemetry and budget.

Prompt review:

- `humanizer`: keep; both instructions use concrete actors and actions, and neither adds setting facts or a preferred outcome;
- `deslop`: pass; the reviewer prompt states one authority boundary, gives exact failure categories, and avoids rhetorical framing, recap, or replacement prose.

Verification so far:

- GitNexus was rebuilt after its incremental FTS index failed. Upstream impact is MEDIUM for `createCampaignPlayActorReplanner` and LOW for the proposer prompt. The CRITICAL shared `validateModelStages` path was deliberately left unchanged, so the stored actor-plan artifact and recovery contract remain stable.
- actor prompt and replanner tests pass `14/14`, including the exact offer-to-completed-work rejection;
- the complete player-turn runtime passes `37/37`, including serial actor settlement, combined telemetry, schema/budget/persistence interruption, process-stop recovery, lease expiry, explicit Resume, and reopened accepted replan;
- backend typecheck passes;
- `actor-scheduler.test.ts` currently has twelve unrelated fixture failures because its Game Master artifact omits the already-required `semanticReview` field. This change does not touch that fixture or the Game Master artifact contract; it is not counted as a passing check.

Rendered acceptance:

- Materialized a second clean copy of the same pristine Black Rain template as `pristine-60-black-rain-54df81f3-r02-grounding-review`; no world generation ran.
- Created ordinary travelling wick repairer Liora Venn through the rendered character flow and opened at Vesper Quay. The opening did tailor Tomasso's document work too closely to Liora's refusal of shadow contracts, which remains a playtest quality warning rather than an authority failure.
- Across five completed player actions, Liora asked Pia about paid wick work, explicitly kept her hands off the lamps, asked who could authorize inspection, payment, and scope, then travelled from Vesper Quay to Cinderwatch and back. Pia reported only the symptoms she had logged and correctly deferred authorization and funds to the Wardens' Council. Neither the public packet nor Narrator claimed that Liora inspected, accepted, or repaired anything.
- The return journey advanced the world from minute `11` to `19` and triggered a real actor replan for Renzo Malfatti. The first reviewer response was not parseable JSON, so the stage stopped as `model_contract_invalid` without persisting a replacement plan or actor event. The rendered UI displayed `The turn stopped before it finished.` and an explicit `Resume` button. No automatic retry, text fallback, repair, or provider switch ran.
- Explicit Resume created actor-replanner attempt two. Proposer plus reviewer accepted in `138788 ms` with combined `7980` input and `9464` output tokens. The accepted three-step plan contains only Renzo's own briefing, future movement, and search. It targets Lucia but neither settles her response nor moves her. The scheduler committed only Renzo's first briefing trace. Because Liora was back at Vesper Quay, the final Narrator packet did not expose that distant event.
- Reload preserved Liora at Vesper Quay, world minute `19`, world version `20`, runtime revision `239`, the same final public packet, and an actionable input surface. Runtime sequences are contiguous `1..239`; SQLite integrity is `ok` with zero foreign-key violations.

Retained rendered evidence:

- `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r02-grounding-review.session/screenshots/action-05-actor-plan-rejected.jpg`, SHA-256 `5721068989BB5AEEFFF001271189FE36FDC2768CE4E61B5609244228813E3CC1`;
- `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r02-grounding-review.session/screenshots/action-05-recovered-background-world.jpg`, SHA-256 `D82017250A83A8641F5868E333F244C54664559631F4BE5E0C823E75BBE48B79`;
- `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r02-grounding-review.session/human-notes.md` and `manifest.json` contain the exact action record and final checkpoint.

Final prose review: `humanizer` keep and `deslop` pass. The task note distinguishes observed UI, stored state, and interpretation; it does not turn the single playtest into a general reliability claim.

Reusable field evidence was returned against `pgg:knowledge:found-004` as `pgg:request:rq-20260717t230603672z-e8faf855`; it refines the boundary with atomic reviewer failure, explicit Resume, visibility filtering, and reload correlation.
