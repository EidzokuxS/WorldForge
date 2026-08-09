# Task 187: structured-tool invalid diagnostics

## Contract

When `safeGenerateObject` tool mode receives no valid `structured_output` call and at least one matching call has `invalid=true`, the existing rejection remains unchanged and one private diagnostic event records only bounded structural metadata. The event is `llm.structured_output_invalid_tool_call` and contains the fixed tool name, result/step origin, source indexes, selected argument carrier/type, and direct/step/matching counts. It never includes argument values, object keys, raw/provider text, ids, schema values, reasoning, or player prose.

Valid matching calls continue to win over invalid matching calls. Missing and valid results emit no new event. `SafeGenerateTrace`, error codes/messages/classification, schema parsing, coercion, repair, fallback, retry, provider requests, persistence, mechanics, UI, and player-visible behavior are unchanged.

## Entry and impact review

Entry was `237059d05b1a02b374f5e209fea2496289d0cfba` on `feat/revamp`, equal to origin. The only pre-existing changes were `AGENTS.md` and `CLAUDE.md`; both were preserved byte-for-byte and unstaged. Frozen r134 and earlier lanes remain immutable.

A task-owned shadow clone at the exact entry was created outside the repository and indexed separately. Current-source upstream impact in that shadow reported:

- `safeGenerateObject`: CRITICAL, 149 impacted symbols, 72 direct callers, 30 processes, 10 modules.
- `attemptToolModeGenerate`: CRITICAL, 74 impacted symbols, 1 direct caller, 23 processes, 7 modules.
- `extractStructuredOutputToolInput`: CRITICAL, 3 impacted symbols, 1 direct caller, 8 processes, 2 modules.
- `collectStructuredOutputToolCalls`: HIGH, 3 impacted symbols, 1 direct caller, 4 processes, 1 module.
- `SafeGenerateTrace`: CRITICAL, 207 impacted symbols, 50 direct callers, 27 processes, 10 modules; this exported interface was explicitly excluded from the edit.

The broad shared-helper fan-out is the packet-authorized diagnostic-only exception. The edit stays inside the private extraction/invalid branch and does not alter an exported interface, request, acceptance path, or error contract. The shadow registry/index is task-owned and will be removed during cleanup.

## Implementation and validation before r135

`generate-object-safe.ts` now retains private source/index metadata while collecting direct and step tool calls, chooses a valid matching call before considering invalid calls, and constructs the approved allowlisted diagnostic only for the first invalid matching call when no valid call exists. The existing invalid error is thrown unchanged after the one log event.

Focused `generate-object-safe.test.ts` coverage proves direct invalid and step invalid origins, argument carrier/type and count metadata, valid-over-invalid preference, missing-call silence, unchanged `invalid_structured_tool_call` classification, and absence of sentinel argument/provider text from the diagnostic. `npm run typecheck` and the focused Vitest file passed at the pre-journey boundary. Full directly affected suites, build, staged `detect_changes`, commit/push, and r135 evidence remain to be recorded below.

## r135 journey

Pending. The fresh lane is `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r135` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using ports 4210/4211/4212 and the canonical pristine/config/card hashes from the task contract. The lane must hard-stop at its first genuine defect or reach 60 completed unique bindings followed by one same-page reload. Live coverage of the new event is unavailable unless the exact invalid structured-output call occurs naturally.

## Acceptance handoff

The static contract is bounded to private diagnostics and preserves all generation and product semantics. Remaining acceptance evidence must map the built r135 setup, rendered journey, authoritative SQLite/log state, any natural diagnostic event, cleanup, and the exact first-defect or 60/reload boundary. Unknown provider or raw tool-call details must remain unknown when not retained.

