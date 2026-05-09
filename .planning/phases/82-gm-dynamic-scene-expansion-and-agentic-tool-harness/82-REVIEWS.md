---
phase: 82
reviewers: [gemini, claude, opencode, codex]
reviewed_at: 2026-05-05
cursor: attempted but local CLI returned usage only
---

# Cross-AI Plan Review - Phase 82

## Consensus

Reviewer consensus is `FLAG`: Phase 82 is the right product direction and uses the correct existing seams, but the initial plan needed sharpening before execution.

Agreed strengths:

- Reuses existing `ephemeral_scene`, `anchorLocationId`, temporary NPC tier, current-scene placement, and Phase 81 sequential tool-step loop.
- Preserves the WorldForge boundary: GM interprets and proposes; backend validates, persists, rolls back, and owns truth.
- Correctly avoids duration caps and monolithic all-in-one schemas.
- Correctly defers full V4 visual migration until gameplay tool behavior stabilizes.

Agreed concerns:

- Cleanup/archive/retirement must name an exact authoritative turn-boundary hook.
- Ephemeral cleanup must be presence-gated so the player or focal actors are not archived out from under the scene.
- Repeated dynamic tool spam needs a concrete per-turn equivalence key, not a vague semantic phrase.
- Promotion must be an explicit state transition/tool path, not a hand-waved future idea.
- The GM prompt/tool-affordance owner must be named so the model actually learns when to reuse/create/retire/promote.
- The live gate needs quantitative no-spam and reuse-before-create criteria.
- Temporary props/items are not sufficiently owned by the plan and should be removed from Phase 82 scope unless explicitly planned.

## Accepted Amendments

1. Narrow Phase 82 scope to ephemeral sublocations and support/temporary NPCs. Temporary props/items are deferred.
2. Cleanup hook: run transient cleanup after successful tool-step settlement, narrator packet/final narration, and post-turn simulation for a turn, before the next GM Read can assemble. Cleanup is inside the active turn/rollback discipline and must skip scenes/NPCs containing the player, current focal actor, or key active participant.
3. Duplicate-call guard: per-turn key is tool name plus normalized anchor/current-scene ref plus normalized role/name/kind/lifetime category. Cross-turn reuse is allowed; rollback resets budgets; one explicit revision path remains allowed after validation failure.
4. Promotion: explicit GM checklist/tool step updates NPC tier/persistence, removes cleanup eligibility, records promoting turn/provenance, and runs or schedules existing enrichment needed for persistent NPC quality.
5. Prompt owner: Phase 82 must update GM Action Checklist/tool-step/tool-schema prompt contract text, not only tests.
6. Live gate: in a 10-turn sequence with at most two scene changes, at most two dynamic creations may occur; ordinary follow-up turns with no new scene fiction should create zero new dynamic objects. The GM must reuse an existing suitable local affordance before creating another one.

## Reviewer Summaries

### Gemini

Verdict: PASS.

Gemini called the plan a surgical GM staging-kit phase. Medium concerns: deterministic event spillover definition, presence-gated cleanup, promotion needing real enrichment, and budget reset on rollback.

### Claude

Verdict: FLAG/BLOCK until amended.

Claude flagged lifecycle trigger semantics, missing repeated-call equivalence rules, vague promotion path, missing prompt owner, and subjective no-spam criteria.

### OpenCode

Verdict: PASS with medium concerns.

OpenCode agreed the five-plan sequence is coherent. It asked for explicit cleanup owner, concrete repeated-call guard, named promotion surface, exact SSE stage strings, and numeric no-spam live criteria.

### Codex CLI

Verdict: FLAG.

Codex agreed with the direction but flagged temporary props/items as unowned and cleanup/promotion hook placement as backend-truth risks.

### Cursor

Attempted. Local `cursor agent -p --mode ask --trust` was not supported by the installed CLI and returned only `Run with 'cursor -'...`, so no Cursor review was available.
