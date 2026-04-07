---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-04-07T05:01:28.528Z"
last_activity: 2026-04-07
progress:
  total_phases: 30
  completed_phases: 29
  total_plans: 107
  completed_plans: 106
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The LLM is the narrator, never the engine. All mechanical outcomes are resolved by backend code.
**Current focus:** Phase 35 — restore-npc-tier-visibility-and-manual-tier-control-in-world-review

## Current Position

Phase: 35 (restore-npc-tier-visibility-and-manual-tier-control-in-world-review) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Current Snapshot:**

- Active roadmap phases: 28
- Completed phases: 27
- Planned or in-progress phases: 1
- Total plans tracked: 88
- Completed plans: 88
- Pending plans: 0

**Open Work:**

- Active execution target: finish the remaining Phase 33 browser verification reruns on top of the completed Phase 32 desktop shell migration
- Next required workflow step: unblock PinchTab localhost access, then resume Phase 33 browser reruns for launcher, campaign creation, world review, and character creation
- Phase 29 and Phase 30 formal closeout still remain separate bookkeeping work, but they no longer block the Phase 32 UI output on the current baseline
- Backlog items outside active execution order are tracked in `.planning/BACKLOG.md`

**Notes:**

- Historical per-plan timing metrics from earlier GSD runs were removed during planning hygiene because they no longer matched the active roadmap after renumbering and archival cleanup.
- Use `ROADMAP.md` progress plus phase directories as the source of truth for current execution state.
- Latest execution: Phase 32 plans `32-00` through `32-05` completed on 2026-04-01; `32-BASELINE-CLOSEOUT.md` now records `Status: GO`.
- Phase 29 execution started on 2026-04-01. Plans 29-01 and 29-02 are complete and committed.
- Plans 29-03 and 29-04 still have their canonical runtime/runtime-mutation implementations in the worktree; targeted backend TypeScript filtering remained clean during the 2026-04-01 resume pass, but unrestricted Vitest and green commits are still pending.
- Plan 29-05 was resumed on 2026-04-01 and the remaining editor migration was completed in worktree: character pages now store `CharacterDraft`, the character card edits grouped draft fields, and the NPC review section edits draft-backed NPCs while preserving scaffold compatibility.
- Phase 30 implementation pass on 2026-04-01 added shared contract types, backend start/loadout/template seams, campaign-scoped persona template routes, frontend API wiring, player editor controls, and NPC review persona plumbing directly in the worktree.
- Phase 31 added shared prompt contracts plus harmonized runtime, character, worldgen, NPC/reflection, Oracle, and world-engine wording without touching Phase 32 UI scope or browser E2E work.
- The prerequisite backend and frontend targeted suites that blocked Wave 0 were rerun successfully during the Phase 32 resume pass, unblocking the UI overhaul.
- Plan 33-11 completed on 2026-04-02 and recorded a PinchTab-only transport contract plus the current external blocker: the shared PinchTab browser can browse the public web but renders `chrome-error://chromewebdata/` for `http://localhost:3000/`.
- Plan 33-12 completed on 2026-04-02 and closed the remaining `33-VERIFICATION.md` lint gap: the lore-section test now uses typed API mocks, `npm --prefix frontend run lint` exits 0, and the targeted lore-section Vitest suite still passes.
- Plan 33-06 completed on 2026-04-02 and restored routed concept/DNA persistence plus visible suggestion/generation progress for `/campaign/new` and `/campaign/new/dna`.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 11 phases derived from dependency analysis -- Foundation -> Turn -> Mechanics -> Control -> Memory -> NPC -> Reflection -> World -> Persistence -> Images -> Import
- [Roadmap]: Prompt Assembler builds token budgets from day one (prevents retrofit pain identified in research)
- [Roadmap]: Tool Executor validates every LLM tool call before DB write (trust boundary pattern)
- [01-01]: 4-char-per-token heuristic avoids tokenizer dependency while providing reasonable estimates
- [01-01]: Priority-based truncation (0=system rules through 7=conversation) with canTruncate flag
- [01-01]: Lore retrieval is best-effort -- embedder failure skips lore section gracefully
- [01-02]: Oracle uses temperature 0 override for deterministic rulings regardless of Judge settings
- [01-02]: Oracle result via X-Oracle-Result header to avoid mixing metadata into text stream
- [01-02]: Fallback to 50% chance on Oracle LLM failure -- game never blocks
- [Phase 02]: AI SDK v6 uses inputSchema (not parameters) for tool(), .text (not .textDelta), .input/.output (not .args/.result)
- [Phase 02]: Tool executor never throws -- returns ToolResult with success/error for LLM retry
- [Phase 02]: Episodic events stored with empty vector (embedding deferred to post-turn)
- [02-02]: Oracle result delivered via SSE event instead of X-Oracle-Result header
- [02-02]: submitAction extracted as reusable core for input form and quick action clicks
- [Phase 03]: NPCs do not have HP -- set_condition returns error guiding to add_tag/remove_tag for NPC conditions
- [Phase 03]: spawn_npc creates temporary tier NPCs (Storyteller-spawned are ephemeral by default)
- [Phase 03]: Inventory always shown in prompt even when empty -- explicit (empty) prevents LLM hallucination
- [03-03]: Re-fetch full world data on turn completion (onDone) rather than per-tool granular updates -- one GET keeps all panels in sync
- [03-03]: Props-driven panels -- sidebar panels receive data from game page, no internal data loading
- [04-01]: In-memory snapshot only (not persisted) -- single-step undo, per CONTEXT.md decision
- [04-01]: Spawned entity tracking via tool result inspection during SSE iteration
- [04-01]: Retry re-uses playerAction as intent (original intent/method not stored)
- [Phase 04]: Hover-reveal retry/undo buttons keep narrative UI clean while controls are discoverable
- [Phase 04]: Click-to-edit with textarea replacement and Ctrl+Enter save for inline assistant message editing
- [05-01]: Composite score formula: similarity*0.4 + recency*0.3 + importance*0.3 for balanced retrieval
- [05-01]: Delete-and-re-add pattern for LanceDB updates (no native UPDATE support)
- [05-01]: buildOnPostTurn helper extracts shared callback logic for /action and /retry
- [Phase 05]: 60% of conversation budget for recent msgs, 40% for first+important middle
- [Phase 05]: Relationship graph enrichment folded into NPC states section for richer per-NPC context
- [06-01]: NPC act() routes through Oracle same as player actions -- no auto-success for NPCs
- [06-01]: NPC ticks run sequentially to avoid conflicting DB state changes
- [06-01]: NPC tick failures logged but never block gameplay (fire-and-forget)
- [Phase 06]: Single batch generateObject call for all off-screen NPCs (not per-NPC) to minimize LLM calls
- [Phase 06]: Off-screen updates stored as episodic events with type npc_offscreen for future retrieval
- [07-01]: Reflection threshold set at 15 unprocessedImportance for meaningful accumulation
- [07-01]: Reflection fetches 10 episodic events (vs 3 for NPC tick) for richer synthesis
- [07-01]: Reflection runs as post-turn step 4 after NPC ticks and off-screen simulation
- [07-02]: One-step-up validation for wealth/skill tier progression prevents unrealistic jumps
- [07-02]: Wealth tier displayed as separate labeled line in Oracle prompt for explicit affordability evaluation
- [07-02]: No-wealth entities start at Destitute/Poor only; no-skill entities start at Novice only
- [08-01]: Faction territory detected via "Controlled by {name}" tag pattern on locations (case-insensitive)
- [08-01]: All factions loaded as neighbors (no graph traversal needed for small worlds)
- [08-01]: faction_action auto-creates chronicle entry alongside explicit add_chronicle_entry tool
- [Phase 08]: Event tags follow pattern Type-affected on locations (Plague-affected etc)
- [Phase 08]: No explicit event propagation -- LLM infers NPC awareness from WORLD STATE + NPC tags + SCENE context
- [Phase 08]: WORLD STATE section at priority 3 between SCENE and PLAYER STATE, canTruncate true
- [09-01]: Checkpoint ID format {timestamp}-{sanitized-name} for natural sort order and human readability
- [09-01]: better-sqlite3 .backup() API for safe SQLite snapshots instead of raw file copy
- [09-01]: Checkpoint load disconnects/reconnects both SQLite and LanceDB connections
- [Phase 09]: Auto-checkpoint triggers at HP <= 2 with non-blocking try/catch
- [Phase 09]: CheckpointPanel uses Dialog component, load triggers full page reload
- [Phase 12]: Added createLogger mock inline rather than importOriginal spread -- explicit test isolation
- [Phase 12]: No bugs found in infrastructure or settings -- all E2E tests passed clean
- [Phase 12]: OpenRouter+Gemini Flash used for QA testing (GLM had insufficient balance)
- [Phase 12]: Lore extraction failure is transient provider error, gracefully handled by try/catch fallback
- [Phase 12]: No bugs found in character creation -- all 3 modes (parse, generate, import V2) work correctly
- [Phase 12]: No bugs found in WorldBook import or checkpoint system -- both work correctly via API testing
- [Phase 12]: Use provider.chat() instead of provider() for Chat Completions API compatibility with third-party providers
- [Phase 12]: Retry pops both user+assistant messages since processTurn re-appends user message
- [Phase 12]: No visual bugs found -- all pages scored >= 3/5 on 6-aspect rubric
- [Phase 12]: LoreSection onRefresh was missing -- wired async re-fetch callback after WorldBook import
- [Phase 12]: No bugs found in checkpoint system -- save/load/delete all work correctly via browser
- [Phase 12]: No bugs found in campaign creation flow -- entire pipeline works end-to-end through browser
- [Phase 12]: Post-turn callback must be fire-and-forget (void IIFE) so SSE stream closes promptly after done event
- [Phase 13]: Oracle calibration bands: 5-15% (no tags), 60-75% (relevant tag), 80-90% (master) prevent over-generous probabilities
- [Phase 13]: CRITICAL OUTPUT RULES block at top of SYSTEM_RULES prevents Gemini Flash from echoing section headers into narrative
- [Phase 13]: NPC agent temperature 0 -> 0.3 for varied autonomous behavior; action bias strengthened
- [Phase 13]: IP terminology guidance references [WORLD PREMISE] and [LORE CONTEXT] for world-specific terms
- [Phase 13]: readCampaignConfig must include currentTick in return object (was silently dropped, causing tick to stick at 1)
- [Phase 13]: Faction tick interval lowered to 5 (from 10) for more frequent world simulation events
- [Phase 13]: NPC reflection threshold lowered to 10 (from 15) for more responsive belief updates
- [Phase 13]: Storyteller stepCountIs(3) to allow narrative + state tools + quick_actions in one turn
- [Phase 13]: Miss narration requires concrete examples per action type to prevent LLM from narrating positive outcomes
- [Phase 13]: COMBAT HP TRACKING rules mandate set_condition call on every damage/heal event in combat
- [Phase 13]: set_condition damage scale: light=-1, solid=-1/-2, devastating=-2/-3 guides LLM on delta sizing
- [Phase 13]: Oracle receives HP context via scene string; wounded state reduces probability by 10-20%
- [Phase 13]: Non-lethal vs lethal HP=0 narration split in SYSTEM_RULES based on fight context
- [14-02]: onStateUpdate triggers refreshWorldData immediately -- no debounce needed for 1-3 events per turn
- [14-02]: Lore extraction 3-attempt strategy: 2x full-size (min 20), 1x reduced (min 10) with 2s delay between retries
- [Phase 14]: Remove vector field entirely from initial episodic event row -- matches lore-cards pattern
- [Phase 14]: Use npx.cmd on Windows instead of shell:true for MCP spawn
- [Phase 14]: Fallback quick actions are deterministic (not AI) for zero latency and guaranteed availability
- [Phase 14]: All 5 bug fixes verified working via API testing: episodic vectors, MCP spawn, quick actions fallback, sidebar refresh, lore retry
- [15-01]: outcomeTier passed as optional param through executeToolCall -- backward compatible with NPC tools
- [15-01]: move_to tool validates connection graph and returns available paths on failure for LLM self-correction
- [15-01]: NPC engagement rules are prompt-level (not code enforcement) -- LLM compliance expected from explicit MUST instructions
- [15-02]: Catch-all regex for unknown function-call patterns prevents future tool leaks without manual enumeration
- [15-02]: auto_checkpoint event emitted from turn-processor, handled in chat.ts -- separation of concerns
- [15-02]: HP=0 awareness added to outcome instructions (miss + weak_hit) rather than post-hoc injection
- [Phase 16]: GLM 4.7 Flash structured output limitation is a provider issue, not a code bug
- [Phase 16]: Scaffold-saver beliefs field stores {} instead of [] -- minor inconsistency, non-blocking
- [Phase 16]: Faction cross-references maintained via relationships table (Member tags), not in NPC persona text
- [Phase 16]: save-edits FK constraint on active campaigns is correct behavior -- scaffold rewrite destroys locations referenced by player FK
- [Phase 16]: GLM 4.7 Flash fails generateObject structured output -- provider compatibility issue, not code defect
- [Phase 17]: No mocks needed for frontend pure logic tests -- fixture data only
- [Phase 17]: Mock paths resolved relative to test file location, not source module
- [Phase 17]: Inline vi.mock factories to avoid hoisting issues with external variable references
- [Phase 17]: Mock all worldgen service functions inline rather than importing from external factory
- [Phase 17]: Let parseBody execute with real Zod schemas rather than mocking for actual validation testing
- [Phase 24]: ScaffoldNpc.tier made optional to avoid breaking downstream until plan 24-03
- [Phase 24]: IP context block inverted: use REAL canonical names instead of avoid trademarked names
- [Phase 24]: DNA generation uses 6 sequential LLM calls with accumulated context per category
- [Phase 24]: Plan+detail mini-call pattern for incremental world building with canonical IP fidelity
- [Phase 24]: NPC plan+detail pattern: 3-5 mini-calls instead of 1 monolithic call for tiered key+supporting NPCs
- [Phase 24]: Lore extractor ipContext is optional 4th param -- backward compatible with existing callers
- [Phase 24]: scaffold-generator.ts reduced from 367 to 98 lines via re-export pattern from scaffold-steps/
- [Phase 24]: Scaffold tier 'supporting' maps to DB tier 'persistent' at saver boundary
- [Phase 25]: PremiseDivergence lives beside IpResearchContext so canonical research stays immutable.
- [Phase 25]: Routes compute-or-load premiseDivergence once and pass the cached artifact downstream instead of mutating ipContext.
- [Phase 25]: Prompt rewrites were deferred; this plan establishes interpretation and transport first.
- [Phase 25]: Prompt helpers now separate canonical baseline from interpreted divergence plus a reusable known-IP generation contract.
- [Phase 25]: scaffold-generator computes or reuses one PremiseDivergence artifact and injects the same object into every known-IP scaffold step and lore extraction call.
- [Phase 25]: Known-IP lore generation updates only divergence-affected facts while keeping untouched canon explicit instead of suppressing names.
- [Phase 25]: The old premise-override helper stays only as a deprecated compatibility shim and no longer participates in the live worldgen export surface.
- [Phase 25]: Phase 25 regressions should prove behavior at three layers: divergence interpretation, prompt assembly, and route/cache reuse.
- [Phase 25]: Known-IP single-seed generation now computes premise divergence when callers omit the cached artifact so every seed entry point follows the same structured path.
- [Phase 26]: Reusable worldbooks live under campaigns/_worldbook-library with one immutable record file per normalized content hash plus a lightweight index.json.
- [Phase 26]: Campaigns persist worldbookSelection as a structured snapshot beside ipContext and premiseDivergence instead of owning reusable records.
- [Phase 26]: The library import route parses raw JSON first, then lets the manager decide whether classification is needed so duplicate uploads skip reclassification.
- [Phase 26]: Reusable worldbooks are composed only on the backend, with deterministic source and entity sorting.
- [Phase 26]: Route contracts stay additive: selectedWorldbooks/worldbookSelection are new inputs while legacy worldbookEntries remains valid.
- [Phase 26]: World generation rebuilds ipContext from saved worldbookSelection before any franchise research fallback.
- [Phase 26]: Wizard state now tracks reusable library items plus an ordered selected source set instead of transient classified entries.
- [Phase 26]: Direct create no longer rebuilds ipContext in the browser; worldbookSelection is enough for backend-owned composition.
- [Phase 26]: Step 1 keeps upload and library selection in one surface while leaving advanced management out of scope.
- [Phase 27]: Lore item edits use PUT with a full replacement payload for term, definition, and category.
- [Phase 27]: Lore card deletion stays row-level and returns a boolean not-found signal to map cleanly to route-level 404 responses.
- [Phase 27]: Lore edits require a resolved embedder and rewrite the full lore table so ids stay stable while vectors stay fresh.
- [Phase 27]: LoreSection clears search results before awaiting onRefresh so parent lore state remains authoritative after item mutations.
- [Phase 27]: LoreCardUpdateInput stays narrowed to canonical categories while LoreCardItem reads remain string-typed for compatibility with existing callers and fixtures.
- [Phase 27]: Added a repo-root Vitest alias config so the plan's exact npm --prefix verification command resolves frontend @/ imports correctly.
- [Phase 27]: Reused the existing 'Voices of the Void' campaign as the smoke target because it already had working lore search and more than two lore cards.
- [Phase 28]: Phase 31 must audit prompt families by task boundary, not treat the prompt system as one monolith.
- [Phase 28]: Prompt rewrites must consume structured character and start-condition fields before any derived runtime tags.
- [Phase 28]: Runtime, character, and worldgen prompt families should centralize shared contract fragments instead of repeating contradictory copies.
- [Phase 31]: Phase 31 centralized canonical prompt vocabulary into shared helpers and reused it across runtime, character, worldgen, and support prompts.
- [Phase 31]: Support prompt audits preserve narrow task boundaries: Oracle stays deterministic, world-engine stays macro-concrete, and NPC/reflection prompts stay canonical-state-first.
- [Phase 32]: Phase 32 stops at Wave 0 when the prerequisite Phase 29/30 regression bundle is red.
- [Phase 32]: Baseline blockers are documented, not worked around, because the approved plan makes 32-00 a strict gate.
- [Phase 32]: Phase 32 owns all non-game desktop flows through a shared (non-game) shell while leaving /game structurally separate.
- [Phase 32]: Legacy /world-review and /character-creation pages are redirect-only compatibility stubs once canonical shell routes exist.
- [Phase 32]: Character and review redesigns must stay on the existing CharacterDraft, persona-template, and loadout seams instead of introducing parallel UI models.
- [Phase 33]: Used curl HTTP verification instead of PinchTab browser testing due to remote Chrome network isolation
- [Phase 33]: Removed unused resizable.tsx shadcn component with broken dependency rather than fixing import
- [Phase 33]: No bugs found in character creation pipeline -- all creation modes work correctly with real GLM LLM calls
- [Phase 33]: Used curl HTTP verification for character creation E2E due to remote Chrome network isolation
- [Phase 33]: Used curl HTTP verification instead of PinchTab due to remote Chrome network isolation
- [Phase 33]: No bugs found in original-world creation flow -- all shell routes, API endpoints, and SSE generation work correctly
- [Phase 33]: Known-IP world review verified: campaign creation, scaffold generation, all 5 sections, editing persistence, NPC creation, section regeneration, and lore search all pass with real GLM LLM calls
- [Phase 33]: Parallel agent DB contention is a known operational issue: singleton DB connection gets switched when concurrent agents load different campaigns during long-running operations
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: Phase 33 reruns remain PinchTab-only; when the bridge cannot render localhost, the plan records a concrete blocker instead of substituting another transport.
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: The current failure is external to WorldForge because localhost responds on the host while PinchTab is attached to a shared proxied browser profile.
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: Non-game shell visuals now flow through shell-specific CSS variables instead of generic card/sidebar theme buckets. — Gap 1 came from mixing generic shadcn surfaces and one-off route styling. A dedicated shell token layer removes the radius and surface drift at the source.
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: Shared shell regressions assert data-shell-region and data-shell-surface hooks so page tests pin the contract without depending on one-off class strings. — The plan needed regressions that survive visual refinements. Semantic shell hooks keep the tests narrow to the shared shell contract instead of brittle cosmetic classes.
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: The lore-section test now binds mocked API functions to the real @/lib/api signatures so the test contract stays explicit without changing behavior.
- [Phase 33-browser-e2e-verification-for-redesigned-creation-flows]: Phase 33 closure evidence uses the actual npm --prefix frontend run lint exit code; unrelated warnings remain non-blocking because lint exits 0.
- [Phase 33]: Campaign readiness is derived from the routed campaign id plus active-campaign fallback so shell links reflect real generation state.
- [Phase 33]: Generated-world requests now return HTTP 409 with a clear readiness error instead of serving empty pseudo-world data.
- [Phase 33]: Persist routed creation flow state in sessionStorage rather than route-local React memory — Leaving and returning to /campaign/new or navigating back/forward was wiping concept and DNA state. Hydrating the existing wizard from sessionStorage fixes that without adding a parallel state machine.
- [Phase 33]: Routed concept and DNA pages must surface active suggestion/generation status and block empty DNA generation — The wizard already tracked suggestion and generation progress, but the routed UI never rendered it and still allowed empty DNA creation attempts. Inline progress and validation make the routed flow recoverable and browser-verifiable.
- [Phase 34]: Per-entity NPC detail loop replaces batch-of-5 for richer cross-references; schema excludes name to force planned name
- [Phase 34]: 4 category-specific lore calls with post-filtering prevent cross-category leaks; failed category returns empty gracefully
- [Phase 33]: DNA suggestion calls take 3-5 minutes with GLM-5.1 (6 sequential LLM calls) -- long but functional
- [Phase 33]: LLM failure with invalid API key results in empty DNA state with clear validation and recovery paths -- no dead-end
- [Phase 33]: Loading existing known-IP campaign satisfies create-or-load requirement without redundant LLM generation
- [Phase 33]: Save-edits triggers lore re-extraction with real LLM calls adding ~30s save latency -- functional but noticeable
- [Phase 33]: Use getByRole heading/tab to disambiguate flat-layout test assertions from duplicate text in sidebar + page header
- [Phase 35]: Review scaffold tier stays key/supporting while DB persistence remains key/persistent.
- [Phase 35]: saveEditsSchema now applies scaffold tier defaults inside the transform so canonical draft tiers can win when explicit scaffold tier is absent.

### Roadmap Evolution

- Phase 12 added: E2E QA & Bug Fixing — full browser-based verification + iterative bug fixing
- [Phase 10]: Plain fetch to OpenAI-compatible endpoint for maximum image provider compatibility
- [Phase 10]: All image generation is fire-and-forget with void async IIFE -- never blocks gameplay
- [11-01]: Single LLM call for batch WorldBook entry classification (not per-entry)
- [11-01]: Bestiary entries stored as lore cards with category "npc", lore_general as "concept"
- [Phase 11-02]: withMcpClient kept as deprecated wrapper; withSearchMcp is preferred API for configurable search providers
- [Phase 11-02]: SEARCH_MCP_CONFIGS record maps SearchProvider to MCP server command/args for easy provider addition
- Phase 14 added: Final Systems Verification & Bug Fixing — fix remaining bugs + verify all systems per docs/
- Phase 16 added: NPC System QA — Three NPC Tiers + World Gen Integration
- Phase 17 added: Unit Test Coverage — real tests for untested backend and frontend modules, desloppify strict 95+
- Phase 23 added: Unified Research & World Generation Pipeline — single research with cache, feeds both DNA and scaffold
- Phase 24 added: Worldgen Known IP Quality — canonical DNA/premise/locations/factions/NPCs, key vs supporting NPC tiers, research-grounded lore
- Phase 25 added: Replace premise-override heuristics with structured divergence interpretation
- Phase 26 added: Reusable multi-worldbook library for campaign creation
- Phase 27 added: Lore card editing and deletion
- Phase 35 added: Restore NPC tier visibility and manual tier control in world review
- Planning hygiene (2026-03-30): ROADMAP/STATE reconciled with completed phase artifacts; legacy superseded E2E phase directories moved out of active `.planning/phases/`
- Phase 23 completed (2026-03-30): cached IP research pipeline reconciled, regression-tested, and verified against the live codebase

### Pending Todos

- Todo ideas were promoted into active roadmap phases 26 and 27.
- New active roadmap phases 28-33 were queued on 2026-04-01 for character-system redesign, prompt audit, desktop-first UI overhaul, persona templates, and browser verification.

### Blockers/Concerns

- Phase 33 browser reruns are blocked until PinchTab is restarted on the same host as the dev servers with a clean Chrome profile and no localhost proxy interception.
- Phase 33 real-browser reruns are still blocked by the PinchTab localhost transport issue; only the lint-verification gap is now closed.
- Phase 29 and Phase 30 still need their separate formal closeout and unrestricted verification work, even though the specific prerequisite bundle for Phase 32 is now green.
- Repo-root Vitest still emits a non-blocking `environmentMatchGlobs` deprecation warning during frontend verification.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260403-grr | Redesign character creation page — full visual overhaul to dossier design language | 2026-04-03 | pending | [260403-grr](./quick/260403-grr-redesign-character-creation-page-full-vi/) |
| 260405-r8a | Pre-filter worldbook entries via LLM before scaffold generation | 2026-04-05 | 63c3f2f | [260405-r8a](./quick/260405-r8a-pre-filter-worldbook-entries-via-llm-bef/) |
| Phase 35 P01 | 9min | 2 tasks | 10 files |

## Session Continuity

Last activity: 2026-04-07
Resume file: None
