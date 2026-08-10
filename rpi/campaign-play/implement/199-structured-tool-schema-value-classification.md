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

The one fresh run was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r147` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, on task-owned ports 4330/4331/4332
from implementation commit `bbf1c4f7259502086a89e450df0a8dce181cce92`.
The materialized state, config, and canonical Brina card hashes were exactly
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

- Bootstrap started backend PID 68016, frontend PID 44528, browser PID
  87160, and the task-owned profile under the r147 session root. One card
  import and one Save/ingestion completed. The setup helper then exited with
  `player_save_network_invariant_0_0` while verifying the post-save network
  event; backend evidence shows ingestion completed and one character was
  durable. This was a harness verification boundary, not a product defect.
  A task-owned continuation probe later failed to write its own JSON with
  `ENOENT` after the product transition. It did not repeat import or Save; the
  one Begin transition was issued once and not repeated. The exact setup
  selections were attempted once, but their direct helper trace was not
  retained. Read-only reconciliation confirmed one Begin and a ready Opening
  state with a proper scene.
- Actions 1-3 each settled once with one unique proper-scene binding and
  enabled controls: `turn-player-action:755b64cf94914bf40acaffee0cac81bb45f1d068`
  (“Talk to Dren Vask: accept the courier work”),
  `turn-player-action:886b61158d3d02c6da53d2dfa608e1e898395243`
  (“Talk to Vedris Kast: ask about the first batch”), and
  `turn-player-action:df67d954a735a73944960bdd4a3898ec4b892e41`
  (“Talk to Vedris Kast: accept the first batch”). Their Judge attempt counts
  were 1, 2, and 2 respectively, with no failed downstream stage.
- Action 4 was the first genuine model defect. The rendered choice was
  “Talk to Vedris Kast: take the seizure notices”,
  `turn-player-action:3a7f52ffdb5fb7ff121fcc90f107eeb55f23469c`. Judge stage
  `f70bb1be0f7420c45b83f6ce1f21a545695492547fca252d988eb399cd4fe1f2` had
  attempt 1 stage id
  `404cbca763fb2db26c9b4503862aecef3421744bfce68a9f671cd52be9030cba`
  using the configured `zai-coding-plan` / `glm-5-turbo` / strict-object route;
  transport completed with native JSON, then existing final Judge validation
  rejected `possessionEffectAuthority.possessionHandle`. Attempt 2 stage id
  `8704d61336dac29af723a2dc8b26f0214a03de906888577abbb887f1c3522044`
  retained the same authority and route, used tool mode, and failed before a
  Judge artifact with invalid structured-output extraction. No raw candidate,
  argument, provider body, or causal provider detail was retained.
- The natural Task 199 event is at `backend.stdout.log` line 846,
  `llm.structured_output_invalid_tool_call`. Its bounded payload retained the
  existing structural fields plus `schemaParseOutcome=invalid`,
  `schemaIssueCount=1`, `schemaIssuesTruncated=false`, issue 0
  `code=invalid_union`, `path=["disposition"]`, `valueState=missing`,
  `valueType=null`, `schemaLiteralCount=4`,
  `schemaLiteralsTruncated=false`, and `schemaLiteralMatch=none` (anchors:
  lines 860-874). No candidate value or literal was logged.
- The lane hard-stopped at action 4 with `completed=4` and `bound=3`; no
  checkpoint at 10 and no reload were attempted. Final authoritative state
  was `worldVersion=16`, `runtimeRevision=73`, `phase=turn_active`, Brina Hael
  at `alderman-hallway`, with the action-4 turn interrupted,
  `error_code=model_contract_invalid`, `retry_eligible=1`, and no action-4
  packet, result, narration operation/attempt, scene, receipt, or actor job.
  SQLite counts were 1 character, 5 turns (Opening plus four actions), 20
  commands, 20 receipts, 10 model stages, 3 narration operations, 5
  narration attempts, 3 proper scenes, and 1 actor job. Read-only
  `integrity_check` returned `ok`; `foreign_key_check` was empty.
- Retained evidence hashes after capture were:
  `r147-terminal.json`=`8145123D94FFDC97C2E1A41492BAA170CF3E4AF37C2B382163285DAE1125142B`,
  `backend.stdout.log`=`CAA4DE82D13409558A74F51B86AAE09124F590EE39BF9256A8BE3FCF502C50E4`,
  `browser-actions.jsonl`=`F045FB1B36BB8A75BC7292716DB32D6DA857012A23F4CE7AF94DD750DA48E2EC`,
  `runtime.json`=`411CE001C50ADD83DB51D5C0FCF1D8F5BB52CFA06EC2A7C516E2702DD517AADC`,
  `probes/setup-continuation-summary.json`=`2EDC40E10DD4714DF148C31BC4039A6970E9EEF633BE468EDB86344E3FA3907E`,
  and `state.db`=`95799430183DDA3F521B33D4E09AE629E56DFB0669A54999FF2999C381114B71`.
- Cleanup closed the task-owned Play page, stopped the validated backend,
  frontend, browser, helper, and child processes, removed only the r147
  browser profile, and independently verified the recorded PIDs, ports,
  profile, and CDP endpoint were absent. The session/run evidence root was
  preserved.

## Acceptance handoff

- Diagnostic fields/privacy: focused safe-generation assertions above.
- Unchanged extraction/error/retry behavior: focused safe-generation and
  Campaign Play suites above.
- Scope/impact: GitNexus impact and staged detect review above.
- Built product setup and Opening: one import, one Save/ingestion, one Begin,
  ready Opening, and one proper scene were observed after read-only
  reconciliation; the setup helper's post-save listener assertion and the
  continuation probe's own file-write failure are recorded as verification
  faults, not repeated product actions.
- Built product actions 1-3: three unique proper-scene bindings and clean
  settlement are directly evidenced by the retained run, runtime state, and
  SQLite counts.
- Task 199 live diagnostic: the natural action-4 tool-mode failure emitted the
  exact bounded classification event at backend log lines 846 and 860-874;
  raw values remained unavailable and were not reconstructed.
- First-defect hard stop: action 4's two immutable Judge stages ended in
  `model_contract_invalid` before any new settlement. No later action was
  clicked, and no attempt 3 or late write exists.
- 60/60 checkpoints and same-page reload are unavailable because the first
  genuine defect occurred at action 4.

## Unknowns

Provider response bodies, raw candidate arguments, the actual invalid value, and
the upstream/provider cause are unknown. The exact setup selection trace is
also unavailable after the helper's post-save instrumentation failure, although
durable state proves the Opening transition. No 10/20/30/40/50/60 checkpoint or
reload exists because action 4 was the first genuine defect. The diagnostic
classification is source/test-proven and naturally observed; it did not affect
acceptance, retry eligibility, or other product decisions.
