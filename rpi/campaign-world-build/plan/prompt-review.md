# Campaign World model contract review

Date: 2026-07-10
Gate: Task 2B before builder implementation
Verdict: ALIGNED

## Reviewed surfaces

- `backend/src/campaign-world/contracts.ts`
- `backend/src/campaign-world/contracts.test.ts`
- `backend/src/campaign-world/world-prompts.ts`
- `shared/src/campaign-world.ts`
- Product envelope, model stages, and Tasks 2B/3 in `docs/goals/campaign-world-build/PLAN.md`

## Prompt ownership

| Stage | Owner | Allowed context | Output |
|---|---|---|---|
| `world_frame` | world frame designer | frozen Campaign World source | world summary, persistent locations, directed routes |
| `world_cast` | starting cast designer | frozen source and accepted frame | people, collective actors, active goals, placements |
| `world_connections` | world connections designer | frozen source, accepted frame, accepted cast | directed relations and starting pressures |

The prompts treat embedded source strings as data, require exact local-reference reuse, and leave persistent IDs to code after all stages validate. They permit world details that fit the supplied source and established prior packets. Later-stage owners cannot revise accepted earlier packets.

## Humanizer and deslop audit

The final prompts and player messages use plain technical English. The pass removed tutorial framing, promotional language, artificial suspense, vague authority, formulaic contrasts, and decorative punctuation. The text contains no em dash or en dash. Each prompt states its actor, scope, context, and output directly.

Scores: directness 10/10, rhythm 8/10, trust 10/10, authenticity 8/10, density 10/10. Total 46/50.

## Droid GLM-5.2 review

- Model alias: `custom:GLM-5.2-(Z.AI-Coding)-0`
- Tool verification: exit 0; read tools available.
- Review prompt: `.codex/droid-prompts/campaign-world-model-contract-review.md`
- Output log: `.codex/agent-logs/droid-campaign-world-model-contract-20260710-003213.out.log`
- Error log: `.codex/agent-logs/droid-campaign-world-model-contract-20260710-003213.err.log`
- Output: `Plan is up-to-date.`

The stderr log contains the known MCP reload warning. Droid continued with allowed read tools and exited 0. The verdict requests no prompt or copy rewrite.

## Gate result

Task 3 builder implementation may begin after the Task 2B focused tests and backend typecheck pass. The builder must use these schemas unchanged with strict structured output, repair disabled, text fallback disabled, and one total attempt per model stage.

## Task 5 API copy review

- Review prompt: `.codex/droid-prompts/campaign-world-route-copy-review.md`
- Output log: `.codex/agent-logs/droid-campaign-world-route-copy-20260710-015022.out.log`
- Error log: `.codex/agent-logs/droid-campaign-world-route-copy-20260710-015022.err.log`
- Exit code: 0
- Verdict: `Plan is up-to-date.`

The reviewed route messages pair stable machine codes with short player-safe explanations. Humanizer and deslop checks found no filler, promotional tone, artificial suspense, vague authority, formulaic contrast, decorative punctuation, or internal provider/database leakage. The stderr log contains the known MCP reload warning; Droid completed the read-only review without MCP tools.

## Live prompt and UI repair reviews

- Connections scale review: `.codex/agent-logs/droid-campaign-world-connections-live-fix-20260710-031845.out.log`; verdict `ALIGNED`.
- World-frame parent-reference review: `.codex/agent-logs/droid-campaign-world-frame-parent-live-fix-20260710-032915.out.log`; verdict `ALIGNED`.
- Durable current-stage UI review: `.codex/agent-logs/droid-campaign-world-stage-activity-plan-20260710-032111.out.log`; result `Plan is up-to-date.`
- Research-summary UI review: `.codex/agent-logs/droid-campaign-world-research-summary-plan-20260710-0356.log`; result `Plan is up-to-date.` after the configured Z.AI GLM-5.2 completed despite the known MCP reload warning.

Humanizer and deslop review kept the numeric scale and parent-reference instructions direct and stage-owned. The Research presentation uses short product labels and turns the stored artifact into readable source context. Focused tests and later live runs verified every reviewed repair.
