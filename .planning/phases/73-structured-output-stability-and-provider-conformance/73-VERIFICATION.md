---
phase: "73-structured-output-stability-and-provider-conformance"
verified: "2026-04-28T00:24:15Z"
status: passed
score: "7/7 must-haves verified"
overrides_applied: 0
current_head: "e4f2a34"
re_verification:
  previous_verification_outcome: "human_needed"
  previous_score: "7/7 must-haves verified"
  gaps_closed:
    - "Live provider conformance gate closed: env-gated run passed with providers=1, cases=5, total=5, passed=5, failed=0, semanticFailed=0."
    - "WR-01 and WR-02 closure confirmed: CLI uses active structured role models, and repair calls forward opts.timeout."
  gaps_remaining: []
  regressions: []
must_haves:
  truths:
    - "P73-R1: All shared object-generation boundaries are audited and classified as native structured output, tool call, text fallback, or intentionally unstructured prose."
    - "P73-R2: safeGenerateObject is native-first for schema-capable providers via AI SDK structured output, while preserving an explicit text fallback for gateways/models that reject schema output."
    - "P73-R3: Provider/model structured-output capability is observable and testable; traces distinguish native schema, native JSON, tool mode, text fallback, repair, and full retry."
    - "P73-R4: ScenePlan no longer requires the model to invent or preserve backend-owned IDs where backend code can derive them deterministically."
    - "P73-R5: A local benchmark/conformance harness covers configured providers/models and representative WorldForge schemas before long-running flows trust them."
    - "P73-R6: Deterministic Zod/sanitization boundaries remain final authority for caps, authority propagation, no-invented-mechanics rules, and executable tool validation."
    - "P73-R7: Regression coverage includes the observed Kimi/Mimo citations/canonicalNames failure, ScenePlan payload/missing-tool failure, overlong external metadata, and artifact-backed Gojo known-IP power dispatch."
---

# Phase 73: Structured Output Stability and Provider Conformance Verification Report

**Phase Goal:** Make WorldForge structured-output calls stable by moving shared object generation to provider-native schema/tool mechanisms where available, keeping deterministic backend validation as final authority, and adding provider conformance gates so long-running worldgen/action flows do not discover model/schema incompatibility after user-visible minutes.
**Verified:** 2026-04-28T00:24:15Z
**Status:** passed
**Re-verification:** Yes - after closure commits `cd0c688`, `e33d362`, and `e4f2a34`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | P73-R1 boundaries inventoried/classified | VERIFIED | `73-STRUCTURED-OUTPUT-INVENTORY.md` classifies production object/prose seams; `structured-output-boundary.test.ts` guards inventory drift and direct production `generateObject` imports; direct source scan found no production `generateObject` import from `ai`. |
| 2 | P73-R2 native-first `safeGenerateObject` with fallback | VERIFIED | `generate-object-safe.ts` imports `Output`, builds native `Output.object({ schema })`, validates native output through Zod, falls back to text JSON, repairs schema-invalid output, and labels full retry exhaustion. Focused AI test passed 28/28. |
| 3 | P73-R3 provider/model capability observable | VERIFIED | `structured-output-capabilities.ts` defines `native_schema`, `native_json`, `tool_mode`, `text_fallback`, `repair`, and `full_retry`; metadata is WeakMap-backed and keyed by provider/model/protocol/base URL family/transport. Trace fields carry strategy and capability diagnostics without secrets. |
| 4 | P73-R4 ScenePlan backend-owned IDs | VERIFIED | `scene-planner.ts` requests `semanticScenePlanSchema`; `semantic-scene-plan-schema.ts` resolves actor refs, maps `payload` to `input`, generates backend IDs with `crypto.randomUUID`, parses via strict `scenePlanSchema`, and calls `validateScenePlan`. |
| 5 | P73-R5 conformance harness covers configured providers/models | VERIFIED | `structured-output-conformance.ts` defines five representative cases; CLI script is env-gated and read-only. Current live orchestrator run passed with one configured provider, five cases, zero failures, and active model `OpenCode/deepseek-v4-flash`. |
| 6 | P73-R6 deterministic validation remains final authority | VERIFIED | Native/model outputs still pass Zod parsing; ScenePlan strict schema and validator remain final; worldgen metadata caps, generated-context shape repair, and known-IP dispatch are enforced by deterministic tests. No backend semantic canon decision was added. |
| 7 | P73-R7 observed regressions covered | VERIFIED | Tests cover Kimi/Mimo `citations`/`canonicalNames` shape, ScenePlan `payload`/missing `toolName`, overlong external metadata, and artifact-backed Satoru Gojo known-IP power dispatch. Focused ScenePlan/worldgen bundle passed 83/83. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/ai/structured-output-capabilities.ts` | Provider/model/transport capability keying | VERIFIED | gsd artifact check passed; source shows typed strategies, WeakMap metadata, capability key construction, and explicit fallback strategy. |
| `backend/src/ai/__tests__/structured-output-capabilities.test.ts` | Capability keying and strategy coverage | VERIFIED | gsd artifact check passed; covered by full backend evidence. |
| `73-STRUCTURED-OUTPUT-INVENTORY.md` | Classified production generation inventory | VERIFIED | gsd artifact check passed; includes conformance harness row and object/prose classification vocabulary. |
| `backend/src/ai/generate-object-safe.ts` | Native-first safe object generation | VERIFIED | gsd artifact check passed; source confirms native schema, tool mode, text fallback, repair timeout forwarding, and full-retry traces. |
| `backend/src/ai/__tests__/generate-object-safe.test.ts` | Native/fallback/repair regression coverage | VERIFIED | Current run passed 14/14 in the AI focused bundle. |
| `backend/src/engine/semantic-scene-plan-schema.ts` | Semantic ScenePlan mapper | VERIFIED | gsd artifact check passed; backend generates IDs and validates through strict schema/validator. |
| `backend/src/engine/scene-planner.ts` | Semantic first-pass ScenePlan wiring | VERIFIED | gsd artifact check passed; normal first pass uses `semanticScenePlanSchema`, not the loose schema. |
| `backend/src/engine/__tests__/scene-planner.test.ts` | ScenePlan semantic regression coverage | VERIFIED | Current run passed 26/26 in the ScenePlan/worldgen bundle. |
| `backend/src/ai/structured-output-conformance.ts` | Non-mutating conformance runner | VERIFIED | gsd artifact check passed; report fields, five schema cases, semantic checks, and compact errors verified. |
| `backend/src/ai/__tests__/structured-output-conformance.test.ts` | Mocked conformance/no-secret/no-mutation coverage | VERIFIED | Current run passed 14/14 in the AI focused bundle. |
| `backend/src/scripts/structured-output-conformance.ts` | Env-gated live/local CLI | VERIFIED | gsd artifact check passed; source reads `settings.json` only in live mode and derives providers from `judge`/`generator` role models. |
| `backend/src/worldgen/__tests__/research-artifact.test.ts` | Metadata cap regression | VERIFIED | Current ScenePlan/worldgen bundle passed. |
| `backend/src/worldgen/__tests__/ip-researcher.test.ts` | Generated-context shape and provider metadata regressions | VERIFIED | Current ScenePlan/worldgen bundle passed. |
| `backend/src/worldgen/__tests__/npcs-step.test.ts` | Artifact-backed known-IP dispatch regression | VERIFIED | Current ScenePlan/worldgen bundle passed. |
| `73-VERIFICATION-MATRIX.md` | Requirement-to-proof matrix | VERIFIED | gsd artifact check passed; matrix maps P73-R1 through P73-R7 plus full backend/type/GitNexus evidence. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `provider-registry.ts` | `structured-output-capabilities.ts` | `rememberStructuredOutputModelMetadata` | WIRED | gsd key-link passed; provider metadata registration includes provider id/name, model, protocol, base URL family, and transport. |
| `structured-output-boundary.test.ts` | `73-STRUCTURED-OUTPUT-INVENTORY.md` | static inventory assertion | WIRED | gsd key-link passed; source test scans production LLM seams and inventory rows. |
| `safeGenerateObject` | AI SDK structured output | `generateText` with `Output.object({ schema })` | WIRED | gsd false negative because plan used a bare symbol as `from`; manual source check verifies `callOpts.output = Output.object({ schema })` before native `generateText`. |
| `safeGenerateObject` | text fallback and repair | fallback/repair branches | WIRED | Source forwards `opts.timeout` into repair calls and tests assert repair timeout propagation. |
| `scene-planner.ts` | `semantic-scene-plan-schema.ts` | `semanticScenePlanToStrictPlan` | WIRED | gsd key-link passed; normal and repair paths use semantic schema and mapper. |
| `semantic-scene-plan-schema.ts` | `scene-plan-schema.ts` / validator | strict parse + `validateScenePlan` | WIRED | gsd key-link passed; strict backend authority remains final. |
| `structured-output-conformance.ts` | `generate-object-safe.ts` | `safeGenerateObject` | WIRED | gsd key-link passed; every conformance case calls the shared boundary. |
| `structured-output-conformance.ts` | no DB/routes/tool executor mutation | import boundary | WIRED | Test scans reject `getDb`, `executeToolCall`, campaign managers, and route imports. |
| `structured-output-conformance.ts` | conformance report | provider/model/schema/mode/strategy fields | WIRED | Report result rows include provider, model, schema, requested mode, strategy, latency, usage, error, repair, semantic pass, and success. |
| `structured-output-conformance.ts` | explicit mode conformance | exercised strategy comparison | WIRED | Tests fail explicit mode when requested `tool` is only exercised through fallback or repair masking. |
| `structured-output-conformance.ts` | active role model selection | `judge`/`generator` role models | WIRED | WR-01 fixed: script uses only active structured roles and dedupes their role models instead of stale provider defaults or prose/embedder roles. |
| CLI script | `backend/package.json` | npm script | WIRED | gsd key-link passed; `structured-output:conformance` runs `tsx src/scripts/structured-output-conformance.ts`. |
| `npcs-step.test.ts` | `npcs-step.ts` | artifact canonical NPC dispatch | WIRED | gsd key-link passed; regression keeps Satoru Gojo on known-IP power dispatch. |
| `73-VERIFICATION-MATRIX.md` | P73-R1..P73-R7 | requirement evidence rows | WIRED | gsd false negative because plan used a bare filename; manual matrix/source checks verify all seven rows. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `provider-registry.ts` / `structured-output-capabilities.ts` | model metadata | `createModel(...)` registers metadata in WeakMap | Yes | FLOWING |
| `safeGenerateObject` | strategy/capability trace | `getStructuredOutputModelMetadata(opts.model)` -> `resolveStructuredOutputCapability` -> trace/log payload | Yes | FLOWING |
| `safeGenerateObject` | returned object | native schema/tool/text fallback -> Zod parse -> optional repair -> final object | Yes | FLOWING |
| `runScenePlanner` | strict `ScenePlan` | semantic model output -> backend mapper -> strict parse -> `validateScenePlan` | Yes | FLOWING |
| `runStructuredOutputConformance` | report rows | provider entries + representative cases -> `safeGenerateObject` -> semantic checks -> summary | Yes | FLOWING |
| CLI live provider list | providers/models under test | read-only `settings.json` -> active `judge`/`generator` roles -> distinct role models -> `createModel` | Yes | FLOWING |
| Worldgen metadata caps | capped provider fields | provider search results -> cap helpers before prompt/artifact parsing | Yes | FLOWING |
| Artifact-backed Gojo dispatch | known-IP power path | research artifact canonical names -> NPC draft identity -> known-IP enrichment dispatcher | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AI focused regressions | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-conformance.test.ts` | 2 files passed, 28 tests passed | PASS |
| ScenePlan/worldgen regressions | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/npcs-step.test.ts` | 4 files passed, 83 tests passed | PASS |
| TypeScript gate | `npm --prefix backend run typecheck` | `tsc --noEmit` exited 0 | PASS |
| Default conformance CLI safety | `npm --prefix backend run structured-output:conformance` | Exited 0 with `skipped: true`, providers 0, results empty | PASS |
| Live provider conformance | Orchestrator evidence: `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1 npm --prefix backend run structured-output:conformance` | Passed: providers 1, cases 5, total 5, passed 5, failed 0, semanticFailed 0; active model `OpenCode/deepseek-v4-flash` | PASS |
| Full backend suite | Orchestrator evidence: `npm --prefix backend test` | 137 files passed, 3 skipped, 1784 tests passed, 30 todo | PASS |
| Schema drift | `node %USERPROFILE%/.codex/get-shit-done/bin/gsd-tools.cjs verify schema-drift 73` | `drift_detected=false`, `blocking=false` | PASS |
| GitNexus freshness | `npx gitnexus status` | Indexed commit `e4f2a34`, current commit `e4f2a34`, status up-to-date | PASS |
| Code review | `73-REVIEW.md` plus source re-check | Status clean; 0 findings; WR-01/WR-02 resolved | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| P73-R1 | 73-01, 73-05 | Boundaries audited/classified | SATISFIED | Inventory row coverage, static boundary test, no direct production `generateObject` import from `ai`. |
| P73-R2 | 73-02 | Native-first `safeGenerateObject` with fallback | SATISFIED | Native schema branch, tool mode, text fallback, repair, timeout propagation, and full-retry tests. |
| P73-R3 | 73-01, 73-02, 73-04 | Observable provider/model capability and strategy traces | SATISFIED | Strategy unions, metadata capability keys, trace fields, conformance report fields. |
| P73-R4 | 73-03 | Semantic ScenePlan avoids model-owned backend IDs | SATISFIED | Semantic schema, backend-generated IDs, `payload` alias mapping, missing `toolName` mapping error, strict validation. |
| P73-R5 | 73-04 | Local/live provider-model conformance harness | SATISFIED | Mocked no-mutation harness, env-gated CLI, active role model selection, and live pass with configured provider. |
| P73-R6 | 73-02, 73-03, 73-05 | Deterministic validation remains final authority | SATISFIED | Zod parses native/text/repair outputs; strict ScenePlan validator remains final; metadata caps and known-IP dispatch stay deterministic. |
| P73-R7 | 73-02, 73-03, 73-04, 73-05 | Observed regression coverage | SATISFIED | Focused AI and ScenePlan/worldgen test bundles passed; named regressions present for every observed failure class. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/ai/generate-object-safe.ts` | 131, 166, 175, 698, 705, 800, 1015 | `return null` | Info | Parse/repair/model-metadata helper misses; callers branch to fallback, repair, or typed errors. Not a stub. |
| `backend/src/ai/generate-object-safe.ts` | 403 | `placeholder values` | Info | Comment describes schema example generation for fallback prompt hints. Not runtime placeholder output. |
| `backend/src/worldgen/scaffold-steps/validation.ts` | 47, 55 | `return null` | Info | Mechanical reference-normalization miss signal. Not user-visible stub data. |
| `backend/src/worldgen/__tests__/npcs-step.test.ts` | 1348 | `generic placeholders` | Info | Test name for placeholder rejection behavior. Not production placeholder. |

### Human Verification Required

None. Previous `human_needed` item is closed by the successful live provider conformance run in this session. External provider behavior was not inferred from the skipped default CLI path; it is covered by the orchestrator-provided live run evidence and source verification that the live CLI now uses active structured role models.

### Gaps Summary

No gaps remain. P73-R1 through P73-R7 are verified against current source, wiring, tests, schema drift, code review, GitNexus freshness, and live provider conformance evidence. Deterministic validation remains the final authority, and backend code does not make new semantic canon decisions.

---

_Verified: 2026-04-28T00:24:15Z_
_Verifier: Claude (gsd-verifier)_
