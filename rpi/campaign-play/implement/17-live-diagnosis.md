# Task 17: live causal and diagnostic lanes

## Checkpoint and reload evidence contract

- `causal-20` is pinned to exactly 20 completed player actions and declared reload checkpoints `[1, 5, 10, 20]`.
- A live checkpoint is captured only from `phase=ready`, with no unfinished player turn and with the requested completed-action count equal to SQLite truth.
- Each checkpoint compares the public API bytes, canonical replay hash, SQLite/public/protected authority hashes, integrity result, foreign keys, and runtime-event cursor before and after the browser reload.
- A matching reload writes `checkpoints/action-<n>.json` and `probes/reload-action-<n>-proof.json`. Divergent reloads retain their proof but cannot produce an accepted checkpoint.
- Bundle finalization copies and validates staged historical checkpoints. It refuses a staged final checkpoint whose authority differs from the final replay and requires every checkpoint declared by the live run config.
- Live run configs now reject `maximumOutputTokens < 32_768`; deterministic seeded evidence uses the same minimum.

## Verification

- `npx vitest run e2e/campaign-play/contracts.test.ts e2e/campaign-play/live-session.test.ts e2e/campaign-play/bundle-writer.test.ts e2e/campaign-play/probes.test.ts`
- `npm --prefix backend run typecheck`

### Actions 7-8 visibility finding

- Action 7 preserved the failed social boundary. Direct inspection exposed only observable blight structure and the already-public northward drift.
- Action 8 proved freeform movement to the visible Lower Greyfork route, but an actor event reached the player packet as `You witnessed a change nearby.` The narrator echoed the missing fact as `perceptible, immediate, unnamed`.
- SQLite showed the deeper cause: Senna Torres executed the event, but `actor-proposal-service` reused Tibbs Mallon's opening-consequence summary whenever any co-located actor received projectable exposure.
- Opening-consequence prose is now used only when actor ID, goal ID, and first settled step all match the frozen seed. Unrelated actor events keep their own plan summary.
- Directly perceived agent events no longer expose their protected summary or emit the abstract placeholder. Visibility renders a bounded surface from public actor names and event class, for example `Senna Torres is occupied with North Harbor Growers' Council.`
- Focused verification: `npx vitest run backend/src/campaign-play/actor-proposal-service.test.ts backend/src/campaign-play/visibility-service.test.ts` (9 passed), plus backend typecheck.

### Action 9 narrator continuity finding

- Senna rejected the player's question without leaking motive or hidden state. The prose then said she kept walking, was halfway gone, and left the player alone at an empty bend while the same public packet still kept Senna in `visibleActors` and offered another contact action.
- The narrator prompt already prohibited movement absent from the packet, so prompt wording alone was not an adequate contract.
- The prompt now states the visible-actor invariant directly. A semantic validator rejects departure or empty-scene language for any named visible actor unless `newObservations` contains the code-owned `<actor> moved` evidence.
- Local gestures remain valid when the prose explicitly keeps the actor present.
- Prompt-craft, humanizer, and deslop review: the added instruction is specific, non-repetitive, and uses plain technical language. It adds no narrative style steering beyond the mechanical continuity rule.
- Focused verification: `npx vitest run backend/src/campaign-play/narrator.test.ts` (10 passed), plus backend typecheck.
- `npm --prefix frontend run typecheck`
- The previously accepted clean-14 first-playable bundle remains valid and promotion-eligible under the updated validator.

The next execution step is a clone-based 20-action GLM 5.2 rehearsal. It is diagnostic preparation, not the fresh-campaign acceptance lane required by Task 17.

## Clone rehearsal: actions 1-6

- Run `causal-20-glm52-brass-orchard-rehearsal-01` uses isolated clone `brass-orchard-longroad-pristine-d59fa3a4`, GLM 5.2 through Z.AI Coding Plan, and the manual browser path.
- Reload checkpoints after actions 1 and 5 matched exactly. The action-5 checkpoint hash is `31b61f079cdc18b23d82e58c9d3c1f5a9d8f712aca1eafb64da022cc95a68455`.
- Actions 1-4 stayed peripheral. The prose remained grounded but repeatedly described a static yard; action 4 ended with the player-centred line that the junction waited for the player to act.
- Action 5 reached Windcleft and surfaced a persisted, off-screen aftermath from Day 1, 01:00: fresh-dug soil, grey-streaked roots, a half-filled seed sack, and a dated skull mark. This satisfies the by-action-5 causal-discovery condition.
- The manual player accidentally duplicated the name and profession of an existing background actor. SQLite confirms separate actor IDs for background `Maren` and human `Maren Tolven`; the run remains mechanically valid but its naming semantics are contaminated.
- Action 6 exposed a reproducible Game Master contract defect. Two GLM proposals for a dialogue were schema-valid but selected a location exposure outside the command grounding, so Rulebook correctly interrupted both with `invalid_exposure`.
- `record_world_event` no longer accepts model-authored exposure. Campaign Play derives one `direct_perception` predicate from the human player's durable `present` placement. The same interrupted turn completed after backend restart and explicit Resume.

Prompt review: prompt-craft identified redundant model authority over a code-owned location anchor. The revised instruction states the exact `record_world_event` fields and tells the model to omit exposure. Humanizer and deslop review found no ornamental framing, filler, duplicated rule, or ambiguous retry language; the technical register is intentionally direct.

Focused verification:

- `npx vitest run backend/src/campaign-play/game-master.test.ts` (19 passed)
- `npm --prefix backend run typecheck`
