# Task 197 - Structured-tool schema issue diagnostics

## Contract and frozen boundary

The frozen `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r144` lane is immutable. At action 8, Game Master attempt 1 ended at the existing 45-second local stage boundary; automatic attempt 2 returned an invalid `structured_output` tool call in tool mode. The retained Task 187 diagnostic recorded only bounded call-origin metadata and no schema coordinate. Source review confirms that the selected invalid argument remains in memory during extraction and was previously discarded before the diagnostic event.

Task 197 is diagnostics-only. For each invalid matching `structured_output` call, the existing `llm.structured_output_invalid_tool_call` event keeps every prior field and adds only `schemaParseOutcome`, `schemaIssueCount`, `schemaIssuesTruncated`, and at most eight `{ issueIndex, code, path }` entries. The argument is used only in the local invalid branch. The original schema is evaluated with `safeParse` without coercion; a schema-valid argument marked invalid reports `valid` with zero issues, and an evaluation failure reports `unavailable` with no issues. Invalid Zod issues are flattened in stable order, union branches included, with a pre-cap count.

Paths retain non-negative numeric indexes and only schema-owned property names collected from bounded provider JSON Schema traversal. Every other string, symbol, or dynamic segment is `[dynamic]`; paths are capped at 12 segments and entries at 8. No argument values, object keys, raw messages, expected/received values, provider data, proposal text, player prose, or schema object are logged, persisted, returned in `SafeGenerateTrace`, or attached to `SafeGenerateError`. Extraction acceptance, valid-call preference, missing-call silence, error code/message, retries, fallback, provider/model/mode/deadline, and player behavior remain unchanged.

## Impact and authorization

Entry was `feat/revamp` at local/origin `e544426c2c9ec476afa7f3deba12be5506f38935`; only pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes were present. The registered GitNexus index was stale. A task-owned exact-entry shadow at `e544426c2c9ec476afa7f3deba12be5506f38935` was analyzed before editing. Exact private-source impact was:

- `extractStructuredOutputToolInput`: CRITICAL, 3 impacted symbols, 1 direct caller, 8 processes, 2 modules.
- `attemptToolModeGenerate`: CRITICAL, 74 impacted symbols, 1 direct caller, 23 processes, 7 modules.
- `structuredOutputToolArgument`: HIGH, 4 impacted symbols, 2 direct callers, 4 processes, 1 module.
- `collectStructuredOutputToolCalls`: HIGH, 3 impacted symbols, 1 direct caller, 4 processes, 1 module.

The nested `StructuredOutputToolInputResult` type is source-qualified and absent from the graph. Main explicitly authorizes this disclosed shared `generate-object-safe` transitive risk only for the private diagnostic seam named in the Task 197 packet. No exported `SafeGenerateTrace`, error interface, signature, consumer, acceptance path, or second production owner is changed.

## Implementation

`generate-object-safe.ts` carries the selected invalid argument only on the local invalid extraction result. Private helpers perform direct Zod parsing, bounded JSON Schema property-name collection, recursive union-issue flattening, path masking, and bounded payload construction. The invalid tool-mode branch spreads this payload into the existing event and then throws the unchanged `invalid_structured_tool_call` error. No argument or schema survives payload construction.

Focused tests cover invalid object privacy, SDK-invalid/schema-valid input, dynamic record-key masking, stable union flattening and eight-entry truncation, scalar/missing carriers, valid-over-invalid preference, missing-call silence, and unchanged error behavior.

No prompt or player-visible copy changed; humanizer/deslop review is not applicable.

## Static validation before r145

- Focused `generate-object-safe.test.ts`: 43/43 passed.
- Combined focused AI/Campaign Play suites (Judge, Game Master, Narrator, Actor Replanner, turn runtime, application): 7 files, 289/289 passed.
- Backend typecheck (`npm run typecheck`) passed.
- Backend build (`npm run build`) passed.
- `git diff --check` passed.
- On the task-owned exact-entry shadow with the staged patch, GitNexus `detect_changes --scope staged` reported 3 files, 6 mapped shared-AI symbols, 36 affected execution flows, and critical risk. The mapped shared symbols include the existing `safeGenerateObject`/native-generation callers because the private helper lives in the shared file; no additional production file, exported interface, consumer, or acceptance path was edited. This is within Main's explicit authorization for the disclosed private diagnostic seam.
- The staged implementation commit is pending before the live lane.

Canonical r145 template state, config, and Brina card hashes are respectively `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## r145 journey

Pending. The fresh lane is `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r145` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using task-owned ports 4310/4311/4312. Generated session and world-run evidence will remain uncommitted. The lane will stop at its first genuine defect, or continue to 60 unique bindings plus one same-page reload with read-only SQLite integrity/FK checks.

## Acceptance handoff

Static acceptance is the focused safe-generation/privacy suite, directly affected Campaign Play suites, typecheck/build, diff check, and staged graph review above. Built acceptance remains unavailable until r145 completes. Natural invalid structured-tool diagnostic coverage, 60 bindings, reload, terminal SQLite counts, and cleanup are pending; no live claim is made before the lane.
