---
phase: 57
reviewers: [gemini, codex]
reviewed_at: "2026-04-15T23:15:00.000Z"
plans_reviewed: [57-01-PLAN.md, 57-02-PLAN.md, 57-03-PLAN.md, 57-04-PLAN.md]
---

# Cross-AI Plan Review — Phase 57

## Gemini Review

This review evaluates the implementation plans for **Phase 57: Power Scaling & Character Profile Redesign**.

### Summary
The plans provide a systematic and well-ordered transition from a decorative, text-heavy grounding system to a structured, engine-actionable power scaling framework based on VS Battles Wiki tiers. The transition follows a logical flow: establishing shared types and utilities (**Plan 01**), updating the generation pipeline (**Plan 02**), rewiring engine consumption and removing legacy continuity logic (**Plan 03**), and finally refreshing the user interface (**Plan 04**). The approach is surgical, effectively removing four bloated legacy types while maintaining backward compatibility through a runtime migration adapter.

### Strengths
* **Programmatic Authority:** Moving from parsing "City Level" strings to `compareTiers` and `canHaxBypass` logic is a major architectural win for engine reliability.
* **Runtime Migration Strategy:** Using `record-adapters.ts` to handle legacy records on-read avoids complex database migrations and ensures existing campaigns don't crash.
* **Type Safety:** The use of const arrays for tiers paired with `z.enum` and `indexOf` provides a robust, single source of truth for both validation and comparison.
* **Clean Separation of Concerns:** Successfully decouples "Character Identity" (personality/behavior) from "Character Continuity" (metadata policies), letting the LLM handle character essence more naturally.
* **UI De-cluttering:** Removing the SourceBundle and Continuity sections significantly cleans up the Inspector, focusing the user on actionable gameplay data.

### Concerns
* **MEDIUM: Migration "Power-Down":** The `migrateGroundingToPowerStats` function defaults all old records to "Human 5". While safe, it will result in a jarring "power-down" for existing high-tier characters until they are regenerated.
* **LOW: Loss of "Range":** The old `PowerProfile` included a `range` field. The new `PowerStats` axes do not explicitly include Range. While Hax can cover some of this, a distinct "Range" axis is often critical in power scaling comparisons.
* **LOW: Rank Granularity:** Risk of LLM "middle-muddling" (defaulting to 5 for everything). Plan 02's prompt mapping helps, but verification should ensure the LLM actually utilizes the 1-10 range effectively.

### Suggestions
* **Heuristic Migration:** In `migrateGroundingToPowerStats`, consider keyword checks on old `PowerProfile.attack` string to preserve relative power for existing campaigns.
* **Consider a "Range" Axis:** Add range to `PowerStats` to avoid losing data.
* **Standardize Rank Mappings:** Explicitly define in LLM prompts that `High` = 8-10, `Mid` = 4-7, and `Low` = 1-3.
* **Hax Bypass Validation:** Ensure `canHaxBypass` is exposed as a hint to the Oracle during combat/conflict resolution.

### Risk Assessment: LOW
The biggest risk is the "power-down" of existing characters, which is a behavioral regression rather than a system failure.

---

## Codex Review

### Summary
The plan set is structurally solid as a four-step rewrite: foundation/types, producers, consumers, then UI. It will likely succeed at removing most of the old grounding/continuity machinery. The gap is that it is stronger on "power scaling rewrite" than on "character profile redesign." It does not yet prove that the redesigned profiles will preserve character essence, avoid data loss across all entry paths, or stay truthful during migration.

### Strengths
- Clean decomposition: types → producers → consumers → UI.
- Credible blast-radius analysis in RESEARCH.md.
- Disciplined out-of-scope boundaries.
- New PowerStats/HaxAbility model is actionable for the engine.
- Graceful no-data handling in UI and lookup flows.

### Concerns
- **HIGH: Early deletion breaks repo.** 57-01 deletes legacy files and removes old types, but downstream rewrites are in 57-02 and 57-03. Wave 1 likely leaves repo in broken intermediate state.
- **HIGH: Synthetic migration data.** Migrating old records to baseline "Human 5" is synthetic surrogate data — produces false comparisons, misleading UI, bad engine decisions. Wrong failure mode for this project.
- **HIGH: Profile redesign underplanned.** CONTEXT.md calls for compact personality, appearance, speech, stress behavior, V2 card essence preservation. Plans mostly remove old fields and add powerStats — no concrete redesign/mapping for profile surfaces.
- **HIGH: Tier normalization under-specified.** No canonical mapping table, normalization helper, or retry path for inevitable model outputs like "MHS+", "City level", "High 7-A". Strict enums alone will be brittle.
- **MEDIUM: Factual grounding replacement unclear.** If old grounding.summary/facts/abilities contained useful canon facts not duplicated elsewhere, removal may degrade roleplay fidelity.
- **MEDIUM: SC-7 mismatch.** Phase goal calls for power spider/radar, plan settles for table. Success criterion should match.
- **MEDIUM: Reflection thresholds are scope creep.** New 15/10/8 thresholds by tier is behavior redesign, not just continuity removal.
- **MEDIUM: Entry-path coverage incomplete.** No explicit matrix for: old campaign load, known-IP worldgen, archetype creation, V2 import, manual edit, save/load, UI readback, in-game compare.
- **LOW: Blocking manual gate.** Manual visual verification as blocking mid-phase is heavier than necessary.

### Suggestions
- Reorder: 57-01 should be additive first. Delay hard deletion until all consumers migrated and repo typechecks.
- Migration should fail closed: undefined powerStats + "No power assessment" instead of synthetic baseline.
- Add dedicated subtask for profile redesign (not just power): speech patterns, stress behavior, persona essence, V2 import richness.
- Add deterministic tier-normalization spec and helper.
- Add explicit route matrix / integration check for each entry path.
- Update SC-7 to "table initially, radar later" or add radar to phase.
- Keep reflection thresholds separate unless directly required.

### Risk Assessment: HIGH
Wide blast radius + migration fabricates false data + profile redesign underspecified. Drops to MEDIUM if ordering fixed, synthetic migration removed, and profile/route-matrix work added.

---

## Consensus Summary

### Agreed Strengths
- Clean 4-plan decomposition with logical wave ordering (both reviewers)
- Runtime migration adapter over schema migration is the right approach (both)
- New PowerStats/HaxAbility model is a major improvement over text-based fields (both)
- Good out-of-scope discipline (both)

### Agreed Concerns
1. **Migration produces false data** (Gemini MEDIUM, Codex HIGH) — defaulting old records to "Human 5" creates synthetic surrogate data. Both agree this is the wrong failure mode. **Recommendation: fail closed (undefined + "No power assessment") instead of synthetic baseline.**
2. **Character profile redesign is underplanned** (Codex HIGH) — plans focus on power scaling removal/replacement but don't specify where personality, speech, appearance, V2 card essence live after grounding removal. Gemini didn't flag this directly but noted the clean separation of identity from continuity.
3. **Tier normalization needs a spec** (Codex HIGH, Gemini implied via "middle-muddling") — LLM output won't always match strict enums. Need normalization helper + retry path.

### Divergent Views
- **Overall Risk:** Gemini says LOW, Codex says HIGH. Gemini focused on system stability (fail-closed philosophy protects). Codex focused on product correctness (false migration data + underspecified profile redesign). Both are valid — system won't crash but product quality may regress.
- **Range axis:** Gemini suggests adding it, Codex didn't mention. Low priority.
- **Deletion ordering:** Codex flags as HIGH (repo breaks between waves), Gemini didn't flag (assumed waves handle it). Worth investigating.
