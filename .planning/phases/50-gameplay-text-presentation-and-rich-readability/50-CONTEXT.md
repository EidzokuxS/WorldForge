# Phase 50: gameplay-text-presentation-and-rich-readability - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring `/game` text presentation materially closer to the established gameplay UI concept through better typography, message rendering, rich-text affordances, and readability treatment across narration, player input, and special gameplay message blocks.

This phase owns presentation only. It does not add new gameplay mechanics or reopen scene-authority, encounter-scope, storyteller-truth, or search-grounding logic from prior phases.

</domain>

<decisions>
## Implementation Decisions

### Text Roles
- **D-01:** Narration and input/UI must not share one flat text mode. Narration is a reader-oriented presentation layer; input/UI is more utilitarian and faster to scan.
- **D-02:** Story text should read like a digital reader surface, not like heavy “bookish italic on dark background” plaintext.

### Rich Text Contract
- **D-03:** Do not invent a new formatting language. Use a lightweight `SillyTavern`-style RP formatting contract.
- **D-04:** The baseline formatting contract is:
  - `"quoted speech"` for direct speech
  - `*action*` for actions / scene emphasis
  - `**strong emphasis**` for stronger emphasis
- **D-05:** Rich text is bounded and exists to improve readability, not to become a full markdown editor or a free-form formatting system.
- **D-06:** Normal paragraph separation, quote presentation, and distinct treatment for system/lookup blocks are part of the contract.

### Input Experience
- **D-07:** Player input remains a normal text input surface, not a WYSIWYG editor.
- **D-08:** The player can type the same lightweight RP markup directly in the input.
- **D-09:** Formatting is primarily realized at render time after submission, not through a heavy live editor UI.

### Message Surface Hierarchy
- **D-10:** Message types must render differently instead of sharing one plain text treatment.
- **D-11:** Ordinary narration is the primary literary/reader block.
- **D-12:** Player input renders as its own visually distinct bubble/block.
- **D-13:** System, progress, lookup, and compare messages render as compact special blocks rather than ordinary narration paragraphs.
- **D-14:** Mechanical resolution blocks are allowed and desired for significant Oracle/mechanical moments, but should not appear after every trivial action.

### UI Concept Alignment
- **D-15:** `docs/ui_concept_hybrid.html` is the canonical visual direction for this phase.
- **D-16:** Scope is broader than “support bold/italic.” Phase 50 should pull `/game` toward the concept’s overall gameplay text shell:
  - typography
  - central reading surface
  - player action presentation
  - special result blocks
  - panel readability
  - sticky input presentation
- **D-17:** This is a presentation-layer alignment phase, not a navigation redesign and not a gameplay-logic phase.

### Streaming Presentation
- **D-18:** SSE truth stays intact, but streaming presentation should feel more crafted than raw plaintext accumulation.
- **D-19:** During streaming, text should settle into readable blocks rather than looking like an unstyled buffer.
- **D-20:** When a turn finishes, the final presented block should look like a finished crafted fragment, not a temporary stream artifact.

### Reasoning Surface
- **D-21:** Add an optional raw reasoning block under a spoiler/disclosure UI for providers that expose reasoning separately.
- **D-22:** This reasoning block is a user-facing debug affordance for the project owner, not part of the canonical narrative layer.
- **D-23:** If a provider does not return reasoning, no reasoning block is shown.
- **D-24:** Reasoning visibility is controlled by a global toggle in settings.

### the agent's Discretion
- Exact typography scale, spacing, and panel polish
- Exact parser/renderer implementation strategy for bounded RP markup
- Exact visual treatment for special blocks, so long as it remains aligned with the hybrid concept
- Exact spoiler/disclosure treatment for reasoning, so long as it stays optional and settings-controlled

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` — Phase 50 goal, success criteria, and milestone positioning
- `.planning/REQUIREMENTS.md` — `UX-01` requirement for gameplay text readability and formatting
- `.planning/PROJECT.md` — milestone rule that live gameplay feel matters, not just formal feature completion

### Prior Phase Contracts
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-CONTEXT.md` — authoritative scene assembly and opening-scene constraints that presentation must not violate
- `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-CONTEXT.md` — writing-quality contract; Phase 50 improves presentation, not prose semantics
- `.planning/phases/49-search-grounding-and-in-game-research-semantics/49-CONTEXT.md` — lookup/compare message intent and bounded research semantics that special message rendering must preserve

### UI Concept
- `docs/ui_concept_hybrid.html` — canonical gameplay UI direction for typography, panel hierarchy, central reading surface, special result blocks, and sticky input treatment

### Existing Runtime/UI Seams
- `frontend/app/game/page.tsx` — gameplay log, lookup rendering, streaming state, and panel composition
- `frontend/components/game/narrative-log.tsx` — current narration and message rendering surface
- `frontend/components/game/action-bar.tsx` — current gameplay input treatment
- `frontend/components/game/location-panel.tsx` — current left-side gameplay context panel
- `frontend/components/game/character-panel.tsx` — current right-side player/status panel
- `frontend/components/game/quick-actions.tsx` — current action-chip presentation under the gameplay log
- `frontend/app/globals.css` — current typography tokens, shell colors, and font setup
- `frontend/lib/api.ts` — lookup SSE event parsing and any reasoning-bearing response shaping that the UI may need to consume

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/components/game/narrative-log.tsx`: already centralizes rendering for user, assistant, and system messages, so it is the natural rich-text/message-surface seam.
- `frontend/app/game/page.tsx`: already distinguishes ordinary turn flow from lookup flow and keeps track of `sceneProgress` / `turnPhase`, so presentation upgrades can bind to real runtime state.
- `frontend/components/game/action-bar.tsx`: already isolates gameplay input, making it the right seam for typography and affordance improvements without rebuilding page layout.
- `frontend/components/ui/*`: existing button, textarea, scroll-area, card, and other primitives can support the visual alignment without inventing a new UI stack.

### Established Patterns
- `/game` currently uses a three-column layout with side panels and a central narrative surface, which aligns directionally with the hybrid concept even though the styling is still far from it.
- Message roles are already distinguished logically (`user`, `assistant`, `system`, `lookup_result`) even though the rendering is still too plain.
- The frontend already uses `Inter` and `Playfair Display` tokens in `globals.css`, which matches the concept’s core font pairing and should be treated as an upgrade path rather than replaced wholesale.

### Integration Points
- Rich-text parsing/rendering for narration and player messages belongs at the narrative-log layer.
- Special block treatment for lookup, system, progress, and mechanical resolution belongs in the `/game` message rendering path, not in backend mechanics.
- Settings-controlled reasoning visibility will need a frontend settings surface plus response/render handling where provider reasoning is available.
- Panel readability work should stay within `location-panel.tsx`, `character-panel.tsx`, `quick-actions.tsx`, and the shared shell styling rather than becoming a new app-shell rewrite.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants the project to stop drifting from `docs/ui_concept_hybrid.html`.
- The user wants the RP formatting model to feel familiar and lightweight, specifically “just do it like SillyTavern.”
- The user wants an optional spoiler-style raw reasoning block for themselves when providers expose reasoning separately, controlled from settings.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- `2026-03-29-add-reusable-multi-worldbook-library.md` — todo-match surfaced only weakly via the word `campaign`; it is unrelated to gameplay text presentation and remains out of scope for Phase 50.

None beyond that — discussion stayed within Phase 50 scope.

</deferred>

---

*Phase: 50-gameplay-text-presentation-and-rich-readability*
*Context gathered: 2026-04-13*
