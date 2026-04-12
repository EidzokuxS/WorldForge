---
phase: 46
reviewers:
  - gemini
  - claude
reviewed_at: 2026-04-12T09:58:30Z
plans_reviewed:
  - 46-01-PLAN.md
  - 46-02-PLAN.md
  - 46-03-PLAN.md
  - 46-04-PLAN.md
---

# Cross-AI Plan Review — Phase 46

## Gemini Review

### Summary
The plan package is architecturally sound and attacks the real problem: `currentLocationId` is currently doing too many jobs at once. Gemini agreed that the right abstraction is to separate physical presence, player awareness, and NPC knowledge through one shared backend seam, then route both backend narration and `/game` through that same truth.

### Strengths
- Centralizing the logic in a shared resolver prevents drift between narration, NPC reasoning, and UI.
- The durable `currentSceneLocationId` direction is a reasonable minimum step for “same district, different immediate scene.”
- The fallback `currentSceneLocationId ?? currentLocationId` is a clean legacy story.
- The plan preserves the “hidden but real participant” model instead of collapsing unnoticed actors into nonexistence.
- The wave ordering is sensible: tests first, foundation next, rewiring after that, frontend last.

### Concerns
- **MEDIUM:** The shared resolver will sit on a hot path and may be invoked several times per turn, so awareness heuristics need to stay cheap.
- **MEDIUM:** Scene-entry behavior inside a macro location still needs to be implemented carefully so actors do not end up “in the district but in no usable scene.”
- **LOW:** Awareness can change mid-turn, so the implementation must tolerate an actor going from unnoticed to clearly present after an action or interruption.

### Suggestions
- Use `location-events.ts` as one of the main sources for hint-level spillover instead of inventing a separate ambient system.
- Handle expired or archived ephemeral scene anchors cleanly when resolving scene scope.
- Consider a bounded UI treatment for hint-level presence so the player can feel “someone is nearby” without identity leakage.

### Risk Assessment
**LOW.** Gemini considered the package execution-ready and mainly called out implementation quality concerns rather than structural plan gaps.

---

## Claude Review

### Summary
Claude agreed with the overall phase shape and root-cause diagnosis. The package is coherent, dependencies are ordered correctly, and the phase is scoped to the actual runtime contract problem rather than drifting into prose quality or a full location rewrite.

### Strengths
- `46-01` starts from real regressions across resolver, prompts, NPC routing, off-screen routing, chat routes, and frontend surfaces.
- `46-02` now explicitly covers both durable local scene scope and authoritative lifecycle sync on movement/arrival paths.
- `46-03` keeps the backend rewire split into two clear responsibilities: scene/prompt reads and actor routing.
- `46-04` treats frontend as a consumer of backend scene truth rather than a second encounter engine.

### Concerns
- **HIGH:** `46-02` remains the riskiest plan because it spans schema, migration, movement/arrival wiring, and the first resolver seam.
- **MEDIUM:** Awareness-band representation still needs disciplined implementation so `clear`, `hint`, and `none` do not drift between prompt assembly and visible UI.
- **MEDIUM:** The world payload extension needs a clean, explicit shape during execution so frontend consumption does not turn into ad hoc parsing.
- **LOW:** Docs may drift from the Phase 44 baseline if the prompt/scene contract changes materially and no follow-up note is written.

### Suggestions
- Keep `46-02` implementation split cleanly inside execution even if it stays one plan on paper: schema plus compatibility first, then movement-path lifecycle sync.
- Be explicit during implementation about how awareness bands appear in prompts and whether hint-level presence is visible in `/game`.
- Treat frontend parser coverage as mandatory, not optional, when the world payload shape changes.
- Use SQLite-safe additive migration patterns only; no destructive table recreation for this field.

### Risk Assessment
**MEDIUM.** Claude considered the package good, but flagged execution risk in the middle waves if the implementation gets sloppy around migration shape or awareness semantics.

---

## Codex Review

Skipped for independence because this thread is the current Codex runtime.

---

## Consensus Summary

Both reviewers agree the package is fundamentally correct:
- the real bug is a runtime contract problem, not a prompt wording problem
- the phase should start with red regressions
- one shared scene-scope resolver is the right center of gravity
- the split `tests -> seam -> backend rewire -> frontend consume` is the right order

### Agreed Strengths
- Shared resolver architecture is the right shape for this bug.
- Legacy compatibility is handled sensibly through fallback from narrow scene scope to broad location.
- The package stays inside `SCEN-02` instead of drifting into writing quality, presentation polish, or a full location rewrite.

### Agreed Concerns
- Middle-wave execution is the main risk area, especially around scene-scope lifecycle and awareness semantics.
- Awareness/hint behavior needs to stay explicit and bounded so backend, prompts, and `/game` do not drift apart.
- The frontend world payload contract needs disciplined execution so scene-scoped fields survive parser boundaries.

### Divergent Views
- Gemini sees the package as low-risk and immediately execution-ready.
- Claude is more cautious about `46-02` and treats the phase as medium-risk unless migration shape and awareness-band behavior stay tightly controlled.

### Recommended Follow-Through
- Keep `46-02` implementation staged carefully during execution.
- Treat parser/API regression coverage as mandatory in `46-04`.
- If awareness-band semantics get murky during execution, stop and tighten the contract before continuing.
