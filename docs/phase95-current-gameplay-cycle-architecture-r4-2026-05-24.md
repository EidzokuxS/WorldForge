# Phase 95 Current Gameplay-Cycle Architecture R4

Date: 2026-05-24
Branch: `develop`
Implementation HEAD under review: `7ea2f46e7f85e6b485b1552df1ef090b7ba5c446`
Baseline reset commit: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`

This is the current-head architecture bundle for Oracle R4. It supersedes the
older R3 canvas that was written at `45d37111`. The product target is a
playable, creative, trustworthy LLM-driven RPG loop that remains coherent at
turn 1, turn 60, turn 600+, after clone, after rollback, after replay attempts,
and after recovery from partial failures.

The architecture is a means to that product end state. Passing 60-turn runs is
smoke evidence, not the goal. A green scripted harness does not prove the game
is good. The game must still feel playable: the player acts naturally, NPCs and
world systems respond coherently, final prose is grounded but not lifeless, and
the UI never turns presentation text into gameplay authority.

## R3 To R4 Delta

R3 Oracle returned `CONDITIONAL GO` for architecture direction and `NO-GO` for
acceptance. It named restore/rollback crash convergence as the only confirmed
P0 and kept public projection, clone/replay, receipt parity, caller graph, and
forecast/observability items as P1/P2 risks.

Since R3, the branch landed and pushed these coherent slices:

- `9ab76db0 Add crash-convergent restore journal`
  - Adds a durable restore journal, staged restore recovery, DB/config/chat/
    vector step tracking, reload/rebuild recovery, and crash-injection tests.
  - Targeted tests cover checkpoint restore, campaign manager lazy recovery,
    state snapshot rollback, corrupted restore evidence, and stranded journal
    convergence.
- `7ea2f46e Harden gameplay public projection boundaries`
  - Replaces terminal `done` SSE blocklist behavior with an explicit allowlist.
  - Removes private NPC identity envelopes from `/world.npcs[]`.
  - Adds backend projection contract tests rejecting `characterRecord`, `draft`,
    and legacy `npc` envelopes on the public world surface.
  - Adds frontend parser tests that legacy NPC envelopes are ignored even if a
    stale backend sends them.

Verification executed on the R4 code before this document:

- Backend focused route/contract tests for public projection: passed.
- Frontend focused API parser tests: passed.
- Full backend test suite: passed, with known todos/skips only.
- Full frontend test suite: passed, with existing dialog-description warnings.
- Backend and frontend typechecks: passed.
- GitNexus `detect_changes` before commit: changed symbols were
  `assertPublicProjectionPayload`, `toPlayerFacingTurnEvent`, and
  `parseWorldData`; risk was high only because `parseWorldData` fans out across
  frontend consumers. The compatibility-preserving parser path was tested.
- GitNexus index was refreshed with embeddings after the push:
  `.gitnexus/meta.json` reports `lastCommit` as `7ea2f46e...` and
  `stats.embeddings` as `4719`.
- In-app Browser workability smoke on current code completed a freeform player
  action back to `Ready` after restarting the stale backend. The terminal
  `done` event was emitted with the expected allowlisted clock boundary fields.
  This is workability evidence, not acceptance. The resulting scene prose was
  noticeably low quality and label-heavy, so gameplay feel remains an explicit
  product risk to evaluate during human-style play.

## Root Authority Model

The invariant is:

```text
model proposes;
backend validates, authorizes, executes, records, projects, recovers.
```

The model may:

- interpret the player action;
- select issued aliases, public handles, or backend capabilities;
- propose runtime tool calls;
- propose actor/world decisions inside a scoped frame;
- select final narration fact refs and style/order.

The backend owns:

- validation;
- authority;
- mutation;
- receipts;
- time;
- persistence;
- clone/replay/rollback;
- public projection;
- recovery;
- observability evidence.

No player-facing or model-facing surface should use raw storage ids as
authority. UI labels, quick-action prose, NPC names, local summaries, and final
prose are presentation unless tied to backend-owned handles, aliases,
capabilities, accepted receipts, or citable fact refs.

## Full Gameplay Cycle Map

| Stage | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Runtime validators | Receipts/projection | Recovery/tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI action intake | frontend form, quick-action handle, request body | frontend submits, `/chat/action` canonicalizes | button labels, local draft text | freeform player prose only | request schema, active campaign check, turn lock, quick-action resolver | turn start SSE and saga intent row | stale/forged/freeform route tests |
| Quick-action consumption | `quick_action_offers` rows | quick-action service | label/action prose | none for authority | campaign/player binding, `offerId/actionId`, expiry, consumed flag, base world version, source digest | `qac_*` capability trace | stale/expired/rollback tests |
| Turn lease and snapshot | turn saga rows plus pre-turn restore bundle | chat route, turn saga, snapshot service | progress events | none | active lease, abandoned saga recovery, manifest capture | lease/snapshot saga events | resume/rollback tests |
| Pre-frame due-world | proposals, actor wake state, world threads | due-world resolver, proposal executor, actor scheduler | forecasts, private actor memory, support context | actor/world proposals only | due time, scope reservations, base version, hidden-term filtering | authority traces or deferred proposal rows | proposal recovery and stale claim cleanup |
| Scene frame and refs | canonical world stores plus alias map | scene-frame builder | labels, summaries, model-facing aliases | none | reserved namespaces, raw backend ref rejection, visibility filters | model-facing packet only | alias collision/raw-id tests |
| Forecast/advisory pressure | world forecast stores and support context | forecast service | forecast prose and guardrails | forecast text | scope filters, `promptReady:false`, support-only classification | advisory prompt context only | hidden-leak tests; cadence policy still watch item |
| GM Read | SceneFrame plus player action | GM Read validator | prompt context and repair diagnostics | path, runtime requirement, action interpretation, aliases | Zod schema, alias resolution, movement binding, speaker binding, durability, no-mutation admissibility | diagnostic-only record; no mutation | GM Read contract tests |
| Optional contest/oracle roll | runtime decision rows | oracle/contest decision service | framing text | contest selection/proposed evidence | bounded target/mode/evidence validation | contest result as support until an owner records fact/outcome | saga stage record |
| GM Tool Loop | descriptor-derived active tool set plus same-turn observations | GM loop orchestrator | helper observations and repair prompts | tool name, typed args, terminal receipt choice | active tool allowlist, same-owner repair, input schemas, ref/capability resolver, write-scope guard | accepted tool results; rejected/helper results support-only | GM loop receipt/rollback tests |
| Executor | SQLite stores plus `ToolExecutionContext` | concrete tool executor per lane | observations | parsed args only | schema validation, unsupported field rejection, base version, scopes, authority-required checks, savepoints | authority traces, state delta refs, durable event ids | no-unaccepted-side-effect and rollback tests |
| Actor runtime | actor process state, actor frame, scheduler decision | actor scheduler and actor tools | actor knowledge/private memory | actor decision packet, requested actor tools | actor frame binding, positive allowed scopes, blocked scopes, base version | actor authority traces and visible consequences | actor out-of-scope mutation tests |
| Due-world runtime | jobs, proposals, world threads, active plans | due-world resolver and proposal executor | forecast/world-brain/proposal text | proposal payloads and plan actions | lifecycle, due time, base version, emitted-ref coverage, scope conflicts | deferred/executed proposal traces | deterministic plan scope-mismatch tests |
| Time | `world_clocks` and `turn_clock_ledger` | living-world authority clock commit | UI turn ordinal, narration tick | proposed `advance_time` minutes/reason | accepted clock receipt, non-negative deltas, no silent boundary minutes | public world time and clock receipt | wait/travel/no-op/resume/restore tests |
| Settled packet | accepted receipts, canonical turn packet, fact ledger | turn processor and narrator packet builder | recent transcript, opening scene, diagnostics | none | citable/support/private classification, redaction, budget | persisted settled packet/fact refs | pending narration resume tests |
| Final narration | backend-issued fact/evidence refs | narration guard and turn processor | style instruction, support context | selected fact refs, evidence refs, style/order | fact refs required, no legacy text fallback, private/backend term scan, grounding compile | assistant SSE/chat text | live/resume fail-closed tests |
| SSE/API projection | player-facing DTO factories and route projectors | route/projector modules | internal saga/tool/state objects | none | public schemas, event allowlists, backend-ref guard, raw-id shape rejection | `narrative`, `state_update`, `quick_actions`, `done`, `/world`, history, checkpoints | route/projection tests |
| Frontend projection | parsed public DTOs and local render state | frontend parser/components | debug state, draft text, labels | none | public handle parser, malformed payload errors, no raw fallback authority | rendered chat, world panels, action chips | API parser tests and Browser smoke |
| Clone/replay/rollback/vector | store manifest, restore bundles, vector policies | clone, restore, vector services | playtest logs/evidence | none | manifest coverage, operation mode, path safety, rewrite/purge/rebuild/reject policies | clone manifest, restore journal, vector rebuild evidence | crash/replay/rollback tests |
| Observability/evals | logs, traces, reports | observability policy and harness | local-only raw payloads | human/Codex play moves | retention/redaction policy, evidence rubric | trace ids, verdict reports, Browser/Oracle evidence | acceptance evidence gates |

## In-Game Agent Roles And Tool Calling

| Role | Inputs | May author | May mutate | Tools/surfaces | Authority boundary |
| --- | --- | --- | --- | --- | --- |
| Player | freeform text, selected public handle/capability | intent prose | no | UI action dock, quick actions, public handles | backend request validation and turn saga |
| GM Read model | scene frame, action, public aliases | route/path/runtime requirement | no | structured GM Read schema | validator and alias resolver |
| GM Tool Loop model | active tool list, same-turn observations | tool calls and args | no direct mutation | descriptor-scoped runtime tools | executor acceptance and receipts |
| Tool executor | validated tool call/context | none | yes, within owner lane | SQLite, authority traces, savepoints | state-owner registry, schemas, write scopes |
| Actor brain model | actor frame and schedule | decision packet and requested tools | no direct mutation | actor-frame tools only | positive actor scopes and executor validation |
| Due-world/proposal model | world pressure, proposals, due routes | proposal payloads/plans | no direct mutation | proposal executor, world-thread runner | lifecycle, scope, emitted-ref checks |
| Narrator model | player-facing settled packet | selected fact refs and style/order | no | grounded narration draft schema | backend fact expansion and grounding guard |
| Frontend | public DTOs and SSE | local render state | no gameplay mutation | public API/SSE only | public schemas and handle parser |
| Oracle/subagents/playtesters | repo files, prompts, Browser, play moves | review/evidence/actions | no gameplay mutation | external review and test tools | committed code/tests/runtime remain source of truth |

Tool-calling invariants:

- Tool visibility is derived from descriptors and runtime requirement, not from
  model preference.
- Every state-bearing tool call is a proposal until executor acceptance.
- Every accepted mutation leaves a receipt or authority trace.
- Helper results can inform the model but cannot close terminal authority.
- Repair retries preserve the same owner and contract unless the runtime
  explicitly replans before execution.
- Actor and due-world work require positive write scopes, not merely
  "not player-owned" filtering.
- Quick-action offer creation is durable public capability authority and must
  be adjacent to accepted turn receipts.
- Every tool result, denial, error, timeout, or rollback must return a
  structured observation to the loop.

## Gameplay State Classes

| State class | Source of truth | Write owner | Support-only/model fields | Validators | Receipts/projection | Recovery/tests |
| --- | --- | --- | --- | --- | --- | --- |
| Campaign identity/config | campaign dir, `config.json`, campaign row | campaign manager, clone service | worldgen drafts before completion | safe id, config parser, generation-complete gate | public campaign metadata | load/migrate/clone/delete tests |
| Player action envelope | validated `/chat/action` body | chat route | `intent`/`method` compatibility mirrors | schema, campaign, lock, capability/version checks | turn saga row, sanitized history | stale/forged/freeform tests |
| Quick-action offer | `quick_action_offers` | quick-action service | label/action prose | source digest, expiry, consumed, base world version, campaign/player binding | `qac_*` handles | stale/consumed/rollback/SSE tests |
| Public DTO handles | projector output plus resolver | public DTO handle module | labels only | deterministic handle kind, resolver, raw-id guard | `pdto_*` handles | world/inventory/history/checkpoint/NPC tests |
| Scene aliases/model refs | scene frame alias map | scene frame builder | visible labels/summaries | reserved namespaces, backend-ref scan | model-facing packet only | collision/raw-id/private-label tests |
| GM Read result | typed GM Read output | GM Read validator | repair diagnostics | Zod schema, alias resolution, semantic binding | diagnostic receipt only | unsupported/composite/ref tests |
| Runtime tool descriptors | descriptor registry and owner registry | descriptor contract module | tool descriptions | active allowlist, state lane ownership, effect parity | descriptor snapshots | runtime effect/state-owner parity tests |
| Tool mutation state | SQLite plus authority traces | tool executor per state lane | helper observations | schemas, refs/caps, base version, scopes, savepoints | accepted receipts/state deltas | no-unaccepted-side-effect and rollback tests |
| Same-turn write scopes | in-memory turn ledger plus accepted refs | turn processor | diagnostic blocked scope lists | conflict detection and positive/blocked scope matching | blocks actor/due work later in turn | actor/due-world scope tests |
| Locations/routes/POIs | locations, edges, recent events | movement, reveal, POI owners | target labels and descriptions | route existence, arrival binding, scope preflight | public place/route handles/facts | movement/reveal/clone/rollback tests |
| Player/NPC actors | players, NPCs, lifecycle rows | movement, condition, promote owners | dialogue/action claims | actor existence, visibility, frame binding | public actor handles/facts | actor promote and scope tests |
| Factions/command nodes | faction resources, command nodes, reports, ops ledger | faction scheduler/tools | reports/proposals | faction scope, command-node row ownership, resource ledger invariants | faction reports/handles | Phase 92 row-semantics tests |
| Relationships/dialogue | relationships and dialogue receipts | dialogue and relationship tools | summaries/quotes before receipt | speaker binding, relationship refs, private scan | public relationship/fact refs | dialogue/relationship tests |
| Inventory/items/documents/tags | item tables, holder state, tags | item tools and entity-tag service | item/tag names | holder refs, item existence, tag lane owner | item handles/facts | spawn/transfer/tag tests |
| World clock/time | `world_clocks`, `turn_clock_ledger` | living-world clock authority | proposed time text, UI tick | accepted clock receipt, non-negative deltas, restore clock separation | public world time | no-op/wait/travel/restore tests |
| Actor private memory | actor process states and knowledge records | actor scheduler/tools | private memory retrieval | actor frame, positive scopes, blocked scopes | actor authority traces/visible effects | out-of-scope actor mutation tests |
| Due-world jobs/proposals/plans | jobs, proposals, world threads, active plans | proposal executor/due-world resolver | forecast/world-brain/proposal text | lifecycle, due time, base version, emitted-ref coverage | proposal commit receipts/deferred work | active-plan scope mismatch tests |
| World-brain/forecast/guardrails | prompt support rows and forecasts | forecast/support builders | suggestions/diagnostics | support-only classification, no hidden-fact promotion | support context only | hidden-leak tests |
| Authority traces/events | authority trace/event rows | accepting executor/proposal owner | summaries as receipt payload | citable/private classification | event refs, packet facts | receipt mismatch/rollback/vector rebuild tests |
| Narrator packet | settled packet and fact list | narrator packet builder | support context and diagnostics | selectable/support/private split | fact refs/evidence refs | resume packet tests |
| Final narration attempt | narrator attempt plus compiled text | narration guard | style/support prompts | selected refs, citable kind, private-term guard | public assistant message | live/resume no-legacy-text tests |
| Chat history/pending resume | chat history JSON and saga state | chat route/resume owner | internal metadata | public history DTO, opaque resume token | public history/recovery state | no saga id/status leakage tests |
| SSE/API projection | DTO factories and route projectors | route/projector modules | none | public schemas, event allowlists, backend-ref guard | public events/JSON | raw legacy id rejection tests |
| Frontend render state | parsed DTOs/local UI state | frontend parser/components | draft/debug local state | public handle parser, malformed payload handling | rendered labels/actions/assets only | API tests and Browser smoke |
| Checkpoints/artifacts | checkpoint dirs/manifests | checkpoint service | checkpoint labels | path safety, restorable manifest, handle resolver | `pdto_checkpoint_*` | create/list/load/delete tests |
| Store manifest/bundles | manifest plus captured stores | bundle/restore services | hashes/reports | coverage, policies, hashes, row counts | checkpoint/turn snapshot manifests | tampered evidence tests |
| Vectors | LanceDB episodic/lore tables | vector services plus rollback policy | retrieval support | campaign/audience filters, row counts, hashes | semantic retrieval only | restore/rollback reconcile tests |
| Clone/rollback/replay | clone manifest, restore bundles, turn snapshots | clone/rollback/restore service | playtest logs | operation mode, path safety, rewrite/purge/rebuild/reject | clone manifest, restore journal/evidence | clean-start clone and fail-closed replay tests |
| Observability/evals | logs, traces, reports | observability/test harness | human/Codex moves | retention/redaction/publication policy | verdict reports and trace ids | GitNexus/tests/Browser/Oracle/play evidence |

## Recovery Modes

| Failure point | Durable evidence | Recovery owner | Expected recovery |
| --- | --- | --- | --- |
| Before lease | none | chat route | reject/retry with no mutation |
| After lease before snapshot | saga lease/event | turn saga | resume or abandon stale lease |
| After snapshot before accepted receipt | turn snapshot manifest | turn processor/restore | rollback to pre-turn snapshot |
| During tool loop mutation before acceptance | transaction/savepoint | executor/GM loop | rollback savepoint; return structured rejection |
| After accepted receipt before packet | authority traces/state deltas | turn processor | rebuild/continue from accepted receipts or rollback snapshot |
| After settled packet before narration | settled packet | narration resume route | resume final narration from packet |
| During final narration validation | narrator attempt | narration guard | retry same contract or fail closed with pending state |
| During SSE disconnect | chat history and saga state | frontend/route | reload history or resume via opaque public token |
| During restore after staging | restore journal plus staging dir | restore service and lazy campaign load | roll forward idempotently or fail closed before live open |
| During vector reconcile | restored SQLite plus vector policy | vector service | purge stale failed-turn rows, preserve matching pre-turn rows, rebuild missing accepted rows |
| During clean-start clone | clone manifest and target stores | clone service | discard incomplete target unless manifest proves completion |
| Replay-preserving clone request | store manifest replay policies | manifest executor | fail closed while any store requires reject/regenerate |

## Significant Options Compared

| Decision | Option A | Option B | Current choice | Why |
| --- | --- | --- | --- | --- |
| Tool authority | AI SDK/tool loop mutates directly | backend executor validates and receipts | backend executor | SDK tool calling is transport; RPG state needs replayable authority |
| GM planning | one giant model plan/mutate/narrate call | staged GM Read -> tool loop -> settled narration | staged loop | keeps model creative while isolating authority |
| Quick actions | plain UI prose | durable capability rows | durable rows | TTL, one-use, world version, receipt adjacency, rollback |
| Public refs | raw DB ids | opaque public handles/capabilities | opaque handles | UI labels are not authority |
| Final narration | model writes all prose | model selects fact refs; backend grounds | fact-ref compiler | preserves style/order without turning inventions into truth |
| Time | tick mutation wherever needed | clock ledger via accepted receipts | clock ledger | long campaigns need audit and replay |
| Actor/due work scopes | only block player-owned scopes | require positive emitted/write scopes | positive scopes | prevents wrong NPC/location/world writes |
| Restore | staged overwrite | journaled roll-forward restore | journaled restore | partial crashes must converge without model help |
| Clone mode | full replay-preserving now | clean-start support, replay fail-closed | clean-start plus fail-closed replay | avoids claiming semantics not implemented |
| Oracle review shape | many inline files | compact doc plus uploaded bundle | bundled upload | avoids browser freeze and keeps review grounded |

## Current Gate View

Local implementation audit after `7ea2f46e` lists no known P0/P1 architecture
implementation blocker in the attached control-plane areas. That is not a
Phase 95 acceptance claim.

Known remaining gates:

- Oracle R4 must review the current HEAD bundle, because R3 reviewed an older
  tree before the restore journal and public projection slices.
- Browser workability needs broader coverage than one action. The latest
  Browser smoke proved route/UI completion, but also surfaced poor label-heavy
  final prose. That is a gameplay-quality concern, not merely a harness concern.
- Fresh/cloned human-style campaigns and longer soak/replay remain required.
- Acceptance evidence must include source campaign id, clone id when used,
  backend/frontend URLs, route, turn counts, terminal event counts, stop reason,
  artifact root, and trace id when enabled.
- Do not call Phase 95 done by scripted evidence alone.

## Cluster A - Intake, Public Projection, Frontend

Status: P1 closed locally for known public campaign surfaces after
`7ea2f46e`.

References Used:

- `backend/src/routes/chat.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/public-dto-handles.ts`
- `frontend/lib/api.ts`
- `frontend/lib/__tests__/api.test.ts`
- `backend/src/routes/__tests__/chat.test.ts`
- `backend/src/routes/__tests__/campaigns.test.ts`
- In-app Browser current-code smoke, 2026-05-24

Unverified Assumptions:

- The current explicit allowlists cover known public surfaces, but any new route
  must be added to the projection contract before acceptance.
- Browser success after one action is workability evidence, not proof that all
  recovery/failure states are usable.

## Cluster B - Refs, Aliases, Capabilities

Status: locally coherent; public handles, quick-action capabilities, and
model-facing aliases are separate namespaces.

References Used:

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/model-facing-ref-safety.ts`
- `backend/src/engine/public-dto-handles.ts`
- `backend/src/engine/quick-action-offers.ts`
- `backend/src/engine/tool-execution-context.ts`

Unverified Assumptions:

- Legacy saved data can be safely reprojected through backend factories without
  accepting raw ids as new public authority.

## Cluster C - GM Read, Tool Loop, Executor, Receipts

Status: locally coherent; model proposal and backend authority boundaries are
explicit.

References Used:

- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/tool-execution-context.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/runtime-tool-input-schemas.ts`
- `backend/src/engine/tool-contracts.ts`
- `C:\Users\robra\.agents\skills\agents-best-practices\SKILL.md`

Unverified Assumptions:

- Non-GM executor callers remain covered by the same strict authority contract
  or are explicitly legacy/test-only. Oracle should challenge this caller graph.

## Cluster D - Actor, Due-World, Time

Status: locally coherent; positive scopes and ledgered time are the intended
long-run boundary.

References Used:

- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/actor-plan-executor.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/simulation-write-scope.ts`
- `backend/src/engine/living-world-authority.ts`
- `backend/drizzle/0019_turn_clock_ledger.sql`

Unverified Assumptions:

- Forecast cadence is a design/watch item, not a P1, unless long-run play shows
  stale world pressure degrading agency or coherence.

## Cluster E - Narrator Packet And Final Narration

Status: strongest architecture subsystem, but current Browser prose quality is
not yet good enough to call the product loop mature.

References Used:

- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/visible-narration-output-guard.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/turn-processor.ts`

Unverified Assumptions:

- The fact-ref compiler can keep gameplay truth stable while future prompt/style
  work improves prose quality. Oracle should call out if the poor Browser prose
  suggests an architecture issue rather than a content-quality issue.

## Cluster F - Persistence, Clone, Replay, Rollback, Vector

Status: R3 P0 restore crash convergence is locally closed by journaled restore;
clean-start clone is supported; replay-preserving clone fails closed.

References Used:

- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/store-manifest-executor.ts`
- `backend/src/campaign/clone.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/vectors/lore-cards.ts`

Unverified Assumptions:

- Journaled restore convergence is sufficient without a larger storage rewrite.
- Replay-preserving clone can remain outside Phase 95 acceptance as long as the
  product wording explicitly scopes acceptance to clean-start clone and
  fail-closed replay-preserving requests.

## Cluster G - Observability, Oracle, Browser, Acceptance

Status: no acceptance GO. Evidence gates remain.

References Used:

- `AGENTS.md`
- `tasks/lessons.md`
- `output/phase95-reset-rebuild-brief-20260524.md`
- `output/phase95-handoff-contract.md`
- `output/phase95-gameplay-cycle-contract-inventory.md`
- `docs/phase95-architecture-closure-audit-2026-05-24.md`
- `docs/phase95-architecture-completeness-matrix-2026-05-24.md`
- `C:\Users\robra\.codex\skills\oracle\SKILL.md`
- `C:\Users\robra\.agents\skills\agents-best-practices\SKILL.md`

Unverified Assumptions:

- Current Browser smoke proves the app can play a turn after the projection
  slice, but it does not replace 3-4 fresh/cloned human-style campaigns, 60-turn
  smoke runs, or longer soak/replay coverage.

## Oracle R4 Questions

1. Does current HEAD have a complete gameplay control plane from UI action
   intake through GM Read, tool loop, executor, receipts, actor/world runtime,
   time, narrator packet, final narration, SSE/API/frontend projection,
   clone/replay/rollback/vector, and observability?
2. Are any gameplay state classes missing a source of truth, single write owner,
   runtime validator, receipt, projection, recovery mode, or test?
3. Are in-game agent roles, tool availability, tool-call validation, permission
   scopes, terminal receipts, and backend authority boundaries sufficient for
   long play?
4. Did the R4 restore journal design close the R3 restore/rollback P0, or is
   there still a crash/recovery P0/P1?
5. Did the R4 public projection slice close the `done`/`/world` projection P1,
   or are there still public DTO leaks that can become player authority?
6. Is the final narration architecture still a GO for creative play, or does
   the poor current Browser prose indicate a deeper architecture problem?
7. Is clean-start clone plus fail-closed replay-preserving clone acceptable for
   Phase 95 architecture, or does the product goal require replay-preserving
   clone before long-play validation?
8. Give a binary gate for architecture only: `ARCHITECTURE GO`,
   `CONDITIONAL ARCHITECTURE GO`, or `ARCHITECTURE NO-GO`.
9. Separately give a gate for long-play acceptance. Do not conflate architecture
   review with human-style gameplay acceptance.
