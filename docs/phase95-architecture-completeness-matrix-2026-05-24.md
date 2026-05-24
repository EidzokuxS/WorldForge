# Phase 95 Architecture Completeness Matrix

Date: 2026-05-24
Branch: `develop`
Reviewed implementation HEAD before this documentation slice:
`732c9aeb0c36e345abb33d6ddfb7992cd5737adf`
Status: **current-head Oracle bundle returned ARCHITECTURE NO-GO on vector
evidence coverage; focused Oracle vector recheck returned VECTOR P1 CLOSED;
gameplay acceptance still NO-GO**

This document is the local "did we forget a layer?" pass for Oracle and
Browser/play evidence. It does not declare Phase 95 done. It tracks the
control-plane map as one gameplay architecture instead of as disconnected
patches.

## Product End State

WorldForge Phase 95 is successful when the game plays like a high-quality,
LLM-driven RPG: the player acts naturally, the world responds coherently, and a
campaign remains trustworthy at turn 1, turn 60, turn 600+, after clone, after
rollback, after replay attempts, and after recovery from partial turns.

The architecture is the means. Backend-owned refs, capabilities, tool
ownership, time, receipts, persistence, clone/replay/rollback, narration
grounding, UI projection, recovery, and observability exist so creative LLM
play remains free without making gameplay truth unstable.

## Completeness Method

- Read local code and docs for the current reset/rebuild branch, not the old
  safety branch as an authority.
- Used GitNexus semantic queries after refreshing the index with embeddings at
  `732c9aeb`.
- Folded independent agent findings into this matrix: clone/replay residue and
  whole-architecture coverage.
- Ran a current-head Oracle bundle review on `732c9aeb`; it returned
  `ARCHITECTURE NO-GO` because vector rollback `purge_rebuild` was not proven
  by the attached implementation files. The follow-up slice adds the missing
  executable vector rollback/fail-closed evidence locally.
- Ran focused Oracle recheck
  `phase95-vector-rollback-focused-recheck` with the vector/restore files; it
  returned `VECTOR P1 CLOSED` and the saved transcript matches the CLI answer.
- Kept old Oracle/agent answers as risk inventory only.
- Used one compact document plus referenced source files instead of many inline
  browser attachments.

References Used:

- `AGENTS.md`
- `tasks/lessons.md`
- `output/phase95-reset-rebuild-brief-20260524.md`
- `output/phase95-handoff-contract.md`
- `output/phase95-gameplay-cycle-contract-inventory.md`
- `docs/phase95-gameplay-cycle-architecture.md`
- `docs/phase95-architecture-closure-audit-2026-05-24.md`
- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/actor-plan-executor.ts`
- `backend/src/engine/faction-command-network.ts`
- `backend/src/engine/faction-command-scheduler.ts`
- `backend/src/engine/command-node-agent.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/world-brain.ts`
- `backend/src/engine/world-forecast.ts`
- `backend/src/engine/living-world-authority.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/public-dto-handles.ts`
- `backend/src/routes/chat.ts`
- `backend/src/routes/campaigns.ts`
- `frontend/lib/api.ts`
- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/store-manifest-executor.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/clone.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/vectors/lore-cards.ts`
- OpenAI tool/function-calling docs:
  `https://developers.openai.com/api/docs/guides/tools` and
  `https://platform.openai.com/docs/guides/function-calling`
- Hono streaming helper docs:
  `https://hono.dev/docs/helpers/streaming`
- LanceDB JavaScript docs for local connect/table row evidence:
  `https://lancedb.github.io/lancedb/js/`
- better-sqlite3 backup docs:
  `https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md`
- GitNexus queries for GM tool loop, public DTO projection, world-brain/
  forecast support lanes, and faction/command-node stores.

Unverified Assumptions:

- Prior same-day in-app Browser smoke confirms `/game` loaded on the restarted
  dev stack, Saves opened, checkpoint deletion used public handles, and one
  freeform player action completed through the action dock with zero console
  errors or warnings. Treat this as historical workability evidence for the
  slice, not as current acceptance evidence.
- Focused Oracle/vector recheck judged the vector P1 closed. This is not a
  broad architecture GO and not gameplay acceptance.
- Existing dirty `.planning` evidence files are outside this architecture
  slice and are not runtime inputs.

## Top-Level Layer Map

The intended gameplay control plane is organized by these layers. Anything
outside these layers is support-only, diagnostic-only, or debt. Current status
means local contract/source evidence, not Browser or long-play acceptance.

| Layer | Owner | Authority rule | Recovery rule | Current status |
| --- | --- | --- | --- | --- |
| UI action intake | frontend parser plus `/chat/action` route | freeform text or backend-issued handle only; labels/prose are display | malformed/stale handles reject before turn mutation | local contract evidence; prior Browser smoke only |
| Turn boundary | chat route plus turn saga | one lease, one pre-turn snapshot, one authority state machine | retry before lease; resume/rollback after lease/snapshot | local contract evidence |
| GM Read | `runGmRead` validator | read/classification only; no mutation | repair/retry before executor | local contract evidence |
| GM Tool Loop | descriptor-derived active tool loop | model proposes tool calls; executor owns authority | savepoint rollback for unaccepted mutation | local contract evidence |
| Executor/receipts | runtime tool executor and authority traces | mutation only through state owner; accepted receipt creates truth | rollback/replay from accepted receipts or snapshot | local contract evidence |
| Actor runtime | scheduler, actor frame, actor tool execution | positive allowed write scopes required for durable actor writes | reject out-of-scope actor writes | local contract evidence |
| Due-world runtime | proposal/job/actor-plan executors | deterministic emitted refs must match reserved scopes | fail closed with no DB writes on scope mismatch | local contract evidence |
| Time | clock ledger owner | world minutes advance only from accepted clock receipts | ledger replay/snapshot restore | local contract evidence |
| Narrator packet | packet builder | selectable facts are backend-visible accepted facts | resume from settled packet | local contract evidence; live/resume full-path evidence still gateable |
| Final narration | narration guard/turn processor | model can style/order only selected fact/evidence refs | repair/fail closed before public prose leaks | targeted legacy-text regressions covered; Browser/soak pending |
| SSE/API projection | DTO factories and route projectors | public handles and allowlists only | rebuild projection from authority | local evidence for known gameplay surfaces; source-scope bundle still needed |
| Frontend projection | `frontend/lib/api.ts` parser | public handles carry authority; local render is not truth | reject/drop raw legacy authority | targeted tests green; prior Browser smoke passed; lookup support cannot replace scene beat |
| Persistence bundles | store manifest and bundle services | every store has policy/evidence | verify before copy; staged restore | local contract evidence |
| Clone/replay/rollback/vector | manifest executor, clone/restore services | clean-start clone is explicit; replay-preserving fails closed | clone manifest, restore staging, vector reconcile | focused Oracle vector P1 CLOSED; long-play/replay evidence pending |
| Observability/evals | traces, reports, test harness | evidence describes outcomes, never creates gameplay truth | rerun/compare using committed snapshots | contract tests/GitNexus done; Oracle/Browser/play pending |

## Agent Roles And Tool Calling

The word "agent" has two meanings here: gameplay agents inside WorldForge and
review agents outside the game. Both are explicitly non-authoritative unless
their output passes a backend owner.

| Agent/actor | May author | May mutate | Available tools/surfaces | Authority boundary |
| --- | --- | --- | --- | --- |
| Player | freeform intent, chosen quick-action handle | no direct mutation | UI form, public handles, action chips | `/chat/action` validates and creates turn envelope |
| GM Read model | interpretation, runtime requirement, proposed refs by alias | no | structured GM Read output | schema plus alias/capability resolver |
| GM Tool Loop model | tool name and typed args | no direct mutation | active runtime tool set from descriptors | executor validates, mutates, and returns accepted/rejected result |
| Tool executor | none; backend code only | yes, within lane | SQLite, authority traces, savepoints | state-owner registry, schemas, write scopes, transaction |
| Actor brain model | actor decision packet, requested actor tools | no direct mutation | actor-frame tools only | actor scheduler grants positive scopes; actor tools validate |
| Due-world/proposal model | forecast/proposal payloads | no direct mutation | world-brain, forecast, proposals, deterministic plans | proposal executor owns lifecycle and emitted-ref checks |
| Narrator model | selected fact refs, evidence refs, style/order | no direct mutation of world state | narrator packet facts/support context | narration guard compiles/validates public prose |
| Frontend | local render state, draft text | no gameplay mutation | public DTOs, SSE events | backend DTO schemas and public-handle parser |
| Oracle/subagents/playtesters | review findings, player actions, evidence | no gameplay mutation | repo files, bundles, Browser, CLI tests | committed code/tests and backend runtime are the only source of truth |

Tool-calling invariants:

- Tool availability is derived from descriptors and runtime requirement, not
  from a prompt wish.
- A model tool call is a proposal until `tool-executor` accepts it.
- Revision/repair paths inherit the strongest possible mutation boundary.
- Rejected/helper results are observations and cannot close authority.
- Durable public affordances, including quick-action offers, are
  receipt-bound authority/projection effects.
- Actor and due-world tools require positive write scopes; broad
  "not player-owned" filtering is not enough.
- Support tools, forecasts, guardrails, and world-brain context are not hidden
  fact authority until an owning receipt promotes a fact.

Options Compared:

- Static prompt-only tool discipline: rejected because it relies on model
  obedience.
- Per-tool ad hoc guards: useful as local checks, but drift-prone.
- Descriptor-derived tool availability plus executor-owned validation,
  receipts, scopes, and projection: chosen.

References Used:

- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/gameplay-control-plane-contract.ts`
- `C:\Users\robra\.agents\skills\agents-best-practices\SKILL.md`

Unverified Assumptions:

- Current descriptor names can remain stable after the owner-parity slice:
  `chronicle_entry` has an explicit state lane, and `entity_tag` keeps a
  service owner with delegate tools.

## State-Class Matrix

This matrix is deliberately wider than the current implementation diff. The
point is to make every state class visible so long playtests stop discovering
architecture boundaries by accident.

| State class | Source of truth | Write owner | Support-only/model fields | Validators | Receipts/projection | Recovery/tests |
| --- | --- | --- | --- | --- | --- | --- |
| Campaign identity/config | campaign dir, `config.json`, `campaigns` | campaign manager, clone service | worldgen drafts before completion | safe id, config parser, complete-generation gate | public campaign metadata | load/delete/clone tests; source-id residue clone fixture |
| Player action envelope | `/chat/action` validated body | chat route | player prose only | schema, active campaign, lock, capability/base version | turn saga row, sanitized history | stale/forged/freeform tests |
| Turn saga/lease/snapshot | saga rows/events, active lease, pre-turn bundle | turn saga service | progress events | lifecycle order, abandoned saga recovery, manifest presence | stage evidence, rollback snapshot | pending/resume/rollback tests |
| Quick-action offers | `quick_action_offers` | quick-action service | label/action prose | source digest, expiry, consumed, campaign/player binding | `qac_*` public handles | stale/expired/solo-offer rollback/SSE rollback tests |
| Public DTO handles | projector output plus resolver | public DTO handle module | labels only | deterministic handle kind, resolver, raw-id guard | `pdto_*` handles | world/inventory/history/checkpoint/NPC tests |
| Scene aliases/model refs | scene frame alias map | scene frame builder | visible labels/summaries | reserved namespaces, backend-ref scan | model-facing packet only | collision/raw-id/private-label tests |
| GM Read result | typed GM Read output | `runGmRead` validator | interpretation/path/runtime requirement | Zod schema, alias resolution, semantic binding | diagnostic receipt only | unsupported/composite/ref tests |
| Runtime tool descriptors | descriptor registry, owner registry | descriptor contract module | tool descriptions | active allowlist, state lane owner, effect parity | descriptor snapshots | runtime effect/state-owner parity tests |
| Tool mutation state | SQLite plus authority traces | runtime executor per lane | typed tool args | input schemas, refs/caps, base version, scopes, savepoints | accepted receipts/state deltas | no-unaccepted-side-effect and rollback tests |
| Same-turn write scopes | turn ledger plus accepted refs | turn processor | diagnostics | conflict detection, positive/blocked scopes | blocks actor/due-world writes | actor/due-world scope tests |
| Locations/routes/POIs | locations, edges, recent events | movement/reveal/POI owners | model target aliases | route existence, arrival binding, scope preflight | public place/route handles/facts | movement/reveal/clone/rollback tests |
| Player/NPC actors | players, npcs, actor lifecycle | movement/condition/promote owners | dialogue/action claims | actor existence, visibility, frame binding | public actor handles/facts | actor promote and out-of-scope tests |
| Factions/command nodes | factions, command nodes/resources/reports/ops/ledger | faction scheduler/tools | faction reports/proposals | campaign scope, command-node/faction child-row ownership, due time, commit-time report/resource revalidation, resource ledger invariants | faction public handles/reports | Phase 92 harness, clone residue coverage, FK-valid mismatched-child regressions, and stale proposal row-semantics regression |
| Relationships/dialogue | relationships, dialogue receipts | dialogue/relationship tools | dialogue summary payloads | speaker binding, relationship refs, private scan | public relationship/fact refs | dialogue/relationship tests |
| Inventory/items/documents/tags | items and item state/tags | item tools/entity-tag service | item names, tag prose | holder refs, item existence, tag lane owner | item handles/facts | transfer/spawn/tag tests; entity-tag delegate parity tests |
| World clock/time | `world_clocks`, `turn_clock_ledger` | living-world clock commit | proposed time deltas | accepted clock receipt, non-negative deltas | public world time | no-op/wait/travel/resume/restore tests |
| Actor process/private memory | process states, wake signals, knowledge records | actor scheduler/tools | actor private memory | actor frame, positive scopes, blocked scopes | actor authority traces/visible effects | out-of-scope actor mutation tests |
| Due-world jobs/proposals/plans | simulation jobs/proposals, world threads/events | proposal executor/due-world resolver | forecast/world-brain/proposal text | lifecycle, due time, base version, emitted-ref coverage | deferred/executed proposal traces | active-plan scope mismatch tests |
| World-brain/forecast/guardrails | prompt context, forecasts, support rows | forecast/support builders | model suggestions/diagnostics | support-only classification, no hidden-fact promotion | support context only | hidden-leak watch coverage; P2 broader tests |
| Authority traces/events | authority trace/event rows | accepting executor/proposal owner | summaries as receipt payload | citable/private classification | event refs, packet facts | receipt mismatch/rollback/vector rebuild tests |
| Narrator packet | settled packet and fact list | packet builder | support context | redaction, packet budget, citable/support split | persisted packet/fact refs | resume packet tests |
| Final narration attempt | narrator attempts plus compiled text | narration guard/turn processor | selected refs/style/order | selected ref existence, private term scan, grounding | assistant SSE/chat line | live/resume no-legacy-text regressions |
| Chat history/pending resume | chat history JSON plus saga state | chat route/resume owner | internal metadata | public history DTO, resume token | public history and recovery state | route tests reject saga id/status leaks |
| SSE/API projection | DTO factories and route projectors | route/projector modules | none | public schemas, event allowlists, backend-ref guard | public events/JSON | raw legacy id rejection tests |
| Frontend render state | parsed public DTOs/local UI state | frontend API parser/components | draft/debug local state | public handle parser, malformed payload errors; lookup support filtered from scene beat; player portrait asset filename is backend-owned | rendered labels/actions/assets only | API/checkpoint/display-beat tests; player portrait URL contract; Browser Saves/freeform/portrait smoke |
| Checkpoints/artifacts | checkpoint dirs/manifests | checkpoint service | UI labels | path safety, restorable manifest, handle resolver | `pdto_checkpoint_*` | create/list/load/delete tests; Browser delete smoke |
| Store manifest/bundles | `store-manifest.json`, captured stores | bundle/restore services | evidence hashes/reports | coverage, policies, hashes, row counts | checkpoint/turn snapshot manifests | tampered SQLite/vector evidence tests |
| Vectors | LanceDB episodic/lore tables | vector services plus rollback policy | retrieval support | campaign/audience filters, row counts, hashes | semantic retrieval only | restore verification and rollback reconcile tests |
| Clone/rollback/replay | clone manifest, turn snapshots, restore bundles | clone/rollback/restore service | playtest logs | operation mode, path safety, rewrite/purge/rebuild/reject | clone manifest, restore evidence | clean-start clone, fail-closed replay, staged restore |
| Observability/evals | logs, traces, reports | observability/playtest harness | human/Codex moves | typed retention/redaction policy, publication target validator, evidence rubric | verdict reports, trace ids, policy summary | GitNexus/tests done; initial Browser drawer/freeform-turn smoke done; Oracle/play pending |

## Recovery Matrix

| Failure point | Durable evidence | Recovery owner | Expected recovery |
| --- | --- | --- | --- |
| Before lease | none | chat route | reject/retry with no mutation |
| After lease before snapshot | saga lease/event | turn saga service | resume or abandon stale lease |
| After snapshot before accepted receipt | turn snapshot manifest | turn processor/restore | rollback to snapshot |
| During tool loop mutation before accepted receipt | savepoint and rejected result | GM tool loop/executor | rollback savepoint; no public side effect |
| After accepted receipt before canonical commit | authority traces/state deltas | turn processor | resume from receipt batch or rollback by snapshot rule |
| After canonical commit before settled packet | committed SQLite and traces | packet builder | rebuild/persist packet from accepted facts |
| After settled packet before narration | settled packet | narrator route/processor | resume final narration from packet |
| After narration before projection | narrator attempt | route projector | rebuild projection/SSE from accepted attempt |
| After projection before final marker | projection digest and saga stage | turn saga service | idempotently finalize |
| During restore copy | `.restore-staging` bundle | restore service | clear stale staging and rerun verified copy |
| During rollback vector reconciliation | restored SQLite, vector policy | vector rollback service | purge failed-turn rows, preserve matching pre-turn rows, rebuild missing accepted rows |
| During clean-start clone | target config/DB plus clone manifest | clone service | discard incomplete target unless `clone-manifest.json` proves complete |
| Replay-preserving clone request | store manifest replay policies | manifest executor | fail closed while any store requires `reject`/`regenerate` |
| Browser/SSE disconnect | chat history, saga/recovery state | route/frontend parser | load history or resume pending narration with opaque token |

## Cross-Layer Invariants

- Product truth is never stored in prompt prose alone.
- The model may propose, classify, select, or style; backend code owns
  validation, authorization, mutation, time, receipts, persistence, projection,
  clone/replay/rollback, and recovery.
- Every state class has one write owner; runtime effect/state-owner parity is
  executable for the descriptor-owned effect lanes.
- Every model/player-facing ref is an issued alias, public DTO handle, or
  backend-owned capability.
- UI labels and quick-action prose are presentation.
- Support-only world-brain, forecast, guardrail, observation, and diagnostic
  lanes cannot become public facts without an accepting owner.
- Accepted receipts are the source for narration facts, rollback, replay,
  vector rebuild, and observability correlation.
- Time is ledgered world time, not UI turn count or narration decoration.
- Public projection is allowlist-based and rejects legacy raw id shapes.
- Clean-start clone is the current product mode; replay-preserving clone is an
  explicit fail-closed product mode until semantics are designed.
- Oracle and playtests are evidence gates, not architecture substitutes.

## Known Open Work Not Forgotten

These items are intentionally not buried under "green tests":

- Closed P2: faction/command-node row semantics audit now has executable
  coverage beyond clone residue. FK-valid child rows with the wrong faction do
  not wake a command node or enter its frame, and a stale proposal cannot
  double-spend a consumed report, drain a resource twice, or create a second
  authority trace.
- Closed P2: observability retention/redaction policy is now explicit and
  executable. `observability-evidence-policy` defines typed artifact classes,
  retention windows, raw-local-only boundaries, remote-publication validation,
  and acceptance-report policy summaries.
- Closed P2: stale Phase 88 harness prose has been reconciled. Current docs
  distinguish historical pre-fix Oracle evidence from current architecture,
  and the live Phase 88/94 harness clone paths call `cloneCampaignCleanStart`
  rather than defining DB-copy clone semantics.
- Closed P2: world-brain/forecast/guardrail hidden-leak coverage is hardened
  for current known support lanes. Final-visible prompt assembly reprojects
  world-brain direction before formatting visible sections, and grounded
  narration rejects `guardrail:*` ledger refs as citation/repair evidence.
- Closed P2: frontend debug reasoning is developer-mode gated. Player builds do
  not expose the settings control and `GamePage` omits `onReasoning` handlers
  unless `NEXT_PUBLIC_WORLDFORGE_DEBUG_REASONING=1`.
- Evidence gate: current-head Oracle bundle returned NO-GO on vector rollback
  evidence coverage; focused Oracle recheck
  `phase95-vector-rollback-focused-recheck` closed that vector P1.
- Evidence gate: in-app Browser UI workability.
- Evidence gate: human-style fresh and cloned campaigns plus longer
  soak/replay. Sixty turns are smoke evidence, not the end state.

## Final Local Verdict

The broad current-head Oracle bundle returned **ARCHITECTURE NO-GO /
ACCEPTANCE NO-GO** because it could not prove vector rollback `purge_rebuild`
without `backend/src/vectors/episodic-events.ts` in the attachment set.

Local follow-up after that review added executable evidence that episodic
rollback rebuild purges stale failed-turn vector rows, preserves matching
accepted rows, rebuilds missing accepted rows from `location_recent_events`, and
fails closed without writing rebuilt rows if the stale vector table cannot be
purged. Focused Oracle session `phase95-vector-rollback-focused-recheck`
reviewed the attached vector/restore files and returned `VECTOR P1 CLOSED`.
This closes that named P1 evidence gap only; it does not turn Phase 95 into
acceptance or replace Browser, human-style play, soak/replay, and any remaining
source-scope architecture review. If later evidence finds a missing layer or
invariant, this document becomes the correction board rather than a defense of
the current design.

Output recheck note: broad Browser/Oracle attachment runs produced tiny or
missing saved transcripts, but that is an extraction/persistence signal, not
proof of a one-token model answer. `scripts/oracle-recheck-output.mjs` now
reopens the saved conversation URL, checks backend conversation JSON, and then
falls back to DOM extraction without submitting a new prompt. Recheck recovered
full DOM answers for `phase95-full-architectu-current-go` and
`phase95-full-architectu-current-go-3`; `phase95-full-architectu-current-go-2`
remains `UNVERIFIED_OUTPUT` because backend/DOM access returned
`conversation_inaccessible`. Do not repeat GPT-5.5 Pro runs for this gate unless
explicitly requested.
