# Phase 95 Current Gameplay-Cycle Architecture

Date: 2026-05-24
HEAD: `458d08c10002b566c18d1726fb3d87218bdb7e04`
Reset baseline: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`
Oracle gate: compact bundled review `phase95-control-plane-compact-review`, verdict `CONDITIONAL GO`

This is the current architecture canvas for the Phase 95 rebuild. The target is not "several green 60-turn runs." The target is a playable LLM-driven RPG loop that stays coherent and recoverable at turn 1, turn 60, turn 600, clone/replay/rollback boundaries, and after partial failures.

## Product Goal

WorldForge should feel like a free-form RPG at the player surface: the player writes natural actions, NPCs react, the world changes, and narration remains fun. Under that surface, gameplay truth must be backend-owned:

- The model proposes intent, tool calls, fact refs, and style.
- The backend owns validation, authority, mutation, time, receipts, persistence, clone/replay/rollback, public projection, recovery, and observability.
- Player/model-facing refs are issued aliases or backend-owned capabilities, never raw storage ids.
- UI labels and quick-action prose are presentation. Backend handles/capabilities carry authority.
- Final narration is grounded in accepted backend-visible facts while leaving room for creative pacing and tone.

## Root Invariants

| Invariant | Owner | Failure mode if broken | Current posture |
|---|---|---|---|
| One writer per gameplay state lane | `GAMEPLAY_STATE_OWNER_REGISTRY` | double mutation, un-replayable state, contradictory receipts | Mostly encoded; actor lifecycle/effect parity remains P1. |
| Typed/runtime-validated model contracts | Zod schemas plus executor grounding | hidden refs, invalid tool args, semantic drift | Strong for tools/narration; legacy/support surfaces remain P2. |
| State-bearing tools require authority | `executeToolCall`, `ToolExecutionContext`, authority traces | background or actor writes bypass receipts | Strong for strict callers; support/background direct calls need audit. |
| Time advances only with a receipt | `commitAuthorityTrace`, `turn_clock_ledger`, turn clock sync | long-play incoherent world time | Strong, with ledger tests. |
| Narration selects facts; backend owns prose | narrator packet + grounding guard | hallucinated final narration becomes gameplay truth | Strongest current subsystem. |
| Public projection is opaque handles/capabilities | public DTO handles, quick-action capabilities, SSE filters | raw ids or private state become player authority | Mostly strong; `done` DTO blocklist is P1. |
| Recovery converges after partial failure | turn saga, snapshots, restore bundle, vectors | rollback/clone/replay corrupt campaign | Turn saga strong; restore crash convergence is P0. |

## Full Gameplay Stage Map

| Stage | Source of truth | Write owner | Model-authored fields | Runtime validators | Receipts/projections | Recovery/tests |
|---|---|---|---|---|---|---|
| UI action intake | Frontend action text or `qac_*` handle | Frontend submits; backend `/chat/action` resolves | player prose; quick-action button text is display only | `chatActionBodySchema`, quick-action handle regex, loaded campaign, turn lock | SSE stream start, route logs | `chat.test.ts`, frontend stream tests |
| Quick-action consumption | `quick_action_offers` rows | `quick_action_consumption_service` | none for authority; model wrote old label/action prose | TTL, consumed flag, source digest, world version, one-use update lock | quick-action consumption trace; selected action text | stale/forged/consumed handle tests |
| Turn lease + snapshot | `turn_sagas`, pre-turn bundle | turn saga service + snapshot service | none | turn lock, saga status, snapshot capture | `intent_created`, `lease_acquired`, `snapshot_taken` | pre-settlement rollback to snapshot |
| Pre-frame due-world | world threads, proposals, actor states, wake signals | due-world runner, actor scheduler, proposal executor | actor/world model proposals before execution | write-scope reservations, due time, provenance, hidden-term checks | authority traces, location events, proposal lifecycle rows | proposal recovery, stale claim cleanup |
| Scene frame + forecast | canonical world stores + advisory forecast | scene-frame builder; forecast service | forecast text only as advisory | scope filters, `promptReady:false`, private-term redaction | model-facing packet only | forecast tests; refresh is currently P1 |
| GM Read | SceneFrame + player action | read-only router | `path`, grounding, refs, runtime requirement | schema, backend-ref guards, repair retry | no mutation; decides tool loop path | `gm-turn-read.test.ts` |
| Oracle/contested outcome | backend oracle decision row | oracle decision service | requested contest framing | bounded mode/target/evidence validation | `oracle_decisions`, safe `oracle_result` projection | turn saga records decision |
| GM Tool Loop | descriptor-derived active tools + same-turn refs | GM loop orchestrator | tool names/args, source refs, terminal receipt choices | active tool allowlist, tool input schemas, grounding, tool-call result loop | accepted tool result receipts; helper results support-only | `gm-tool-loop.test.ts`, receipt tests |
| Executor | canonical stores + `ToolExecutionContext` | `executeToolCall` and concrete tool handlers | parsed args only | schema validation, unsupported fields fail, authority required, write-scope checks, blocked-scope checks | `authority_traces`, state delta refs, tool result JSON | rejected calls return structured result; failed authority retracts durable side effects |
| Actor/world runtime | actor frames, proposals, world threads | actor tools, scheduler, world-thread runner | actor decision packets / world routes as proposals | legal actor tools, write scopes, savepoints, hidden leakage checks | actor action receipts, proposal commits, world-thread events | savepoint rollback, proposal watchdog |
| Time | `world_clocks`, `turn_clock_ledger` | `commitAuthorityTrace` | `advance_time` minutes/reason only | nonnegative minutes, reason enum, unique source receipt | clock receipt and world version | restore invalidates future runtime state and records replay restore |
| Narrator packet | settled canonical turn packet | narrator packet builder | none in packet | visibility filters, forbidden actor/fact/private terms, evidence ledger | packet persisted before final narration | pending narration resumes from settled packet |
| Final narration | player-facing packet + backendFacts refs | narration grounding guard/compiler | selected `factRefs`, `evidenceRefs`, style/order | strict structured output, no text fallback, unknown/non-citable refs fail, packet guard | assistant SSE text, narrator attempt, chat history | retry/repair where allowed; pending narration stays resumable |
| SSE/API projection | backend event allowlist | route projector | none | player-safe event projection, raw-id redaction, public DTO handle validator | narrative, state_update, quick_actions, done boundary | pending narration public status; `done` allowlist gap P1 |
| Frontend projection | SSE events + `/world` handles | frontend state reducers | display labels only | boundary freshness, world refresh before action chips, quick-action handles | visible chat, quick action chips, world panels | fail-closed on sync error; recovery UX P1 |
| Clone/replay/rollback/vector | store manifest + bundles + vector policy | clone/restore/vector services | none | manifest coverage, mode planning, active-turn rejection, source-id policies | clone manifest, restore evidence, vector rebuild logs | clean-start clone covered; restore crash convergence P0; replay-preserving clone P1 |
| Observability | logs, traces, artifacts | observability policy | none | redaction/publication policy | stage latency, safe evidence summaries | acceptance evidence must not become gameplay authority |

## In-Game Agent Roles And Tool Calling

| Role | Inputs | Allowed tools/surfaces | Authority boundary | Output |
|---|---|---|---|---|
| Player | action prose or quick-action handle | `/chat/action`, `/chat/resume`, `/chat/retry`, UI controls | Player can request, not mutate. | intent envelope |
| GM Read judge | SceneFrame, player action, prior context | read-only structured decision | Cannot call mutation tools directly. | path/runtime requirement |
| GM Tool Loop judge | active tool list, same-turn tool results | runtime tools exposed by descriptor/profile | Tool calls are proposals until executor accepts. | tool calls and terminal receipts |
| Executor | tool call + `ToolExecutionContext` | concrete handlers | Owns validation, mutation, authority trace, receipts. | structured tool result |
| Actor scheduler | actor states, wake signals, due time | actor proposals, actor tools through authority context | Actor decisions are fenced by write scopes and savepoints. | actor receipts/proposals |
| World-thread runtime | due routes/provenance | world-thread advance; proposal executor | Hidden causes must not surface as player facts. | world events and authority traces |
| Narrator | player-facing packet | `GroundedSentenceDraft` only | Selects refs; backend expands refs into prose. | final narration draft |
| Projection services | canonical stores/events | public DTO handles, quick-action handles, SSE allowlists | Opaque handles only; no raw storage ids. | public UI state |
| Recovery services | saga, snapshots, manifest, vectors | restore/rollback/clone/rebuild | Must converge without model help. | restored or rejected campaign state |

Official AI SDK reference check: the SDK supports schema-defined tools, model-requested tool calls, code-executed tool results, and manual agent loops where tool results are returned to the model. WorldForge deliberately uses a stricter version: every state-bearing tool result also needs backend authority, write scope, receipts, and replay/rollback semantics.

## Runtime Tool Ownership

| Lane | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Validators | Receipts | Public projection | Recovery/tests |
|---|---|---|---|---|---|---|---|---|
| Observation helpers | SceneFrame/bridge lookup snapshot | bridge/context helpers | helper result text | query/ref fields | Zod, bridge snapshot, ref guard | none | support context only | tool-contract tests |
| Known-route movement | locations/edges/player record | `move_actor` | route labels | actor/destination/evidence | schema, movement refs, grounding | movement receipt, authority trace | public fact/state_update | snapshot restore |
| New place reveal | locations/edges | `reveal_location` | generated label/description until accepted | name/anchor/description | schema, anchor ref, authority | location_revealed | public place fact | snapshot restore |
| Local POI creation | locations as POI rows | `create_minor_poi` | POI prose before accept | type/name/description/area | schema, area/current scene ref | minor_poi_created | public place/POI fact | snapshot restore |
| Dialogue outcome | accepted dialogue receipt | `record_dialogue_outcome` | helper observations, speaker prose before receipt | outcome kind, claims, quote, source refs | schema super-refine, dialogue receipt matcher | dialogue_outcome | narratable public fact | receipt replay |
| Durable world fact | knowledge/event stores | `record_world_fact` | rumor/report support | fact kind/truth/source refs | schema, source refs, truth status | world_fact | narratable public fact | receipt replay |
| Scene-local event | recent events | `log_event` legacy support | scene-local text | event text | unsupported action guard, durability rules | legacy scene beat | support-only | purge |
| Item creation | item store | `spawn_item` | item label | item details/owner/location | schema, inventory authority | item_created | public item fact/handle | snapshot restore |
| Item transfer | inventory/item state | `transfer_item` | transfer prose | source/target/item/equip | schema, inventory authority | item_transfer | public inventory fact | snapshot restore |
| Condition state | actor condition fields/tags | `set_condition` | condition prose | actor/ref/condition | schema, actor refs, authority | condition_state | public actor fact | snapshot restore |
| Entity tags | entity tags | `entity_tag_service` via `add_tag`/`remove_tag` delegates | tag labels | entity/tag | schema, entity refs | entity_tag_delta | public fact where visible | snapshot restore; owner parity P1/P2 |
| Chronicle entry | chronicle table | `add_chronicle_entry` | not player-turn authored | text in background only | player-turn direct call rejected | chronicle_entry | public fact if surfaced | snapshot restore |
| Relationship change | relationships table | `set_relationship` | relationship prose | entity refs/score/context | schema, refs | relationship_change | public relationship fact | snapshot restore |
| Support actor creation | NPC rows/presence | `create_scene_extra` | support labels/roles | name/role/tags/reason | schema, scene refs, spawn_npc rejection | support_actor_created | support-only unless promoted | snapshot restore |
| Actor lifecycle | NPC lifecycle | `promote_npc` | support actor display | npc ref/tier | schema, local actor ref | actor_lifecycle | public actor fact | P1: missing effect-kind parity |
| Clock delta | `world_clocks`, `turn_clock_ledger` | `turn_clock_ledger` via authority trace | time prose | minutes/reason | nonnegative/enum/source uniqueness | clock_receipt | public time fact | receipt replay |
| Quick-action offer | `quick_action_offers` | `quick_action_offer_service` | labels/action prose | label/action text | schema, sanitization, source refs | quick_action_offer | `qac_*` capability | purge/expire/reject stale |

## Significant Options Compared

| Decision | Option A | Option B | Current choice | Rationale |
|---|---|---|---|---|
| Tool authority | Let AI SDK `execute` mutate directly | Backend executor validates and writes receipts | Backend executor | SDK loop is a transport pattern; RPG state needs replayable authority. |
| Quick actions | Plain UI text | Stateless signed token | Durable capability rows | Rows support TTL, one-use, digest, world version, clone/rollback policy. |
| Public refs | Raw ids in DTOs | Opaque public handles | Public handles | UI labels are presentation; handles keep authority backend-owned. |
| Narration | Model writes final prose | Model selects fact refs, backend expands | Fact-ref compiler | Keeps creative ordering without letting prose invent gameplay truth. |
| Owner model | Descriptors only | Central owner registry plus descriptor parity | Registry + parity | Registry gives stable architecture; parity tests expose drift. |
| Time | Tick mutation wherever needed | Clock ledger through authority traces | Clock ledger | Long campaigns need audit/replay of time. |
| Forecast | Always refresh in turn path | Advisory/deferred forecast | Currently deferred | Safe but weak; P1 because long-play world pressure needs living forecast. |
| Restore | Staged overwrite | Crash-convergent transactional restore plan | Currently staged overwrite | P0 because partial crash can leave mixed state unproven. |
| Replay clone | Implement full replay-preserving clone now | Fail closed, support clean-start first | Fail-closed replay-preserving; clean-start live | Correct as interim, but long-play replay acceptance remains P1. |

## Gap Matrix

Oracle review result: `CONDITIONAL GO`. Oracle agreed the architecture is directionally sound and broad enough to continue cluster-by-cluster, but not to enter long-run acceptance. The confirmed P0 is restore/rollback crash convergence. Oracle did not promote the listed P1 items to P0 based on the compact bundle, but added terminal receipt parity as a P1 and flagged several call-site/caller-graph assumptions as unverified.

### P0

| Gap | Why it blocks architecture acceptance | Owner cluster | Required closure |
|---|---|---|---|
| Restore/rollback is staged but not crash-convergent across DB/config/chat/vector overwrite steps | A long campaign cannot trust rollback/recovery if power loss or process death can leave mixed stores. | persistence/recovery | Atomic or journaled restore protocol plus crash-injection tests that prove convergence or fail-closed repair. |

### P1

| Gap | Risk | Owner cluster | Candidate fix |
|---|---|---|---|
| `done` SSE DTO uses blocklist projection | future raw field can leak by default | API/SSE projection | strict allowlist schema for terminal `done` payload |
| Frontend world-sync failure strands controls fail-closed | authority-safe but poor recovery/playability | frontend projection | explicit recover/refresh/resume state with clear control path |
| Forecast refresh not wired into current turn path | world pressure can become stale in long campaigns | world runtime | wire `runWorldForecastBuilder` or make deferred policy explicit with cadence |
| Hidden-cause guard is term/substr based | semantic private-cause leakage if terms incomplete | world runtime/narration | structured visibility metadata and semantic leak tests |
| Player-turn positive `allowedWriteScopes` not defaulted | post-write coverage can be skipped | executor/tool context | derive positive write-scope set per active tool/profile |
| `actor_lifecycle` registry lane lacks runtime effect-kind parity | one-owner invariant is not fully executable | runtime tools | add effect kind or reclassify lane |
| Terminal receipt parity is not asserted like state effects | dialogue/world-fact terminal receipts can drift from owner registry while runtime effect parity still passes | runtime tools/contracts | add `terminalKind -> gameplay lane` parity assertion or explicit exemption |
| Direct support/background `executeToolCall` callers need authority classification | strict executor can reject or legacy callers can bypass | executor/agents | audit/migrate callers or mark legacy explicitly with tests |
| Replay-preserving clone fail-closes | replay acceptance cannot claim parity | clone/replay | implement full id rewrite/regenerate plan or keep acceptance scope clean-start only |
| Lore vector preserve policy lacks freshness/hash proof on rollback | derived memory may drift after rollback | vector recovery | hash/freshness evidence or exact restore policy |
| Operator logs include raw player input and quick-action handles | sensitive artifacts can outlive gameplay surface | observability | redact/hash handles in standard logs; keep secure trace path separate |

### P2

| Gap | Owner cluster |
|---|---|
| Store manifest and gameplay lane ownership require manual join for audits | persistence/contracts |
| Legacy/support tools still exist behind filters/rejections | runtime tools |
| Due-world orchestration lacks direct owner-level tests | world runtime |
| Due-world receipts are folded into accepted committed event ids, not query-friendly receipt columns | observability/replay |
| Acceptance report generation is not forced through observability policy | observability |
| Browser proof is artifact evidence, not committed live e2e assertion | frontend/evidence |
| Dialog accessibility warnings remain | frontend polish |

## References Used

### Intake / Projection / UI

- `backend/src/routes/chat.ts` for `/chat/action`, pending narration, player-safe SSE projection, quick-action buffering.
- `backend/src/routes/campaigns.ts` and `backend/src/engine/public-dto-handles.ts` for public DTO handles.
- `frontend/app/game/page.tsx`, `frontend/lib/api.ts`, and quick action components for browser-visible loop.
- Erdos agent audit, current HEAD.

Unverified assumptions:
- Browser artifact `phase95-gameplay-live-action3-final-snapshot-20260524.md` is useful evidence but is not a fresh Oracle-gated acceptance run.
- Current frontend recovery UX is inferred from code/tests, not from a new manual failure drill.

### GM Read / Tool Loop / Executor

- `backend/src/engine/gm-turn-read.ts`, `gm-tool-loop.ts`, `gm-tool-step.ts`.
- `backend/src/engine/runtime-tool-input-schemas.ts`, `runtime-tool-descriptors.ts`, `tool-contracts.ts`, `tool-execution-context.ts`, `tool-executor.ts`.
- `backend/src/engine/gameplay-control-plane-contract.ts`.
- Darwin agent audit, current HEAD.
- Official Vercel AI SDK docs via Context7 for schema-defined tools and manual agent loops.

Unverified assumptions:
- Existing focused tests cover the listed validators, but this canvas has not rerun the full backend/frontend suite.
- Direct support/background callers are not assumed safe until classified.

### Actor / World Runtime / Time

- `backend/src/engine/actor-scheduler.ts`, `actor-tools.ts`, `due-world-work.ts`.
- `backend/src/engine/simulation-proposal*.ts`, `simulation-write-scope.ts`.
- `backend/src/engine/world-thread*.ts`, `world-forecast*.ts`, `world-brain.ts`.
- `backend/src/engine/living-world-authority.ts`, `backend/drizzle/0019_turn_clock_ledger.sql`.
- Halley agent audit, current HEAD.

Unverified assumptions:
- Forecast deferral is treated as risk, not as intended final design, unless Oracle accepts it.
- Hidden-cause semantic leakage needs deeper adversarial scenarios beyond current term-list tests.

### Narration / Public Facts

- `backend/src/engine/narrator-packet.ts`, `player-facing-packet.ts`, `narration-grounding-guard.ts`, `visible-narration-output-guard.ts`.
- `backend/src/engine/prompt-assembler.ts` final narration prompt path.
- Erdos agent audit, current HEAD.

Unverified assumptions:
- The fact-ref compiler is strong enough for current tool outputs; future state lanes must add backendFacts deliberately.
- Legacy `sentences[].text` support is safe only outside live strict mode.

### Persistence / Clone / Replay / Rollback / Vector / Observability

- `backend/src/campaign/store-manifest.ts`, `store-manifest-executor.ts`, `clone.ts`, `restore-bundle.ts`.
- `backend/src/engine/state-snapshot.ts`, `turn-saga.ts`, `turn-processor.ts`.
- `backend/src/vectors/episodic-events.ts`, vector policy entries in `gameplay-control-plane-contract.ts`.
- `backend/src/lib/observability-evidence-policy.ts`, `turn-latency-trace.ts`.
- Meitner agent audit, current HEAD.

Unverified assumptions:
- Staged restore can be made crash-convergent without rewriting all campaign storage; Oracle must challenge this.
- Replay-preserving clone remains out of acceptance scope until implemented or explicitly rejected as product scope.
- Oracle could not verify the full `processTurn`, GM Read, GM Tool Loop, actor scheduler, world-thread runner, prompt assembler, or `executeToolCall` implementation from the compact bundle.
- Oracle could not verify that production final narration always calls the compiler with `requireFactRefs: true`.
- Oracle could not verify the full caller graph for support/background state-bearing tool execution.

## Oracle Gate Result

Run evidence:

- Broad bundle: `phase95-current-control-plane-architectu`, 30 files in one ZIP bundle, invalid as a full gate because the model returned only one short issue.
- Compact bundle: `phase95-control-plane-compact-review`, 18 files in one ZIP bundle, valid review result saved at `output/oracle/phase95-current-control-plane-20260524/oracle-compact-review.md`.

Verdict: `CONDITIONAL GO`.

Oracle confirmed:

- The control-plane split is architecturally right: model proposes, backend owns authority/mutation/time/receipts/persistence/projection/recovery.
- Restore/rollback crash convergence is correctly P0.
- No listed P1 needed promotion to P0 from the compact bundle alone.
- Final narration architecture is the strongest subsystem: model selects `factRefs`, backend expands and validates prose.
- Clean-start clone is acceptable as the supported path; replay-preserving clone may fail closed if acceptance wording does not claim it.

Oracle added or emphasized:

- Add terminal receipt parity for `record_dialogue_outcome` and `record_world_fact`, not only runtime `stateEffects` parity.
- Add a generated crosswalk from gameplay lanes to physical stores, rollback policy, replay policy, and projection/rebuild path.
- Treat production call-site coverage as unverified until `processTurn`, prompt assembler, and executor caller graph are included in an implementation audit.
- Long-play acceptance remains blocked until P0 restore convergence is implemented and proven by crash-injection tests.

## Oracle Review Questions

1. Is the full control-plane map complete for a long-lived LLM RPG loop, including in-game agents, tool calling, receipts, time, projection, clone/replay/rollback/vector, recovery, and observability?
2. Is the P0 classification for restore/rollback crash convergence correct, or should any current P1 gap also block architecture acceptance?
3. Is the current "model selects factRefs, backend expands prose" narration architecture sufficient for fun creative play without sacrificing gameplay truth?
4. Should forecast refresh be wired into every turn, cadence-based, or remain advisory/deferred for Phase 95?
5. Is the split between store manifest ownership and gameplay lane ownership acceptable, or should Phase 95 unify them before implementation continues?
6. Is fail-closed replay-preserving clone acceptable while clean-start clone is the supported gameplay path, or does the product goal require replay-preserving clone as P0?
