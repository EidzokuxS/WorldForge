# Task 3 evidence: builder, validator, and snapshot

## Staged builder

- The builder performs exactly three ordered calls: `world_frame`, `world_cast`, and `world_connections`.
- Every call uses `mode: "auto"`, `strictSchema: true`, `allowRepair: false`, `allowTextFallback: false`, and `retries: 1`.
- Provider metadata must resolve to `native_schema`, `native_json`, or `tool_mode` before the first call.
- Accepted packets receive code-owned persistent IDs after all model stages pass.
- The builder resolves local references, runs the independent whole-world validator, and calculates the canonical content hash.

## Model-contract evidence

- Evidence records stage, requested mode, primary and actual strategy, one total attempt, strategy flags, response model, finish reason, stable error code, and token counts.
- Evidence excludes prompt, model output, cleaned output, reasoning, response ID/timestamp, provider metadata, and repair payloads.
- A failed one-attempt call can arrive with the existing outer `full_retry` label. Campaign World records the underlying primary strategy, `totalAttempts: 1`, and `retryUsed: false`.
- Successful repair, text fallback, retry-wrapper, and mismatched-strategy traces fail closed.

## CRITICAL shared-boundary constraint

GitNexus reports `safeGenerateObject` as CRITICAL: 28 direct callers, 49 affected symbols, 13 execution flows, and 7 modules. Task 3 added only `getSafeGenerateObjectTrace(error)` beside the existing error-code accessor. Generation, retry, repair, and trace mutation behavior remain unchanged.

## Deterministic validation and hash

- The whole-world validator independently enforces counts, runtime enums, text limits, one starting macro location, directed reachability, role minimums, goals, placements, relations, pressure anchors, and persistent-reference integrity.
- Collective organizations pass through ordinary actor, goal, placement, relation, and pressure contracts.
- Canonical serialization sorts entity arrays by persistent ID plus tags, traits, and pressure anchors by lexical value. Stable object-key ordering precedes SHA-256 hashing.
- Hash input includes source digest, world summary, persistent IDs, and every canonical entity field. Runtime status, version, timestamps, build telemetry, and provider evidence stay outside the input.

## Verification

- Builder, validator, snapshot, and complete shared AI-boundary suite: 4 files, 70 tests passed.
- Backend typecheck: passed.
- `git diff --check`: passed.
- Campaign World Task 3 files import no old world generator module and contain no regex parser.
- No standalone smoke suite was added.
