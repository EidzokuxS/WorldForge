# Phase 95 Gameplay-Cycle Architecture

Status: Oracle-reviewed architecture gate for the Phase 95 reset/rebuild.

Oracle gate result on 2026-05-24:

- Full/bundled architecture review: NO-GO for broad Phase 95 implementation.
- Approved next scope: GO only for a narrow architecture-hardening slice that
  freezes executable contracts before gameplay feature work expands.
- Required first slice: turn authority contract, store manifest, executable
  state-owner registry, issued refs/capabilities, public projection DTOs,
  clock ledger contract, and fact-ref narration contract.

Gameplay control-plane bundle review on 2026-05-24:

- Oracle session: `phase95-gameplay-control-plane-bundle`.
- Delivery: one zip bundle with three bundle files, no inline file set.
- Verdict: CONDITIONAL-GO for the architecture direction; NO-GO for long-play,
  clone/rollback acceptance evidence until P0 blockers close.
- P0 queue: live turn authority spine and shared same-turn write scopes;
  fact-ref-only live narration; manifest-constructed clean-start clone and
  vector-safe restore; typed public DTO projection for `/world` and entity
  routes; RPG-domain state owner matrix.
- Implementation implication: continue with verified P0 slices and regular
  commits, but do not resume fresh/cloned 60-turn or longer acceptance
  playtests until these blockers are executable, tested, and reviewed.

Post-write-scope wide bundle review on 2026-05-24:

- Oracle session: `phase95-wide-p0-bundle-valid`.
- Delivery: one zip bundle with 17 files; dry-run confirmed roughly `130k`
  tokens and the run reported `files=17`.
- Invalidated evidence: `phase95-wide-p0-bundle` uploaded an empty zip because
  the CLI prompt/file argument order was wrong; do not use that response as
  architecture evidence.
- Verdict: NO-GO for long-play Phase 95 acceptance; CONDITIONAL-GO only for
  the next hardening slices.
- P0 queue confirmed from the current `HEAD`: public projection/API/SSE/
  frontend boundary; manifest-owned clean-start clone; vector-safe rollback;
  public DTO handles/shared ref resolver.
- Recommended first slice: close the public projection boundary with typed DTO
  factories and frontend public handles, then implement manifest-driven
  clean-start clone and vector-safe restore.

Implemented hardening slices after the reset:

- Durable quick-action capabilities: quick-action labels/prose remain
  presentation, while backend-owned offer rows and opaque capabilities carry
  selection authority.
- Runtime store bundle manifest: checkpoint and turn-rollback bundles now write
  and verify a manifest before restore. The manifest covers every current
  SQLite gameplay table plus JSON, vector, projection, artifact, and evidence
  stores, so missing store policy blocks restore evidence instead of silently
  trusting helper-copy behavior.
- Turn clock ledger and authority stages: gameplay world time is now recorded
  as ledgered accepted authority, while turn-stage evidence is recorded through
  saga events. UI turn ordering remains separate from world minutes.
- Fact-ref live narration: final narration uses backend-issued fact/evidence
  refs instead of a live authority-bearing free-text lane.
- Live turn authority stages: the current turn spine records the reviewed
  authority lifecycle through the route, turn processor, executor, narrator
  packet, final narration, and public projection checkpoints.
- Same-turn write-scope ledger: accepted player-turn writes reserve scopes for
  actor/due-world work later in the same turn.
- Pre-commit blocked-scope guard: the executor now rejects blocked write-scope
  conflicts before mutation where possible and again before authority commit
  from exact backend-visible state-delta refs.

Current post-slice status on `develop`:

- Last verified commit: `197ba289 Guard same-turn write scopes before tool
  commits`.
- Backend evidence: `npm --prefix backend run typecheck` passed; full backend
  `vitest` passed `219` files and `2938` tests, with `1` skipped file and
  `30` todo tests.
- GitNexus evidence: staged `detect_changes` reported `critical` because the
  slice intentionally touched `executeToolCall`, `executeValidatedTool`,
  `runGmToolLoop`, actor/due-world proposal paths, and turn processing. The
  high-risk symbols were inspected before commit, and the index was refreshed
  with `npx gitnexus analyze`.
- Long-play status: still NO-GO. These slices close important control-plane
  blockers, but they are not full Phase 95 acceptance evidence.

## End State

WorldForge Phase 95 should reach a high-quality, playable LLM-driven RPG loop:
the player can act naturally, the world responds coherently, and the campaign
remains trustworthy across the first turn, the sixtieth turn, the six-hundredth
turn, cloned worlds, replay, rollback, and long-running play.

The game should feel free and creative because LLM narration can style and
compose the experience. Gameplay truth must stay stable because refs,
capabilities, tool ownership, time, receipts, persistence, clone/replay,
rollback, narration grounding, UI projection, and recovery have explicit
backend-owned contracts.

Sixty-turn playtests are early smoke evidence. The design pressure is campaign
continuity at hundreds of turns, where refs, time, memories, receipts, vectors,
projection, and narration must still behave like ordinary gameplay rather than
a brittle test survival mode.

## Baseline

- Reset baseline: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`
- Safety branch: `codex/phase95-pre-reset-20260524`
- Safety branch role: risk/evidence library only, not an architecture source of
  authority.
- Current verdict: the reset baseline is useful and testable, but it is not a
  Phase 95 gameplay architecture GO.

## Root Invariants

- The model proposes. Backend code validates, authorizes, mutates, records,
  projects, recovers, and persists.
- Every player turn has one authoritative state machine. Side effects are
  either staged, accepted into receipts, rebuildable from accepted receipts, or
  rolled back by a named recovery rule.
- Every state class has exactly one write owner.
- Every player/model-facing ref is an issued alias or a backend-owned
  capability. Raw database ids are not a gameplay contract.
- UI labels, quick-action text, and model prose are presentation. They never
  carry authority.
- Tool results are observations until accepted into backend receipts.
- Time advances only from accepted clock receipts.
- Narration is grounded in backend-visible accepted facts while remaining fun
  and expressive.
- Public projection is allowlist-based. Omission filters are temporary risk
  controls, not architecture.
- Clone/replay/rollback is a store-manifest problem, not a helper-script trick.

## Oracle Gate P0/P1

P0 blockers before broad implementation:

- Public projection is not yet proven as a closed authority boundary. Route
  filters and public projection assertions exist, but `/world`, entity routes,
  history, SSE, quick actions, and frontend state still need a current
  end-to-end DTO audit before long playtests.
- Clone/replay/rollback/vector lifecycle is only partially contract-closed.
  Store-manifest rollback bundles exist, but clean-start clone must consume the
  manifest rather than legacy helper-copy semantics, and vector restore/rebuild
  policy still needs current cluster GO.
- Clock authority has an executable ledger and no-silent-minute tests, but the
  next review must confirm that all actor/due-world wakeups, resume, clone, and
  projection consumers now read the ledgered authority meaning.
- Live final narration is fact-ref based in the current reset/rebuild branch;
  next review must confirm no legacy `text` authority path remains reachable in
  normal gameplay.
- A shared issued-ref/capability resolver remains the long-term direction. The
  current branch has backend-owned capability rows, scene aliases, narration
  fact refs, and write scopes, but the unification is not complete enough to
  call the ref/capability layer mature.

P1 blockers to close in the first hardening wave:

- Actor/due-world player-owned fences need executable proof.
- State-owner lanes need sharper granularity than broad categories such as
  movement, world event, or scene beat.
- World-brain, forecast, and support-only context must not become hidden-fact
  authority.
- Quick-action source digest semantics must be explicit: authority comes from
  the durable offer row and live resolver checks.
- Settled-turn resume, retry, rollback, undo, and clone need one shared meaning
  of "settled".

The full Oracle verdict is captured as `phase95-architectu-bundle-go`.

## Full Gameplay Stage Map

1. UI action intake
   - Accept freeform text or a backend quick-action handle.
   - Quick-action labels and prose are display only.

2. Route turn boundary
   - Acquire a durable turn lease.
   - Reject concurrent turns.
   - Create a rollback snapshot/intent before mutation.
   - Enter the executable turn authority state machine.
   - Build an action envelope with source, player, campaign, base world version,
     and optional capability handle.

3. GM Read
   - Classify the player's action and runtime requirement from the visible scene
     frame.
   - No writes.
   - No raw id authority.
   - All target refs must resolve through current issued aliases/capabilities.

4. GM Tool Loop
   - Expose a narrow active tool set derived from descriptors.
   - The model proposes tool calls only.
   - Terminal closure is receipt-driven, not prompt-driven.

5. Executor
   - Resolve issued aliases/capabilities to internal ids.
   - Validate schema, scope, base version, and player-owned fences.
   - Mutate only through the canonical owner of the relevant state class.

6. Receipts
   - Accepted effects create authority traces, state deltas, event refs,
     witnesses, time deltas, and durable event ids.
   - Rejected or helper-only tool calls remain observations.
   - Accepted receipts are the only source for later authority hashes, replay,
     rollback, vector rebuilds, and citable narration facts.

7. Actor/world runtime
   - Due-world and actor decisions run with explicit scope and owner fences.
   - Support/offscreen proposals cannot mutate player-owned state during a
     player turn unless a named contract permits it.

8. Time
   - UI turn ordinal and world-time minutes are separate.
   - World time advances from accepted time ledger entries only.

9. Narrator packet
   - Build from settled backend state, accepted receipts, visible facts, and
     support-only context.
   - Selectable facts are separated from non-citable orientation.

10. Final narration
   - The model selects backend fact/evidence refs and style choices.
   - Runtime compiles or validates the final text against accepted facts.
   - Private, hidden, or unsupported terms fail closed or trigger repair.

11. SSE/API/frontend
   - Project only typed public DTOs.
   - `turn_resolution`, quick actions, `/world`, `/history`, and location entity
     routes use allowlists.

12. Persistence, clone, replay, rollback, vector
  - A store manifest declares preserve, purge, rewrite, rebuild, or external
    evidence policy for every store.
  - Snapshots and rollback cover SQLite, config, chat, vectors, projection
    rows, saga state, and active turn intent.

13. Observability
   - Every stage emits bounded trace events without private payload leakage.
   - Evals assert contracts, not just successful scripts.

## Turn Authority Contract

The first implementation slice must turn the stage map into an executable
contract, not only prose.

Required lifecycle:

1. `intent_created`
2. `lease_acquired`
3. `snapshot_taken`
4. `effects_staged`
5. `receipts_accepted`
6. `canonical_state_committed`
7. `settled_packet_persisted`
8. `narration_accepted`
9. `public_projection_committed`
10. `turn_finalized`

Each stage must define:

- idempotency key;
- allowed writes;
- recovery after crash before/after the write;
- rollback behavior;
- replay behavior;
- public projection behavior;
- whether vector memory may be written, purged, or rebuilt;
- what evidence proves the stage completed.

Anything outside this lifecycle is either support-only, diagnostic-only, or a
bug.

## State Ownership Contracts

| State class | Source of truth | Write owner | Model-authored fields | Validators | Receipts/projection/recovery/tests |
| --- | --- | --- | --- | --- | --- |
| Campaign identity/config | Campaign directory, `config.json`, campaigns table | Campaign manager | Worldgen premise/seeds before generation completion | Safe campaign id, config parser, generation-complete gate | Creation/load receipts; public campaign metadata; migration/reconnect on load; create/load/delete/clone identity tests |
| Player action envelope | `/chat/action` route validation result | Chat route turn boundary | None | Discriminated schema, length, active campaign, base world/capability version | Turn saga row; sanitized history; rollback snapshot before mutation; freeform/handle/stale action tests |
| Quick-action offers | Durable offer ledger | Quick-action offer service | Label and suggested prose only | Offer id, campaign/player/base version/source digest/expiry/consumed marker | Offer created/consumed/rejected receipts; opaque handles to frontend; stale/forged/replayed/expired tests |
| Scene frame and aliases | Scene frame plus turn-scoped issued ref set | Scene frame builder and alias issuer | None | Alias map, reserved namespaces, backend-ref rejection, private term scan | Prompt packet digest; public labels only; replay rejects stale aliases; duplicate/raw-id/hidden-label tests |
| GM Read decision | Typed accepted GM Read result | `runGmRead` for classification only | Path, runtime requirement, interpreted target/action | Zod schema, semantic checks, alias-only refs, repair | Diagnostic receipt; not public except progress; retry/fail before mutation; composite/unsupported-ref tests |
| Tool descriptors/runtime requirement | Descriptor registry and state owner matrix | Descriptor/contract module | Tool calls and args | Active allowlist, terminal requirement, one canonical owner per state lane | Receipt plan; narrow model toolset; descriptor snapshots and owner exclusivity tests |
| Tool execution/mutation | SQLite state plus authority trace | Runtime executor per state lane | Tool input args | Input schema, grounding, alias/capability resolution, fences, transaction/savepoint | Authority receipts/state deltas; rejected observations stay non-authority; rollback/no-unaccepted-side-effect tests |
| World clock/time | Clock tables plus turn clock ledger | Clock ledger commit service | Proposed `advance_time` args | Accepted time receipt, non-negative deltas, UI turn vs world time separation | Clock ledger rows/public world time; ledger replay/snapshot restore; no-op/wait/travel/resume tests |
| Actor/due-world runtime | NPC/process/proposal/job/thread state | Actor decision/proposal executor within scope | Actor decision/proposal payloads | Actor frame, changed read sets, player-owned fences, preflight, base version | Proposal commit receipts and due-world refs; only visible consequences project; hidden-leak/fence/concurrency tests |
| Narrator packet | Settled canonical turn packet | Turn processor/narrator packet builder | None | Redaction audit, support-only classification, packet budget trace | Settled packet and fact refs; resume from settled packet; private/support-only/resume tests |
| Final narration | Backend selectable facts plus accepted narrator attempt | Narration guard/turn processor | Fact refs/evidence refs/order/style choices | Required fact refs, compile/grounding check, private term scan, repair | Narrator attempt receipt; assistant SSE/chat line; pending resume; no live `text` fallback/unsupported-ref tests |
| Public projection | Backend public DTO projectors | Projection module | None | DTO schemas, raw id/private/tool/saga leak tests | Projection digest; rebuild from authoritative state; route/event/frontend contract tests |
| Clone/replay/rollback/vector | Store manifest and authoritative stores | Clone/rollback service | None | Manifest coverage, path safety, rewrite/purge/rebuild rules, hashes/id scrub | Clone/restore manifests; vector policy; stale-vector/crash/replay-mode tests |
| Observability/evals | Bounded traces, test artifacts, reports | Observability module and playtest harness | Human/model playtest actions when applicable | Event schemas, no private leakage, contract evals | Per-turn trace ids and verdicts; replay correlation; trace completeness and long-run report tests |

## Store Manifest Contract

The store manifest is part of the first hardening slice. It must fail closed:
any store not listed in the manifest blocks clone/rollback/replay evidence.

Every store entry declares:

- store name and path/table/collection;
- authority level: authoritative, derived, projection, diagnostic, evidence, or
  cache;
- clone policy: preserve, purge, rewrite, rebuild, or reject mode;
- rollback policy: snapshot, ledger replay, purge/rebuild, or external;
- replay policy: deterministic replay, recorded reuse, regenerate, or reject;
- vector policy where relevant;
- source campaign id scrub policy;
- hash/count evidence.

Current implementation status:

- `PHASE95_STORE_MANIFEST` covers every current SQLite table named in
  `backend/src/db/schema.ts`, plus `json:config`, `json:chat_history`,
  `vectors:episodic_events`, `vectors:lore_cards`, `artifact:checkpoints`,
  `artifact:images`, `artifact:turn_boundaries`, `projection:public_dtos`,
  and `evidence:playtest_reports`.
- `captureCampaignBundle` writes `store-manifest.json` into each checkpoint or
  turn snapshot bundle.
- `restoreCampaignBundle` refuses to restore a bundle without a manifest and
  refuses vector restore when the bundle did not capture vectors.
- Remaining work: make clean-start clone consume the same manifest instead of
  using the legacy Phase 94 helper-copy/rewrite path, and add stronger content
  hashes for logical vector rows once the clone/replay store rewrite service
  lands.

Clean-start clone is the Phase 95 mode. Replay-preserving clone stays rejected
until it has explicit id rewrite and saga/vector/packet replay semantics.

Post-write-scope bundle focus:

- Verify public projection and clone/replay/vector clusters against the current
  `HEAD`, not the pre-reset safety branch.
- Treat the previous Oracle/agent answers as risk inventory. Any GO for
  long-run campaigns must be rerun on a frozen current-state bundle.
- Use bundle attachments or compact single-file packets for Oracle and agents;
  do not paste large inline file sets into the browser composer.

## Cluster Plan

### A. UI Intake And Public Projection

Decision: durable quick-action capabilities plus public DTO allowlists.

Options considered:

- Keep prose quick actions. Lowest churn, but violates backend authority.
- Signed stateless tokens. Better than prose, but weak for consumption,
  replay, recovery, and audit.
- Durable offers. Highest authority and recovery. Chosen.

References Used:

- `backend/src/routes/chat.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/engine/player-facing-events.ts`
- `frontend/lib/api.ts`
- `frontend/app/game/page.tsx`
- OpenAI tools/function calling docs
- Hono SSE docs
- Independent UI/SSE and GM Tool Loop audits

Unverified Assumptions:

- The current frontend can migrate to handle-based quick actions without a full
  play-surface redesign.
- Debug/admin views that need raw state can move to explicit debug DTOs.

### B. Refs, Aliases, And Capabilities

Decision: one shared turn-scoped issuer/resolver for scene aliases, tool refs,
quick-action handles, narrator facts, and public DTO capabilities.

Options considered:

- Keep current per-surface alias helpers. Low churn, but drift-prone.
- Shared issuer/resolver. More invasive, but gives one namespace owner. Chosen.

References Used:

- `backend/src/engine/model-facing-scene.ts`
- `backend/src/engine/model-facing-ref-safety.ts`
- `backend/src/engine/tool-execution-context.ts`
- `backend/src/engine/gm-turn-read.ts`
- Independent refs/capabilities audit

Unverified Assumptions:

- The issuer can be introduced incrementally without rewriting every prompt
  builder in one pass.

### C. GM Read, Tool Loop, Executor, Receipts

Decision: descriptor-derived state owner matrix with explicit effect lanes.

Options considered:

- Keep descriptors plus ad hoc profile allowlists. Fast, incomplete.
- Derive state owner matrix from descriptors and snapshot-test it. Chosen.

References Used:

- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/gm-tool-step.ts`
- `backend/src/engine/tool-executor.ts`
- OpenAI function calling docs
- AI SDK tool loop docs
- Independent GM Tool Loop audit

Unverified Assumptions:

- Current tool names can mostly remain stable while effect lanes become more
  explicit.

### D. Actor, World Runtime, And Time

Decision: turn clock ledger separating UI turn ordinal from world minutes, plus
player-owned fences for due-world and actor writes.

Options considered:

- Keep current turn-boundary clock sync. Simple, but preserves split authority.
- Add a clock ledger. More explicit and replayable. Chosen.

References Used:

- `backend/src/engine/living-world-authority.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/world-brain.ts`
- `backend/src/engine/world-forecast.ts`
- `backend/src/engine/actor-plan-executor.ts`
- Drizzle SQLite transaction docs
- Independent actor/world/time audit

Unverified Assumptions:

- Existing clock tables can support the ledger without a destructive migration
  of old zero-turn campaign data.

### E. Narrator Packet And Final Narration

Decision: live runtime final narration must be fact-ref based. The legacy
`text` lane, if retained at all, belongs behind an explicit legacy/recovery
boundary and must not be accepted as live gameplay authority.

Options considered:

- Keep compatibility `text`. Provider-friendly, but weakens grounding.
- Split legacy schema from live runtime schema. Chosen.

References Used:

- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/visible-narration-output-guard.ts`
- `backend/src/engine/player-facing-packet.ts`
- `backend/src/engine/prompt-assembler.ts`
- Independent narration/player-facing audit

Unverified Assumptions:

- Current structured-output reliability is sufficient after fact-ref-only repair
  prompts.

### F. Persistence, Rollback, Clone, Replay, Vector

Decision: implement a store manifest with clean-start clone first. Replay-
preserving clone is a separate explicit product mode, not an accidental
byproduct.

Options considered:

- Clean-start clone with risky stores purged/rebuilt. Safer for Phase 95.
- Replay-preserving clone with full id rewrite. Powerful, higher blast radius.

References Used:

- `backend/src/campaign/runtime-state.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/checkpoints.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/engine/turn-saga.ts`
- `e2e/phase-94/baseline-pool.ts`
- Independent persistence/clone/vector audit

Unverified Assumptions:

- Exact vector snapshots are acceptable short-term for rollback, while
  ledger-driven rebuild can follow once the durable event ledger is stronger.

### G. Observability, Evals, And Acceptance Evidence

Decision: contract evals plus human-style campaigns. Script success alone is
not acceptance.

Options considered:

- Continue scripted success as acceptance. Fast, misleading.
- Contract tests and human-style evidence. Chosen.

References Used:

- `AGENTS.md`
- `tasks/lessons.md`
- Oracle skill
- Agents best-practices skill
- Independent cluster audits

Unverified Assumptions:

- In-app Browser automation can be restored before final UI acceptance. Current
  thread previously hit a Browser runtime setup error, so Browser evidence must
  be rechecked before claiming UI verification.

## Implementation Order

1. Contract-freeze hardening slice
   - Implement the turn authority contract, store manifest, state-owner
     registry, issued-ref/capability contract, public projection DTO contract,
     clock ledger contract, and fact-ref narration contract.
   - This is the only implementation scope approved by the current Oracle
     gate.

2. Public intake/projection spine
   - Durable quick-action handles are implemented.
   - Next: prove every public DTO/SSE/API/frontend surface is allowlisted and
     does not expose raw backend ids, authority refs, saga/tool internals, or
     support-only private terms.
   - Verify with targeted backend/frontend tests plus in-app Browser evidence
     when UI behavior changes.
   - Run GitNexus impact before symbol edits and detect_changes before commit.

3. Unified issued refs/capabilities
   - Introduce the shared issuer/resolver and migrate model-facing surfaces.
   - Verify alias, stale-ref, hidden-ref, and replay tests.

4. Descriptor-derived state owner matrix
   - Split tool effect lanes and enforce one owner per state class.
   - Verify descriptor and executor contract tests.

5. Time and actor/world fences
   - Add turn clock ledger and due-world player-owned fences.
   - Demote `config.currentTick` to derived/cache/debug compatibility, not
     gameplay authority.
   - Verify no-op, wait/travel, due-world, and hidden-leak tests.

6. Final narration grounding
   - Make live final narration fact-ref based.
   - Verify grounding, resume, retry, and no-live-text-fallback tests.

7. Store manifest implementation for clone/replay/rollback/vector
   - Expand the already-frozen manifest into clean-start clone and
     rollback/vector behavior.
   - Verify clone poisoning, stale vector deletion, crash convergence, and
     replay-mode rejection tests.

8. Acceptance evidence
   - Run full backend/frontend suites and typechecks.
   - Use in-app Browser for UI workability evidence.
   - Run human-style fresh/cloned campaigns and hundreds-of-turn soak/replay
     only after architecture blockers are closed.

## Oracle Review Questions

1. Does this control plane assign one write owner per state class, or are any
   ownership boundaries still ambiguous?
2. Is durable quick-action capability storage the correct authority boundary,
   or is a signed-token design sufficient for long campaigns?
3. Is the turn clock ledger enough to solve clock authority, or should
   `config.currentTick` be removed from gameplay turn state entirely?
4. Should live final narration remove the `text` lane immediately, or keep it
   behind a named provider compatibility/recovery boundary?
5. Is clean-start clone the right Phase 95 scope, with replay-preserving clone
   deferred, given the long-term RPG quality goal?
