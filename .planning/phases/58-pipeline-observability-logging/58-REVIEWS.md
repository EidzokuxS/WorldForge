---
phase: 58
reviewers: [gemini, codex]
reviewed_at: 2026-04-16T22:30:00Z
plans_reviewed: [58-01-PLAN.md, 58-02-PLAN.md, 58-03-PLAN.md, 58-04-PLAN.md]
overall_verdicts:
  gemini: LOW — GO
  codex: HIGH — STOP (revise 58-01 and 58-04 first)
---

# Cross-AI Plan Review — Phase 58

## Gemini Review

This review covers implementation plans for **Phase 58: Pipeline Observability Logging**.

### 1. Summary
Phase 58 is a foundational observability upgrade that transforms the project's logging from basic text files into a structured, per-turn JSONL pipeline. The use of `pino` for performance and `AsyncLocalStorage` for context propagation is an industry-standard architectural choice that avoids "prop-drilling" correlation IDs through dozens of function signatures. The plans are exceptionally thorough, addressing complex issues like secret redaction, large-payload truncation, and import cycle prevention. The inclusion of stream-safety and concurrency integration tests ensures that the new logging layer won't degrade user experience or corrupt game state.

### 2. Strengths
- **Context Propagation:** Leveraging `AsyncLocalStorage` to automatically attach `turnId`, `campaignId`, and `tick` to all logs across async boundaries is the correct way to handle correlation in a Node.js backend.
- **Robust Security:** The redaction list in Plan 58-01 is comprehensive, covering top-level and nested `apiKey` paths, Authorization headers, and search provider keys.
- **Smart Truncation:** Using SHA-256 hashes + head/tail previews for payloads >10KB allows for auditability and identity-checking (comparing prompts across runs) without causing log volume explosion.
- **Role Granularity:** The `withRole` nested wrappers (especially the Judge role inside Oracle/Reflection) provide high-resolution signal on which LLM task is firing an event.
- **Dependency Management:** Plan 58-03's explicit strategy to keep `prompt-dump.ts` off the barrel to avoid circular dependencies with `settings/manager.ts` shows strong awareness of Node.js ESM binding behavior.
- **Validation Depth:** The validation strategy (Plan 58-04) includes a "stream-safety" test to ensure that adding observability doesn't introduce byte-level drift or latency in the Storyteller SSE stream.

### 3. Concerns
- **Sync Write Divergence (LOW):** The Research doc recommends `pino.destination({ sync: true })` for crash safety, but Plan 58-01 Task 2 uses a custom `Writable` (`TurnFileDispatch`) that writes to a `createWriteStream` (async). If the backend process crashes mid-turn, the last few log events (which likely contain the reason for the crash) might still be in the Node.js write buffer and never land on disk.
- **Settings Disk I/O (LOW):** `prompt-dump.ts` calls `loadSettings()` twice per turn (hidden and final passes). While disk I/O for a small JSON file is generally fast, if the user is on a slow network mount, this adds a small blocking overhead to the prompt assembly phase.
- **Log Retention (LOW):** Logs are stored in `campaigns/{id}/logs/`. There is no automatic rotation or cleanup. While "one file per turn" is naturally indexed, a very long-running campaign could accumulate thousands of small files.

### 4. Suggestions
- **Flush on Turn End:** In Plan 58-03, Task 1, step 2b (the `finally` block for `/action`), consider adding a call to `rootPino.flush()` to ensure all async streams are drained before the route yields its final SSE event.
- **Synchronous Turn Dispatcher:** For maximum crash safety (matching the Research recommendation), consider using `fs.appendFileSync` inside the `TurnFileDispatch._write` method instead of managing a Map of `WriteStream` objects. For ~100 events per turn, the performance cost of opening/closing the file is negligible compared to the 2-5 second LLM latencies, and it guarantees that every event lands on disk immediately.
- **Documentation:** Ensure the `LOG_LEVEL` environment variable and the new `Settings.observability` structure are documented in the backend `README.md` or a dedicated observability guide.

### 5. Risk Assessment: LOW
The risk is low because the implementation is almost entirely additive. The preserve-compatible `createLogger` shim ensures that no existing code needs to be refactored, and the integration tests specifically guard against the two most likely failure modes: secret leaks and stream corruption.

**Verdict: GO.** Proceed with Wave 1 (Plan 58-01).

---

## Codex Review

### Cross-Plan Blockers
- **HIGH:** `58-01`'s `serializePayload()` design truncates the entire object once it crosses 10KB. That breaks later guarantees in `58-02` to `58-04` like `payload.targetTags`, `payload.assembledChars`, and `payload.type === "oracle_result"`.
- **HIGH:** Redaction is designed against top-level keys, but the logger wraps structured data under `payload`. As written, `apiKey` and `Authorization` nested under `payload.*` can leak.
- **MEDIUM:** The plans still allow some degraded behavior (`pino-pretty` fallback, prompt-dump no-op, malformed-settings defaulting). That conflicts with the project's "no silent degradation" rule unless explicitly narrowed.
- **MEDIUM:** Tests rely on global singleton state (`rootPino`, `process.cwd()`, open stream maps) without a reset strategy. Expect flake unless that is designed up front.

### Plan 58-01

**Summary:** Good decomposition and dependency ordering. This is the most important plan in the phase, but it currently has two design flaws that will cascade into every later wave: redaction coverage and object-level truncation.

**Strengths:**
- Clear modular split between context, setup, serializers, and API shim.
- Preserves `createLogger(tag)` compatibility, which reduces refactor risk.
- Extends shared settings, wire schema, and normalizer in the right order.
- Front-loads unit coverage before seam instrumentation.

**Concerns:**
- **HIGH:** Redaction paths do not match the actual logged structure once data is wrapped as `{ payload: ... }`.
- **HIGH:** Whole-object truncation destroys required payload fields instead of truncating only oversized fields.
- **MEDIUM:** In-memory stream key uses `campaignId:turnId`, but on-disk filename stays `turn-{tick}.jsonl`; same-campaign retry/same-tick collisions remain unresolved.
- **MEDIUM:** `createWriteStream` + custom dispatch is weaker than the crash-safe sync JSONL design described in research.
- **MEDIUM:** Falling back to defaults for malformed persisted observability settings is still a silent behavior change.

**Suggestions:**
- Change truncation to be field-level and recursive, not whole-payload replacement.
- Either stop wrapping under `payload`, or add redaction coverage for `payload.*` and nested variants.
- Decide explicitly whether malformed persisted settings should fail startup or emit a hard error.
- Add a same-campaign same-tick collision test, or switch filenames to include `turnId`.
- Prefer injectable sinks/log roots in tests instead of `process.chdir()`.

**Risk Assessment: HIGH.** If this plan ships as written, later plans can "work" while producing logs that are incomplete, unqueryable, or unsafe.

### Plan 58-02

**Summary:** The seam map is thorough and the role-boundary design is strong. The main issue is that it assumes `58-01` already guarantees stable payload shapes, which it currently does not.

**Strengths:**
- Strong mapping from research seams to concrete files.
- Additive instrumentation approach lowers behavioral regression risk.
- Good use of nested `withRole("judge")` inside oracle/reflection.
- Explicitly avoids hidden-pass per-token log spam.

**Concerns:**
- **HIGH:** `prompt.assembled`, `oracle.call`, and similar events depend on payload fields surviving serialization; with the current foundation they may not.
- **MEDIUM:** The plan language says "all 18 seams" while actually deferring 4 route seams to `58-03`.
- **MEDIUM:** Manual `db.write` insertion across many handlers is easy to miss or duplicate.
- **MEDIUM:** Hidden-stream aggregation helps, but overall log volume is still under-specified for visible streaming and SSE-heavy turns.
- **LOW:** `npcOffscreen.batch` is extra scope beyond the declared 18 seams.

**Suggestions:**
- Fix `58-01` before approving this wave.
- Add a checklist/table of exact tool handlers and DB write sites expected to emit `db.write`.
- Use small helpers like `logDbWrite(...)` and `logPromptAssembled(...)` to reduce copy/paste drift.
- Rewrite the success language to "14 engine/vector seams" so acceptance stays crisp.

**Risk Assessment: MEDIUM.** The structure is good, but it inherits critical foundation risk and has some completeness risk around manual instrumentation.

### Plan 58-03

**Summary:** This is the right place to wire ALS and route-owned events, and the cycle-avoidance thinking is solid. The main concern is operational overhead: `sse.emit` and prompt side-car behavior can become the new failure/spam surface.

**Strengths:**
- Correctly puts turn context at the route boundary.
- Handles detached post-turn work explicitly.
- Good separation of route seams from engine seams.
- Strong attention to ESM cycle prevention around `prompt-dump`.

**Concerns:**
- **HIGH:** Logging every outbound SSE event with `dataPreview: event.data` can recreate log explosion on visible narration and add latency in the hottest path.
- **MEDIUM:** `writePromptSideCarIfEnabled()` silently no-ops on settings read or file write failure even when the feature is enabled.
- **MEDIUM:** Calling `loadSettings()` from prompt assembly adds sync I/O and tight coupling on a hot path.
- **MEDIUM:** `currentTick` may not be the final authoritative turn identity if the true tick is established later in route/turn lifecycle.
- **MEDIUM:** The planned route test can prove wrapping, but not full route-to-engine correlation unless it exercises the real handler path.

**Suggestions:**
- For `sse.emit`, log type/size/hash for high-frequency delta events instead of full payload previews.
- If prompt dumping is enabled and fails, emit an explicit error event; don't silently no-op.
- Read observability state from cached runtime config, not `loadSettings()` per prompt.
- Source `tick` from the actual "turn began" state, not a pre-read config value.
- Make the test hit the real chat route, not a mocked generator boundary.

**Risk Assessment: MEDIUM-HIGH.**

### Plan 58-04

**Summary:** Good instinct to add end-to-end, concurrency, and stream-safety tests. As written, though, the acceptance bar is too weak for the phase goal: it can pass without proving all 18 seams or true stream invariance.

**Strengths:**
- Moves beyond unit tests into real acceptance evidence.
- Adds explicit checks for the three payload-shape regressions most likely to break.
- Includes concurrent-turn isolation and validation-doc completion.
- Recognizes route-level seams as part of acceptance.

**Concerns:**
- **HIGH:** The test allows calling `processTurn` directly, which cannot prove `turn.begin`, `turn.end`, or route-level `sse.emit`.
- **HIGH:** The test criteria relax from "all 18 seams" to a much smaller subset; that is not a valid acceptance gate for this phase.
- **HIGH:** The stream-safety test does not prove byte-identical output; it only compares event types and visible text.
- **MEDIUM:** `installLlmMocks()` using `vi.mock()` from a helper/`beforeEach` is brittle unless module imports are deferred.
- **MEDIUM:** Global cwd + singleton logger state + persistent stream maps will make these tests flaky.
- **MEDIUM:** Concurrency coverage is only cross-campaign, not same-campaign same-tick/retry collision.

**Suggestions:**
- Require a route-level harness for the main observability acceptance test.
- Force fixture conditions so all 18 seams fire across one or more deterministic scenarios, or explicitly split acceptance by scenario but cover every seam.
- Compare normalized full SSE transcripts, not just type sequences and visible text.
- Use `vi.doMock()` with dynamic imports, or top-level mocks before importing the subject.
- Add logger reset/cleanup hooks for tests.
- Add a same-campaign retry/collision test, or explicitly declare that case unsupported.

**Risk Assessment: HIGH.** The current validation plan is not strong enough to prove the phase goal.

### Overall Risk Assessment
**HIGH.** The wave ordering is sensible, but `58-01` has core design issues and `58-04` does not yet prove acceptance strongly enough. I would not start implementation until `58-01` is revised for payload-safe truncation/redaction, and `58-04` is tightened to require route-level, full-seam validation.

---

## Consensus Summary

Both reviewers agree the wave ordering, ALS-for-correlation choice, and cycle-avoidance design are sound. Gemini's LOW-risk verdict is based on the additive nature of the change and strong backward-compat posture. Codex's HIGH-risk verdict is based on substantive design flaws in Plan 58-01 that cascade through the phase: object-level truncation destroys payload shape guarantees, redaction coverage misses nested `payload.*` paths, and validation in 58-04 is too weak to actually prove the phase goal.

### Agreed Strengths
- AsyncLocalStorage for correlation (both).
- `createLogger` backward-compat shim (both).
- Cycle-avoidance for `prompt-dump` (both).
- Role-granularity via `withRole` nesting (both).
- Integration test ambition including stream-safety (both).

### Agreed Concerns (must address)
- **HIGH: Hot-path SSE spam and sync-write crash safety.** Gemini flagged sync write as LOW; Codex flagged SSE payload logging as HIGH. Resolution: use sync JSONL writes AND log type/size/hash not full payloads for high-frequency delta events.
- **MEDIUM: loadSettings() called per prompt on hot path.** Both flagged. Resolution: cached runtime config snapshot.
- **MEDIUM: Silent no-op on side-car failure / malformed settings / pino-pretty fallback.** Codex flagged all three; project rule forbids silent degradation. Resolution: fail loudly or explicitly document accepted degradation modes.

### Codex-only concerns (must address — actionable)
- **HIGH: Field-level truncation, not whole-object.** Replace `serializePayload` to recurse into object and truncate only oversized string/blob fields while preserving shape keys.
- **HIGH: Redaction paths must cover `payload.*`.** Add `payload.apiKey`, `payload.Authorization`, `payload.*.apiKey`, `payload.providers[*].apiKey`, etc.
- **HIGH: Tests must hit real route, not processTurn directly.** 58-04 integration test must exercise the actual chat route to prove `turn.begin` and `sse.emit` route-owned seams.
- **HIGH: All 18 seams must appear in acceptance.** Don't relax to a subset. Either force-fixture all 18 or split acceptance across scenarios that collectively cover every seam.
- **HIGH: Stream-safety byte-identical test.** Compare full normalized SSE transcripts, not just event types + visible text.
- **MEDIUM: Same-campaign retry/same-tick collision.** Include `turnId` in filename OR reject collision loudly.
- **MEDIUM: Injectable sinks + logger reset hooks in tests.** Remove `process.chdir()` and singleton dependency.
- **MEDIUM: `db.write` call-site checklist.** Exhaustive table of expected emission sites so manual instrumentation doesn't miss handlers.
- **MEDIUM: Replace `vi.mock()` in beforeEach with `vi.doMock()` + dynamic imports.**

### Divergent Views
- Gemini: LOW risk, GO. Codex: HIGH risk, STOP. Resolution: follow Codex — the design flaws it identifies are concrete and cascade through the phase.
- Gemini: suggests `fs.appendFileSync` as optional enhancement. Codex: treats sync write as required for crash safety. Resolution: adopt sync write design.

## Required Action

Re-run `/gsd:plan-phase 58 --reviews` so planner absorbs REVIEWS.md and produces revised plans addressing every HIGH and MEDIUM item above. Do not proceed to execute until revised plans pass `plan-checker` again.
