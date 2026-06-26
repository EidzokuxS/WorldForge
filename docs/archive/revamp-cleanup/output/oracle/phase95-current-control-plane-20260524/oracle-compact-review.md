1. Verdict: `CONDITIONAL GO`

The Phase 95 control-plane architecture is directionally sound and much stronger than a “60-turn smoke test” loop. The core split is right: model proposes intent/tool calls/fact refs, while backend owns authority, mutation, time, receipts, persistence, public projection, and recovery. The attached canvas states those invariants directly in `docs/phase95-current-gameplay-cycle-architecture-2026-05-24.md:11-29`, and the representative code mostly backs them.

This is not an unconditional architecture acceptance because restore/rollback crash convergence is still a real P0. Implementation may continue, but long-run acceptance should stay blocked until restore is journaled/atomic or startup-repairable.

2. P0 blockers

P0: restore/rollback crash convergence.

Yes, restore/rollback crash convergence is correctly P0. `restoreCampaignBundle` verifies bundle evidence, prepares staging, closes DB/vector DB, then copies the staged SQLite DB into the live path, copies config, copies or writes chat history, removes/copies or policy-applies vectors, clears staging, reloads the campaign, and finally rebuilds episodic vectors when vectors were excluded. Those are multiple destructive/overwriting filesystem steps with no restore journal, committed-generation pointer, startup recovery phase, or “complete-or-repair” marker. A crash after `state.db` copy but before config/chat/vector completion can leave mixed stores. See `restore-bundle.ts:164-204`. `restoreSnapshot` depends on that restore and only clears pending events / invalidates authority after the restore returns, so a crash before return can also skip the post-restore invalidation path; see `state-snapshot.ts:42-57`.

No other listed P1 must be promoted to P0 based on the compact bundle alone. However, support/background `executeToolCall` callers become P0 if an audit finds any state-bearing caller bypassing `ToolExecutionContext` validation or writing without authority traces.

3. P1 blockers and promotion assessment

Keep as P1, not P0: `done` DTO blocklist projection. The route currently strips only `acceptedDurableEventIds` and `producedDurableEventIds` from `done` data in `chat.ts:783-790`. That is a real public-boundary gap because future fields can leak by default, but it is not presently shown to corrupt gameplay truth. Fix with a strict terminal `done` allowlist and run `assertPublicProjectionPayload`-style checks over the result.

Keep as P1: deferred forecast refresh. The canvas explicitly treats forecast deferral as safe but weak for long play, not as a truth-corruption issue, in `docs/...:101` and `docs/...:119`. Make the cadence explicit, keyed to worldVersion/time/pressure changes.

Keep as P1: hidden-cause semantic leakage. The current guard is structurally useful: player-facing packets omit raw canonical turn payload, track forbidden actor/fact/private terms, and check visible text for forbidden term leaks in `player-facing-packet.ts:401-523` and `526-593`. But it is still term/substr-based rather than semantic. Promote only if hidden/private causes are part of the specific acceptance scenario being tested adversarially.

Keep as P1: missing positive player-turn `allowedWriteScopes`. This is a genuine architecture gap. `ToolExecutionContext` supports `allowedWriteScopes` in authority (`tool-execution-context.ts:49-56`), actor turns set it to `args.allowedWriteScopes ?? []` (`tool-execution-context.ts:918-927`), and background state-bearing tools require non-empty allowed scopes (`tool-execution-context.ts:1801-1827`). But player-turn context only accepts `blockedWriteScopes` in its args (`tool-execution-context.ts:113-117`) and builds player authority without a positive allowlist (`tool-execution-context.ts:610-620`, `766-799`). I would not promote it to P0 if active-tool allowlists and concrete validators are enforced elsewhere, but it should be closed before claiming complete one-writer/write-scope coverage.

Keep as P1: actor-lifecycle effect parity. The registry has an `actor_lifecycle` lane owned by `promote_npc` (`gameplay-control-plane-contract.ts:1188-1195`), but runtime effect kinds do not include `actor_lifecycle` (`runtime-tool-descriptors.ts:3-15`), and `promote_npc` only declares a delegate `support_actor_created` effect (`runtime-tool-descriptors.ts:131-136`). The parity check loops over declared runtime effect kinds (`gameplay-control-plane-contract.ts:1284-1367`), so it can pass while actor lifecycle remains unexecutable as an effect-kind invariant. P1 is correct.

Keep as P1, conditionally P0 if bypass exists: support/background `executeToolCall` callers. The compact bundle does not include `tool-executor.ts` or the direct caller set. The context-level posture is good for background calls because state-bearing background tools require source authority and non-empty allowed scopes (`tool-execution-context.ts:1801-1827`). The unknown is caller coverage.

Keep as P1: replay-preserving clone. Fail-closed replay-preserving clone is acceptable while clean-start clone is the supported gameplay path. The manifest executor rejects replay-preserving clone when stores require `reject` or `regenerate` (`store-manifest-executor.ts:91-109`), and clone mode calls the replay plan then throws before proceeding (`clone.ts:396-399`). That is the right interim behavior, provided acceptance wording does not claim replay-preserving clone.

Keep as P1: lore-vector freshness. The policy says lore vectors are `preserve_verified` on turn rollback and exact restore on checkpoint (`gameplay-control-plane-contract.ts:220-223`), but `applyTurnRollbackVectorPolicies` simply continues on `preserve_verified` without showing freshness/hash verification (`restore-bundle.ts:85-107`). This can drift derived memory after rollback. It is not P0 unless lore vectors can surface as authoritative or hidden facts.

Keep as P1: log handle redaction. The route logs raw player input and quick-action handle/offer/action IDs at turn begin (`chat.ts:1362-1374`) and logs durable event IDs on rollback (`chat.ts:490-494`). This is an observability/privacy and capability-hygiene issue, not a gameplay-truth P0.

Additional P1 I would add: terminal receipt parity. `record_dialogue_outcome` and `record_world_fact` have `terminalKind` descriptors (`runtime-tool-descriptors.ts:86-95`) and registry lanes (`gameplay-control-plane-contract.ts:1109-1123`), but the shown parity check only covers `stateEffects`. Add an explicit terminalKind-to-lane parity assertion, or document these as intentionally separate from runtime effect-kind parity. Time can remain a special lane if it has an explicit clock-ledger parity/exemption.

4. Missing layers, invariants, state classes, or agent roles

No major agent role is missing at the architecture-canvas level. The canvas covers Player, GM Read, GM Tool Loop, Executor, Actor scheduler, World-thread runtime, Narrator, Projection services, and Recovery services in `docs/...:53-65`.

The missing or incomplete invariants are narrower:

The restore layer needs a real crash-convergent restore saga: journal, phase marker, generation directory or atomic pointer, startup repair, and crash-injection tests at every boundary.

The tool-authority layer needs positive write-scope derivation for player turns, plus an audit proving every state-bearing player/actor/background/support caller enters through the same executor authority path.

The owner matrix needs terminal receipt parity, not only runtime effect-kind parity. Dialogue/world-fact terminal receipts and clock/time effects should either be mapped into the owner registry by executable assertions or explicitly exempted.

The public projection layer needs default-deny schemas for every SSE terminal payload, especially `done`.

The derived-memory layer needs freshness/hash evidence for lore vectors and clear “derived, never authoritative” retrieval semantics after rollback.

The visibility layer needs structured hidden-cause metadata and semantic adversarial tests; term guards are useful but insufficient for long-play hidden-cause secrecy.

The store-manifest/gameplay-lane join is acceptable as a split, but the current manual join is a P2 audit gap. Add a generated crosswalk proving every gameplay lane maps to a physical store, rollback policy, replay policy, and projection/rebuild path.

5. Assessment of the current state-owner matrix and tool-calling architecture

The state-owner matrix is a good architecture foundation. It encodes the “one writer per gameplay state lane” idea and validates duplicate/missing lanes (`gameplay-control-plane-contract.ts:1047-1064`, `1214-1229`). The issued-ref matrix is also strong: scene aliases, tool-result aliases, quick-action capabilities, narration facts, and public DTO handles all have issuer/resolver/boundary/test metadata (`gameplay-control-plane-contract.ts:753-930`).

Runtime tool descriptors are mostly aligned with this: state mutation tools declare roles/effects, quick actions are separated as UI suggestion plus public-handle authority, and legacy or hidden tools are flagged (`runtime-tool-descriptors.ts:53-201`). The Zod schemas are strong where they matter: quick actions are bounded (`runtime-tool-input-schemas.ts:263-280`), movement requires evidence refs (`runtime-tool-input-schemas.ts:376-386`), dialogue applied state effects require backend receipts (`runtime-tool-input-schemas.ts:446-519`), and durable world facts/dialogue outcomes require structured claims and source refs (`runtime-tool-input-schemas.ts:539-752`).

The weakest parts are not conceptual; they are parity and caller-coverage gaps. `actor_lifecycle` is not covered by runtime effect-kind parity. Player-turn authority lacks positive allowed scopes. Background validation is strong, but the actual executor caller graph is not present in the compact bundle, so caller coverage cannot be verified.

The split between store manifest ownership and gameplay lane ownership is acceptable. They answer different questions: store manifest ownership is about physical persistence/clone/rollback/replay policy; gameplay lane ownership is about logical mutation authority. They should not be merged. They should be joined by an audit/test so a lane cannot be “owned” but unrecoverable, and a store cannot be “recoverable” while containing ownerless gameplay truth.

6. Assessment of final narration architecture

This is the strongest subsystem in the bundle.

The architecture choice is right: the model selects `factRefs` and `evidenceRefs`, while the backend expands those refs into prose. The schema allows one to five grounded sentence objects, each with exactly one of `text` or `factRefs`, and `factRefs` are capped at one per sentence (`narration-grounding-guard.ts:54-111`). The repair/prompt instructions explicitly say to use `factRefs`, not text, and that the backend expands selected fact refs (`narration-grounding-guard.ts:661-669`).

The compiler is appropriately fail-closed. It can require fact refs, resolves evidence refs only from allowed packet refs, expands backend-owned fact refs, rejects repeated fact refs, rejects duplicate prose, checks visible-prose constraints, validates precision support, and then runs full grounding validation (`narration-grounding-guard.ts:286-390`). Allowed evidence excludes player action requests, anchors, guardrails, control returns, and tool-result evidence; committed events are allowed only when they are not merely the player action (`narration-grounding-guard.ts:191-216`). Backend fact text is sanitized against forbidden terms and backend metadata (`narration-grounding-guard.ts:937-948`), and fact expansion requires that each selected backend fact’s owning evidence was cited (`narration-grounding-guard.ts:1126-1163`).

The one thing I cannot verify from this compact bundle is the live call site. The source supports `requireFactRefs`, but the compiler option is optional (`narration-grounding-guard.ts:286-301`). Acceptance should require proof that production final narration calls compile with `requireFactRefs: true` and, where legacy skeleton text remains available, `requireBackendOwnedFactText: true` or equivalent.

Product risk: this architecture protects truth, but it can make narration dry unless backend facts are already written in good player-facing prose or a safe backend phrase/template layer is added. That is not a truth blocker.

7. Assessment of clone/replay/rollback/vector recovery

Restore/rollback is the blocking weakness. The manifest/evidence layer is good: bundle entries carry capture status, row counts, and evidence hashes (`store-manifest.ts:20-35`); vector tables are captured for checkpoint restore when included and excluded by policy for turn snapshots (`store-manifest.ts:209-228`); restorable bundles verify SQLite, JSON, vector, and metadata-only evidence (`store-manifest.ts:487-500`). But the application of a restore is not crash-convergent, as described above.

Clean-start clone looks acceptable as the supported gameplay path. It rejects cloning during active turns (`clone.ts:401-403`), uses the store manifest plan (`clone.ts:411`), rewrites/purges SQLite stores in a transaction-like local DB operation, checks source campaign ID residue, checks foreign keys, truncates WAL (`clone.ts:162-226`), resets chat history, and rebuilds/purges vectors as empty clean-start stores (`clone.ts:303-327`). A crash during clone can leave a partial target directory, but that is source-safe and can be handled as a target cleanup/reject issue rather than a live-campaign rollback P0.

Replay-preserving clone fail-closed is acceptable. The manifest executor rejects unsupported replay policies (`store-manifest-executor.ts:91-109`), and clone throws instead of partially implementing replay-preserving mode (`clone.ts:396-399`). Do not count replay-preserving clone as accepted gameplay functionality until it is actually implemented.

Episodic vector rollback is mostly sound as derived recovery. It rebuilds from authoritative `location_recent_events`, preserves matching existing vectors, purges stale vector rows, recreates the table, and logs counts (`episodic-events.ts:425-483`). Visibility filtering is also audience-aware (`episodic-events.ts:780-807`). Lore vectors are the concern: the policy is `preserve_verified`, but the compact code does not show actual freshness/hash verification during turn rollback.

8. Implementation order

First, close the P0 restore/rollback convergence gap. Add a restore journal with phases, never clear staging until a durable success/repair decision exists, and add startup recovery that either completes the restore, rolls back to the last complete generation, or rejects campaign load. Use crash-injection tests after DB copy, config copy, chat copy, vector remove/copy, staging clear, campaign load, episodic rebuild, and authority invalidation.

Second, make public projection default-deny. Replace `done` blocklist omission with a strict allowlist schema, then run backend-ref/public-boundary validation on every SSE event type. Keep durable IDs out of player terminal payloads.

Third, complete authority parity. Add player-turn positive `allowedWriteScopes`, add terminalKind-to-lane parity, fix or reclassify `actor_lifecycle`, and audit all support/background `executeToolCall` callers. Any unclassified state-bearing caller should fail tests.

Fourth, close hidden-cause and derived-memory long-play risks. Add structured visibility metadata and semantic leak tests for hidden causes. Add lore-vector source hash/worldVersion/freshness stamps, or make lore vectors exact-restore/purge-rebuild depending on source of truth.

Fifth, wire forecast refresh as an explicit policy. It does not need to run every turn, but it needs a backend-owned cadence keyed to worldVersion, elapsed time, pressure signals, or thread wakeups.

Sixth, harden observability. Hash or redact player input, quick-action handles, offer/action IDs, and durable event IDs in standard logs; keep full values only in a deliberately secure trace channel if needed.

Seventh, run long-play acceptance after the above: turn 1/60/600, pending narration resume, rollback before and after settled packets, quick-action stale/consumed/worldVersion mismatch, actor/background tool calls, clone clean-start, vector rebuild, and crash-injection restore.

9. Unverified assumptions

I could not verify the actual `processTurn`, GM Read, GM Tool Loop, actor scheduler, world-thread runner, prompt assembler, or `executeToolCall` implementation from this compact bundle. The architecture canvas names them, but the implementation files are not included.

I could not verify that production final narration actually calls `compileGroundedSentenceDraftToNarrationDraft` with `requireFactRefs: true`.

I could not verify the full caller graph for support/background tool execution. The context validator is strict for background tools, but caller coverage is not shown.

I could not verify lore-vector source-of-truth handling beyond the manifest/restore policy and episodic-vector code.

I did not run the repository test suite; this review is based on the attached compact source and architecture canvas.
