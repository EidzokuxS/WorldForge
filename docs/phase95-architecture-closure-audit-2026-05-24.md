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
guard, frontend raw-id fallback, and pending-narration public recovery DTO P1s
have also been implemented locally with targeted backend/frontend tests and
frontend/backend typechecks, but the branch remains NO-GO for long-play
acceptance until the remaining P1 queue closes, full verification, GitNexus,
Oracle bundled review, Browser evidence, and human-style play/soak evidence.

No long human-style 60-turn, cloned-world, or 600-turn soak acceptance should
resume until the P1 queue below is executable, tested, bundled, and Oracle
reviewed on a frozen current tree.

## Full Stage Coverage

| Stage | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Runtime validators | Receipts/projection/recovery/tests |
| --- | --- | --- | --- | --- | --- | --- |
| UI action intake | Frontend action form plus backend request body | `/chat/action` route canonicalizer | Button labels, quick-action prose, local draft text | Freeform player prose only | request schema, campaign active check, quick-action handle resolution | route tests for freeform/handle/stale/forged; public error DTOs |
| Turn boundary | turn saga, active lease, pre-turn snapshot | chat route plus turn saga service | progress SSE | none | active turn lock, abandoned saga recovery, snapshot manifest presence | rollback snapshot before mutation; pending recovery tests |
| GM Read | typed GM Read result | `runGmRead` and validator | prompt context, support forecasts | interpretation, path, runtime requirement, target/action refs by alias | schema, alias resolution, movement binding, speaker binding, durability checks | diagnostic-only receipt; no mutation; route/runtime requirement fixtures |
| GM Tool Loop | descriptor-derived active tool set and accepted tool results | `runGmToolLoop` | observations, helper results, repair prompts | tool name and args as proposals | active tool allowlist, runtime requirement, ref/capability resolution, write-scope guard | accepted terminal receipts close requirement; rejected/helper results remain support-only |
| Executor | SQLite authoritative tables and authority traces | runtime tool executor per state lane | same-turn observations | validated tool args only | input schemas, base world version, fences, allowed/blocked write scopes, transactions/savepoints | authority trace, state delta refs, durable event ids, rollback/no-unaccepted-side-effect tests |
| Quick-action production | `quick_action_offers` table | quick-action offer service | label/action prose | label/prose suggestions only | source digest, world version, expiry, consumed marker, campaign/player binding | `qac_*` handles; stale/forged/replayed tests; **P1: accepted-receipt boundary for offer creation still needs proof** |
| Receipts | authority traces, accepted result refs, settled packet inputs | executor and turn processor | tool observations | none after acceptance | receipt role classification, state-owner matrix, write-scope ledger | replay/rollback fact source; receipt mismatch tests |
| Actor runtime | key actor process state, actor frame, actor schedule decision | actor scheduler and actor tool execution | actor knowledge retrieval, private memory | actor decision packet requested tools | actor frame binding, base world version, positive allowed scopes, blocked scopes | actor action results and authority traces; positive scope fence tests |
| Due-world runtime | actor processes, world threads, proposal queue | due-world resolver/proposal executor | forecast/world-brain/guardrails | proposals, deterministic plan payloads | due time, scope conflicts, proposal lifecycle, support-only filtering | deferred proposal rows, skipped/executed traces; **P1: deterministic plan emitted refs need allowed-scope coverage** |
| Time | `world_clocks`, turn clock ledger | living-world authority clock commit service | UI turn ordinal, narration tick | proposed `advance_time` args | non-negative deltas, no turn-boundary time advance, accepted receipt source | clock ledger rows, public world time, no-op/wait/travel/resume tests |
| Narrator packet | settled canonical turn packet plus citable fact list | narrator packet builder | recent transcript, opening scene, guardrails, diagnostics | none | redaction audit, support-only classification, packet budget trace | settled packet persisted before final narration; resume from packet |
| Final narration | backend-issued fact refs and narrator attempt | narration guard/turn processor | style instruction, support context | selected fact refs/evidence refs/order/style | fact-ref required, private/backend term scan, grounding compile, repair/fail-closed | assistant SSE/chat line; no live text fallback; **P2: full turn/resume regression still needed** |
| SSE/API projection | player-facing DTO factories | projection modules and route projectors | internal saga/tool/state objects | none | public DTO schemas, backend-ref guard, explicit event allowlists, legacy raw-id rejection | `turn_resolution`, lookup, world, inventory, history tests; raw legacy id guard targeted test green |
| Frontend projection | `frontend/lib/api.ts` parsed DTOs | frontend API parser | debug state, local render state | none | public handle parser, SSE parser, malformed payload errors, no raw fallback authority | API parser rejects/drops raw `loc-*`/`npc-*`/`item-*` fallbacks; Browser evidence still required |
| Persistence bundles | `store-manifest.json` plus campaign stores | manifest/bundle capture and restore services | evidence hashes, playtest reports | none | manifest coverage, policy schemas, path safety, hash/row-count recomputation | checkpoint/turn snapshot tests; corrupted SQLite/vector evidence fails before live copy |
| Clone | source campaign stores plus manifest plan | clean-start clone service | old source artifacts as forensic context only | none | active-turn rejection, id rewrite/purge/rebuild plan, path safety | clean clone manifest and clone tests; **P1: non-SQL policies partly hard-coded, no durable clone artifact** |
| Rollback/replay/vector | turn snapshots, checkpoints, vector stores, event ledgers | rollback/restore service | vector evidence, playtest harness logs | none | restore policy executor, vector include/exclude policy, recovery mode gate | rollback snapshot restore; episodic vectors reconcile to restored receipts while preserving matching pre-turn vectors |
| Observability/evals | bounded traces, test artifacts, reports | observability module and playtest harness | local Workshop payloads, redacted remote traces | human/Codex playtest actions | event schemas, redaction policy, evidence completeness rubric | contract tests, GitNexus, Oracle bundles, Browser evidence, human-style playtest reports |

## State-Class Ownership Matrix

| State class | Source of truth | Write owner | Support-only surfaces | Model-authored fields | Runtime validators | Receipts/projections | Recovery modes and tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign identity/config | campaign directory, `config.json`, `campaigns` row | campaign manager and clean clone service | worldgen drafts before completion | premise/seeds during generation only | safe id, config parser, generation-complete gate | public campaign metadata | load/migrate/clone/delete tests; P1 full source-id residue fixture needed |
| Player action envelope | validated `/chat/action` body | chat route | `intent`/`method` compatibility mirrors | player prose | schema, campaign, lock, capability/version checks | turn saga row, sanitized history | stale/forged handle tests; legacy mirrors must never override |
| Quick-action offer | `quick_action_offers` table | quick-action service | UI chips and labels | label/action prose | offer id/action id, source digest, expiry, consumed, base world version | `qac_*` handles | stale/consumed/expired tests; P1 non-receipted creation rollback test needed |
| Public DTO handles | projector output and resolver | public DTO handle module | UI labels | none | deterministic handle issuer, resolver, public guard | `pdto_*` handles | route tests; P1 raw legacy shape rejection needed |
| Scene frame aliases | `SceneFrame`, alias map, backend-only ref set | scene frame builder/alias issuer | visible labels and summaries | none | reserved namespaces, backend ref safety, hidden/private term scan | model-facing prompt packet | label collision/raw id tests |
| GM Read result | accepted typed decision | GM Read validator | repair diagnostics | path/runtime requirement/action interpretation | Zod schema, semantic validators, alias-only refs | diagnostic receipt only | unsupported/composite/ref tests |
| Runtime tool descriptors | descriptor registry and owner registry | descriptor contract module | tool descriptions | tool calls choose visible tool names | active allowlist, state lane ownership, effect kind parity | descriptor snapshots | P2 `chronicle_entry` lane and `entity_tag` closure remain open |
| Tool mutation state | SQLite gameplay tables plus traces | tool executor per lane | helper observations | typed tool args | schemas, grounding, authority, write scopes, savepoints | accepted receipt/state delta refs | no-unaccepted-side-effect, rollback, idempotency tests |
| Same-turn write scopes | in-memory turn ledger plus accepted refs | turn processor | diagnostic blocked scope lists | none | conflict detection, prefix scope matching | blocks actor/due work later in turn | actor positive allowed-scope test now covers player-owned mutation rejection |
| World clock | `world_clocks`, `turn_clock_ledger` | living-world authority | UI turn/narration tick | proposed time deltas | accepted clock receipt, non-negative, no boundary time advance | public world time | no-op/wait/travel/restore tests |
| Actor process | `actor_process_states`, wake signals, actor frame | actor scheduler/actor tools | actor knowledge/private memory | actor decision packet | actor frame binding, route, positive allowed scopes, blocked scopes | actor authority traces and visible consequences | out-of-scope actor mutation rejection test |
| Due-world proposal/plan | proposals/jobs/world threads/active plans | proposal executor/due-world resolver | forecast/world-brain | proposal payloads and plan actions | lifecycle, due time, scope conflicts, base version | proposal commit receipts, deferred work | P1 deterministic plan emitted-ref coverage and hidden-leak tests |
| Inventory/items/documents | items tables/tags/holder state | inventory authority/tool executor | dialogue claims | item/tool args | item existence, holder refs, tag/state descriptors | item public handles/facts | transfer/spawn/document state tests |
| Knowledge/events | authority traces, events, knowledge rows | tool/proposal owner that accepted the event | recent transcript, observations | summaries as receipt payload only | citable/public/private surface policy | event refs, packet facts | rollback/vector rebuild tests |
| Narrator packet | settled packet and fact list | narrator packet builder | support context, diagnostics | none | selectable/support/private classification | fact refs/evidence refs | resume packet tests |
| Final narration attempt | narrator attempt record and compiled text | narration guard | style and support prompts | selected fact refs and style/order | selected ref existence, citable kind, private-term guard | public assistant message | no text fallback/unsupported term tests; full E2E gap remains |
| Chat history/pending resume | chat history file plus saga state | chat route/resume owner | internal metadata | none | history projection, resume token check | public history DTO | coarse public recovery state plus opaque resume token; route tests reject saga status/id leakage |
| Checkpoints/artifacts | checkpoint directories and manifest | checkpoint service | checkpoint UI labels | none | manifest restorable checks, path safety | checkpoint handles/metadata | P1 raw checkpoint ids need system-only or handle contract |
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

## Current P1 Queue

1. Adjacent public campaign APIs must be classified or wrapped.
   - NPC promote and checkpoint APIs still trade raw ids.
   - Required closure: mark them explicit admin/system-only surfaces or wrap
     them in public `npcHandle`/`checkpointHandle` contracts.

2. Deterministic due-world actor plans need emitted-ref coverage.
   - Schedules reserve predicted scopes, but `executeActorPlanStep` does not
     validate actual emitted `stateDeltaRefs` against those scopes.
   - Required tests: travel/record-event active plans missing destination,
     event, or location scopes fail before DB updates.

3. `offer_quick_actions` needs accepted-receipt boundary proof.
   - It is durable public-handle authority, but not treated like a mutation in
     all GM loop boundary checks.
   - Required tests: if the turn does not reach accepted receipt closure, no
     quick-action offer row or SSE/projection survives.

4. Clean-start clone must become fully manifest-owned.
   - SQLite uses the manifest plan; non-SQL policies are still partly
     hard-coded and no durable clone manifest is written to the target.
   - Required tests: non-SQL manifest policy mutation fails closed or is
     executed by the plan; target contains clone manifest artifact.

5. Replay-preserving clone/replay must be executable rejection.
   - Manifest has replay policy, but there is no mode that fails closed when a
     caller asks for replay-preserving clone semantics.

6. Clone test coverage must use a representative migrated source fixture.
   - Existing tests prove narrow happy paths. Need source-id residue across all
     rewrite/purge tables and nested JSON/text payloads.

## Current P2 Queue

- Runtime effect-kind/state-owner parity is incomplete for `chronicle_entry`
  and the `entity_tag` service lane.
- Full turn/resume final-narration regression is still needed for legacy
  `sentences[].text` and unsupported/private terms.
- Frontend stale/debug reasoning lane should be developer-mode only or ignored.
- Public DTO player portrait handle may no longer match backend image filename
  lookup. Needs asset URL contract test.
- Phase 88 harness text still says clone copies campaign DBs although the code
  now uses `cloneCampaignCleanStart`.

## Cluster Status, References, Assumptions, Options

### A. Intake, Public Projection, Frontend

Status: **P1 partly closed; adjacent public surfaces still open**

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
- `backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts`
- `frontend/app/game/page.tsx`
- Read-only public projection/frontend audit from Tesla, 2026-05-24

Unverified Assumptions:

- Checkpoint/NPC admin routes can either move behind system-only semantics or
  be wrapped without a broad UI redesign.
- In-app Browser evidence will confirm the stricter frontend parser still
  renders current backend `pdto_*` payloads in the real game UI.

### B. Refs, Aliases, Capabilities

Status: **P1 open**

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

Status: **P1 open**

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
- Meitner audit, 2026-05-24

Unverified Assumptions:

- `offer_quick_actions` can be moved under accepted-receipt cleanup without
  making normal successful turns lose useful action chips.

### D. Actor, Due-World, Time

Status: **P1 open after actor P0 closure**

Decision in force: actor and due-world runtime may be creative and proactive,
but every write must be fenced by positive ownership and same-turn conflict
rules. Time is ledger-owned.

Options compared:

- Block only player-owned scopes during actor work. Good partial guard, but
  insufficient for wrong-NPC/location/item writes.
- Require positive allowed scopes from schedule/frame and reject emitted refs
  outside those scopes. Chosen and implemented for actor decision tools.

References Used:

- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/actor-plan-executor.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/simulation-write-scope.ts`
- `backend/src/engine/living-world-authority.ts`
- Meitner audit, 2026-05-24

Unverified Assumptions:

- Scheduled actor write scopes are specific enough for immediate actor tools.
  Deterministic due-world plan emitted refs still need their own P1 coverage.

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

Status: **P1 open after restore/vector P0 closure**

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
- `C:\Users\robra\.codex\skills\oracle\SKILL.md`
- `C:\Users\robra\.agents\skills\agents-best-practices\SKILL.md`
- Browser plugin requirement from user, 2026-05-24

Unverified Assumptions:

- The local in-app Browser path is healthy enough for final gameplay UI
  verification after backend/frontend servers are restarted.

## "Nothing Forgotten" Checklist

This list is the closure guard before any future "architecture GO" claim:

- [x] UI action intake has an owner and does not trust prose labels.
- [x] Quick actions are durable capabilities, but receipt-bound cleanup is P1.
- [x] GM Read is read/classification only.
- [x] GM Tool Loop is proposal-only until executor acceptance.
- [x] Tool executor owns mutation and receipt authority.
- [x] Same-turn write-scope ledger exists.
- [x] Actor tool execution has positive allowed-scope fences.
- [ ] Due-world deterministic plan emitted refs are checked against predicted
  scopes. P1.
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
- [ ] Checkpoint/NPC adjacent APIs are system-only or handle-wrapped. P1.
- [x] Store manifest covers current stores.
- [x] Restore verifies manifest evidence before copy.
- [x] Restore uses a staged idempotent lifecycle for rerun convergence.
- [x] Episodic vector rollback preserves/rebuilds pre-turn memory from
  authoritative receipts.
- [ ] Clean-start clone is fully manifest-owned and writes clone evidence. P1.
- [ ] Replay-preserving clone/replay is executable fail-closed. P1.
- [ ] Observability evidence includes Browser UI, GitNexus, Oracle bundle, and
  human-style play after blockers close.

## Next Implementation Order

1. Quick-action offer accepted-receipt cleanup.
2. Due-world deterministic emitted-ref coverage.
3. Adjacent public campaign API classification/handle wrapping.
4. Fully manifest-owned clean-start clone artifact and replay rejection.
5. Oracle bundled full architecture GO, then Browser gameplay workability,
    fresh/cloned human-style 60-turn campaigns, and longer soak/replay.
