---
phase: 67
reviewers: [gemini, claude]
reviewed_at: 2026-04-20
plans_reviewed:
  - 67-01-combat-bounds-and-posture-foundation-PLAN.md
  - 67-02-player-storyteller-outcome-bounds-PLAN.md
  - 67-03-npc-agent-combat-posture-PLAN.md
  - 67-04-verification-and-closeout-PLAN.md
---

# Cross-AI Plan Review — Phase 67

## Gemini Review

### Summary

Phase 67 is tightly scoped and correctly builds on Phase 66. The plan makes combat stats meaningful for narrative direction without drifting into hard combat math or persistence changes.

### Strengths

- Centralizes deterministic semantics in `combat-envelope.ts`
- Picks the right hybrid model for narrative bounds
- Places posture correctly in `npc-agent.ts` before tool selection
- Explicitly covers both hidden and final visible storyteller passes

### Concerns

- **MEDIUM:** Prompt bloat if bounds/posture blocks are not programmatically capped
- **LOW:** Instruction-echo sensitivity if bounds sound too imperative
- **LOW:** Primary target selection may be naive in multi-actor scenes

### Suggestions

- Cap guidance lines and bounds lengths in helper code
- Include explicit matchup summary in posture block
- Prefer a stronger primary-target heuristic than "first actor in array"

### Overall Risk

LOW

---

## Claude Review

### Summary

The plan is directionally correct and additive-only, but it needed tighter regression locks around no-envelope parity, instruction-echo safety, payload bounds, enum exhaustivity, and the exact ownership of primary-target selection.

### Strengths

- Correct wave split: foundation, then player/NPC in parallel, then verification
- Both storyteller passes are explicitly in scope
- Posture sits in `npc-agent.ts`, not `npc-tools.ts`
- Scope gates are explicit and preserved

### Concerns

- **HIGH:** No-envelope byte-for-byte prompt behavior was not locked by regression
- **MEDIUM:** Instruction-echo detector was not explicitly tested with bounds present
- **MEDIUM:** Posture enum contract and unknown-outcome fallback were not explicitly locked
- **MEDIUM:** Observability payload compactness was not tested explicitly
- **LOW:** Primary target selection seam needed explicit ownership
- **LOW:** Scope-gate diff baseline needed explicit `HEAD`

### Suggestions

- Add no-envelope prompt-parity regression to player and NPC paths
- Add visible narration detector regression for bounds-bearing prompts
- Lock the exact six posture labels and unknown-outcome fallback in foundation tests
- Add explicit payload-size bound assertions for new observability events
- State that target selection stays local to `npc-agent.ts`
- Use `git diff --name-only HEAD -- ...` for the scope gate

### Overall Risk

LOW-MEDIUM before patching, LOW after patching

---

## Consensus Summary

### Agreed Strengths

- The split is coherent: pure helpers first, then player/storyteller and NPC posture, then verification
- Narrative bounds should stay hybrid and deterministic
- NPC posture belongs in `npc-agent.ts` before tool selection
- Scope stays intentionally tight: no persistence, runtime-tags, frontend, offscreen, or reflection

### Agreed Concerns

- Prompt additions must stay tightly bounded to avoid bloat
- Constraint phrasing must stay detector-safe
- Primary target selection needs an explicit v1 rule

### Changes Applied After Review

- Patched plan 67-01 to lock the exact six posture values and unknown-outcome fallback
- Patched plan 67-02 to require no-envelope prompt-parity regression and instruction-echo detector coverage
- Patched plan 67-02 and 67-03 to require explicit bounded observability payload coverage
- Patched plan 67-03 to lock primary-target selection as a local `npc-agent.ts` seam
- Patched plan 67-04 to use explicit `git diff --name-only HEAD -- ...` scope gating
