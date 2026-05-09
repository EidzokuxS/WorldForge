# Phase 87 Backend-As-GM Audit

Date: 2026-05-07

## Question

Do current fixes make backend play GM instead of making the model act as GM inside backend rules?

## Audit Scope

- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/visible-narration-output-guard.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/narrator-packet.ts`

## Current Read

Backend is currently allowed to:

- validate GM Read and tool-loop output;
- ask the model to repair invalid structured output;
- reject still-invalid GM output;
- execute accepted runtime tools as deterministic world rules;
- assemble authoritative narrator packets from settled state;
- retry visible narration through the storyteller model when output is empty or leaks packet-forbidden facts.

Backend must not:

- silently change a no-mutation GM Read into `tool_plan`;
- invent replacement narration after storyteller failure;
- grant unsupported player claims as truth;
- convert failed tool calls into successful scene truth;
- disable mechanics or tools to make findings disappear.

## Evidence

- `gm-turn-read.ts` rejects `direct`/`continue`/`clarification` paths with future-relevant concrete pressure and instructs repair to let the GM switch path itself.
- `turn-processor.ts` skips tool loop only for no-mutation GM Read paths; mutating paths go through `runGmToolLoop`.
- `visible-narration-output-guard.ts` retries by calling the storyteller again with a correction addendum; it does not synthesize backend prose.
- `turn-processor.ts` calls `assertNonEmptyFinalVisibleNarration` after guarded narration before appending assistant text.
- `gm-tool-loop.ts` rejects future-relevant concrete pressure emitted as assistant prose without an accepted state-bearing tool observation.

## Verification

Passed:

```text
npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts
```

Result: 4 files / 45 tests.

## Remaining Risk

The current `/game` ScenePlan path does not intentionally author GM output in backend, but the wider codebase still has several surfaces that can drift into backend-as-GM if they affect live play:

- GM Read may still choose a weak path under live pressure; this should be fixed by prompt/schema/repair contracts or fail-closed validation.
- Model repairs may still remove too much or too little; repair must stay model-authored and observable.
- Narrator may produce bland/empty/over-broad prose until live reruns prove the prompt contract; transport retry may call the storyteller again, but must never synthesize backend prose.
- Old legacy turn paths still exist in code and should not be the acceptance surface for current `/game` quality. The `SCENE_PLAN_ENABLED=false` path remains high-risk because it can interpret outcomes outside the current tool-loop contract.
- Post-turn NPC/offscreen simulation can silently write world updates. It needs explicit provenance and should be treated as proposal/tool-loop work if it becomes player-visible.
- Faction/world-engine macro events can create world history without the same GM turn contract. They need gating/proposal semantics before being treated as part of the live GM loop.
- Worldgen repair/default placement code can promote missing locations or actors into defaults. Those repairs should be explicit, logged, and preferably model-repaired or fail-closed when they would create canon.
- Pattern-based unsupported-claim guards are useful, but they are not a semantic proof. Claim validation should move toward structured claim categories tied to narrator packets and tool observations.

## Decision

Proceed with `phase87-smoke`, then `phase87-focused`. Treat any backend-authored semantic fallback found in logs as a blocker, not as a valid fix.
