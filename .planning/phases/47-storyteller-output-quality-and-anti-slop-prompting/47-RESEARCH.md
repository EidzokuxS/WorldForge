# Phase 47: Storyteller Output Quality & Anti-Slop Prompting - Research

**Researched:** 2026-04-12
**Domain:** Live storyteller prompting, RP preset adaptation, and GLM-5 output-quality tuning
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- Full character identity/canonical modeling is Phase 48, even though better writing quality will interact with it.
- Search/research quality for worldgen and live gameplay is Phase 49, even though external grounding quality affects prose.
- Typography, formatting, and rich readability in the UI are Phase 50, not Phase 47.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRIT-01 | Storyteller output quality is tuned for playable RP, with research-backed prompting/model settings that materially reduce purple prose and obvious AI smell. | Use a baseline storyteller contract plus GLM overlay, extract concrete preset motifs from community presets, keep prompt layers bounded, and add only a light final-pass lint/retry seam if prompt-only tuning fails. |
</phase_requirements>

## Summary

The repo already has the right runtime shape for this phase. Phase 45 and Phase 46 split hidden tool-driving from final visible narration, and the visible pass already runs through `assembleFinalNarrationPrompt()` plus `buildStorytellerContract()`. That means Phase 47 does not need a new storytelling pipeline. It needs better contract text, better section ordering, a preset-derived baseline plus a GLM-specific overlay, and possibly a very small output-quality guard after the final visible pass.

The external preset evidence is consistent on one point: good RP presets are not abstract style manifestos. They are layered control systems. Community presets repeatedly combine simulation framing, anti-impersonation, anti-omniscience, anti-drama or anti-melodrama, pacing control, dialogue/thought formatting rules, and response-length control. The best recent GLM-oriented presets also warn against prompt bloat and overthinking loops. That matches the current WorldForge constraint set: use preset practice, not invented theory.

The strongest planning recommendation is to treat this as an extraction-and-adaptation phase, not a blank-page writing phase. Pull the portable motifs out of the user's local Celia preset, the public Celia/Chatfill style presets, the Freaky archive summaries, and stop-slop heuristics. Normalize them into a WorldForge contract with a baseline block and a GLM overlay. Keep SillyTavern macros, jailbreak baggage, card placeholders, and UI-specific formatting out of runtime prompts.

**Primary recommendation:** Add one new preset-normalization seam that feeds `storyteller-contract.ts` and `prompt-assembler.ts`, then validate it with targeted unit tests plus a short live GLM smoke harness.

## Project Constraints (from CLAUDE.md)

- Keep the LLM as narrator only; engine truth remains deterministic.
- Use the existing `ai` SDK model call path, not raw fetch-based provider clients.
- Keep TypeScript strict and ES modules.
- Use Zod for any new schema or settings fields.
- Use Drizzle query builder, not raw SQL.
- Shared settings/types belong in `@worldforge/shared`; do not duplicate them in backend-only types.
- Backend route/schema conventions matter if settings or test endpoints change: outer try/catch, `parseBody()`, and `getErrorStatus(error)`.
- Research for this phase must not recommend moving gameplay truth into prompt logic.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Repo storyteller pipeline (`backend/src/engine/turn-processor.ts`, `prompt-assembler.ts`, `storyteller-contract.ts`) | repo HEAD | Hidden pass, final visible pass, and contract injection | This is already the authoritative storyteller runtime seam. |
| `ai` | 6.0.106 (installed) | `streamText()` / `generateText()` model orchestration | Already used for both hidden and final narration passes. |
| `@worldforge/shared` | workspace HEAD | Shared storyteller settings contract | Any new preset mode or minimal sampler field must land here first. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 (installed) | Validate any new storyteller settings surface | Use only if Phase 47 adds minimal new settings fields. |
| `vitest` | 3.2.4 (installed) | Contract, prompt assembly, and turn-processor regression tests | Use for all Phase 47 automated coverage. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Repo-local preset extraction | Directly importing SillyTavern JSON/macros at runtime | Faster to prototype, but drags in frontend-specific baggage and unstable macro syntax. |
| Prompt-first quality improvement | Full rewrite or prose post-processor | More control, but violates the user's preferred enforcement layer and risks truth drift. |
| Baseline + GLM overlay | Provider-by-provider preset trees | More tailored, but too fragmented for this phase and contradicts D-08. |

**Installation:**
```bash
# No new packages recommended for Phase 47.
```

**Version verification:** No new npm packages are recommended for this phase. Use the versions already pinned in this repo; registry verification is intentionally skipped because the phase should not adopt a new dependency stack.

## Suggested Plan Decomposition

1. **Preset extraction and decision pass**
   - Build a motif matrix from the user's local preset, public Celia/Chatfill presets, stop-slop heuristics, and Freaky archive notes.
   - Explicitly classify each motif as `portable`, `portable with rewrite`, or `reject`.

2. **Runtime contract refactor**
   - Add a new repo-local storyteller preset module that emits:
     - baseline world/RP rules
     - tone and pacing guidance
     - anti-slop guidance
     - GLM-specific overlay
   - Keep `storyteller-contract.ts` as the assembly seam instead of spreading strings across files.

3. **Prompt assembly integration**
   - Inject the new baseline and GLM overlay into both hidden and final-visible passes.
   - Add response-length and scene-mode guidance only where WorldForge can infer it from runtime state.

4. **Minimal settings surface**
   - Prefer one preset mode enum or one small "storyteller profile" setting over exposing many sampler knobs.
   - Only add extra sampler fields if live testing proves temperature alone is not enough.

5. **Optional light lint/retry**
   - Add a bounded final-visible lint for obvious slop signals only if first-pass prompt tuning still fails.
   - Retry once, with a tightened addendum, not a full rewrite pipeline.

6. **Verification**
   - Add unit tests for preset assembly and prompt integration.
   - Add one manual GLM smoke checklist for live scene quality across combat, quiet scene, and dialogue.

## Architecture Patterns

### Recommended Project Structure
```text
backend/src/engine/
├── storyteller-contract.ts      # Final contract assembly seam
├── storyteller-presets.ts       # New: normalized baseline + GLM overlay blocks
├── prompt-assembler.ts          # Injects bounded preset blocks into hidden/final passes
├── turn-processor.ts            # Optional light final-output lint/retry hook
└── __tests__/
    ├── storyteller-contract.test.ts
    ├── storyteller-presets.test.ts
    ├── prompt-assembler.test.ts
    └── turn-processor.test.ts

shared/src/
├── types.ts                     # Optional new storyteller profile fields
└── settings.ts                  # Defaults for any new minimal storyteller profile
```

### Pattern 1: Baseline + GLM Overlay
**What:** Keep one WorldForge storyteller baseline, then append a smaller GLM-specific overlay for instruction-following quirks and repetition control.
**When to use:** Always. This is the core planning shape for D-08 and D-09.
**Example:**
```ts
// Source: repo pattern adapted from storyteller-contract.ts + community preset practice
const contract = [
  buildWorldForgeBaseline(pass, sceneMode),
  provider.family === "glm" ? buildGlmOverlay(pass) : null,
  pass === "hidden-tool-driving" ? buildToolSupportRules() : null,
]
  .filter(Boolean)
  .join("\n\n");
```

### Pattern 2: Preset Motifs, Not Preset Macros
**What:** Translate community preset ideas into plain runtime rules. Do not import `{{setvar}}`, `<details>`, or card placeholders.
**When to use:** Any time a community preset contains useful intent but frontend-specific syntax.
**Example:**
```ts
// Source: local Celia preset + Chatfill preset, normalized into repo-local prose rules
const antiSlopRules = [
  "Use concrete nouns and strong verbs.",
  "Do not re-process the same emotional beat twice.",
  "Keep knowledge bounded to witnessed or communicated facts.",
  "Prefer slow-burn scene motion over melodramatic inflation.",
];
```

### Pattern 3: Final-Visible Lint Only for Hard Failures
**What:** Detect only obvious output failures after the final narration pass: repeated opening sentence, bracket/header leak, or banned slop phrase clusters.
**When to use:** Only if prompt-only tuning still leaves frequent visible failures.
**Example:**
```ts
// Source: sanitizeNarrative() seam in turn-processor.ts, extended narrowly
if (looksSloppy(finalText)) {
  finalText = await retryFinalNarrationWithTighterRules();
}
```

### Anti-Patterns to Avoid
- **Monolithic imported preset:** Do not paste a 50-block SillyTavern preset into the runtime contract.
- **Heavy rewrite stack:** Do not rewrite every final narration through a second LLM or a large regex normalizer.
- **Provider explosion:** Do not create one preset per provider when the user explicitly wants baseline + GLM overlay.
- **Preset cargo culting:** Do not copy jailbreak, censorship-bypass, or card-specific content that is unrelated to RP quality.
- **Sampler UI creep:** Do not expose ten new knobs unless live evidence shows they are needed.

## Concrete Recommendations

### Use these preset-derived motifs

1. **Simulation framing over "be vivid" fluff**
   - Community presets repeatedly frame the model as a simulator of scene, characters, and consequences rather than a generic atmospheric narrator.
   - For WorldForge, this should become "simulate the settled scene truth in prose" rather than "write vivid narration."

2. **Anti-impersonation stays explicit**
   - Chatfill and Celia-style presets keep a hard rule against writing the user's side.
   - WorldForge already enforces engine truth; Phase 47 should keep an explicit player-agency boundary in the visible narration contract.

3. **Anti-omniscience belongs in the preset layer too**
   - Local Celia and recent community presets repeatedly add explicit knowledge-boundary rules.
   - WorldForge already has runtime encounter-scope rules from Phase 46. Phase 47 should reinforce those rules in prose-oriented wording, not invent new knowledge logic.

4. **Use anti-drama and anti-perfection as counterweights**
   - The local preset repeatedly uses anti-drama, anti-perfection, less-dramaticization, anti-robot, anti-repetition, and enhanced anti-echo blocks.
   - These should become short, specific WorldForge rules like:
     - no scene restarts
     - no repeated realization beats
     - no melodramatic inflation unless the scene actually warrants it
     - failure and awkwardness remain allowed

5. **Keep response length bounded on purpose**
   - Community presets almost always set explicit length bands.
   - WorldForge should not let the storyteller drift arbitrarily long. Prefer one or two runtime-controlled bands such as `compact`, `standard`, and maybe `expanded`, with `standard` as default.

6. **Dialogue and thought rules should be scene-appropriate, not globally decorative**
   - Community presets frequently push thoughts, more dialogue, subtitles, visual props, and style containers.
   - WorldForge should only port the useful part: make dialogue sound spoken, keep internal thought limited, and do not force decorative formatting into every scene.

### Reject or heavily rewrite these motifs

1. **Jailbreak and content-safety bypass prompt blocks**
   - The user's local preset contains GLM safety-bypass text. This is not a writing-quality feature and should not be imported into the runtime contract.

2. **Frontend macro systems**
   - `{{setvar}}`, XML wrappers used only for display, hidden-block helpers, and regex post-formatting are SillyTavern frontend constructs, not backend storytelling logic.

3. **Model-persona framing**
   - "You are Celia" style preset identity is useful in a chat frontend but wrong for WorldForge's storyteller role. Keep the useful writing rules, not the persona shell.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anti-slop style control | A brand-new abstract prose doctrine | Extracted rules from stop-slop + proven RP presets | The user explicitly rejected invented style theory. |
| Quality rescue | A mandatory second-pass rewrite LLM | First-pass contract tuning plus optional one-shot lint/retry | Heavy rewrite stacks are slow, opaque, and can drift from runtime truth. |
| Provider tuning | A provider-specific preset forest | One baseline plus GLM overlay | Matches D-08 and reduces maintenance. |
| Preset portability | A SillyTavern macro interpreter | Repo-local normalized prompt blocks | ST macro baggage does not belong in backend runtime. |
| Scene quality enforcement | Regex-only prose rewriting | Scene-aware contract plus narrow failure detection | Most quality failures here are causal or pacing failures, not just wording patterns. |

**Key insight:** Community presets work because they stack a few clear controls around scene truth, agency, knowledge, pacing, and repetition. They do not work because they perform giant hidden rewrites after the fact.

## Common Pitfalls

### Pitfall 1: Prompt Bloat Eats GLM Attention
**What goes wrong:** GLM quality improves at first, then collapses into ignored instructions, bland prose, or broken role boundaries when the contract gets too long.
**Why it happens:** Community GLM users repeatedly report attention loss with large prompt/context loads, and recent preset authors responded by creating lighter "Bolt" variants.
**How to avoid:** Keep the WorldForge baseline short, move scene facts into existing structured sections, and keep the GLM overlay small and targeted.
**Warning signs:** Good quality in short scenes, but worse quality once lore, conversation, and scene context grow.

### Pitfall 2: Anti-Slop Rules Flatten the Output
**What goes wrong:** The prose stops sounding purple, but also stops sounding alive.
**Why it happens:** Over-aggressive anti-drama or anti-robot rules can suppress emotional contrast and scene texture.
**How to avoid:** Use anti-slop as a negative filter plus pacing guidance, not as an instruction to strip all mood.
**Warning signs:** Narration becomes flat, report-like, or emotionally colorless.

### Pitfall 3: Hidden and Visible Passes Drift
**What goes wrong:** The hidden pass resolves one tone or emphasis, and the final visible pass writes like a different system.
**Why it happens:** Phase 45 split the passes correctly, but Phase 47 could accidentally tune only one of them.
**How to avoid:** Build the preset layer once, then emit pass-specific variants from the same source module.
**Warning signs:** Final narration ignores the same scene priorities that the hidden pass used for tools and settlement.

### Pitfall 4: Preset Cargo Culting Imports Wrong Layers
**What goes wrong:** The runtime inherits ST placeholders, persona shell text, safety bypasses, or formatting gimmicks that do not belong in WorldForge.
**Why it happens:** Community presets bundle writing rules, frontend wiring, persona framing, and moderation workarounds together.
**How to avoid:** Classify each imported motif before coding: portable, rewrite, reject.
**Warning signs:** Contract text references `{{char}}`, `{{user}}`, or frontend-only markers.

### Pitfall 5: Sampler Knobs Expand Faster Than Evidence
**What goes wrong:** The phase adds many settings without proving which ones actually matter for GLM-5 in this runtime.
**Why it happens:** Preset communities often tune many knobs at once, making causality unclear.
**How to avoid:** Start with current temperature plus maybe one extra profile or one extra knob only if live testing proves it matters.
**Warning signs:** Settings UI/schema grows, but quality gains are still anecdotal.

## Code Examples

Verified patterns from repo seams and researched presets:

### Contract Assembly at One Authoritative Seam
```ts
// Source: backend/src/engine/storyteller-contract.ts + Phase 47 recommendation
export function buildStorytellerContract(pass: StorytellerPass, family: "baseline" | "glm") {
  return [
    buildBaselineRpRules(pass),
    family === "glm" ? buildGlmOverlay(pass) : null,
    pass === "hidden-tool-driving" ? buildToolRules() : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

### Bounded Final-Pass Quality Guard
```ts
// Source: backend/src/engine/turn-processor.ts sanitization seam, extended narrowly
if (hasNarrativeLeak(text) || repeatsLead(text) || hitsBannedSlopCluster(text)) {
  text = await regenerateFinalVisiblePass({ tighten: true });
}
```

### Portable Preset Motif Translation
```ts
// Source: local Celia preset, Chatfill preset, stop-slop references
const visiblePassRules = [
  "Advance the scene every paragraph.",
  "Do not repeat an emotional realization once it has landed.",
  "Keep knowledge limited to what the player can perceive here.",
  "Prefer concrete action, dialogue, and consequence over inflated commentary.",
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic "vivid atmospheric narrator" prompt | Simulation-first RP contract with explicit pacing, agency, and knowledge controls | 2025-2026 preset practice | Better scene discipline and less assistant-like prose. |
| One-tone literary output | Scene-adaptive overlays such as everyday tone, realism, anti-drama, and slow-burn pacing | 2026 community presets | Better fit across combat, dialogue, horror, and quiet scenes. |
| Large monolithic preset blobs | Lighter baseline plus smaller model-specific overlays or "Bolt" variants | March 2026 community shift | Helps GLM/Kimi-style models hold instructions under token pressure. |

**Deprecated/outdated:**
- Generic prose inflation as quality signal: recent preset authors now treat repetition, melodrama, and omniscience as bugs, not strengths.
- Card/frontend macro cargo culting: useful in SillyTavern authoring, but not appropriate as backend runtime contract text.
- Legacy plain `callStoryteller()` prompt shape in `backend/src/ai/storyteller.ts`: too generic for this phase and not the authoritative gameplay seam anymore.

## Open Questions

1. **Should Phase 47 add only a preset/profile enum, or also one extra sampler knob?**
   - What we know: current settings expose only `temperature` and `maxTokens` for storyteller; community presets often tune more.
   - What's unclear: whether GLM-5.1 quality gains in WorldForge actually require `top_p` or repetition penalty exposure.
   - Recommendation: plan for a profile enum first; only add sampler fields after live evidence.

2. **Does final-visible output still need a lint/retry after contract cleanup?**
   - What we know: the repo already sanitizes leaked headers and collapses repeated narration blocks.
   - What's unclear: whether those two guards plus better prompts are enough for GLM-5.1.
   - Recommendation: plan the lint/retry as optional scope, behind evidence from manual smoke.

3. **How should scene mode be inferred for adaptive style?**
   - What we know: the user wants adaptive prose by scene type, not one voice.
   - What's unclear: whether scene mode should derive from Oracle outcome, scene effects, explicit tool calls, or only local context tags.
   - Recommendation: infer conservatively from runtime facts already assembled, not from a second classifier if avoidable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tests, scripts, local backend | ✓ | v23.11.0 | — |
| npm | Workspace scripts and Vitest runs | ✓ | 11.12.1 | — |
| GLM storyteller provider config | Live Phase 47 smoke validation | ✓ | `GLM-5.1` configured in `settings.json` | Fallback model configured as `GLM-5` |
| External API reachability | Live model validation | Unknown | — | Use unit tests plus offline prompt-contract verification if the API is unavailable |

**Missing dependencies with no fallback:**
- None verified at research time.

**Missing dependencies with fallback:**
- Live external model availability was not probed end-to-end. If the GLM API is unavailable during execution, planner should fall back to unit tests and defer live prose validation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix backend run test -- src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` |
| Full suite command | `npm --prefix backend run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRIT-01 | Storyteller contract emits baseline rules plus pass-specific rules without regressing truth/tool constraints | unit | `npm --prefix backend run test -- src/engine/__tests__/storyteller-contract.test.ts` | ✅ |
| WRIT-01 | Prompt assembly carries the new preset layer into hidden and final-visible narration contexts | unit | `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts` | ✅ |
| WRIT-01 | Final visible narration still respects settlement order, sanitization, and bounded retries if added | unit | `npm --prefix backend run test -- src/engine/__tests__/turn-processor.test.ts` | ✅ |
| WRIT-01 | Live prose is materially less purple, less repetitive, and less AI-smelling across scene types on GLM-5.1 | manual smoke | `—` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix backend run test -- src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts`
- **Per wave merge:** `npm --prefix backend run test`
- **Phase gate:** Unit tests green plus a short live GLM smoke across at least dialogue, combat, and quiet scene narration before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/engine/__tests__/storyteller-presets.test.ts` - covers baseline vs GLM overlay extraction and portable motif mapping
- [ ] `backend/src/engine/__tests__/turn-processor.story-quality.test.ts` - covers light lint/retry behavior if Phase 47 adds it
- [ ] Phase-local manual smoke checklist artifact - compares before/after narration quality on the live GLM storyteller model

## Sources

### Primary (HIGH confidence)
- Repo runtime seams:
  - `backend/src/engine/turn-processor.ts`
  - `backend/src/engine/prompt-assembler.ts`
  - `backend/src/engine/storyteller-contract.ts`
  - `backend/src/ai/provider-registry.ts`
  - `backend/src/settings/manager.ts`
  - `backend/src/worldgen/scaffold-steps/prompt-utils.ts`
- Repo tests:
  - `backend/src/engine/__tests__/storyteller-contract.test.ts`
  - `backend/src/engine/__tests__/prompt-assembler.test.ts`
  - `backend/src/engine/__tests__/turn-processor.test.ts`
- Local preset reference: `X:\Models\templates\RE (´｡• ᵕ •｡`) Celia Custom.json`
- stop-slop references:
  - https://github.com/hardikpandya/stop-slop
  - https://raw.githubusercontent.com/hardikpandya/stop-slop/main/SKILL.md
  - https://raw.githubusercontent.com/hardikpandya/stop-slop/main/references/phrases.md
  - https://raw.githubusercontent.com/hardikpandya/stop-slop/main/references/structures.md
  - https://raw.githubusercontent.com/hardikpandya/stop-slop/main/references/examples.md
- SillyTavern docs:
  - https://docs.sillytavern.app/usage/core-concepts/instructmode/

### Secondary (MEDIUM confidence)
- Freaky archive summary page: https://rentry.org/freaky-frankenstein-presets
- Public Celia preset download page: https://leafcanfly.neocities.org/presets
- Public Celia preset JSON: https://leafcanfly.neocities.org/RE%20(%C2%B4%EF%BD%A1%E2%80%A2%20%E1%B5%95%20%E2%80%A2%EF%BD%A1%60)%20Celia%20V5.4.json
- Public Chatfill preset JSON mirror: https://files.catbox.moe/e5xq0f.json

### Tertiary (LOW confidence)
- Reddit: Celia Preset 5.3 discussion, including "reasoning on Auto" and "don't use COT for GLM" notes
  - https://www.reddit.com/r/SillyTavernAI/comments/1rm95rf/celia_preset_53/
- Reddit: "What happened to GLM 5?" context-sensitivity discussion
  - https://www.reddit.com/r/SillyTavernAI/comments/1rpeb8y/what_happened_to_glm_5/
- Reddit: Stab's Directives v2.5 preset release tuned for GLM5
  - https://www.reddit.com/r/SillyTavernAI/comments/1rzz6l5/stabs_directives_v25_preset_release_tuned_for_glm5/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - the repo seams and installed tooling are explicit.
- Architecture: MEDIUM - repo seams are clear, but the best GLM-specific overlay size still needs live validation.
- Pitfalls: MEDIUM - prompt-bloat and GLM behavior warnings are consistent across community sources, but still partly anecdotal.

**Research date:** 2026-04-12
**Valid until:** 2026-04-19
