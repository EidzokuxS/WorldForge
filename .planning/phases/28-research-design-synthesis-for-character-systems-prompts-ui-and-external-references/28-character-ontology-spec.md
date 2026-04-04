# Phase 28 Character Ontology Specification

## Goal

Define one canonical character model that serves player creation, NPC generation, review editing, save/load, and prompt consumption. Player and NPC are role attributes on the same ontology, not separate mental models.

## Player and NPC

### Core position

- Every major character uses one canonical `CharacterRecord`.
- `role` distinguishes protagonist-facing flow from NPC-facing flow.
- `tier` distinguishes runtime/world importance (`temporary`, `supporting`, `persistent`, `key`) without redefining the rest of the model.
- Prompt, UI, and persistence layers consume the same field groups, then apply role-specific visibility and workflow rules.

### Canonical top-level groups

1. `identity`
2. `profile`
3. `socialContext`
4. `motivations`
5. `capabilities`
6. `state`
7. `loadout`
8. `startConditions`
9. `provenance`

## Source of Truth

### Authoritative persisted field groups

| Group | Purpose | Example fields |
| --- | --- | --- |
| `identity` | Stable identity and classification | `id`, `campaignId`, `role`, `tier`, `displayName`, `canonicalStatus` |
| `profile` | Character facts that should not be reconstructed from tags | `species`, `gender`, `ageText`, `appearance`, `backgroundSummary`, `personaSummary` |
| `socialContext` | Place in the world | `factionId`, `homeLocationId`, `currentLocationId`, `relationships`, `socialStatus`, `originMode` |
| `motivations` | Drives and internal state | `shortTermGoals`, `longTermGoals`, `beliefs`, `drives`, `frictions` |
| `capabilities` | Structured traits that explain what the character can do | `traits`, `skills`, `flaws`, `specialties`, `wealthTier` |
| `state` | Mutable runtime condition | `hp`, `conditions`, `statusFlags`, `activityState` |
| `loadout` | What the character starts with and what is actively equipped | `inventorySeed`, `equippedItemRefs`, `currencyNotes`, `signatureItems` |
| `startConditions` | Structured arrival scenario | see Start Conditions section |
| `provenance` | Where this record came from | `sourceKind`, `importMode`, `templateId`, `archetypePrompt`, `worldgenOrigin` |

### Persistence rule

- These groups are the canonical authored facts.
- Prompt families, runtime helper views, and editing UIs must read from them instead of inferring primary meaning from tag arrays.
- Flat tags may remain in storage only as generated caches or compatibility shims during migration, not as the long-term authoring source.

## Derived Runtime Tags

### Purpose

Derived runtime tags remain useful for:

- tool prompts that still expect compact labels
- quick filter/search surfaces
- compatibility with existing mechanics that currently read tag strings
- backwards migration during Phase 29

### Allowed derivation sources

Derived tags are generated from authoritative groups only:

- `capabilities.traits`, `skills`, `flaws`
- `state.conditions`
- `socialContext.socialStatus` or faction alignment
- `capabilities.wealthTier`
- limited `profile` or `motivations` facts when a prompt/tool explicitly needs them

### Guardrails

- Runtime tags are snapshots, not edit surfaces.
- No user-facing editor should ask downstream phases to hand-maintain both structured fields and flat tags.
- Any derived tag must point back to one canonical field or rule, so migrations and prompt rewrites stay deterministic.

## Field Groups

### Identity

- `id`
- `campaignId`
- `role`: `player | npc`
- `tier`: `temporary | supporting | persistent | key`
- `displayName`
- `canonicalStatus`: `original | imported | known_ip_canonical | known_ip_diverged`

### Profile

- `species`
- `gender`
- `ageText`
- `appearance`
- `backgroundSummary`
- `personaSummary`

Rationale:

- Preserve profile parity across protagonists and NPCs.
- Keep `personaSummary` as a concise authored field instead of letting only NPCs own persona semantics.

### Social Context

- `currentLocationId`
- `homeLocationId`
- `factionId`
- `relationshipRefs`
- `originMode`: replaces the current import-only idea of native vs outsider with a reusable cross-flow field
- `socialStatus`

### Motivations

- `shortTermGoals`
- `longTermGoals`
- `beliefs`
- `drives`
- `frictions`

Rationale:

- Give protagonists and NPCs the same motivation grammar.
- Preserve the richer NPC goal/belief model instead of flattening everything down to player tags.

### Capabilities

- `traits`
- `skills`
- `flaws`
- `specialties`
- `wealthTier`

Rationale:

- Replace one undifferentiated tag pile with explicit buckets.
- Preserve the existing tier-based wealth/skill logic, but source it from structured fields first.

### State

- `hp`
- `conditions`
- `activityState`
- `statusFlags`

Rationale:

- Keep mutable gameplay condition separate from authored identity and profile.
- Allow future prompt/UI changes to reason about start injuries, disguise state, escort state, debt pressure, or bounty status without abusing free-form tags.

## Start Conditions

### Structured persisted object

`startConditions` is required for protagonists and available for NPCs/worldgen when relevant.

Suggested subfields:

| Field | Meaning |
| --- | --- |
| `startLocationId` | Chosen resolved starting location |
| `arrivalMode` | How the character enters: resident, arrival, return, exile, undercover, prisoner, escort, survivor, etc. |
| `immediateSituation` | Short factual summary of what is happening right now |
| `entryPressure` | Structured pressure list such as debt, injury, pursuit, deadline, mission, escort, shortage |
| `companions` | Named or typed companions arriving with the character |
| `startingVisibility` | Public, discreet, disguised, hidden, notorious |
| `resolvedNarrative` | Human-readable summary generated for UI/prompt reuse |
| `sourcePrompt` | Original player-entered setup text or generation seed |

### Rules

- `startLocationId` replaces loose `locationName` as the persisted anchor.
- The full object survives save/load and is available to prompt assembly.
- Start conditions influence loadout, opening scene framing, and initial world review, rather than disappearing after location resolution.

## Loadout

### Canonical loadout rules

- Items are first-class entities in the `items` table.
- `loadout` defines intended starting inventory and active equipment state, then materializes item entities at save time.
- `equippedItemRefs` points to item ids or deterministic pre-save item keys, not loose display strings as the long-term source of truth.
- `signatureItems` may remain a lightweight authored summary for prompt/UI display, but it must map to materialized items.

### Migration implication

- Existing `players.equippedItems` becomes a compatibility seam, not the future canonical surface.
- NPCs receive the same loadout grammar even if many NPCs default to empty or minimal equipment.

## Persona

### One draft pipeline

All authoring paths must converge into a shared `CharacterDraft` pipeline before persistence:

1. free-text parse
2. AI generation
3. archetype research
4. V2 import
5. persona template selection
6. worldgen NPC creation

### Draft inputs

- `templateId` or inline template payload
- `archetypeResearch`
- `importMode`
- `originMode`
- `franchise/world context`
- optional user-provided overrides

### Draft outputs

- populated field groups from this ontology
- derived runtime tags generated from those field groups
- unresolved warnings for missing location/faction/template matches when needed

## Unresolved Migration Risks

## Risks

### Storage and compatibility

- Existing saves split player profile, NPC motivation, and inventory semantics across different tables and JSON formats.
- Runtime systems still read `players.tags`, `npcs.tags`, and JSON-encoded goal/belief fields directly.

### Review/editor migration

- World review currently edits scaffold NPCs by name-based references and a reduced field set.
- Character creation currently assumes a player-only sheet and a transient start-resolution flow.

### Runtime contract drift

- Prompt assembler, NPC agent, reflection tools, and worldgen all consume different slices of character meaning.
- Phase 29 must migrate those readers carefully so runtime behavior does not regress while the compatibility layer is still active.

## Immediate Implementation Consequences for Phases 29-30

- Phase 29 owns the canonical record shape, storage seam, derivation rules, and prompt/runtime readers that must swap to it.
- Phase 30 layers scenario-aware `startConditions`, canonical loadout materialization, and reusable persona templates on top of the shared draft pipeline.
- Neither phase should reintroduce player-vs-NPC ontology drift once the shared record exists.
