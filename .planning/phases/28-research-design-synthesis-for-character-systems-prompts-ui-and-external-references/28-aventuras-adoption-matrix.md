# Aventuras Adoption Matrix for WorldForge

## Adoption criteria

- Must fit a browser-first localhost product, not a desktop-wrapper roadmap.
- Must help Phases 29-33 directly: character model, prompts, non-game shell, or browser verification.
- Must preserve WorldForge's current stack direction: Next.js frontend, Hono backend, Tailwind/shadcn UI, backend-owned state and composition.

## Adopt

| Concept | Why adopt | Where it applies next |
| --- | --- | --- |
| Context-builder layering for prompt inputs | WorldForge already has the beginnings of this in `prompt-assembler.ts` and worldgen prompt helpers. Formalizing family-level context builders will reduce drift between runtime, character, and worldgen prompts. | Phase 31 prompt harmonization |
| Explicit prompt family boundaries | Aventuras-style modular prompt families map cleanly onto WorldForge's split between runtime narration, Oracle/Judge flows, worldgen, and character drafting. | Phase 31 |
| Sticky high-value context posture | WorldForge already uses prompt budgets, lore retrieval, and episodic memory. The useful takeaway is to treat a small set of high-value context as first-class contract inputs rather than rediscovering them in every prompt. | Phase 31, with light carry-over to Phase 33 verification |
| Controlled lore-management workflow | Aventuras' reviewable lore-management idea fits WorldForge's existing world review and lore editing direction better than freeform mutation. | Phase 32 UI shell, Phase 33 browser verification |
| Dense desktop shell framing | Aventuras-style resizable/dense workspace thinking matches the user's desktop-first request and the `docs/ui_concept_hybrid.html` direction more than the current modal/card-grid flow. | Phase 32 |

## Reject

| Concept | Reject reason | Why it does not fit this milestone |
| --- | --- | --- |
| Tauri | Reject | WorldForge is explicitly browser-first and localhost-oriented. A desktop wrapper adds packaging/testing complexity without solving the current milestone's workflow problems. |
| mobile-first shell | Reject | Phase 28 context explicitly prioritizes 1080p/1440p desktop editing workflows. Mobile-first constraints would push the UI in the opposite direction. |
| sync / account-driven architecture | Reject | The active roadmap is local single-user product work. Sync adds auth, persistence, conflict, and deployment scope far beyond Phases 29-33. |
| Svelte-specific implementation patterns | Reject | WorldForge is already a Next.js/Tailwind/shadcn codebase. The transferable value is product architecture, not framework mechanics. |
| theme proliferation for its own sake | Reject | The current need is one coherent non-game product language, not a larger theme system. |

## Defer

| Concept | Defer reason | Trigger for reconsideration |
| --- | --- | --- |
| Broader retrieval overhaul | Defer | Tiered retrieval is interesting, but Phases 29-33 are not a memory-architecture milestone. Keep only the contract-layer lesson for now. | Consider after prompt harmonization if real context failure remains |
| Heavier lore workflow automation | Defer | Phase 32 should improve workspace review/edit flows first. More agentic lore mutation can wait until UI and prompt contracts stabilize. | Revisit after Phase 33 if manual review becomes the bottleneck |
| Panel resizing and multi-pane persistence everywhere | Defer | Useful desktop idea, but first ship a coherent shell and route model. Full per-user workspace persistence is not required to unlock the next milestone. | Consider after the base shell lands cleanly |

## Prompt and context layering decision

### Adopt

- Use the Aventuras takeaway as a structural rule: prompt inputs should be layered by responsibility, with reusable context builders and family-level contracts.
- WorldForge should not copy another app's prose or helper naming directly.
- Phase 31 should centralize shared contract fragments where repetition is currently causing drift.

## Retrieval posture decision

### Defer with a narrow keep

- Keep the idea of sticky high-value context as a prompt-design principle.
- Do not launch a separate retrieval overhaul or new memory subsystem in Phases 29-33.
- The only retrieval-related work that belongs in the current milestone is making prompt families clearer about what context they consume.

## Lore workflow decision

### Adopt in moderated form

- Keep reviewable, explicit lore-management patterns.
- Route them through WorldForge's existing review/editor surfaces and backend-owned persistence.
- Do not move toward automatic freeform lore rewriting without user review.

## Shell and workspace decision

### Adopt

- Borrow the idea of a dense, framed desktop workspace with persistent navigation, a strong center editing region, and contextual side surfaces.
- Translate it into Next.js routes and shadcn/Tailwind layout primitives instead of copying Aventuras' exact UI implementation.

## Why this fits WorldForge

- WorldForge already has backend-owned composition, explicit route flows, lore review, prompt helper layers, and a strong separation between deterministic state and LLM narration.
- The useful Aventuras takeaways reinforce those strengths instead of replacing the architecture.
- The rejected items are mostly product-envelope changes, not correctness or workflow improvements for the active milestone.

## Milestone guardrails

- Keep browser verification first-class; every adopted concept must still be testable in the browser.
- Keep retrieval changes narrow.
- Keep UI adoption constrained to Tailwind/shadcn-compatible implementation.
- Keep prompt adoption grounded in the shared character/start model from Plan 28-01 and the rewrite rules from Plan 28-02.
