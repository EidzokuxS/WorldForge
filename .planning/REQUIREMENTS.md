# Requirements: WorldForge

**Defined:** 2026-04-08
**Core Value:** The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.

## v1.1 Requirements

Requirements for the gameplay-fidelity milestone. Each maps to roadmap phases.

### Runtime Integrity

- [x] **RINT-01**: Player can resume gameplay routes (`history`, `action`, `retry`, `undo`, `edit`) after reload using campaign identity, without depending on an in-memory active campaign session.
- [x] **RINT-02**: Retry and undo restore the same authoritative world boundary the player experienced as the completed turn, including post-turn simulation effects.
- [x] **RINT-03**: Checkpoint save/load restores all campaign-authoritative runtime state, including `config.json`-backed values such as current tick and related campaign runtime metadata.
- [x] **RINT-04**: Inventory and equipment have one authoritative persistence model that gameplay, prompts, checkpoints, and UI all read and mutate consistently.

### Simulation Fidelity

- [x] **SIMF-01**: Reflection trigger accumulation occurs in live runtime so NPC beliefs, goals, relationship drift, and progression can actually fire under normal play.
- [x] **SIMF-02**: Post-turn simulation has an honest player-visible completion boundary, so world updates do not silently continue after the turn is presented as finished.
- [x] **SIMF-03**: World-state mutations from NPC autonomy, reflection, and faction simulation remain coherent with rollback, retry, and checkpoint restore behavior.

### Gameplay Semantics

- [x] **GSEM-01**: Oracle evaluation includes target-aware context when the player acts against a concrete entity, rather than always judging actions with empty target tags.
- [x] **GSEM-02**: Start conditions affect early gameplay mechanically and persistently, not only as prompt flavor text.
- [x] **GSEM-03**: Travel/time semantics promised by current docs are either implemented as runtime mechanics or removed from the active product contract.
- [x] **GSEM-04**: Per-location recent-happenings state promised by current docs is either implemented as runtime state or removed from the active product contract.

### Documentation Alignment

- [x] **DOCA-01**: Every gameplay claim elevated by Phase 36 Group B and Group C is resolved as either implemented behavior or an explicit deprecation in docs.
- [x] **DOCA-02**: Gameplay docs describe the live structured character/runtime model accurately, including the role of derived tags versus canonical character data.
- [x] **DOCA-03**: Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as a planning baseline for later milestones.

### Live Gameplay Quality

- [x] **SCEN-01**: Player-visible turn text is a single-pass scene assembled from authoritative runtime state, without repeated output blocks or raw-premise opening dumps.
- [x] **SCEN-02**: Scene participation and knowledge follow encounter/perception scope, so large locations do not behave like one small room and NPCs do not over-know unseen actors.
- [x] **WRIT-01**: Storyteller output quality is tuned for playable RP, with research-backed prompting/model settings that materially reduce purple prose and obvious AI smell.
- [x] **CHARF-01**: Character runtime modeling preserves distinctive personality, motives, and identity details for both native and imported/canonical characters.
- [x] **RES-01**: Search and research flows use explicit retrieval intent in both worldgen and live gameplay, producing focused, useful grounded context instead of vague blended queries.
- [x] **RES-02**: Worldgen research reuses one persisted campaign/worldgen grounding frame, so DNA-aware follow-up research does not rebuild franchise intent or search shape from raw user prose on every step.
- [x] **UX-01**: Gameplay text surfaces present player input and generated narration with materially better readability, formatting, and rich-text affordances.
- [x] **UX-02**: Authoring/review UI exposes the full structured character record for important actors, including grounding and power-profile data, without requiring direct database inspection.
- [x] **TRUTH-01**: Runtime and worldgen fail closed on missing or failed semantic generation instead of silently substituting backup providers, synthetic grounding, or surrogate gameplay content.

### Phase 60 — Character Ingestion Backend Pipeline

- [x] **P60-R1**: Unified backend ingestion pipeline feeds all 4 character-creation endpoints (parse / generate / research / import) for both `player` and `key` NPC roles.
- [x] **P60-R2**: V2/V3 card is INPUT to the pipeline, not a direct field map. `mapV2CardToCharacter` and `mapV2CardToNpc` are removed.
- [x] **P60-R3**: Explicit `overrideText` field flows through every creation route schema, `IngestionInput`, synthesizer prompt, and PowerStats assessor.
- [x] **P60-R4**: Priority merge honored: user override > card > research > LLM inference, enforced at the LLM prompt layer (PRIORITY 1..4 blocks in synthesizer).
- [x] **P60-R5**: Canon characters (known_ip_canonical / known_ip_diverged) run archetype research + VS Battles PowerStats via reused `enrichKnownIpWorldgenNpcDraft`.
- [x] **P60-R6**: Original characters (original / imported) infer PowerStats from draft + card text + override via new `assessOriginalCharacterPowerStats` (no web search).
- [x] **P60-R7**: Every ingested draft has non-undefined `PowerStats` (attackPotency, durability, speed, intelligence, hax[], vulnerabilities[]).
- [x] **P60-R8**: No fallbacks. Pipeline failure throws typed `IngestionPipelineError` after retry exhaustion (stage + attempts + cause recorded).
- [x] **P60-R9**: Route response envelope carries the enriched draft + powerStats + provenance.overrideText for Phase 61 UI consumption.

### Phase 61 — Character Ingestion Frontend UI

- [x] **P61-R1**: Visible Power Stats section on both player `CharacterCard` and NPC cards — tier+rank table for all 4 axes (Attack Potency, Speed, Durability, Intelligence), hax list with `Bypasses {tier}` badges, vulnerabilities with minor/major/critical severity color coding.
- [x] **P61-R2**: Persistent `overrideText` textarea on both creation surfaces — visible on all 4 modes, text preserved across mode switches, sent with the request on every creation call.
- [x] **P61-R3**: NPC creation tab mode parity with player creation page — both surfaces expose describe / AI-generate / research-archetype / import-V2.
- [x] **P61-R4**: Explicit error states + real retry buttons with stage context — on pipeline failure, UI displays the failing `stage`, `attempts`, and a one-click "Retry" that re-invokes the same ingestion call with the same bundle. No silent toast-and-forget.
- [x] **P61-R5**: Aesthetic parity with `docs/ui_concept_hybrid.html` — charcoal palette (`zinc-950/900/800/700`), blood accent for primary actions only, Inter sans + Playfair Display serif headings, font-mono small-caps microcopy, opaque `rgb()` surfaces (no backdrop-blur on shell). No hardcoded franchise names in placeholders.

### Phase 62 - Advanced Character Inspector Complement Redesign

- [x] **P62-R1**: Advanced panel (CharacterRecordInspector) renders strictly complementary data to the basic NPC card — never duplicates displayName, currentLocationName, factionName, personaSummary, PowerStats (table/hax/vulnerabilities), activeGoals, shortTermGoals, or longTermGoals.
- [x] **P62-R2**: Advanced panel renders the 10 locked sections in order: Overview, Identity Core, Profile, Live Dynamics, Capabilities, Runtime & State, Loadout, Starting Conditions, Provenance, Raw JSON. Each section only renders when it has at least one non-empty field.
- [x] **P62-R3**: Advanced panel displays the literal text `No additional data` when every complement section is empty; Raw JSON still renders when the draft is non-null.
- [x] **P62-R4**: `PowerStatsSection` import is removed from `frontend/components/world-review/character-record-inspector.tsx`; basic NPC card (`npcs-section.tsx`) remains the single renderer of Power Stats in review UI.
- [x] **P62-R5**: Test coverage (`character-record-inspector.test.tsx`) locks the new contract with original-world fixture names only (e.g. Commander Kael, Dunespire Hold, Wind Cutting). No IP franchise names (Naruto, Sasuke, Uchiha, Sharingan, Konoha, Gojo, Jujutsu, Saiyan, Luffy, Airbender, Geralt, Jedi, Sith, Hogwarts, etc.).

### Phase 63 — Personality Interiority Model

- [x] **P63-R1**: `CharacterPersonality` block present on every `CharacterIdentityDraft` produced by all 4 ingestion paths (parse / generate / research / import). Every field non-empty when source material is non-trivial; `sampleLines[]` length ≥ 2 and ≤ 3.
- [x] **P63-R2**: Prompt assembler runtime identity block emits a `Personality:` section with `summary / voice / decision-style / worldview / internal-contradictions / personal-mythology / sample-lines` and no longer emits `motives / pressure / taboos`. `attachments` reads from `liveDynamics.attachments`.
- [x] **P63-R3**: V2/V3 card import maps `card.personality` → `personality.summary` and parses `card.mes_example` `{{char}}` turns → `personality.sampleLines` (2-3, ≥20 chars, no OOC markers). LLM-pass derives `voice / decisionStyle / worldview / internalContradictions / personalMythology`.
- [x] **P63-R4**: Basic NPC card (`npcs-section.tsx`) renders a PERSONALITY section between Tags and PowerStats. `summary` + `voice` always visible; `sampleLines / decisionStyle / worldview / internalContradictions / personalMythology` reveal via a collapsible control.
- [x] **P63-R5**: Advanced inspector (`character-record-inspector.tsx`) no longer renders blocks for `motives / pressureResponses / taboos / traits / flaws / legacyTags`. Provenance section is removed (metadata only reachable via Raw JSON tab).
- [x] **P63-R6**: Backfill script (`backend/src/scripts/backfill-personality.ts`) populates `personality` on every pre-existing player + NPC row with empty `personality.summary`, in batches of 5-10 parallel `generateObject` calls, with idempotency check, per-record structured logs, backup file written before each update, `withPipelineRetry` retry wrapper, re-read-before-write safeguard, and a `--dry-run` flag.
- [x] **P63-R7**: Zod schemas accept the new `personality` block and keep `motives / pressureResponses / taboos / traits / flaws / legacyTags` as `.optional()` reads during the migration window. Wrapper objects (`behavioralCore`, `capabilities`, `provenance`) stay defaulted.
- [x] **P63-R8**: NPC runtime prompts (`npc-agent.ts`, `npc-offscreen.ts`) and reflection prompt (`reflection-agent.ts`) read from `personality.*` instead of `behavioralCore.motives / pressureResponses / taboos`.

### Phase 64 — NPC Personality Regeneration Parity

- [x] **P64-R1**: `generateNpcsStep` emits a complete `identity.personality` block (`summary`, `voice`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`, `sampleLines`) for every NPC tier, including the key-tier known-IP path.
- [x] **P64-R2**: Shared helper module `backend/src/character/personality-schema.ts` exports `personalityFieldSchema` and `mapFlatPersonalityToNested`, and both `npc-generator.ts` and `scaffold-steps/npcs-step.ts` consume that single source of truth.
- [x] **P64-R3**: The worldgen personality mapper overwrites `draft.identity.personality` after `fromLegacyScaffoldNpc` returns, replacing the former summary-only stub and preserving all 7 nested personality sub-fields.
- [x] **P64-R4**: `shouldRetrySampleLines` triggers one bounded repair call when the first detail output returns empty, all-short, generic-opener, or all-identical `sampleLines`, and retry failure safely falls back to the primary detail without crashing worldgen.
- [x] **P64-R5**: `/api/worldgen/regenerate-section` with `section="npcs"` returns NPC drafts whose `identity.personality` block is fully populated, proven by a real-step integration test that mocks only `safeGenerateObject`.
- [x] **P64-R6**: `backfill-personality.ts --mode=incomplete-pack` targets the exact legacy summary-only signature (`summary` populated, `voice` / `decisionStyle` / `worldview` / `personalMythology` empty), preserves Phase 63 safety guards, and deliberately excludes valid empty `sampleLines` / `internalContradictions` cases.
- [x] **P64-R7**: Backend verification for Phase 64 is green via targeted unit/integration coverage, backend typecheck, and the full backend Vitest suite. Frontend verification is outside Phase 64 scope per D-16.
- [x] **P64-R8**: Existing runtime personality consumers continue to read the repaired full personality block without regression; `prompt-assembler.personality.test.ts`, `npc-agent.personality.test.ts`, `npc-offscreen.personality.test.ts`, and `reflection-agent.personality.test.ts` all pass unchanged.

### Phase 65 — Supporting NPC Power Stats and Review Payload Parity

- [x] **P65-R1**: Every worldgen-produced scaffold NPC (known-IP key, known-IP supporting, original key, original supporting) carries `draft.powerStats` after both initial scaffold generation and `/api/worldgen/regenerate-section section=npcs`.
- [x] **P65-R2**: Shared helper module `backend/src/character/enrich-npc-batch.ts` exports `enrichNpcsBatch` as the single source of truth for per-NPC power-stats delegation; the helper delegates to the existing `assessPowerStats` dispatcher at `backend/src/character/ingestion/power-assessor.ts:38` without duplicating routing rules; both `backend/src/worldgen/scaffold-steps/npcs-step.ts` and the regenerate-section handler consume the helper.
- [x] **P65-R3**: Per-NPC enrichment propagates `IngestionPipelineError` unchanged on retry exhaustion; the batch aborts and no partial results are returned. Retry ownership stays at the single existing layer inside `assessOriginalCharacterPowerStats`, so `enrichNpcsBatch` does not add an outer retry wrapper that would inflate original-branch attempts to 9.
- [x] **P65-R4**: `enrichNpcsBatch` bounds parallel concurrency to <=4 inflight per-NPC `assessPowerStats` calls by default, with a test-tunable override.
- [x] **P65-R5**: `/api/worldgen/regenerate-section section=npcs` returns NPC drafts with populated `powerStats` for both tiers in both world modes, with known-IP tests explicitly satisfying the dispatcher's `research.enabled` gate.
- [x] **P65-R6**: `reconcileDraftBackedScaffoldNpc` preserves `draft.powerStats` on draft-backed supporting-tier round-trip through `saveScaffoldToDb`, proven through the mocked `dbCalls` transaction-log pattern without changing `scaffold-saver.ts`.
- [x] **P65-R7**: Review UI payload envelope preserves the authoritative `draft` returned by every ingestion route so freshly-created NPCs retain `draft.powerStats` through the `npcs-section.tsx` merge path.
- [x] **P65-R8**: `PowerStatsSection` conditional render contract stays locked for the null case, with no production change to `power-stats-section.tsx` or the `npcs-section.tsx` render condition.
- [x] **P65-R9**: Full backend Vitest suite, backend typecheck, targeted frontend `npcs-section` suite, and scoped-eslint on the edited frontend files all exit 0 as the binary verification gate.
- [x] **P65-R10**: Phase 60/63/64 personality and PowerStats regressions remain green, untouched protected files stay clean by phase-base diff, and the only adjacent protected-file change (`backend/src/character/record-adapters.ts`) is explicitly validated and absorbed as a draft-backed save-edits compatibility fix rather than left as unowned drift.

### Phase 66 — Combat Envelope and Oracle Context

- [x] **P66-R1**: A backend-local deterministic `CombatEnvelope` builder exists and derives combat comparison from actor/target power data with no LLM call, no persistence, and no runtime-tag writes.
- [x] **P66-R2**: `CombatEnvelope` stays qualitative only: matchup band, AP-vs-durability delta, speed delta, optional intelligence delta, bypasses, relevant vulnerabilities, and bounded summary lines. No HP math or hard combat formulas.
- [x] **P66-R3**: `resolveActionTargetContext(...)` additively exposes optional combat snapshot data for resolved character targets while item/location/faction/unknown targets preserve honest non-combat behavior.
- [x] **P66-R4**: `processTurn(...)` computes and passes `combatEnvelope` after target resolution and before `callOracle(...)` for eligible hostile player actions, and omits it otherwise.
- [x] **P66-R5**: `createNpcAgentTools(...).act.execute(...)` reuses the same combat-envelope and target-resolution seams for eligible hostile NPC actions instead of inventing a separate NPC-only comparison path.
- [x] **P66-R6**: `OraclePayload` accepts optional `combatEnvelope`, Oracle prompt consumes compact backend-authored envelope context, and explicit no-bypass durability-gap clamp wording is locked while no-envelope behavior remains compatible.
- [x] **P66-R7**: Phase 66 does not modify runtime-tags, storyteller prompt assembly, npc-offscreen, reflection, persistence, or schema surfaces.
- [x] **P66-R8**: Backend verification proves envelope builder, target-context, Oracle contract, player/NPC pass-through, and observability are green under full backend Vitest suite plus backend typecheck.

### Phase 67 — Narrative Outcome Ceilings and NPC Combat Posture

- [x] **P67-R1**: When `combatEnvelope` exists, backend deterministically derives `NarrativeOutcomeBounds` from `(combatEnvelope, oracleResult.outcome)` before storyteller prompt emission.
- [x] **P67-R2**: `NarrativeOutcomeBounds` are injected into both the hidden storyteller system prompt in `turn-processor.ts` and the final visible narration prompt assembled by `assembleFinalNarrationPrompt(...)`.
- [x] **P67-R3**: Bounds remain qualitative only: ceilings, floors, prohibitions, and a compact summary. Phase 67 does not add HP formulas, chance rewrites, or post-generation prose normalization.
- [x] **P67-R4**: `NpcCombatPosture` is derived in `tickNpcAgentInternal(...)` before NPC tool/action selection, using a single primary clear-awareness target and shared pure helpers from `combat-envelope.ts`.
- [x] **P67-R5**: Posture influences the NPC decision prompt in `npc-agent.ts`; posture is not newly owned or persisted by `npc-tools.ts`, DB rows, `CharacterRecord`, or runtime tags.
- [x] **P67-R6**: Missing envelope or missing combat data preserves pre-phase behavior byte-for-byte on both player and NPC paths; no bounds/posture block is rendered when absent.
- [x] **P67-R7**: Phase 67 does not modify runtime-tags, persistence/schema surfaces, frontend, `npc-offscreen.ts`, or `reflection-agent.ts`.
- [x] **P67-R8**: Observability adds bounded `combat.bounds.derived` and `combat.posture.derived` events with compact payloads only.
- [x] **P67-R9**: Backend verification proves bounds derivation, posture derivation, hidden + final narration pass-through, NPC prompt posture flow, full backend Vitest suite, and backend typecheck are green.

### Phase 68 — World Brain Hidden Adjudication and Scene Direction

- [x] **P68-R1**: A backend-local `WorldBrainSceneDirection` structured contract exists with the Phase 68 field set (`situationSummary`, `sceneQuestion`, `focalActorNames`, `backgroundActorNames`, `presenceReasons`, `causalBeats`, `narrationGuardrails`) and explicit caps that keep the output bounded.
- [x] **P68-R2**: `processTurn(...)` runs a judge-owned `safeGenerateObject` world-brain pass after Oracle resolution and before hidden storyteller tool-driving on normal player turns.
- [x] **P68-R3**: `processOpeningScene(...)` runs the same world-brain seam before opening visible narration instead of narrating directly from opening state plus raw presence.
- [x] **P68-R4**: `scene-assembly.ts` carries authoritative world-brain causal metadata and a filtered player-perceivable derivative, preferring explicit world-brain reasons and beats over loose fallback inference where both exist.
- [x] **P68-R5**: `assembleFinalNarrationPrompt(...)` consumes only player-perceivable world-brain direction plus settled authoritative scene effects; visible narration never reads raw hidden scratch reasoning.
- [x] **P68-R6**: The existing hidden storyteller tool-driving pass remains in place in Phase 68 but consumes world-brain direction as a bridge; full hidden-pass ownership migration stays deferred to Phase 69.
- [x] **P68-R7**: Phase 68 remains additive and bounded: no route/SSE redesign, no DB schema changes, no Oracle probability redesign, no post-generation prose rewriting, and no hidden-pass migration cleanup work.
- [x] **P68-R8**: Observability adds one compact Phase 58-style world-brain event proving whether the seam ran for `player-turn` and `opening-scene`, with bounded counts and summary/question lengths only.
- [x] **P68-R9**: Backend verification proves contract coverage, player-turn integration, opening-scene integration, final-visible consumption, observability, focused regression bundle, full backend Vitest, and backend typecheck are green.

### Phase 69 — Judge-Owned Hidden Pass Migration and Narrator-Only Runtime

- [x] **P69-R1**: A bounded backend-local `AdjudicationPlan` contract exists for normal player turns with a bounded `rationale` field plus an ordered action list built from shared runtime tool input schemas instead of duplicated per-tool plan shapes.
- [x] **P69-R2**: `processTurn(...)` generates a judge-owned adjudication plan after Oracle resolution and Phase 68 world-brain direction, before any state mutation or final visible narration.
- [x] **P69-R3**: Normal player-turn adjudication executes deterministically through backend executor helpers, preserving `state_update` / `quick_actions` turn-event semantics and aborting loudly on invalid plan parsing or failed executed actions.
- [x] **P69-R4**: The default normal player-turn runtime no longer binds tools to storyteller hidden passes; any retained legacy fallback is explicit, env-gated, and non-default.
- [x] **P69-R5**: Final visible narration remains storyteller-only prose sourced from settled authoritative scene state; judge hidden rationale and plan scratch reasoning are not narrator-facing inputs.
- [x] **P69-R6**: Opening scenes remain on the Phase 68 path (`world-brain -> authoritative scene assembly -> final visible narration`) with no new hidden adjudication pass.
- [x] **P69-R7**: Compact observability proves adjudication plan generation and execution counts/durations without dumping raw hidden reasoning or prompt bodies.
- [x] **P69-R8**: Focused regression coverage proves prompt separation, structural turn-event parity, loud-failure behavior, and opening-scene non-regression.
- [x] **P69-R9**: Backend verification proves focused Phase 69 regressions, backend typecheck, and full backend Vitest suite are green.

### Phase 71 — Worldgen Research Authority Boundary

- [x] **P71-R1**: Direct/certain model responses cannot become backend-owned canonical world subjects; premise interpretation is stored as an LLM-authored v2 research artifact with source usage rules.
- [x] **P71-R2**: Likely/search-verified research preserves mixed-premise source roles, including JJK world-basis plus Naruto power-system overlay behavior.
- [x] **P71-R3**: Prompt-facing research artifact formatting omits canonical-subject language and renders bounded source usage rules instead.
- [x] **P71-R4**: Worldgen suggest/generate/regenerate routes persist and pass v2 research artifacts through the automatic known-IP research flow.
- [x] **P71-R5**: Campaign config reads legacy research fields safely and writes optional v2 research artifacts without silent repair, migration, or saved-campaign mutation.

### Phase 72 — Worldgen Authority Propagation Regression Audit

- [x] **P72-R1**: When `WorldgenResearchArtifactV2` is present, legacy `ipContext`, `premiseDivergence`, `researchFrame`, `buildKnownIpGenerationContract`, and `buildCanonicalList` do not own semantic prompt decisions. Mirrors `INV-72-01`.
- [x] **P72-R2**: External search/provider fields are deterministically capped before strict artifact parsing, including sufficiency follow-up search results, so provider-length payloads cannot crash long worldgen runs. Mirrors `INV-72-02`.
- [x] **P72-R3**: JJK world basis plus Naruto mechanics overlay does not import Naruto locations, factions, or cast through backend canonicalization. Mirrors `INV-72-03`.
- [x] **P72-R4**: Artifact canonical character names route matching NPCs to known-IP enrichment and not original-character power stats; source-rule/name-collision behavior is documented by deterministic tests before any schema expansion. Mirrors `INV-72-04`.
- [x] **P72-R5**: Campaign-stored artifacts survive generate/regenerate/save-edits and cannot be silently bypassed by nullable request payloads without an explicit tested rule. Mirrors `INV-72-05`.
- [x] **P72-R6**: Frontend wizard/API transports `_researchArtifact` explicitly through seed suggestion, single-seed reroll, and world generation with automated test coverage. Mirrors `INV-72-06`.
- [x] **P72-R7**: Review/draft conversion preserves backend known-IP NPC identity and does not default artifact-backed canonical NPCs to `original`. Mirrors `INV-72-07`.

### Phase 73 — Structured Output Stability and Provider Conformance

- [x] **P73-R1**: All shared object-generation boundaries are audited and classified as native structured output, tool call, text fallback, or intentionally unstructured prose.
- [x] **P73-R2**: `safeGenerateObject` is native-first for schema-capable providers via AI SDK structured output, while preserving an explicit text fallback for gateways/models that reject schema output.
- [x] **P73-R3**: Provider/model structured-output capability is observable and testable; traces distinguish native schema, native JSON, tool mode, text fallback, repair, and full retry.
- [x] **P73-R4**: ScenePlan no longer requires the model to invent or preserve backend-owned IDs where backend code can derive them deterministically.
- [x] **P73-R5**: A local benchmark/conformance harness covers configured providers/models and representative WorldForge schemas before long-running flows trust them.
- [x] **P73-R6**: Deterministic Zod/sanitization boundaries remain final authority for caps, authority propagation, no-invented-mechanics rules, and executable tool validation.
- [x] **P73-R7**: Regression coverage includes the observed Kimi/Mimo citations/canonicalNames failure, ScenePlan payload/missing-tool failure, overlong external metadata, and artifact-backed Gojo known-IP power dispatch.

### Phase 74 — Structured Prompt Contracts and Model-Facing Schema Hardening

- [x] **P74-R1**: The Phase 73 structured-output inventory is refreshed into a prompt-contract audit that records each production structured/model-output seam, prompt builder, schema/tool contract, known failure class, and owner.
- [x] **P74-R2**: Every structured-output prompt that asks for JSON/tool-shaped data includes explicit model-facing contract text: required fields, nested shapes, allowed enum/tool names, string/list caps, nullable/optional rules, and at least one compact example when the shape is non-trivial.
- [x] **P74-R3**: Shared prompt-contract helpers or colocated contract builders prevent schema drift between Zod/tool definitions and prompt instructions; automated tests fail when high-risk structured-output callers omit the required contract marker.
- [x] **P74-R4**: Regression coverage spans the observed classes across gameplay, worldgen, character, and worldbook seams: strings returned where arrays/objects are required, missing nested tool fields, overlong fields, invented tool names, payload/input aliasing, and malformed optional UI actions.
- [x] **P74-R5**: Backend repair/sanitization policy remains deterministic: it may coerce shape, trim caps, map aliases, or drop optional non-executable outputs, but it must not invent semantic lore, actions, targets, power facts, source roles, or canonical truth to satisfy a schema.
- [x] **P74-R6**: Structured-output conformance distinguishes "primary prompt-contract success" from fallback/repair success and reports prompt-contract case failures for active role models before long-running worldgen/gameplay flows are called stable.

### Phase 75 — Cross-Phase Promise Audit and Location-Presence Reality Closure

- [x] **P75-R1**: Completed phase artifacts from the active milestone are audited against current code and tests, producing an evidence matrix that classifies each material promise as implemented, deprecated, stale/unwired, or follow-up.
- [x] **P75-R2**: The audit prioritizes user-visible gameplay/worldgen promises over cosmetic documentation drift, with fresh phase decisions taking precedence over older stale claims.
- [x] **P75-R3**: Worldgen location persistence creates or preserves scoped persistent sublocations for dense macro locations when the generated scaffold/artifact contains meaningful smaller places, rather than saving every location as `macro`.
- [x] **P75-R4**: Worldgen NPC placement assigns NPCs to appropriate scoped locations/current scene presence when evidence exists, so a large location like Shibuya does not place every generated actor in the same broad room.
- [x] **P75-R5**: Runtime opening-scene and turn-scene participation consume scoped location/presence data so actors do not automatically see, know, or appear with every other actor sharing a macro location.
- [x] **P75-R6**: Deterministic backend code only derives reproducible placement/shape data from generated scaffold fields; semantic interpretation of premise/source/canon remains LLM-owned and artifact-driven.
- [x] **P75-R7**: Regression coverage proves the location-presence fix with a dense urban/generated-world fixture and guards against all-NPC-in-one-macro-location collapse.
- [x] **P75-R8**: Any additional stale completed-phase promises found by the audit are either fixed in Phase 75, converted into explicit Phase 76/gap work, or removed/deprecated from active project truth with evidence.

### Phase 76 — Full Historical Phase Promise Audit and De-Jure/De-Facto Gap Closure

- [x] **P76-R1**: Every prior phase from archived v1.0 through Phase 75 has an explicit audit matrix row with phase number, title, promised behavior, evidence checked, classification, risk, and disposition.
- [x] **P76-R2**: The audit distinguishes `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, and `needs-human-UAT` without treating old summaries or checkboxes as sufficient evidence.
- [x] **P76-R3**: Material stale/unwired/partial promises are collected into a gap ledger with severity, owner recommendation, and explicit routing to immediate fix, future phase, backlog, deprecation, or UAT.
- [x] **P76-R4**: Automated coverage validation proves no expected phase number was skipped and that every non-verified row has a disposition.
- [x] **P76-R5**: Planning truth is reconciled so Phase 75 is described as location-presence closure only, while Phase 76 owns the historical promise audit.
- [x] **P76-R6**: Phase 76 avoids silent product implementation scope creep; any large discovered gap becomes an explicit follow-up plan/phase unless it is a small deterministic docs/state repair.

### Phase 77 — Scene-First VN/RPG Play Surface and Weekend Playable UX Slice

- [x] **P77-R1**: The default `/game` surface presents a scene-first VN/RPG shell instead of a document or permanent multi-column debug cockpit: location/scene visual layer, compact HUD, visible actor presence, bottom narration/input dock, and hidden-by-default debug mechanics.
- [x] **P77-R2**: Latest narration is adapted into local presentation beats with `Next`, `Auto`, and `Log` controls; these controls never create backend turns, while `Send` and first-class `Continue` do.
- [x] **P77-R3**: Existing `/game` panels are reorganized into overlays/drawers/widgets for Log, World/Map, Character, Lore/Journal, Inventory, Inspect, and Saves, preserving the input draft and returning to the same scene state.
- [x] **P77-R4**: Actor presentation distinguishes `visible/interactable now`, `sensed/same-area nearby`, and `off-screen anchors` so a shared broad or persistent location does not imply everyone is in arm's reach.
- [x] **P77-R5**: The action dock supports freeform play without command syntax, including first-class `Continue`, one raw narrative input, and per-campaign input draft persistence. It must not require `Act`/`Speak`/`Observe` command modes.
- [x] **P77-R6**: Oracle/dice/mechanic outcomes are surfaced as fiction-facing game beats by default, with raw chance/roll/reasoning and JSON available only through Inspect/debug affordances.
- [x] **P77-R7**: The implementation includes desktop and mobile visual checks proving the default `/game` screenshot reads as a game/VN within five seconds and not as a newspaper/editorial reader/SaaS dashboard.
- [x] **P77-R8**: A live or deterministic 10-turn playtest gate proves the user can continue, act freely, interact with an actor, move or inspect the world, open at least one drawer, and understand consequences without raw debug panels.

## v1.2+ Candidate Requirements

Deferred until runtime integrity is repaired.

### Phase 78 — GM-First Turn Orchestration And Oracle-On-Demand

- [x] **P78-R1**: Turn orchestration treats player input as raw scene text; backend does not authoritatively infer intent, target, hostility, combat mode, or action category before the GM/Judge interprets it.
- [x] **P78-R2**: Backend provides a neutral scene packet with current state, candidate IDs/names, visibility bands, recent events, memory hints, and allowed tools; these are evidence and affordances, not semantic conclusions.
- [x] **P78-R3**: GM/Judge chooses whether the turn resolves directly, needs a roll/Oracle, calls a tool, transitions into combat, asks clarification, or simply continues the scene.
- [x] **P78-R4**: Oracle/rolls run only when requested for meaningful uncertainty or resistance; pure conversation, obvious observation, guaranteed actions, and dead-air outcomes use no-roll resolution.
- [x] **P78-R5**: Backend validates and executes only GM-supplied concrete tools/IDs, performs deterministic math/random rolls, persists receipts, and rolls back on failure.
- [x] **P78-R6**: Legacy `intent` and `method` fields are deprecated as product semantics; during migration they may mirror raw player text/empty method for route compatibility only.
- [x] **P78-R7**: Backend remains the rulebook and final world truth for time, locations, stats, inventory, conditions, resources, relationships, clocks, persisted facts, and legal state transitions; LLM-authored outputs cannot overwrite those without deterministic validation.

### Phase 79 — GM Epistemic Context And Tool Grounding

- [x] **P79-R1**: Player-turn GM prompts receive a local model-facing scene packet that separates immediate scene truth, player-known facts, legal candidates, and hidden/background summaries.
- [x] **P79-R2**: Runtime tools prefer backend-approved refs over free-text world names, and player-turn tool inputs are prevalidated against the local grounding context before mutation.
- [x] **P79-R3**: Remote/offscreen locations and actors cannot become legal local spawn/log targets merely because they exist in campaign state or background simulation.
- [x] **P79-R4**: `spawn_npc`, `log_event`, scene assembly, and final narration cannot turn failed/remote/local-only tool behavior into visible settled local truth.
- [x] **P79-R5**: Durable event writes distinguish future-relevant committed world facts from scene-local beats and reject unsupported possession/access/item-use claims.
- [x] **P79-R6**: Regression coverage reproduces the Forest Outpost-style wrong-location spawn class and proves prompt, grounding, validation, rollback, and narration boundaries.

### Phase 80 — Forecast-Led GM Beat Planning

- [x] **P80-R1**: The GM can maintain bounded advisory forecasts of likely NPC/faction/thread movement if the player does not intervene.
- [x] **P80-R2**: Forecasts are scoped, invalidated, and stored as advisory GM notes rather than backend-owned world truth.
- [x] **P80-R3**: Player-turn GM prompts receive only forecast excerpts that are local, player-known, or otherwise legally surfaced.
- [x] **P80-R4**: Per-turn beat planning explains what the GM is trying to accomplish, why now, what should be revealed, and what tools may be justified.
- [x] **P80-R5**: Tool execution and final narration remain backend-settled and cannot mutate or reveal private forecast internals directly.
- [x] **P80-R6**: Tests prove forecast isolation, rollback safety, invalidation, BeatPlan/ScenePlan separation, and narration boundary behavior.

### Phase 81 — GM Turn Orchestration Loop And Settled Tool Execution

- [x] **P81-R1**: Player-turn world-brain and GM decision responsibilities are consolidated into a compact GM Read stage with no concrete tool payloads.
- [x] **P81-R2**: GM Read explains situation, focal actors, scene question, player action interpretation, path, rationale, and evidence refs.
- [x] **P81-R3**: Direct, continue, and clarification turns skip action planning and cannot produce planned world mutations.
- [x] **P81-R4**: Mutating/combat turns produce an auditable Action Checklist before tool execution.
- [x] **P81-R5**: Tool mutations execute through small validated steps with backend authority over refs, inputs, persistence, rollback, and final truth.
- [x] **P81-R6**: Failed or skipped tool steps do not appear in final narration as completed effects.
- [x] **P81-R7**: Narration consumes settled post-execution truth and compact GM guardrails, never planned-but-unexecuted intent or private forecast terms.
- [x] **P81-R8**: Fresh-campaign live playtest proves opening plus at least ten turns across direct, clarification, oracle, single-tool, multi-step, and rejected/revised/skipped tool behavior.

### Phase 82 — GM Dynamic Scene Expansion And Agentic Tool Harness

- [ ] **P82-R1**: Model-facing GM context explicitly explains when dynamic local scene expansion is allowed: anchored ephemeral sublocations, support NPCs, reuse-before-create, and promotion only when fiction makes them durable; temporary props/items are deferred from Phase 82 scope.
- [ ] **P82-R2**: Dynamic location creation anchors ephemeral sublocations under the current legal broad/persistent location with lifetime metadata and authoritative result refs.
- [ ] **P82-R3**: Ephemeral scenes have an intentional lifecycle and archived/expired scenes stay out of normal traversal/presence while durable events spill to the persistent anchor.
- [ ] **P82-R4**: Support/temporary NPC spawning writes correct broad and current-scene ids for macro, persistent sublocation, and ephemeral scene targets.
- [ ] **P82-R5**: Support NPCs can be retired or promoted deliberately so incidental service actors do not accumulate forever.
- [ ] **P82-R6**: The GM tool harness returns compact structured observations, exposes next legal affordances, and blocks repeated equivalent calls with a concrete per-turn key and semantic budgets rather than duration caps.
- [ ] **P82-R7**: UI/SSE progress exposes exact dynamic scene/support NPC/lifecycle stages without claiming completion before backend truth settles.
- [ ] **P82-R8**: Fresh-campaign live play proves selective dynamic scene/support NPC use, reuse-before-create, quantified no-spam, cleanup/promotion, and narration from settled truth.

### Phase 83 — WorldForge V4 Full Visual Migration

- [ ] **P83-R1**: Every migrated visible control/status is classified against current product truth as real current behavior, backend-backed target UI, or intentionally deferred.
- [ ] **P83-R2**: Global shell, rail, typography, spacing, panels, tabs, drawers, cards, buttons, and responsive constraints move to the V4 visual language.
- [ ] **P83-R3**: Launcher, campaign creation, worldgen/DNA, review, character, settings, library/worldbook, and import flows preserve existing behavior while adopting the V4 layout rhythm.
- [ ] **P83-R4**: `/game` keeps the scene-first VN/RPG contract: stage, HUD, presence, narration dock, action dock, widgets/drawers, log/auto/next, and hidden debug.
- [ ] **P83-R5**: The migration removes ad hoc duplicate styling instead of pasting prototype HTML/CSS beside the real component tree.
- [ ] **P83-R6**: Screenshot QA compares real routes against V4 target shots at 1366, 1920, and 2560 widths, plus mobile/tablet overlap smoke.
- [ ] **P83-R7**: Interaction QA covers tabs, drawers, imports, settings persistence, game send/continue, log/auto/next, and route navigation.
- [ ] **P83-R8**: The final result is beautiful, coherent, and playable, not merely technically passing.

### Nice To Have Later

- **POL-01**: Revisit older fixed UI and budget claims that have already drifted from the live product.
- **POL-02**: Surface NPC promotion and companion semantics more explicitly if they become materially player-facing.
- **POL-03**: Add new gameplay features on top of the repaired runtime baseline rather than during integrity repair.

### Phase 88 — Living-World Authority Spine and Key NPC Co-Player Process Simulation

- [x] **P88-R1**: Add an authoritative world version/world time spine so every state-bearing mutation, event, tool result, simulation job, proposal, actor process update, and rollback boundary has campaign id, base version, result version, source entity, world time/tick, provenance, and failure semantics.
- [x] **P88-R2**: Replace detached post-`done` authoritative mutation with required-before-done settlement plus versioned after-done proposal work; stale, aborted, retried, or restored branches cannot be mutated by old async jobs.
- [x] **P88-R3**: Build ActorFrame and CommandNodeFrame contracts that expose only private POV knowledge with source routes, while PlayerFacingPacket/NarratorPacket exposes only committed visible truth.
- [x] **P88-R4**: Model key NPCs as durable co-player processes with goals, active plans, next decision time, interrupts, inbox, private beliefs, memory cursor, write-scope reservations, and agency debt.
- [x] **P88-R5**: Replace prose/batch NPC ticking with ActorDecisionPacket plus backend-validated actor tools that return expanded ToolResult records and fail closed on invalid targets, hidden targets, stale versions, missing resources, or illegal authority.
- [x] **P88-R6**: Implement world-time plan execution and just-in-time offscreen catch-up so long-running actor work creates durable, inspectable state and can later be discovered through valid knowledge routes.
- [x] **P88-R7**: Implement provenance-rich memory, belief, report, rumor, and reflection policy so false claims do not become truth, summaries never replace source events, and actor retrieval stays source-backed and context-budgeted.
- [x] **P88-R8**: Replace abstract faction macro cognition with command/report/resource networks: command actors/nodes, units, standing orders, reports, communication latency, resources, and operation ledgers.
- [x] **P88-R9**: Add WorldThreads for long-running world pressure with clocks, stages, involved actors/factions, source events, surface routes, consequences, rumors, and player-facing surfacing without hidden truth leaks.
- [x] **P88-R10**: Add latency/context observability for living-world turns, including serialized LLM group counts, parallel groups, token usage, retries, context budget traces, hidden-truth exclusion, and no truncation/fake-success shortcuts.
- [x] **P88-R11**: Extend rollback, retry, undo, and checkpoint restore to simulation queue, proposals, actor processes, world threads, faction operations, memories/beliefs, event supersession, and narrator/cache artifacts.
- [x] **P88-R12**: Prove the full living-world implementation through deterministic invariant tests, integration state-diff tests, focused live Playwright routes, deep live routes, and prose/playfeel review across tourist, key-NPC, faction, false-claim, combat, rollback, memory-stress, hidden-truth, and latency routes.

Verification: Phase 88 is verified complete by `88-VERIFICATION.md`, `88-VERIFICATION-MATRIX.md`, and `evidence/wave-7/final-closeout.md`. Final clone-pool live proof passed 8 routes / 14 turns / 0 hard failures with no output clipping or turn rollback events.

### Phase 89 — Runtime Turn Resilience and Narrator Repair Boundary

- [x] **P89-R1**: Add an explicit TurnSaga lifecycle with persisted phase/status artifacts, including `resolved_pending_narration`.
- [x] **P89-R2**: Persist Oracle decisions and SettledTurnPackets independently from final narrator output so paid adjudication/resolution can resume without re-running.
- [x] **P89-R3**: Split deterministic backend mutation rejection from narrator grounding/quality repair; prose-layer defects must not rollback accepted state.
- [x] **P89-R4**: Add narrator repair/regeneration for unsupported concrete pressure, hidden leaks, malformed prose, and thin/failed narration.
- [x] **P89-R5**: Reserve full rollback for state corruption, stale version conflict, or unrecoverable atomic mutation failure.
- [x] **P89-R6**: Ensure next player turn starts only from a finalized or intentionally resumable worldVersion boundary.
- [x] **P89-R7**: Prove chakra-coin/narrator-pressure, narrator failure, Oracle persistence, and resume-after-crash regressions.
- [x] **P89-R8**: Keep pending narration locked/resumable so the next player action cannot race ahead of an unresolved delivered response.
- [x] **P89-R9**: Preserve accepted adjudication when narrator pressure repair is needed, including the weak-chakra coin miss regression.
- [x] **P89-R10**: Produce Phase 89 verification artifacts mapping requirements to deterministic tests, live route output, and scope checks.

### Phase 90 — Playable GM Bridge Tools for Fuzzy Player Intent

- [x] **P90-R1**: Add non-state candidate/affordance tools for visible actions, navigation, actor/object/POI lookup, known facts, and route checks.
- [x] **P90-R2**: Add constrained state-bearing bridge tools for legal movement, searches, scene-local extras, minor POIs, and player-intent records.
- [x] **P90-R3**: Teach GM prompt policy to bridge understandable low-risk fuzzy intent instead of asking for exact backend IDs.
- [x] **P90-R4**: Ask clarification only when risk, cost, identity, contradiction, or irreversible impact makes silent bridging unfair.
- [x] **P90-R5**: Keep dynamic POI/extra creation bounded to mundane local affordances, not plot-critical artifacts or key NPCs.
- [x] **P90-R6**: Return compact ToolResults/observations and next legal tools so the GM can continue after failed candidate/action calls.
- [x] **P90-R7**: Add reviewer/repair for parser-like unnecessary clarification and prove tourist/courier fuzzy-navigation routes advance play without exact-ID questions while narrating only settled truth.

### Phase 91 — Living World Proposal Commit and Surface Signal Pipeline

- [x] **P91-R1**: Add explicit proposal terminal states: committed, rejected, expired, deferred, superseded, needs-rebase, and needs-retry.
- [x] **P91-R2**: Store proposal preconditions, base world version, read set, write scope, due time, intended tools, priority, and expiry policy.
- [x] **P91-R3**: Implement proposal commit/rebase/retry execution through backend-validated tools, never direct narration or uncommitted truth.
- [x] **P91-R4**: Resolve due visible proposals before SceneFrame assembly when their effects are current-POV relevant.
- [x] **P91-R5**: Add surface-signal policy for committed offscreen events and world threads.
- [x] **P91-R6**: Prevent proposals from entering SceneFrame, NarratorPacket, or player-facing prose as truth before commit.
- [x] **P91-R7**: Add watchdog/metrics for proposal terminal state ratio, commit ratio, stale jobs, and surface signal coverage.
- [x] **P91-R8**: Prove ignored-world-time routes produce committed events/thread updates/surface signals, not only proposal backlog.
- [x] **P91-R9**: Produce Phase 91 closeout evidence mapping proposal lifecycle, commit/surface metrics, packet truth firewall, and route artifacts to requirements.

### Phase 92 — Key Actor and Faction Scheduling Repair

- [x] **P92-R1**: Classify actor/faction work by critical path so visible/current-scope catch-up runs before GM Read while distant work stays scheduled.
- [x] **P92-R2**: Wake key actors via world time, reports, direct observation, interrupts, deadlines, agency debt, and surface exposure, not per-turn polling.
- [x] **P92-R3**: Execute key NPC due plan steps from private ActorFrames with source-backed knowledge and backend-validated actor tools.
- [x] **P92-R4**: Implement faction command/report/resource paths for orders, operations, units, standing orders, and communication latency.
- [x] **P92-R5**: Add just-in-time catch-up before exposing unresolved actors, locations, or faction consequences to the player.
- [x] **P92-R6**: Preserve private names/facts/beliefs through viewer-specific identity and knowledge routes.
- [x] **P92-R7**: Prove offscreen key NPC/faction actions leave discoverable consequences without waking every NPC every turn.
- [x] **P92-R8**: Produce focused acceptance evidence proving key-actor and faction scenarios, private POV, and no every-NPC polling.

### Phase 93 — Latency and Context Budget Instrumentation

- [ ] **P93-R1**: Record per-stage timing and L0-L4 critical-path classification for player turns, actor work, faction work, and narration repair.
- [ ] **P93-R2**: Identify safe parallel groups for retrieval and independent proposals without mutating stale versions.
- [ ] **P93-R3**: Expose honest UI stage messages while hiding private actor/faction content.
- [ ] **P93-R4**: Add explicit budgets for SceneFrame, OracleFrame, ActorFrame, FactionCommandFrame, NarratorPacket, and ReviewerPacket.
- [ ] **P93-R5**: Use visibility-gated retrieval and source-linked summaries instead of dumping whole world state or silently truncating model output.
- [ ] **P93-R6**: Add overflow warnings/redaction audits proving hidden proposals/private facts are excluded from narrator packets.
- [ ] **P93-R7**: Prove latency/context traces explain slow turns without arbitrary model-duration caps, output truncation, or fake success.
- [ ] **P93-R8**: Prove narrator redaction and UI stage copy are player-safe: hidden facts/proposals are counted as excluded and stage messages do not reveal private actor/faction content.

### Phase 94 — Focused Living World Playtest and Runtime Acceptance Gate

- [ ] **P94-R1**: Build reliable clone-pool playtest baselines so gameplay-distance tests do not repeatedly pay worldgen cost.
- [ ] **P94-R2**: Run focused routes for tourist/fuzzy navigation, uncertain Oracle action, false claims, proposal backlog, key NPC/faction discovery, combat/power, hidden-truth privacy, and narrator repair.
- [ ] **P94-R3**: Preserve hard evidence: logs, packets, state diffs, job/proposal ledgers, surface signals, latency/context traces, screenshots, and route summaries.
- [ ] **P94-R4**: Add hard automated invariants for rollback, narrator repair, proposal truth boundaries, privacy, and next-turn worldVersion integrity.
- [ ] **P94-R5**: Add trace-based living-world assertions for proposal terminal states, discoverable surface signals, key NPC progress, and faction causality.
- [ ] **P94-R6**: Use LLM/human review for prose/playfeel, parser-like GM behavior, low-stakes interest, and living-world feel instead of pretending code heuristics judge text quality.
- [ ] **P94-R7**: Allow long model turns without duration caps while keeping harness submission, server health, and retry behavior reliable.

## Out of Scope

Explicitly excluded from this milestone to keep it reconciliation-driven.

| Feature | Reason |
|---------|--------|
| New worldgen feature verticals | Worldgen breadth already shipped; this milestone is about gameplay truthfulness |
| Large non-game shell redesigns | UI overhaul shipped in v1.0; only gameplay-critical UX fallout belongs here |
| Multiplayer / cloud / auth | Still outside the local singleplayer product boundary |
| Purely decorative polish unrelated to gameplay feel | Prompt and presentation work is only in scope when it improves actual play readability, scene fidelity, or writing quality |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RINT-01 | Phase 37 | Complete |
| RINT-02 | Phase 39 | Complete |
| RINT-03 | Phase 41 | Complete |
| RINT-04 | Phase 38 | Complete |
| SIMF-01 | Phase 40 | Complete |
| SIMF-02 | Phase 39 | Complete |
| SIMF-03 | Phase 41 | Complete |
| GSEM-01 | Phase 42 | Complete |
| GSEM-02 | Phase 42 | Complete |
| GSEM-03 | Phase 43 | Complete |
| GSEM-04 | Phase 43 | Complete |
| DOCA-01 | Phase 44 | Complete |
| DOCA-02 | Phase 44 | Complete |
| DOCA-03 | Phase 55 | Complete |
| SCEN-01 | Phase 53 | Complete |
| SCEN-02 | Phase 55 | Complete |
| WRIT-01 | Phase 53 | Complete |
| CHARF-01 | Phase 48 | Complete |
| RES-01 | Phase 53 | Complete |
| RES-02 | Phase 51 | Complete |
| UX-01 | Phase 50 | Complete |
| UX-02 | Phase 54 | Complete |
| TRUTH-01 | Phase 56 | Complete |
| P60-R1 | Phase 60 | Complete |
| P60-R2 | Phase 60 | Complete |
| P60-R3 | Phase 60 | Complete |
| P60-R4 | Phase 60 | Complete |
| P60-R5 | Phase 60 | Complete |
| P60-R6 | Phase 60 | Complete |
| P60-R7 | Phase 60 | Complete |
| P60-R8 | Phase 60 | Complete |
| P60-R9 | Phase 60 | Complete |
| P61-R1 | Phase 61 | Complete |
| P61-R2 | Phase 61 | Complete |
| P61-R3 | Phase 61 | Complete |
| P61-R4 | Phase 61 | Complete |
| P61-R5 | Phase 61 | Complete |
| P62-R1 | Phase 62 | Complete |
| P62-R2 | Phase 62 | Complete |
| P62-R3 | Phase 62 | Complete |
| P62-R4 | Phase 62 | Complete |
| P62-R5 | Phase 62 | Complete |
| P63-R1 | Phase 63 | Complete |
| P63-R2 | Phase 63 | Complete |
| P63-R3 | Phase 63 | Complete |
| P63-R4 | Phase 63 | Complete |
| P63-R5 | Phase 63 | Complete |
| P63-R6 | Phase 63 | Complete |
| P63-R7 | Phase 63 | Complete |
| P63-R8 | Phase 63 | Complete |
| P64-R1 | Phase 64 | Complete |
| P64-R2 | Phase 64 | Complete |
| P64-R3 | Phase 64 | Complete |
| P64-R4 | Phase 64 | Complete |
| P64-R5 | Phase 64 | Complete |
| P64-R6 | Phase 64 | Complete |
| P64-R7 | Phase 64 | Complete |
| P64-R8 | Phase 64 | Complete |
| P65-R1 | Phase 65 | Complete |
| P65-R2 | Phase 65 | Complete |
| P65-R3 | Phase 65 | Complete |
| P65-R4 | Phase 65 | Complete |
| P65-R5 | Phase 65 | Complete |
| P65-R6 | Phase 65 | Complete |
| P65-R7 | Phase 65 | Complete |
| P65-R8 | Phase 65 | Complete |
| P65-R9 | Phase 65 | Complete |
| P65-R10 | Phase 65 | Complete |
| P66-R1 | Phase 66 | Complete |
| P66-R2 | Phase 66 | Complete |
| P66-R3 | Phase 66 | Complete |
| P66-R4 | Phase 66 | Complete |
| P66-R5 | Phase 66 | Complete |
| P66-R6 | Phase 66 | Complete |
| P66-R7 | Phase 66 | Complete |
| P66-R8 | Phase 66 | Complete |
| P67-R1 | Phase 67 | Complete |
| P67-R2 | Phase 67 | Complete |
| P67-R3 | Phase 67 | Complete |
| P67-R4 | Phase 67 | Complete |
| P67-R5 | Phase 67 | Complete |
| P67-R6 | Phase 67 | Complete |
| P67-R7 | Phase 67 | Complete |
| P67-R8 | Phase 67 | Complete |
| P67-R9 | Phase 67 | Complete |
| P68-R1 | Phase 68 | Complete |
| P68-R2 | Phase 68 | Complete |
| P68-R3 | Phase 68 | Complete |
| P68-R4 | Phase 68 | Complete |
| P68-R5 | Phase 68 | Complete |
| P68-R6 | Phase 68 | Complete |
| P68-R7 | Phase 68 | Complete |
| P68-R8 | Phase 68 | Complete |
| P68-R9 | Phase 68 | Complete |
| P69-R1 | Phase 69 | Complete |
| P69-R2 | Phase 69 | Complete |
| P69-R3 | Phase 69 | Complete |
| P69-R4 | Phase 69 | Complete |
| P69-R5 | Phase 69 | Complete |
| P69-R6 | Phase 69 | Complete |
| P69-R7 | Phase 69 | Complete |
| P69-R8 | Phase 69 | Complete |
| P69-R9 | Phase 69 | Complete |
| P71-R1 | Phase 71 | Complete |
| P71-R2 | Phase 71 | Complete |
| P71-R3 | Phase 71 | Complete |
| P71-R4 | Phase 71 | Complete |
| P71-R5 | Phase 71 | Complete |
| P72-R1 | Phase 72 | Complete |
| P72-R2 | Phase 72 | Complete |
| P72-R3 | Phase 72 | Complete |
| P72-R4 | Phase 72 | Complete |
| P72-R5 | Phase 72 | Complete |
| P72-R6 | Phase 72 | Complete |
| P72-R7 | Phase 72 | Complete |
| P73-R1 | Phase 73 | Complete |
| P73-R2 | Phase 73 | Complete |
| P73-R3 | Phase 73 | Complete |
| P73-R4 | Phase 73 | Complete |
| P73-R5 | Phase 73 | Complete |
| P73-R6 | Phase 73 | Complete |
| P73-R7 | Phase 73 | Complete |
| P74-R1 | Phase 74 | Complete |
| P74-R2 | Phase 74 | Complete |
| P74-R3 | Phase 74 | Complete |
| P74-R4 | Phase 74 | Complete |
| P74-R5 | Phase 74 | Complete |
| P74-R6 | Phase 74 | Complete |
| P75-R1 | Phase 75 | Complete |
| P75-R2 | Phase 75 | Complete |
| P75-R3 | Phase 75 | Complete |
| P75-R4 | Phase 75 | Complete |
| P75-R5 | Phase 75 | Complete |
| P75-R6 | Phase 75 | Complete |
| P75-R7 | Phase 75 | Complete |
| P75-R8 | Phase 75 | Complete |
| P76-R1 | Phase 76 | Complete |
| P76-R2 | Phase 76 | Complete |
| P76-R3 | Phase 76 | Complete |
| P76-R4 | Phase 76 | Complete |
| P76-R5 | Phase 76 | Complete |
| P76-R6 | Phase 76 | Complete |
| P77-R1 | Phase 77 | Complete |
| P77-R2 | Phase 77 | Complete |
| P77-R3 | Phase 77 | Complete |
| P77-R4 | Phase 77 | Complete |
| P77-R5 | Phase 77 | Complete |
| P77-R6 | Phase 77 | Complete |
| P77-R7 | Phase 77 | Complete |
| P77-R8 | Phase 77 | Complete |
| P78-R1 | Phase 78 | Complete |
| P78-R2 | Phase 78 | Complete |
| P78-R3 | Phase 78 | Complete |
| P78-R4 | Phase 78 | Complete |
| P78-R5 | Phase 78 | Complete |
| P78-R6 | Phase 78 | Complete |
| P78-R7 | Phase 78 | Complete |
| P79-R1 | Phase 79 | Complete |
| P79-R2 | Phase 79 | Complete |
| P79-R3 | Phase 79 | Complete |
| P79-R4 | Phase 79 | Complete |
| P79-R5 | Phase 79 | Complete |
| P79-R6 | Phase 79 | Complete |
| P80-R1 | Phase 80 | Complete |
| P80-R2 | Phase 80 | Complete |
| P80-R3 | Phase 80 | Complete |
| P80-R4 | Phase 80 | Complete |
| P80-R5 | Phase 80 | Complete |
| P80-R6 | Phase 80 | Complete |
| P81-R1 | Phase 81 | Complete |
| P81-R2 | Phase 81 | Complete |
| P81-R3 | Phase 81 | Complete |
| P81-R4 | Phase 81 | Complete |
| P81-R5 | Phase 81 | Complete |
| P81-R6 | Phase 81 | Complete |
| P81-R7 | Phase 81 | Complete |
| P81-R8 | Phase 81 | Complete |
| P82-R1 | Phase 82 | Planned |
| P82-R2 | Phase 82 | Planned |
| P82-R3 | Phase 82 | Planned |
| P82-R4 | Phase 82 | Planned |
| P82-R5 | Phase 82 | Planned |
| P82-R6 | Phase 82 | Planned |
| P82-R7 | Phase 82 | Planned |
| P82-R8 | Phase 82 | Planned |
| P83-R1 | Phase 83 | Planned |
| P83-R2 | Phase 83 | Planned |
| P83-R3 | Phase 83 | Planned |
| P83-R4 | Phase 83 | Planned |
| P83-R5 | Phase 83 | Planned |
| P83-R6 | Phase 83 | Planned |
| P83-R7 | Phase 83 | Planned |
| P83-R8 | Phase 83 | Planned |
| P88-R1 | Phase 88 | Complete |
| P88-R2 | Phase 88 | Complete |
| P88-R3 | Phase 88 | Complete |
| P88-R4 | Phase 88 | Complete |
| P88-R5 | Phase 88 | Complete |
| P88-R6 | Phase 88 | Complete |
| P88-R7 | Phase 88 | Complete |
| P88-R8 | Phase 88 | Complete |
| P88-R9 | Phase 88 | Complete |
| P88-R10 | Phase 88 | Complete |
| P88-R11 | Phase 88 | Complete |
| P88-R12 | Phase 88 | Complete |
| P89-R1 | Phase 89 | Complete |
| P89-R2 | Phase 89 | Complete |
| P89-R3 | Phase 89 | Complete |
| P89-R4 | Phase 89 | Complete |
| P89-R5 | Phase 89 | Complete |
| P89-R6 | Phase 89 | Complete |
| P89-R7 | Phase 89 | Complete |
| P89-R8 | Phase 89 | Complete |
| P89-R9 | Phase 89 | Complete |
| P89-R10 | Phase 89 | Complete |
| P90-R1 | Phase 90 | Complete |
| P90-R2 | Phase 90 | Complete |
| P90-R3 | Phase 90 | Complete |
| P90-R4 | Phase 90 | Complete |
| P90-R5 | Phase 90 | Complete |
| P90-R6 | Phase 90 | Complete |
| P90-R7 | Phase 90 | Complete |
| P91-R1 | Phase 91 | Complete |
| P91-R2 | Phase 91 | Complete |
| P91-R3 | Phase 91 | Complete |
| P91-R4 | Phase 91 | Complete |
| P91-R5 | Phase 91 | Complete |
| P91-R6 | Phase 91 | Complete |
| P91-R7 | Phase 91 | Complete |
| P91-R8 | Phase 91 | Complete |
| P91-R9 | Phase 91 | Complete |
| P92-R1 | Phase 92 | Complete |
| P92-R2 | Phase 92 | Complete |
| P92-R3 | Phase 92 | Complete |
| P92-R4 | Phase 92 | Complete |
| P92-R5 | Phase 92 | Complete |
| P92-R6 | Phase 92 | Complete |
| P92-R7 | Phase 92 | Complete |
| P92-R8 | Phase 92 | Complete |
| P93-R1 | Phase 93 | Planned |
| P93-R2 | Phase 93 | Planned |
| P93-R3 | Phase 93 | Planned |
| P93-R4 | Phase 93 | Planned |
| P93-R5 | Phase 93 | Planned |
| P93-R6 | Phase 93 | Planned |
| P93-R7 | Phase 93 | Planned |
| P93-R8 | Phase 93 | Planned |
| P94-R1 | Phase 94 | Planned |
| P94-R2 | Phase 94 | Planned |
| P94-R3 | Phase 94 | Planned |
| P94-R4 | Phase 94 | Planned |
| P94-R5 | Phase 94 | Planned |
| P94-R6 | Phase 94 | Planned |
| P94-R7 | Phase 94 | Planned |

**Coverage:**
- v1.1 requirements: 248 total
- Mapped to phases: 248
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-05-10 after Phase 89 final verification closeout*
