# Phase 62: Advanced Character Inspector Complement Redesign — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** Inline brief (equivalent to PRD Express Path)

<domain>
## Phase Boundary

Rework the Advanced panel (`CharacterRecordInspector`) in the world-review NPC tab so it is strictly complementary to the basic NPC card. Today Advanced duplicates name/persona/location/faction/PowerStats/goals from basic, which masks the unique fields a user needs to understand what the LLM sees when playing this NPC (biography, behavioralCore, liveDynamics delta, capabilities, runtime state, loadout, starting conditions, provenance).

Basic NPC card remains the single source of truth for:
- Tier (Key/Supporting)
- Display name
- Persona summary (`profile.personaSummary`)
- Tags (`ScaffoldNpc.tags`)
- Power Stats (table + hax + vulnerabilities)
- Objectives (short-term + long-term goals)
- Location + Faction (footer)

Advanced becomes the complement: **everything else from `CharacterDraft` the LLM actually uses**, with zero overlap.

Out of scope (explicitly):
- Player `CharacterCard` (`frontend/components/character-creation/character-card.tsx`) — separate component without an Advanced toggle; not touched.
- Basic NPC card markup (`npcs-section.tsx` card body) — not touched.
- Any backend changes.
- Any schema changes (`CharacterDraft`, `ScaffoldNpc`).

</domain>

<decisions>
## Implementation Decisions

### Advanced Section Order (Locked)

The Advanced panel MUST render sections in this exact order, each rendered only when it has at least one non-empty field:

1. **Overview** — badges only. Badge field paths (EXACT): `identity.canonicalStatus`, `provenance.sourceKind`, `provenance.importMode`, `provenance.worldgenOrigin`. Use dedupeStrings to drop null/empty values. NOT `socialContext.originMode`. Plus Biography text (`identity.baseFacts.biography`). No display name, no location, no faction, no persona summary.
2. **Identity Core** — self image, social roles, motives, pressure responses, taboos, attachments, hard constraints, socialStatus (from `socialContext.socialStatus`), relationshipRefs (from `socialContext.relationshipRefs`).
3. **Profile** — species, gender, ageText, appearance, backgroundSummary.
4. **Live Dynamics** (without goals) — belief drift, current strains, earned changes, beliefs (from `motivations.beliefs`), drives (from `motivations.drives`), frictions (from `motivations.frictions`). No `activeGoals` / `shortTermGoals` / `longTermGoals` — those live in basic Objectives.
5. **Capabilities** — traits, skills, specialties, flaws, wealthTier.
6. **Runtime & State** — hp, activityState, conditions, statusFlags.
7. **Loadout** — inventorySeed, equippedItemRefs, signatureItems, currencyNotes.
8. **Starting Conditions** — sourcePrompt, arrivalMode, startLocationId, immediateSituation, entryPressure, companions, startingVisibility, resolvedNarrative.
9. **Provenance** — sourceKind, importMode, templateId, archetypePrompt, worldgenOrigin, legacyTags.
10. **Raw JSON** — full `CharacterDraft` JSON (diagnostic tail, unchanged from current).

### Removed From Advanced (Locked)

These MUST NOT appear anywhere in the Advanced panel:
- `identity.displayName` (duplicate of basic name).
- `socialContext.currentLocationName` / `socialContext.factionName` (duplicate of basic footer).
- `profile.personaSummary` (duplicate of basic Persona textarea).
- `powerStats.*` table, `powerStats.hax`, `powerStats.vulnerabilities` (duplicate of basic Power Stats section).
- `identity.liveDynamics.activeGoals`, `motivations.shortTermGoals`, `motivations.longTermGoals` when rendering Live Dynamics (duplicate of basic Objectives).

### Empty-State Rules (Locked)

- A section with every candidate field empty MUST NOT render at all (no empty section headers).
- A string field is empty when `!value || !value.trim()`.
- A list field is empty when `!list || list.length === 0`, OR every entry is empty string after trim (normalized-list semantics — the helper MUST trim before length-checking entries).
- **Invariant-only sections** are sections whose only populated fields are required enum/number fields that every valid `CharacterDraft` always has: `identity.canonicalStatus`, `provenance.sourceKind`, `state.hp`, `state.activityState`. When such a section has ZERO additional populated fields (no biography, no behavioral data, no loadout items, etc.), the section is considered **non-informative** and is suppressed from the panel AND does not count toward `hasAnyComplementSection`.
- `hasAnyComplementSection` is true iff at least one section has at least one populated field BEYOND the invariant-only set listed above.
- If `hasAnyComplementSection` is false, the panel body renders a single fail-closed notice `No additional data` and the Raw JSON tail is still rendered. This fallback is reachable for a skeletal-but-valid draft (e.g. freshly-minted NPC with no behavioral core / no loadout / no starting conditions).
- If the draft object is null, render the existing "No character data to inspect" placeholder (unchanged from current behavior).

### Component API (Locked)

- `CharacterRecordInspector` props remain unchanged (`draft: CharacterDraft | null`, `characterRecord: CharacterRecord | null`).
- Existing subcomponents (`Section`, `TextBlock`, `ListBlock`, `MetaGrid`, `Badge`) are reused — no new layout primitives.
- `PowerStatsSection` import MUST be removed from the inspector (section is not rendered there any more).
- The outer `<details><summary>Advanced</summary>` wrapper is preserved — the panel remains collapsed by default.

### Visual Style (Locked)

- Keep existing hybrid-950/900/800 charcoal palette, font-mono uppercase section headers, `tracking-[0.14em]` cadence.
- Section container spacing unchanged (`space-y-4 rounded-xl border ...`).
- No new colors, no new typography tokens, no new icons.

### Claude's Discretion

- How to assemble section "emptiness" checks (single `hasFields()` helper vs inline ternaries) — planner may pick the cleaner option.
- Internal ordering of fields inside a section (e.g. Identity Core social roles before motives vs after) — keep current implementation's order unless it contradicts a locked decision above.
- Whether to extract new small helpers (e.g. `renderFieldBlock`, `renderBadgeRow`) — discretion as long as no net-new public exports escape the file.
- Test fixture shape — as long as tests cover every locked decision (removed duplicates + added sections + empty-state fallback).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Inspector (the file being rewritten)
- `frontend/components/world-review/character-record-inspector.tsx` — current Advanced implementation with duplicated sections.
- `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` — current test coverage; must be rewritten to match new section contract.

### Basic NPC card (the source of truth for "what is already shown")
- `frontend/components/world-review/npcs-section.tsx` — basic card markup (name, persona, tags, Power Stats, objectives, location, faction footer). Inspector is embedded at `~line 585`.

### Character shape
- `shared/src/types.ts` — `CharacterDraft`, `CharacterRecord`, `PowerStats`, `CharacterIdentityDraft`, `CharacterProfileDraft`, `CharacterSocialContextDraft`, `CharacterMotivationsDraft`, `CharacterCapabilitiesDraft`, `CharacterStateDraft`, `CharacterLoadoutDraft`, `CharacterStartConditionsDraft`, `CharacterProvenanceDraft`. Contains every field referenced in the locked section list.
- `frontend/components/world-review/npcs-helpers.ts` (if present, otherwise inline in `npcs-section.tsx`) — `scaffoldNpcToDraft` converter used to feed the inspector.

### Reused subcomponents
- `frontend/components/character-creation/power-stats-section.tsx` — `PowerStatsSection`. Import is removed from inspector (kept for basic card usage).
- `frontend/components/world-review/character-record-inspector.tsx` internal: `Section`, `TextBlock`, `ListBlock`, `MetaGrid`. Reused unchanged.

### Project rules
- `CLAUDE.md` (project root) — TypeScript strict, Tailwind, Shadcn, Next.js App Router conventions.
- `~/.claude/rules/coding-style.md` — immutability, small files, no mutation.
- `~/.claude/rules/testing.md` — 80%+ coverage, unit tests first.
- Memory `feedback_no_ip_in_prompts.md` — fixtures MUST NOT use Naruto/Sasuke/Uchiha/Sharingan or other real-IP names; use original-world names only.

</canonical_refs>

<specifics>
## Specific Ideas

### Duplicate Removal Map

| Field in basic card | Where in Advanced today | Action |
|---------------------|-------------------------|--------|
| Display name | Overview `MetaGrid.label="Display name"` | DELETE |
| Current location | Overview `MetaGrid.label="Current location"` | DELETE |
| Faction | Overview `MetaGrid.label="Faction"` | DELETE |
| Persona summary | Overview `<TextBlock label="Persona" value={profile.personaSummary} />` | DELETE |
| Power Stats table + hax + vulnerabilities | `<Section title="Power Stats"><PowerStatsSection .../></Section>` | DELETE ENTIRE SECTION |
| Short/long-term goals | Live Dynamics `ListBlock label="Active goals"` + `label="Long-term goals"` | DELETE the two list rows; keep remaining live dynamics |

### Added Fields Map (new coverage)

| Field | Source | Advanced section |
|-------|--------|------------------|
| Biography | `identity.baseFacts.biography` | Overview (below badges) |
| Species | `profile.species` | Profile |
| Gender | `profile.gender` | Profile |
| Age text | `profile.ageText` | Profile |
| Appearance | `profile.appearance` | Profile |
| Background summary | `profile.backgroundSummary` | Profile |
| Currency notes | `loadout.currencyNotes` | Loadout |
| Start location ID | `startConditions.startLocationId` | Starting Conditions |
| Arrival mode | `startConditions.arrivalMode` | Starting Conditions |
| Entry pressure | `startConditions.entryPressure` | Starting Conditions |
| Companions | `startConditions.companions` | Starting Conditions |
| Starting visibility | `startConditions.startingVisibility` | Starting Conditions |
| Resolved narrative | `startConditions.resolvedNarrative` | Starting Conditions |
| Source prompt | `startConditions.sourcePrompt` | Starting Conditions |
| Immediate situation | `startConditions.immediateSituation` | Starting Conditions (already exists — moved to dedicated section) |
| HP | `state.hp` | Runtime & State (new line) |
| Activity state | `state.activityState` | Runtime & State (new line) |
| Source kind | `provenance.sourceKind` | Provenance (was previously only in badges) |
| Import mode | `provenance.importMode` | Provenance |
| Template ID | `provenance.templateId` | Provenance |
| Archetype prompt | `provenance.archetypePrompt` | Provenance |
| Worldgen origin | `provenance.worldgenOrigin` | Provenance |
| Legacy tags | `provenance.legacyTags` | Provenance |

### Test Coverage Checklist (every item MUST have a test case)

- Given a draft with all duplicate fields set, Advanced DOES NOT render "Display name", "Current location", "Faction", persona summary, power stats, short-term goals, long-term goals.
- Given a draft with `identity.baseFacts.biography`, Advanced renders it inside Overview.
- Given a draft with full profile fields, Advanced renders a Profile section with species/gender/age/appearance/backgroundSummary.
- Given a draft with belief drift / current strains / earned changes, Advanced renders Live Dynamics with those three rows and no goal rows.
- Given a draft with traits/skills/specialties/flaws/wealthTier, Advanced renders a Capabilities section.
- Given a draft with loadout fields, Advanced renders a Loadout section (including currencyNotes).
- Given a draft with starting conditions, Advanced renders a Starting Conditions section with every sub-field that is populated.
- Given a draft with provenance fields, Advanced renders a Provenance section with every populated subfield.
- Given an empty draft (no fields populated beyond role=key), Advanced shows `No additional data` (and Raw JSON only).
- Fixtures use original-world names (e.g. `Commander Kael`, `Dunespire Hold`, `Wind Cutting`), NOT any real-IP franchise names.

</specifics>

<deferred>
## Deferred Ideas

- Player `CharacterCard` Advanced toggle — not added in this phase; player card remains standalone.
- `lorebook`/`worldBookEntries` surfacing — not part of CharacterDraft, out of scope.
- NPC card basic layout reorganization — deferred; basic card markup is not touched.
- New icons / severity badges beyond existing hax/vulnerability subcomponents — not introduced.

</deferred>

---

*Phase: 62-advanced-character-inspector-complement-redesign*
*Context gathered: 2026-04-18 via inline brief*
