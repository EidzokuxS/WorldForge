# Phase 47: Storyteller Output Quality & Anti-Slop Prompting - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve live storyteller writing quality for actual gameplay narration. This phase is about better RP prose in the live scene pipeline: less purple prose, less obvious AI smell, stronger scene-appropriate voice, and better use of proven prompting/preset patterns without regressing runtime truthfulness.

</domain>

<decisions>
## Implementation Decisions

### Writing Target
- **D-01:** The target style is adaptive by scene, not one uniform voice. Combat, horror, dialogue, and quiet scene-setting should all read differently, but all must stay disciplined and playable.
- **D-02:** The desired result is not “more literary” by default. It is prose that feels like strong RP writing: concrete, atmospheric when needed, but not inflated, repetitive, or theatrically overwritten.

### Prompting Strategy
- **D-03:** Phase 47 should reuse and adapt proven community preset patterns instead of inventing a fresh style framework from scratch.
- **D-04:** The primary reference set is the user-provided preset material plus broader SillyTavern/Reddit community patterns, especially where they successfully reduce AI smell in roleplay output.
- **D-05:** The phase should explicitly research common anti-slop techniques already used in the wild, including signs people use to identify “neural-net text” and prompt patterns that suppress those tells.

### Enforcement Strength
- **D-06:** Anti-slop control should stay mostly at the prompt/preset/model-settings layer. Do not overbuild a heavy rewrite stack unless research proves a light fallback is necessary.
- **D-07:** A giant mandatory rewrite pass is not the default target for this phase. The preferred outcome is that the first visible storyteller pass already writes materially better.

### Model Targeting
- **D-08:** The tuning strategy should use one general baseline plus a GLM-specific overlay, not a fully fragmented provider-by-provider system.
- **D-09:** `GLM-5` is the primary optimization target because it is the user’s accessible everyday model, but the phase should avoid hardcoding everything so narrowly that the baseline becomes useless elsewhere.

### Style Contract Source
- **D-10:** Do not invent an abstract style doctrine if the needed guidance already exists in working presets. Extract and adapt the useful parts from researched presets into the runtime storyteller contract.

### the agent's Discretion
- Exact prompt wording and structure
- Whether a light post-generation lint or retry check is needed at all
- Which preset motifs are portable into WorldForge without importing SillyTavern-specific baggage
- Exact parameter tuning for storyteller role settings

</decisions>

<specifics>
## Specific Ideas

- The user already supplied core reference material and wants Phase 47 grounded in it rather than in ad hoc stylistic invention.
- The GitHub `stop-slop` reference is relevant as an anti-pattern catalog, not as a complete writing solution by itself.
- The Freaky Frankenstein / FranKIMstein preset archive is relevant because it reflects popular working community practice for RP-oriented prompting, including GLM-targeted variants.
- The user also explicitly likes the local preset file `X:\Models\templates\RE (´｡• ᵕ •｡`) Celia Custom.json`.
- Research should include Reddit and SillyTavern preset discussions to find recurring working patterns, especially for GLM-family models.
- The user’s desired direction is “good RP writing”, not generic assistant prose and not maximalist purple prose.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` — Phase 47 goal, success criteria, and milestone positioning
- `.planning/REQUIREMENTS.md` — `WRIT-01` requirement for storyteller output quality
- `.planning/PROJECT.md` — milestone rule that gameplay feel, not just formal reconciliation, decides completion

### Existing Runtime Seams
- `backend/src/engine/turn-processor.ts` — live storyteller pipeline and hidden/final narration passes
- `backend/src/engine/prompt-assembler.ts` — assembled storyteller inputs and current scene context
- `backend/src/engine/storyteller-contract.ts` — current storyteller contract and pass-specific rules
- `backend/src/ai/provider-registry.ts` — model/provider middleware, including reasoning-model handling
- `backend/src/settings/manager.ts` — storyteller role settings normalization and tunable parameters
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` — existing reusable anti-slop helper patterns

### User-Specified External References
- [GitHub: `hardikpandya/stop-slop`](https://github.com/hardikpandya/stop-slop) — anti-slop phrase/structure guidance and prose hygiene heuristics
- [Rentry: `The Freaky Frankenstein & FranKIMstein Archive`](https://rentry.org/freaky-frankenstein-presets) — community RP preset archive, including GLM-oriented variants
- `X:\Models\templates\RE (´｡• ᵕ •｡`) Celia Custom.json` — user-preferred local preset reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/storyteller-contract.ts`: already separates hidden and visible storyteller passes, so Phase 47 can improve writing quality without reopening Phase 45 sequencing.
- `backend/src/engine/prompt-assembler.ts`: already owns the assembled narration inputs, making it the natural place to inject stronger style controls or bounded prompt sections.
- `backend/src/ai/provider-registry.ts`: already has GLM/OpenAI-compatible reasoning middleware and parameter normalization, so model-specific overlays can live here cleanly.
- `backend/src/settings/manager.ts`: storyteller settings are already configurable, which gives the phase a natural place to tune or constrain runtime parameters.
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts`: existing `buildStopSlopRules()` provides a concrete in-repo precedent for anti-slop guidance.

### Established Patterns
- WorldForge prefers backend-owned contracts over vague prompt magic. Phase 47 should improve output quality through explicit contracts and bounded controls, not by making prose quality invisible and untestable.
- The runtime already separates hidden causal resolution from final visible narration. This means quality work can target the visible pass without reintroducing duplicated scene assembly.
- Reasoning-capable models already get special handling, so GLM-focused tuning can be added as an overlay rather than a separate pipeline.

### Integration Points
- Storyteller visible-pass contract
- Prompt assembly sections and scene directives
- Storyteller settings in `settings.json`
- Optional light validation path around visible narration output if prompt-only tuning proves insufficient

</code_context>

<deferred>
## Deferred Ideas

- Full character identity/canonical modeling is Phase 48, even though better writing quality will interact with it.
- Search/research quality for worldgen and live gameplay is Phase 49, even though external grounding quality affects prose.
- Typography, formatting, and rich readability in the UI are Phase 50, not Phase 47.

</deferred>

---

*Phase: 47-storyteller-output-quality-and-anti-slop-prompting*
*Context gathered: 2026-04-12*
