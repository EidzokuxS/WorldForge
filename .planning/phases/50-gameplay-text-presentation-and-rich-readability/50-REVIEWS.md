---
phase: 50
reviewers: [gemini, claude]
reviewed_at: 2026-04-13T04:12:00Z
plans_reviewed:
  - 50-01-PLAN.md
  - 50-02-PLAN.md
  - 50-03-PLAN.md
  - 50-04-PLAN.md
---

# Cross-AI Plan Review — Phase 50

## Gemini Review

# Phase 50 Plan Review: Gameplay Text Presentation & Rich Readability

## Summary
The plans for Phase 50 are exceptionally well-structured, moving the `/game` interface from a generic application layout to a high-fidelity "digital reader" surface aligned with the project's hybrid UI concept. The strategy correctly prioritizes **render-time transformation** over data persistence changes, ensuring that the underlying mechanical truth remains clean and plain-text while the presentation layer gains significant sophistication. The separation of canonical narration from "support blocks" (lookup, comparison, system) and the dedicated SSE lane for reasoning metadata demonstrate a mature understanding of the project's architecture.

## Strengths
- **Architectural Integrity:** Using a separate SSE lane for "reasoning" (Plan 50-04) is an excellent decision. It prevents debug data from contaminating the persisted narrative history while allowing for real-time visibility.
- **Bounded Formatting:** The decision to use a "locked" subset of Markdown (Plan 50-01) via `react-markdown` overrides is a secure and maintainable way to implement the "SillyTavern-style" RP contract without opening the door to XSS or layout-breaking Markdown features.
- **Role-First Rendering:** Deriving `GameMessageKind` before rendering ensures that player input, narration, and system notices never share a flat visual mode, which is the primary driver for "scanability."
- **Concept Alignment:** The plans directly address the "drift" from `docs/ui_concept_hybrid.html`, specifically through typography pairings (Inter/Playfair) and the sticky input treatment.
- **Persistence Discipline:** Gating reasoning behind a persisted backend settings contract (Plan 50-03) while keeping the reasoning text itself as transient session metadata is the correct trade-off for a "debug affordance."

## Concerns
- **MEDIUM:** Streaming Markdown flickering if partial markers cause layout shifts mid-stream.
- **LOW:** Typography plugin bleed if `prose` classes are not tightly scoped.
- **LOW:** Dialogue detection could misclassify quoted text, though it remains a presentation-only risk.

## Suggestions
- Consider a slightly distinct dialogue token/color treatment inside the reader surface.
- Style the reasoning disclosure with an obviously debug-only surface.
- Polish the empty/opening-state transition so the move from idle to scene generation feels smoother.

## Risk Assessment
**LOW.** The plans are additive, frontend-heavy, and keep gameplay semantics intact.

**Verdict:** Approved. Proceed with Wave 1 (`50-01`, `50-03`).

---

## Claude Review

# Phase 50 Plan Review

## Plan 50-01: Bounded Rich-Text Renderer & Role-Aware Log Blocks

### Summary
Solid foundation plan that introduces `react-markdown` + `remark-gfm` + `@tailwindcss/typography` for bounded RP rendering, a message classification layer, and distinct rendering surfaces for narration vs. player vs. special blocks. The scope is well-contained to the rendering seam without touching gameplay logic.

### Strengths
- Explicitly locks the allowed RP subset and tests that unsupported markdown stays plain — prevents feature creep into a full markdown editor
- Keeps stored content raw and only renders at display time — correct architectural choice
- Dedicated compare/power_profile path preserves Phase 49 lookup semantics instead of flattening them
- Stream-safe partial marker handling is called out as an explicit test case
- `npm install --workspace frontend` is the correct workspace-aware install command

### Concerns
- **MEDIUM:** `@tailwindcss/typography@0.5.19` with Tailwind v4 may be a compatibility mismatch. The plan should verify that the plugin line actually works with the repo's Tailwind setup before execution locks it in.
- **MEDIUM:** The plan text says to add gameplay text color tokens, but `globals.css` may already define the relevant tokens. The executor should reuse or extend, not duplicate.
- **LOW:** `remark-gfm` enables broader constructs by default, so the bounded subset must be enforced explicitly at the renderer/component layer.

### Suggestions
- Verify typography plugin compatibility against the repo's Tailwind version before execution.
- Reuse existing `globals.css` color tokens instead of duplicating them.
- Be explicit about nullifying or flattening unwanted GFM constructs so unsupported syntax never upgrades into full markdown rendering.

### Risk Assessment
**LOW-MEDIUM** — mostly because of the typography plugin compatibility seam.

---

## Plan 50-02: Hybrid Concept Shell, Sticky Input & Panel Readability

### Summary
Applies the visual concept from `ui_concept_hybrid.html` to the `/game` shell, input bar, and side panels. Pure presentation work with no gameplay logic changes. Well-structured to preserve Phase 45/46 contracts while upgrading visual hierarchy.

### Strengths
- Explicitly preserves busy-state locking, travel feedback, and scene contracts
- Keeps `ActionBar` as a plain textarea
- RP markup hints are practical and low-risk
- Separate tasking for shell vs. panels keeps the diff reviewable

### Concerns
- **MEDIUM:** If panel widths change toward the concept, responsive behavior needs to stay intentional.
- **LOW:** Placeholder copy changes will force predictable test updates.
- **LOW:** Always-visible RP markup helper text could clutter smaller layouts.

### Suggestions
- Clarify responsive fallback if panel widths change materially.
- Keep markup helper copy compact or contextual.

### Risk Assessment
**LOW**

---

## Plan 50-03: Persisted `ui.showRawReasoning` Settings Contract

### Summary
Extends the shared `Settings` type with a persisted UI/debug toggle and threads it through the backend normalization and frontend settings surface. Clean full-stack settings work.

### Strengths
- End-to-end settings contract across shared, backend, and frontend
- Legacy normalization and default `false` keep old settings safe
- Tests cover round-trip behavior

### Concerns
- **MEDIUM:** Backend schema stripping means the settings schema update must be atomic with the new field.
- **LOW:** If `frontend/lib/types.ts` mirrors shared settings instead of re-exporting them, it may also need updating.

### Suggestions
- Verify whether frontend-local type mirrors exist and include them if needed.
- Keep `ui` extensible for future toggles.

### Risk Assessment
**LOW**

---

## Plan 50-04: Reasoning Transport & `/game` Disclosure

### Summary
The most complex plan in the package. It adds a reasoning SSE lane, parser support, and a gated disclosure surface without polluting canonical narration.

### Strengths
- Human-verify checkpoint between transport and UI wiring is the right risk control
- Reasoning remains non-canonical and non-persistent in chat history
- Native disclosure pattern is appropriate
- Negative-case tests are explicitly planned

### Concerns
- **HIGH:** The exact Vercel AI SDK field for reasoning extraction is not named. If the executor reads the wrong field, the feature may silently never surface.
- **MEDIUM:** Frontend storage for reasoning metadata is not explicitly named; the executor must avoid widening canonical `ChatMessage`.
- **MEDIUM:** Reasoning may only be available after streaming completes depending on the SDK/provider path.
- **LOW:** Plan `50-04` stays at the upper edge of acceptable scope, though the checkpoint mitigates that.

### Suggestions
- Verify the exact SDK field or response shape used for reasoning before implementation.
- Keep reasoning in a parallel local metadata structure rather than in canonical message records.
- Clarify whether reasoning arrives during stream or only at completion.
- Consider clamping rendered reasoning length.

### Risk Assessment
**MEDIUM**

---

## Consensus Summary

Phase 50 is broadly execution-ready. Both reviewers agreed the phase direction is correct: render-time transformation instead of storage mutation, explicit role-based message surfaces, concept alignment with `ui_concept_hybrid.html`, and reasoning kept outside canonical narration. No shared blocker was raised after the final planner/checker revision cycle.

### Agreed Strengths
- The phase is correctly scoped as a presentation-layer upgrade rather than a gameplay-logic rewrite.
- The bounded RP subset is the right direction for the `SillyTavern`-style formatting contract.
- The settings-gated reasoning surface is the correct separation between debug affordance and canonical narration.
- The overall wave ordering and cross-plan dependency structure are sound.

### Agreed Concerns
- The most important execution watch item is `50-04`: the exact reasoning extraction seam in the AI SDK/provider path must be verified concretely during execution.
- The `50-01` renderer must stay tightly bounded so `react-markdown`/`remark-gfm` do not expand into general markdown behavior.

### Divergent Views
- `Gemini` sees the package as low-risk and effectively approved for execution.
- `Claude` is more cautious about two implementation seams:
  - typography plugin compatibility with the current Tailwind setup
  - the exact AI SDK field and timing model for reasoning extraction

### Recommended Focus For `--reviews`
- Keep the current plan split; do not reopen the overall structure.
- Tighten execution notes around:
  - verifying `@tailwindcss/typography` compatibility before locking the install path
  - naming the exact SDK/provider reasoning field during implementation
  - reusing existing gameplay tokens in `globals.css` instead of duplicating them
