# Phase 57: Power Scaling & Character Profile Redesign - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Source:** Live discussion with user (this session)

<domain>
## Phase Boundary

Replace the bloated character grounding/power/continuity system built by ChatGPT in phases 48-49 with a VS Battles Wiki-based power scaling system, compact character profiles, and structured hax abilities. This is a full redesign of how characters are represented, stored, and consumed by the engine.

The old system produced duplicate fields, decorative text-based power profiles, academic metadata dumps, and source citations nobody reads. The new system must be actionable for the engine, authentic for character roleplay, and readable for the player.

</domain>

<decisions>
## Implementation Decisions

### Power Scaling System
- Use **VS Battles Wiki** tier system as the standard (the fan community standard, most comprehensive)
- **5 axes**: Attack Potency, Speed, Durability, Intelligence, Hax
- **Format**: Condensed tier name + rank 1-10 within tier (e.g., "City 7", "Continental 3")
- AP/Durability tiers: Human → Street → Wall → Building → City Block → Town → City → Mountain → Island → Country → Continental → Moon → Planet → Star → Solar System → Galaxy → Universal → Multiversal+
- Speed tiers (own scale): Human → Superhuman → Subsonic → Supersonic → Hypersonic → Massively Hypersonic → Sub-Relativistic → Relativistic → FTL → MFTL → Infinite
- Intelligence tiers (qualitative): Average → Above Average → Gifted → Genius → Extraordinary Genius → Supergenius
- Sub-tiers from VS Battles (Low/High/+) map to 1-10 rank naturally
- Engine can compare `{tier: "City", rank: 8}` vs `{tier: "City", rank: 3}` programmatically

### Hax (Special Abilities)
- Structured list per character, NOT tiered
- Each ability: name, type (e.g., "Spatial Manipulation"), bypass tier (what durability it ignores), limitations
- Example: Gojo's Infinity = {name: "Infinity", type: "Spatial Manipulation", bypassTier: "Universal", limitations: ["Domain Expansion disables it", "requires concentration"]}
- This lets the engine determine: "character A has hax that bypasses character B's durability tier"

### Vulnerabilities
- Separate list per character
- Concrete, actionable (not vague "has weaknesses")

### Character Essence / Profile
- Goal: Gojo must BE Gojo, not "LLM playing Gojo"
- Compact but complete: personality, appearance, speech patterns, behavior under stress
- **NO duplication** — one field per concept, not biography + persona + grounding.summary saying the same thing
- V2 card imports already contain rich data — convert it properly, don't lose the essence
- Token budget: no hard limit, but every token must be justified. 2-4k per character is fine if all useful.

### What Gets REMOVED
- `CharacterGroundingProfile` — entirely. Its functions absorbed into proper fields (personality, power stats, hax)
- `PowerProfile` (old text-based attack/speed/durability/range strings) — replaced by new tier+rank system
- `SourceBundle` (canonSources, secondarySources, synthesis metadata) — removed. Research results are one-time-use.
- `ContinuityPolicy` (identityInertia, protectedCore, mutableSurface, changePressureNotes) — removed entirely. Judge role handles identity drift validation. LLM understands character flexibility from personality description.

### Counterweight System — NOT IN THIS PHASE
- WorldForge as meta-universal entity maintaining balance — future phase
- Characters keep full power but universe "resists" extreme imbalance — future phase
- Canonical limitations come from CHARACTER personality, not explicit constraint fields
- LLM + Judge arrive at narrative consequences naturally

### Global Character Database — NOT IN THIS PHASE
- Canonical characters stored globally (not per-campaign) — future phase
- Any creation path checks global DB first, googles only if not found — future phase
- Campaign instance = fork of canon — future phase

### Claude's Discretion
- Exact TypeScript type shapes for new PowerStats, HaxAbility, Vulnerability types
- How to migrate existing character records (schema migration vs runtime adapter)
- Frontend Advanced tab layout and visual spider/radar chart implementation
- Prompt format for injecting power stats into LLM context
- How grounded-lookup.ts handles cross-tier comparisons programmatically

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Shared Types
- `shared/src/types.ts` — Current CharacterGroundingProfile, PowerProfile, ContinuityPolicy, SourceBundle definitions (TO BE REPLACED)

### Backend Character System
- `backend/src/character/grounded-character-profile.ts` — Current grounding synthesis (TO BE REWRITTEN)
- `backend/src/character/archetype-researcher.ts` — Archetype grounding (ADAPT)
- `backend/src/character/known-ip-worldgen-research.ts` — Known-IP NPC enrichment (REWRITE)
- `backend/src/character/npc-generator.ts` — NPC generation (ADAPT)
- `backend/src/character/generator.ts` — Player character generation (ADAPT)

### Backend Routes
- `backend/src/routes/character.ts` — Character CRUD routes (ADAPT)
- `backend/src/routes/worldgen.ts` — Worldgen routes (ADAPT where character data flows)

### Engine Consumers
- `backend/src/engine/grounded-lookup.ts` — Character fact/power lookups during gameplay (REWRITE to use new power stats)
- `backend/src/engine/npc-agent.ts` — NPC agent prompts include continuity (REMOVE continuity, keep character data)
- `backend/src/engine/reflection-agent.ts` — Reflection prompts include continuity (REMOVE)
- `backend/src/engine/reflection-tools.ts` — Inertia enforcement (REMOVE)
- `backend/src/engine/prompt-assembler.ts` — Assembles character data for storyteller (ADAPT)

### Frontend Display
- `frontend/components/world-review/character-record-inspector.tsx` — Full character card (REDESIGN)
- `frontend/components/world-review/npcs-section.tsx` — NPC cards in world review (ADAPT)

### Database
- `backend/src/db/schema.ts` — characterRecord stored as JSON text blob (schema unchanged, content changes)

### Design Discussion Memory
- `~/.claude/projects/R--Projects-WorldForge/memory/project_power_profile_redesign.md` — Full discussion decisions

</canonical_refs>

<specifics>
## Specific Ideas

### VS Battles Wiki Tier Reference (from research)
- AP/Durability: 10-C (Below Average Human) through 0 (Boundless), with sub-tiers Low/High/+
- Speed: Below Average Human through Irrelevant, with specific Mach/c values per tier
- Intelligence: Mindless through Omniscient (11 qualitative tiers)
- Hax: qualitative categories (Spatial, Soul, Time, Causality manipulation etc.), NOT numerically tiered
- Lifting Strength: own class system (Class 5 through Immeasurable) — EXCLUDED from our system (rarely relevant)
- Striking Strength = same as AP — EXCLUDED (redundant)
- Battle IQ = not formally standardized — merged with Intelligence for our purposes

### UI Card Structure
- **Main card**: Name, role, faction, location (compact, always visible)
- **Advanced tab**: Personality/character, appearance, power spider/radar chart, hax abilities, vulnerabilities
- Source bundle, synthesis metadata, identity inertia — NOT shown anywhere

</specifics>

<deferred>
## Deferred Ideas

- Global canonical character database (cross-campaign character reuse)
- Counterweight/balance system (WorldForge as meta-universal entity)
- Judge role rework for identity drift validation
- Visual radar/spider chart component (can be plain table initially)

</deferred>

---

*Phase: 57-power-scaling-character-profile-redesign*
*Context gathered: 2026-04-15 via live discussion*
