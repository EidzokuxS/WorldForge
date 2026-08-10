# Task 199: structured-tool schema value classification

## Contract and boundaries

Extend only the private `llm.structured_output_invalid_tool_call` diagnostic. For
each existing bounded `schemaIssues` entry, classify the raw issue-path value
without logging it: `valueState` (`present|missing|unavailable`), the existing
bounded `valueType` (or null), a bounded scalar-literal count and truncation bit,
and `schemaLiteralMatch` (`exact|normalized_string|none|unavailable`). Resolve
only provider-facing schema literals through bounded, cycle-safe traversal of
properties, combinators, const/enum, local refs/`$defs`/definitions, and array
items/prefixItems. Dynamic path segments remain `[dynamic]`; named schema-map
keys are not output paths. Candidate values, schema literal values, messages,
keys, prose, provider data, identifiers, and secrets remain private.

Extraction, valid-call preference, missing-call silence, schema parsing,
coercion, errors/codes/messages, retries, fallback, provider/model/mode,
deadlines, traces, persistence, mechanics, and player behavior are unchanged.
No exported interface or additional production owner is changed.

## Entry and frozen evidence

Entry is `feat/revamp` at `c0f86aadade6855e6389fa3a8cc69531b6f30a90`, equal to
`origin/feat/revamp`. Pre-existing `AGENTS.md` and `CLAUDE.md` remain dirty,
unstaged, and byte-preserved (SHA-256:
`0D75EDC72CC195E385ED5B9C98C616E82FDB3C13E210D0FEB94333E19A76D541`,
`C6874175503F6890AF8CA2DB34EFF5630B8A513EDE95CEA3F76C43435925FCA6`). Frozen
r146 is immutable. Its action-4 Judge attempt 1 timed out and attempt 2 failed
structured-output validation at `disposition`; raw argument/value bytes are
unknown and were not reconstructed.

## Impact review

The exact-entry GitNexus index was refreshed once before edits. Source-qualified
impact for the private diagnostic seam reported:

- `collectStructuredOutputSchemaPropertyNames`: HIGH, one direct caller, four
  processes, one module (`runStructuredOutputConformance`, `executeOracleCall`,
  `generateCharacterFromArchetype`, `generateCharacter`).
- `buildStructuredOutputSchemaDiagnostics`: CRITICAL, one direct caller, eight
  processes, two modules.
- `extractStructuredOutputToolInput`: CRITICAL, one direct caller, eight
  processes, two modules.
- `attemptToolModeGenerate`: CRITICAL, 74 impacted symbols, 23 processes, seven
  modules.

Main authorized this disclosed shared AI diagnostic-only fan-out for the private
types/helpers and invalid-tool diagnostic branch only. No exported trace/error
interface, acceptance path, or additional production owner was edited.

## Implementation

`backend/src/ai/generate-object-safe.ts` carries the selected invalid argument
only in the local invalid result, resolves the issue-path value, traverses the
provider JSON Schema with depth/node/literal bounds and local `$ref` support,
and emits the five bounded classification fields. Existing fields and event
name are retained exactly; valid/missing paths emit no event and a valid matching
call still wins over an invalid call.

`backend/src/ai/__tests__/generate-object-safe.test.ts` covers missing
discriminated-union values, normalized and unrelated strings, an exact literal,
refs/named definitions and array paths, dynamic-key masking, scalar/null
carriers, existing invalid-event privacy, and unchanged errors/preferences.

No prompt or visible copy was changed; humanizer/deslop review is not
applicable.

## Static validation

- Focused `generate-object-safe.test.ts`: 48/48 passed, exit 0.
- Focused Judge, Game Master, Narrator, Actor Replanner, turn-runtime, and
  Campaign Play application suites: 6 files, 248/248 passed, exit 0.
- Backend typecheck (`tsc --noEmit`): passed.
- Backend build (`tsc -p tsconfig.json`): passed.
- `git diff --cached --check`: passed (only expected LF/CRLF warnings).
- GitNexus staged `detect_changes --repo WorldForge`: 3 files, 8 changed
  symbols, 3 affected execution flows, risk medium. The reported flows were
  RunStructuredOutputConformance and ExecuteOracleCall through the existing
  structured-generation helpers; no unrelated product owner or acceptance
  flow appeared. This is within the disclosed private diagnostic-only shared
  AI fan-out.

## r147 live evidence

Pending. The one fresh run is
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r147` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, using ports 4330/4331/4332 and the
canonical state/config/card hashes from the contract. Record setup, opening,
action checkpoints, any natural diagnostic event, terminal boundary, SQLite
integrity/FK, reload (only after 60/60), and cleanup here without inferring
unretained provider data.

## Acceptance handoff

- Diagnostic fields/privacy: focused safe-generation assertions above.
- Unchanged extraction/error/retry behavior: focused safe-generation and
  Campaign Play suites above.
- Scope/impact: GitNexus impact and staged detect review above.
- Built product: r147 evidence is pending and must distinguish rendered,
  authoritative SQLite, and private diagnostic observations.
- 60/60 and reload: unavailable until r147 completes; do not claim either early.

## Unknowns

Provider response bodies, raw candidate arguments, and any r147 diagnostic event
are unknown unless naturally retained by the bounded event. The effect of the
classification on no acceptance or retry decision is source/test-proven, not a
provider-causality claim.
