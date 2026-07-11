# Task 6 — Campaign World UI and copy gate

## Outcome

The Campaign World Forge, persisted World Review, and campaign shell have one approved UI contract before production frontend changes begin.

The player surface follows `docs/UI Concept.html`, uses the existing WorldForge editorial token system, and displays only durable Campaign World state:

- Forge maps persisted stages to Locations, Actors, Connections, and Review preparation;
- build progress comes from sequenced events and survives replay or resume;
- completed entity cards appear only after the atomic world commit;
- World Review owns Overview, Locations, Actors, Connections, and Source;
- people and collectives use the same actor grammar and persistent-ID navigation;
- shell navigation derives its lifecycle labels from `/api/campaigns/:id/world/state`.

## Accessibility and interaction corrections

The first review exposed two plan defects and four underspecified behaviors. The approved plan now requires:

- a new opacity-only active-stage marker rather than the box-shadow pulse;
- a global reduced-motion rule covering existing pulse, shimmer, text pulse, blink, and entrance animations;
- `--fg-2` or lighter for all informational small text, reserving `--fg-3` for non-text chrome;
- explicit labels for all five shell states;
- high, medium, and low pressure treatments plus a textual `N of 5` relation intensity;
- terminal failure codes excluded from the player ledger, with the safe message shown only in the failure notice;
- DNA edits held as a local draft until `Create world`, with navigation or reload discarding unsaved edits.

## Review evidence

- Prompt: `.codex/droid-prompts/campaign-world-ui-plan-review.md`
- Model: `custom:GLM-5.2-(Z.AI-Coding)-0`
- First verdict: `REVISE`
- First stdout: `.codex/agent-logs/droid-campaign-world-ui-plan-20260710-020043.out.log`
- Re-review verdict: `ALIGNED`
- Re-review stdout: `.codex/agent-logs/droid-campaign-world-ui-plan-rereview-20260710-020710.out.log`
- Both stderr logs contain only the known MCP reload warning.
- Humanizer/deslop note: the approved strings use concrete Campaign World language, short sentence forms, and direct action labels.

## Verification

- `git diff --check -- rpi/campaign-world-build/plan/ui-plan.md`
- GLM cross-checked the plan against the visual canon, shared contract, architecture plan, and current Forge/Review/shell code.
- GLM recomputed the relevant token contrast and confirmed the approved AA rule.
