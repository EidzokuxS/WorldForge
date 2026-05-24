# Phase 95 Architecture Closure Audit

Date: 2026-05-24
Branch: `develop`
Reviewed base before this slice: `aa6a7fb582c2203be2813565c48f90af79dc77dc`
Status: **NO-GO for long-play acceptance**

This audit exists to keep the Phase 95 reset/rebuild honest. The product goal is
a high-quality LLM-driven RPG loop that remains coherent and fun at turn 1,
turn 60, turn 600+, after clone, after rollback, after replay attempts, and
after recovery from partial turns. The architecture is the means: backend-owned
truth, typed contracts, explicit receipts, safe refs, durable time, public
projection, and recoverable stores.

## Current Verdict

The current branch has important hardening slices landed and verified:

- durable quick-action capability rows;
- actor-turn positive write-scope fences for authority-bearing actor tools;
- live turn authority stage evidence;
- fact-ref final narration path;
- clock ledger and no-silent-minute behavior;
- public DTO handles on the main `/world`, `/inventory`, location-entities,
  quick-action, lookup, and primary SSE path;
- receipt-bound quick-action capability creation and public SSE projection;
- store manifest coverage;
- vector row-count/hash evidence for checkpoint bundles;
- manifest-owned clean-start clone service;
- restore-side manifest evidence verification before copy;
- staged, idempotent restore lifecycle;
- vector-policy turn rollback with episodic pre-turn vector retention/rebuild.

It is **not** Phase 95 closure. Independent current-HEAD audits found blockers
in actor/tool ownership, restore integrity/crash convergence, vector rollback
semantics, public projection guard strength, frontend raw-id fallback, and
pending narration recovery projection. The actor/tool ownership P0 has since
been implemented locally. The restore/vector/recovery P0 queue has also now
been implemented locally with targeted contract tests. The public projection
guard, frontend raw-id fallback, pending-narration public recovery DTO P1, and
quick-action accepted-receipt cleanup have also been implemented locally with
targeted backend/frontend tests and frontend/backend typechecks. The adjacent
checkpoint/NPC public API handle wrapping P1 and clone/replay P1 closure have
also been implemented locally with route/API/frontend/clone tests and
typechecks. The branch remains NO-GO for long-play acceptance until the full
architecture completeness matrix, GitNexus, Oracle bundled review, Browser
evidence, and human-style play/soak evidence pass.

External/current review status after HEAD
`006421983a794b358cf830f891a149568f8527c3`: **CONDITIONAL ARCHITECTURE GO /
ACCEPTANCE NO-GO**. The full-cycle control-plane map is coherent enough to
move to Browser/play evidence gates, but Phase 95 gameplay acceptance remains
blocked until those gates pass. Browser/Oracle saved transcripts for the broad
bundle sessions were tiny or missing, but those are now treated as
`NEEDS_RECHECK` rather than proof of one-token model output. Recheck through
`scripts/oracle-recheck-output.mjs` recovered full DOM answers for
`phase95-full-architectu-current-go` and `phase95-full-architectu-current-go-3`;
`phase95-full-architectu-current-go-2` remains `UNVERIFIED_OUTPUT` because the
conversation is inaccessible through backend JSON and DOM. Do not repeat
GPT-5.5 Pro runs for this gate unless explicitly requested.

No long human-style 60-turn, cloned-world, or 600-turn soak acceptance should
resume until the full local closure matrix is bundled, Oracle-reviewed on a
frozen current tree, and Browser workability is rechecked.

## Full Stage Coverage

| Stage | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Runtime validators | Receipts/projection/recovery/tests |
| --- | --- | --- | --- | --- | --- | --- |
| UI action intake | Frontend action form plus backend request body | `/chat/action` route canonicalizer | Button labels, quick-action prose, local draft text | Freeform player prose only | request schema, campaign active check, quick-action handle resolution | route tests for freeform/handle/stale/forged; public error DTOs |
| Turn boundary | turn saga, active lease, pre-turn snapshot | chat route plus turn saga service | progress SSE | none | active turn lock, abandoned saga recovery, snapshot manifest presence | rollback snapshot before mutation; pending recovery tests |
| GM Read | typed GM Read result | `runGmRead` and validator | prompt context, support forecasts | interpretation, path, runtime requirement, target/action refs by alias | schema, alias resolution, movement binding, speaker binding, durability checks | diagnostic-only receipt; no mutation; route/runtime requirement fixtures |
| GM Tool Loop | descriptor-derived active tool set and accepted tool results | `runGmToolLoop` | observations, helper results, repair prompts | tool name and args as proposals | active tool allowlist, runtime requirement, ref/capability resolution, write-scope guard | accepted terminal receipts close requirement; rejected/helper results remain support-only |
| Executor | SQLite authoritative tables and authority traces | runtime tool executor per state lane | same-turn observations | validated tool args only | input schemas, base world version, fences, allowed/blocked write scopes, transactions/savepoints | authority trace, state delta refs, durable event ids, rollback/no-unaccepted-side-effect tests |
| Quick-action production | `quick_action_offers` table | quick-action offer service | label/action prose | label/prose suggestions only | source digest, world version, expiry, consumed marker, campaign/player binding, accepted-receipt boundary | `qac_*` handles; stale/forged/replayed tests; GM-loop rollback tests; SSE rollback test |
| Receipts | authority traces, accepted result refs, settled packet inputs | executor and turn processor | tool observations | none after acceptance | receipt role classification, state-owner matrix, write-scope ledger | replay/rollback fact source; receipt mismatch tests |
| Actor runtime | key actor process state, actor frame, actor schedule decision | actor scheduler and actor tool execution | actor knowledge retrieval, private memory | actor decision packet requested tools | actor frame binding, base world version, positive allowed scopes, blocked scopes | actor action results and authority traces; positive scope fence tests |
| Due-world runtime | actor processes, world threads, proposal queue | due-world resolver/proposal executor | forecast/world-brain/guardrails | proposals, deterministic plan payloads | due time, scope conflicts, proposal lifecycle, support-only filtering, deterministic emitted-ref coverage | deferred proposal rows, skipped/executed traces; active-plan scope mismatch tests |
| Time | `world_clocks`, turn clock ledger | living-world authority clock commit service | UI turn ordinal, narration tick | proposed `advance_time` args | non-negative deltas, no turn-boundary time advance, accepted receipt source | clock ledger rows, public world time, no-op/wait/travel/resume tests |
| Narrator packet | settled canonical turn packet plus citable fact list | narrator packet builder | recent transcript, opening scene, guardrails, diagnostics | none | redaction audit, support-only classification, packet budget trace | settled packet persisted before final narration; resume from packet |
| Final narration | backend-issued fact refs and narrator attempt | narration guard/turn processor | style instruction, support context | selected fact refs/evidence refs/order/style | fact-ref required, private/backend term scan, grounding compile, repair/fail-closed | assistant SSE/chat line; live and resume regressions reject legacy text/private prose |
| SSE/API projection | player-facing DTO factories | projection modules and route projectors | internal saga/tool/state objects | none | public DTO schemas, backend-ref guard, explicit event allowlists, legacy raw-id rejection | `turn_resolution`, lookup, world, inventory, history, checkpoint, NPC promote tests; raw legacy id guard targeted test green |
| Frontend projection | `frontend/lib/api.ts` parsed DTOs | frontend API parser | debug state, local render state | none | public handle parser, SSE parser, malformed payload errors, no raw fallback authority | API parser rejects/drops raw `loc-*`/`npc-*`/`item-*` fallbacks; Browser evidence still required |
| Persistence bundles | `store-manifest.json` plus campaign stores | manifest/bundle capture and restore services | evidence hashes, playtest reports | none | manifest coverage, policy schemas, path safety, hash/row-count recomputation | checkpoint/turn snapshot tests; corrupted SQLite/vector evidence fails before live copy |
| Clone | source campaign stores plus manifest plan | clean-start clone service | old source artifacts as forensic context only | none | active-turn rejection, manifest-dispatched id rewrite/purge/rebuild/reject plan, path safety | durable clone manifest, filesystem action evidence, broad residue tests |
| Rollback/replay/vector | turn snapshots, checkpoints, vector stores, event ledgers | rollback/restore service | vector evidence, playtest harness logs | none | restore policy executor, vector include/exclude policy, recovery mode gate | rollback snapshot restore; episodic vectors reconcile to restored receipts while preserving matching pre-turn vectors |
| Observability/evals | bounded traces, test artifacts, reports | observability module and playtest harness | local Workshop payloads, redacted remote traces | human/Codex playtest actions | event schemas, redaction policy, evidence completeness rubric | contract tests, GitNexus, Oracle bundles, Browser evidence, human-style playtest reports |

## State-Class Ownership Matrix

| State class | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Runtime validators | Receipts/projections | Recovery modes and tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign identity/config | campaign directory, `config.json`, `campaigns` row | campaign manager and clean clone service | worldgen drafts before completion | premise/seeds during generation only | safe id, config parser, generation-complete gate | public campaign metadata | load/migrate/clone/delete tests; P1 full source-id residue fixture needed |
| Player action envelope | validated `/chat/action` body | chat route | `intent`/`method` compatibility mirrors | player prose | schema, campaign, lock, capability/version checks | turn saga row, sanitized history | stale/forged handle tests; legacy mirrors must never override |
| Quick-action offer | `quick_action_offers` table | quick-action service | UI chips and labels | label/action prose | offer id/action id, source digest, expiry, consumed, base world version, accepted receipt adjacency | `qac_*` handles | stale/consumed/expired tests; non-receipted GM-loop rollback and route SSE rollback tests |
| Public DTO handles | projector output and resolver | public DTO handle module | UI labels | none | deterministic handle issuer, resolver, public guard | `pdto_*` handles | route tests; P1 raw legacy shape rejection needed |
| Scene frame aliases | `SceneFrame`, alias map, backend-only ref set | scene frame builder/alias issuer | visible labels and summaries | none | reserved namespaces, backend ref safety, hidden/private term scan | model-facing prompt packet | label collision/raw id tests |
| GM Read result | accepted typed decision | GM Read validator | repair diagnostics | path/runtime requirement/action interpretation | Zod schema, semantic validators, alias-only refs | diagnostic receipt only | unsupported/composite/ref tests |
| Runtime tool descriptors | descriptor registry and owner registry | descriptor contract module | tool descriptions | tool calls choose visible tool names | active allowlist, state lane ownership, effect kind parity | descriptor snapshots | runtime effect/state-owner parity tests cover `chronicle_entry` and `entity_tag` service ownership |
| Tool mutation state | SQLite gameplay tables plus traces | tool executor per lane | helper observations | typed tool args | schemas, grounding, authority, write scopes, savepoints | accepted receipt/state delta refs | no-unaccepted-side-effect, rollback, idempotency tests |
| Same-turn write scopes | in-memory turn ledger plus accepted refs | turn processor | diagnostic blocked scope lists | none | conflict detection, prefix scope matching | blocks actor/due work later in turn | actor positive allowed-scope test now covers player-owned mutation rejection |
| World clock | `world_clocks`, `turn_clock_ledger` | living-world authority | UI turn/narration tick | proposed time deltas | accepted clock receipt, non-negative, no boundary time advance | public world time | no-op/wait/travel/restore tests |
| Actor process | `actor_process_states`, wake signals, actor frame | actor scheduler/actor tools | actor knowledge/private memory | actor decision packet | actor frame binding, route, positive allowed scopes, blocked scopes | actor authority traces and visible consequences | out-of-scope actor mutation rejection test |
| Due-world proposal/plan | proposals/jobs/world threads/active plans | proposal executor/due-world resolver | forecast/world-brain | proposal payloads and plan actions | lifecycle, due time, scope conflicts, base version, active-plan emitted refs | proposal commit receipts, deferred work | deterministic travel/record-event scope mismatch tests; hidden-leak tests remain watch coverage |
| Inventory/items/documents | items tables/tags/holder state | inventory authority/tool executor | dialogue claims | item/tool args | item existence, holder refs, tag/state descriptors | item public handles/facts | transfer/spawn/document state tests |
| Knowledge/events | authority traces, events, knowledge rows | tool/proposal owner that accepted the event | recent transcript, observations | summaries as receipt payload only | citable/public/private surface policy | event refs, packet facts | rollback/vector rebuild tests |
| Narrator packet | settled packet and fact list | narrator packet builder | support context, diagnostics | none | selectable/support/private classification | fact refs/evidence refs | resume packet tests |
| Final narration attempt | narrator attempt record and compiled text | narration guard | style and support prompts | selected fact refs and style/order | selected ref existence, citable kind, private-term guard | public assistant message | no text fallback/unsupported term tests; live/resume fail-closed regressions |
| Chat history/pending resume | chat history file plus saga state | chat route/resume owner | internal metadata | none | history projection, resume token check | public history DTO | coarse public recovery state plus opaque resume token; route tests reject saga status/id leakage |
| Checkpoints/artifacts | checkpoint directories and manifest | checkpoint service | checkpoint UI labels | none | manifest restorable checks, path safety, public handle resolver | `pdto_checkpoint_*` metadata; storage ids stay internal | route/API/UI tests reject raw checkpoint ids and resolve handles to storage ids |
| Vectors | LanceDB episodic/lore tables | vector services plus rollback policy | vector evidence stats | none | campaign/audience filters, row counts, hashes | semantic retrieval only | restore verifies evidence; turn rollback preserves matching pre-turn vectors and rebuilds missing rows from `location_recent_events` |
| Observability | logs, trace spans, eval artifacts | observability/test harness | local-only full payloads | human/Codex moves | no private leakage to public/remote, evidence rubric | trace ids, verdict reports | Browser/UI, GitNexus, Oracle, human-style playtest evidence |

## Current P0 Queue

Closed locally after this audit:

- Actor decision tools now receive positive allowed write scopes from the
  schedule decision. Actor-turn execution defaults to no authority-bearing
  writes when no allowed scopes are supplied, actor-private durable memory is
  scoped to the actor rather than broad `world:event`, and a regression proves
  a scheduled `npc:npc-key:state` actor cannot tag the player.
- Restore integrity now verifies recorded physical hashes and row counts
  before any live campaign copy. Corrupted SQLite evidence and tampered vector
  row-count evidence fail closed.
- Restore now stages bundle files under campaign-local `.restore-staging`
  before closing live runtime handles, clears stale staging on rerun, applies
  one staged bundle into the live campaign, and removes staging before reload.
- Turn rollback now reconciles `vectors:episodic_events` after restore from
  authoritative `location_recent_events`: matching pre-turn vector rows are
  preserved, failed-turn vector rows are purged, and missing accepted receipt
  rows are rebuilt without inventing new authority.

No P0 blockers are currently listed after this local slice. That is not an
acceptance claim: the P1 queue, Oracle full architecture GO, Browser evidence,
and human-style long-play evidence remain required.

## Recently Closed P1 Items

1. Frontend raw-id fallback is fenced.
   - `frontend/lib/api.ts` accepts only valid `pdto_*` handles for world
     authority fields and drops malformed/legacy raw ids instead of blessing
     `loc-*`, `npc-*`, `item-*`, relationship, route, faction, or player ids.
   - Targeted frontend tests cover valid public handles plus legacy raw-id
     rejection.

2. Public projection guard rejects legacy raw-id shapes.
   - `assertPublicProjectionPayload` rejects UUID/colon refs, legacy result
     refs, exact storage-like ids such as `loc-1`, `npc-1`, `item-1`,
     `campaign-main`, and matching object keys.
   - Targeted backend tests cover public handles passing while raw shapes fail.

3. Pending narration public recovery DTO is fenced.
   - Public `/chat/history` and pending-narration conflict/error responses no
     longer expose `TurnSagaRecord.status`.
   - Route tests cover coarse `recoveryState`, opaque `resumeToken`, and
     absence of saga status, saga id, and turn id in public JSON/SSE.

4. Quick-action capability creation is receipt-bound.
   - `offer_quick_actions` is treated as public-handle authority for GM-loop
     savepoint tracking, while remaining support/projection authority rather
     than a terminal scene receipt.
   - Public-handle authority tools may execute beside a typed receipt, but the
     GM loop rejects and rolls back successful quick-action rows unless some
     accepted turn receipt exists.
   - Route SSE buffers `quick_actions` until the `done` boundary can be built;
     rollback/error paths drop the buffered capability event.
   - Targeted GM-loop and chat-route tests cover solo quick-action rollback,
     receipt-adjacent acceptance, and no quick-action SSE after route rollback.

5. Deterministic due-world actor-plan writes are fenced by emitted refs.
   - `resolveDueWorldWorkForScope` and exposure catchup pass the scheduler's
     reserved write scopes into `executeActorPlanStep`.
   - Actor-plan executor preflights planned actor state, location presence,
     location recent-event, and world-time refs before writing NPC rows,
     location events, authority traces, clock state, process state, or replan
     proposals.
   - Missing destination/event scopes return a fail-closed actor-plan result
     with no DB writes; successful deterministic fixtures now reserve
     `location:*:recent_event` explicitly.

6. Adjacent public campaign APIs are handle-wrapped.
   - Checkpoint create/list/load/delete routes now project `pdto_checkpoint_*`
     handles and resolve handles back to storage ids only inside the route.
   - Raw checkpoint ids are rejected at the public route boundary.
   - NPC promote now accepts public actor handles, returns actor/npc handles,
     and no longer exposes raw `npcId`.
   - Frontend checkpoint API/panel actions use `checkpointHandle` for load and
     delete.

7. Clone/replay P1 queue is executable.
   - Non-SQL clean-start clone stores are dispatched through manifest steps:
     config rewrite, chat purge, vector rebuild, artifact rejection,
     projection rebuild, and evidence rejection.
   - Target clones write durable `clone-manifest.json` with source/target ids,
     plan, rewritten/purged/scrubbed tables, and filesystem actions.
   - Replay-preserving clone is an explicit operation mode that fails closed
     when current store replay policies require `reject` or `regenerate`.
   - Clone residue tests seed representative rows across rewrite and purge
     manifest tables, nested JSON/text payloads, config map keys, and verify no
     source campaign id remains in target SQLite gameplay stores.

8. Runtime effect-kind/state-owner parity is executable.
   - `chronicle_entry` is now a gameplay state lane owned by
     `add_chronicle_entry`.
   - `entity_tag` remains owned by the `entity_tag_service` lane, while
     `add_tag` and `remove_tag` are receipt-capable delegates rather than
     competing canonical owners.
   - Contract tests require every runtime state effect kind to map to one
     gameplay state lane and owner.

9. Final narration legacy-text leakage is regression-covered.
   - Live full-turn final narration fails closed when the model returns legacy
     `sentences[].text` with private/unsupported prose.
   - Existing resume coverage recompiles accepted structured attempts with
     `requireFactRefs: true`; the new live regression proves leaked prose does
     not reach assistant chat or narrative SSE before failure.

## Current P1 Queue

No current P1 blockers are listed after the local public-API and clone/replay
closure slices. This is still **not** Phase 95 acceptance: Oracle bundled GO,
Browser UI evidence, human-style play, longer soak/replay, and P2 hardening
remain required before calling the gameplay loop mature.

## Current P2 Queue

- Frontend stale/debug reasoning lane should be developer-mode only or ignored.
- Public DTO player portrait handle may no longer match backend image filename
  lookup. Needs asset URL contract test.
- Phase 88 harness text still says clone copies campaign DBs although the code
  now uses `cloneCampaignCleanStart`.

## Cluster Status, References, Assumptions, Options

### A. Intake, Public Projection, Frontend

Status: **P1 closed for current known public campaign surfaces**

Decision in force: durable quick-action handles and backend-issued public DTO
handles are the player-facing authority boundary.

Options compared:

- Keep raw ids as UI ids. Lowest churn, but turns storage identity into a
  player contract.
- Allow raw ids as compatibility fallback. Good migration bridge, but weak
  Phase 95 closure because the frontend can bless leaked ids.
- Strict public handles with explicit admin/debug exceptions. Chosen for Phase
  95 acceptance.

References Used:

- `backend/src/routes/chat.ts`
- `backend/src/routes/__tests__/chat.test.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/engine/player-facing-events.ts`
- `backend/src/engine/public-dto-handles.ts`
- `frontend/lib/api.ts`
- `frontend/lib/__tests__/api.test.ts`
- `frontend/components/game/checkpoint-panel.tsx`
- `frontend/components/game/__tests__/checkpoint-panel.test.tsx`
- `backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts`
- `frontend/app/game/page.tsx`
- Read-only public projection/frontend audit from Tesla, 2026-05-24

Unverified Assumptions:

- In-app Browser evidence will confirm the stricter frontend parser still
  renders current backend `pdto_*` payloads in the real game UI.

### B. Refs, Aliases, Capabilities

Status: **Quick-action receipt P1 closed locally**

Decision in force: model/player-facing refs must be issued aliases,
capabilities, or public DTO handles. Raw DB ids are not contracts.

Options compared:

- Per-surface detectors. Fast, but drift-prone and already missed legacy id
  shapes.
- Shared unsafe-ref/public-handle validator with explicit allowlists. Chosen.

References Used:

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/model-facing-ref-safety.ts`
- `backend/src/engine/model-facing-scene.ts`
- `backend/src/engine/public-dto-handles.ts`
- `backend/src/engine/quick-action-offers.ts`
- Tesla audit, 2026-05-24

Unverified Assumptions:

- Public handles can be made strict without breaking saved old transcripts by
  projecting legacy storage through backend factories at read time.

### C. GM Read, Tool Loop, Executor, Receipts

Status: **Quick-action receipt P1 closed locally; P2 owner-parity items remain**

Decision in force: model proposes; executor validates, mutates, and records
accepted receipts. Quick-action production is authority-bearing even though it
is presentation-facing.

Options compared:

- Treat only world-state DB writes as mutation boundary. Simpler, but misses
  durable public capabilities.
- Treat every durable authority/projection affordance as a receipt-bound
  mutation. Chosen.

References Used:

- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/__tests__/gm-tool-loop.test.ts`
- `backend/src/routes/chat.ts`
- `backend/src/routes/__tests__/chat.test.ts`
- Meitner audit, 2026-05-24

Unverified Assumptions:

- Route buffering preserves normal successful-turn action chips in live
  Browser play; targeted tests prove the protocol boundary, but playfeel still
  needs Browser and long-run evidence.

### D. Actor, Due-World, Time

Status: **Due-world emitted-ref P1 closed locally**

Decision in force: actor and due-world runtime may be creative and proactive,
but every write must be fenced by positive ownership and same-turn conflict
rules. Time is ledger-owned.

Options compared:

- Block only player-owned scopes during actor work. Good partial guard, but
  insufficient for wrong-NPC/location/item writes.
- Require positive allowed scopes from schedule/frame and reject emitted refs
  outside those scopes. Chosen and implemented for actor decision tools and
  deterministic actor-plan execution.

References Used:

- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/actor-plan-executor.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/actor-exposure-catchup.ts`
- `backend/src/engine/simulation-write-scope.ts`
- `backend/src/engine/living-world-authority.ts`
- `backend/src/engine/__tests__/actor-plan-executor.test.ts`
- `backend/src/engine/__tests__/key-actor-due-plan.test.ts`
- `backend/src/engine/__tests__/offscreen-catchup.test.ts`
- `backend/src/engine/__tests__/key-actor-faction-scheduling-repair.test.ts`
- Meitner audit, 2026-05-24

Unverified Assumptions:

- Existing long-lived campaigns may contain old deterministic active plans that
  lack `location:*:recent_event`; these should fail closed until a decision or
  repair path supplies a complete plan.

### E. Narrator Packet And Final Narration

Status: **P2 open, no current P0/P1 observed in code path**

Decision in force: live final narration is fact-ref based; prose style is
creative, but gameplay truth comes from accepted backend facts.

Options compared:

- Keep legacy text lane as provider compatibility. Provider-friendly, but weak
  grounding.
- Reject live text lane and require selected fact refs. Chosen.

References Used:

- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/turn-processor.ts`
- Meitner audit, 2026-05-24

Unverified Assumptions:

- Current structured-output reliability is good enough with fact-ref retries;
  full turn/resume tests still need to prove fail-closed UX.

### F. Persistence, Clone, Replay, Rollback, Vector

Status: **P1 closed locally after restore/vector and clone/replay closure**

Decision in force: clone/rollback/replay/vector is a manifest-owned store
lifecycle problem. Clean-start clone is Phase 95 mode; replay-preserving clone
stays rejected until its semantics are explicit.

Options compared:

- Helper-copy clone/restore. Fast, but stale JSON/saga/vector poisoning is
  unavoidable.
- Manifest evidence without restore verification. Better observability, but
  still not authority.
- Manifest-owned execution with hash/row-count verification, atomic restore,
  vector retention/rebuild, and executable replay rejection. Chosen.

References Used:

- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/store-manifest-executor.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/clone.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/vectors/lore-cards.ts`
- `better-sqlite3` official backup docs
- LanceDB JS docs for connect/open/count rows
- Godel audit, 2026-05-24

Unverified Assumptions:

- The staged restore lifecycle is sufficient for local crash convergence when
  rerunning the same restore after interruption; deeper startup-time recovery
  markers can remain P1/P2 unless Browser/soak evidence proves a gap.
- Rebuilt accepted episodic rows without vectors are acceptable as a
  short-lived degradation until normal embedding paths refresh them; preserved
  pre-turn rows keep their existing vectors.
- Durable clone manifests intentionally retain source campaign ids as lineage
  evidence; runtime SQLite/config/chat/vector/artifact stores must not retain
  source-owned gameplay state.

### G. Observability, Oracle, Browser, Acceptance

Status: **NO-GO until P1 queues close and Oracle/Browser/play evidence passes**

Decision in force: 60-turn runs are smoke evidence, not the goal. Acceptance
requires contract tests, GitNexus impact/detect changes, Oracle GO on bundled
current evidence, in-app Browser UI workability, and human-style fresh/cloned
campaigns plus longer soak/replay.

Options compared:

- Keep running scripted greens. Fast, but can certify the harness rather than
  the game.
- Use contract closure first, then human-style play and soak as evidence.
  Chosen.

References Used:

- `AGENTS.md`
- `tasks/lessons.md`
- `output/phase95-reset-rebuild-brief-20260524.md`
- `output/phase95-handoff-contract.md`
- `output/phase95-gameplay-cycle-contract-inventory.md`
- `docs/phase95-architecture-completeness-matrix-2026-05-24.md`
- `C:\Users\robra\.codex\skills\oracle\SKILL.md`
- `C:\Users\robra\.agents\skills\agents-best-practices\SKILL.md`
- Browser plugin requirement from user, 2026-05-24

Unverified Assumptions:

- The local in-app Browser path is healthy enough for final gameplay UI
  verification after backend/frontend servers are restarted.

## "Nothing Forgotten" Checklist

This list is the closure guard before any future "architecture GO" claim:

- [x] UI action intake has an owner and does not trust prose labels.
- [x] Quick actions are durable capabilities, and receipt-bound GM-loop/SSE
  cleanup is covered by targeted tests.
- [x] GM Read is read/classification only.
- [x] GM Tool Loop is proposal-only until executor acceptance.
- [x] Tool executor owns mutation and receipt authority.
- [x] Same-turn write-scope ledger exists.
- [x] Actor tool execution has positive allowed-scope fences.
- [x] Due-world deterministic plan emitted refs are checked against predicted
  scopes. Targeted actor-plan/due-world tests green.
- [x] Time has a ledger and no silent turn-boundary minutes.
- [x] Narrator packet separates citable facts from support context.
- [x] Final narration is fact-ref based on live path.
- [ ] Final narration full turn/resume fail-closed regression exists. P2.
- [x] Main backend public projection uses DTO handles.
- [x] Public guard rejects legacy raw id shapes. Targeted backend tests green.
- [x] Frontend rejects raw id fallback as public handles. Targeted frontend
  tests and frontend typecheck green.
- [x] Pending narration exposes only public recovery state. Targeted route
  tests green.
- [x] Checkpoint/NPC adjacent APIs are handle-wrapped. Targeted route/API/UI
  tests green.
- [x] Store manifest covers current stores.
- [x] Restore verifies manifest evidence before copy.
- [x] Restore uses a staged idempotent lifecycle for rerun convergence.
- [x] Episodic vector rollback preserves/rebuilds pre-turn memory from
  authoritative receipts.
- [x] Clean-start clone is fully manifest-owned and writes clone evidence.
  Targeted clone tests green.
- [x] Replay-preserving clone/replay is executable fail-closed. Targeted
  manifest/clone tests green.
- [ ] Observability evidence includes Browser UI, GitNexus, Oracle bundle, and
  human-style play after blockers close.

## Next Implementation Order

1. Bundle `docs/phase95-architecture-completeness-matrix-2026-05-24.md`
   with the focused source/docs index for Oracle full architecture GO.
2. After Oracle GO, run Browser gameplay workability, fresh/cloned human-style
   60-turn campaigns, and longer soak/replay.
