# Task 201: Z.AI fetch settlement diagnostics

## Contract and boundaries

The existing private Z.AI thinking-disabled fetch wrapper emits one additive
`ai.zai_fetch.settlement` event whenever its wrapped fetch invocation settles.
The event distinguishes `response`, `aborted`, and `fetch_error`, includes a
bounded non-negative integer `elapsedMs`, and reuses only the existing safe
request metadata. A response also carries the existing safe status, content
type, and request-id metadata. It never reads or consumes the response body.
The existing `ai.zai_fetch.failure` event, error identity, returned Response,
request rewriting, provider/model behavior, deadlines, retries, persistence,
mechanics, UI, and player-facing behavior remain unchanged. Frozen r148 is
immutable.

## Entry and impact

Entry is `feat/revamp` at
`bbbf1e31dbca7ae86ad9e0d979f276be9969c862`, equal to
`origin/feat/revamp`. Pre-existing `AGENTS.md` and `CLAUDE.md` are dirty,
unstaged, and byte-preserved. An exact-entry GitNexus shadow was created for
the entry source. `createZaiThinkingDisabledFetch` has the authorized
CRITICAL transitive impact: 140 impacted symbols, one direct caller, 28
processes, and nine modules. The nested `observeFetch` helper is not indexed,
so the source-qualified wrapper owner is authoritative. This is the disclosed
diagnostics-only exception; `buildZaiFetchDiagnostic`, exported interfaces,
and all behavior-producing consumers remain unedited.

## Implementation and review

`provider-registry.ts` now captures a local start timestamp immediately before
each wrapped fetch, emits exactly one settlement event for response, aborted,
or other fetch rejection, and caps elapsed time at 10,000,000 ms. Response
settlement uses only status, sanitized content type, and sanitized request-id
fields from the existing diagnostic builder. Existing non-success body parsing
and `ai.zai_fetch.failure` emission remain in their original path. No prompt,
visible copy, or substantial product prose changed; humanizer/deslop review is
not applicable.

## Static validation

Focused provider coverage passed with
`src/ai/__tests__/provider-registry.test.ts` at 28/28 and
`src/ai/__tests__/zai-fetch-diagnostic.test.ts` at 4/4. The focused
Campaign Play/AI regression run passed seven files and 296/296 tests:
`generate-object-safe`, Judge, Game Master, Narrator, Actor Replanner,
turn-runtime, and Campaign Play application. `npm run typecheck` and
`npm run build` both passed. `git diff --check` passed (only the expected
CRLF normalization warnings for touched/protected working-tree files were
reported). No Vitest worker-shutdown defect occurred. Staged GitNexus
`detect_changes` on the exact-entry shadow reported 3 files, 4 symbols, 12
affected processes, and high risk. Its file-level mapping also named
`parseJsonBody` and `resolveProviderProtocol`; the source-qualified diff is
limited to the private settlement helper/wrapper path, tests, and this note,
with no edit to those functions or to any exported interface. This is the
authorized wrapper fan-out described above. Implementation commit
`a8754947d6e530070b8e10af1392ff557fd6af4d` was pushed to
`origin/feat/revamp`.

## r149 live evidence

The single fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r149` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` on owned ports 4350/4351/4352. Canonical
materialization matched state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and Brina card SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The pushed implementation commit was `a8754947d6e530070b8e10af1392ff557fd6af4d`.
The lane performed one canonical card import/file assignment, one Save/Continue,
the exact lower-wards / Local / Already here / Looking for work selections, and
one Begin. Opening rendered ready with a proper scene and enabled choices. Actions
1--9 each settled one new durable proper-scene binding. Action 10 selected the
rendered `Talk to Vedris Kast: ask who gets Pira's reassignment` choice once; its
Actor Replanner was the first genuine defect, so no action 11 was submitted.

The frozen action-10 boundary is turn
`turn-player-action:d4bfc7c293c56e432fae6fd790b47115fdd9c1c5`, with Actor Replanner
stage `actor-replan-stage:b08e9c0d534dc2a6d064226af9bd8f69`, job
`actor-job:0000:860dd712b9e560cf7b7870ba`, and attempts
`actor-replan-attempt:4fc04650b5a78e13ab63f08d5f1be78f` and
`actor-replan-attempt:ef12fbcaa482ce2723627925d4583553`. Attempt 1 and attempt 2
both ended `model_contract_invalid` with schema-invalid results; the second retained
tool-calls finish metadata. The player turn, mechanics, and Narrator each settled
once, but the actor job ended `replan_invalid`, so the lane froze at completed=10,
bound=9. There was no attempt 3, later player click, or mechanics replay.

Backend diagnostics retained ordinary successful `ai.zai_fetch.settlement` response
events, including status 200, sanitized `text/event-stream;charset=UTF-8`, and
bounded elapsedMs, with no `ai.zai_fetch.failure` event observed. The new aborted or
fetch_error outcome was not naturally observed. The Task 199 invalid structured-tool
event remained bounded (including valueState/valueType/literal fields) and exposed
no raw argument. No settlement event was used to infer an upstream cause.

Read-only final SQLite counts included 11 turns, 10 narration operations, 11
narration attempts, 10 proper scenes, 37 commands, 37 receipts, 22 model stages,
and 9 actor-replan attempts; `PRAGMA integrity_check` returned `ok` and
`foreign_key_check` returned `[]`. The terminal evidence recorded world/runtime
versions 20->21 and no late or duplicate writes. The r149 terminal, action-10
evidence, browser-actions log, setup summary, backend log, and database hashes were
respectively:
`2578F3FDCC1EBC81B03C17768F345AD443489CE4ABDA8BFB966157061E94494A`,
`168E320D05E6171BA79FDFCEA9D9F766F243D3A9D5FC08BC1395B245446DB2DC`,
`99FEB1E6E389F394C83216B1B7187262660290289EE3A36285D9AAE6D47D2BC0`,
`93A4A398DED67EC0DD48D4ECED3EC9A1F4C8852C5F0F5D6E74B634CBA4635932`,
`AB72ACFD4D75694B5710072CCF9370CD0A82D091CDF2973A0A0AFB847B482EFB`, and
`535F8B7E3C2A3B44FD95ACFDDFE2B5011975B3FC15E5ACF9C485ED8A3C65A8EC`.

Cleanup stopped only the recorded task-owned backend/frontend/Chrome process tree,
verified no listeners on 4350/4351/4352, verified the CDP endpoint/page absent,
removed the task-owned browser profile and helper scripts, removed the exact-entry
GitNexus shadow, and independently verified all recorded PIDs and owned paths were
absent. Generated r149 session/run evidence remains uncommitted.

## Acceptance handoff

Static acceptance proved response, non-ok response, aborted rejection, and
non-abort rejection settlement behavior, exact response/error identity, untouched
readable bodies, bounded private payloads, and unchanged request
rewriting/failure semantics. The built r149 journey proved canonical setup,
Opening readiness, and nine unique bindings before the first genuine Actor
Replanner defect at action 10; therefore the 60-action and same-page reload
criteria are unavailable and are not claimed. Natural `response` settlement
coverage is live. Natural `aborted` and `fetch_error` settlement coverage, and a
natural non-ok response, are unavailable in this lane; static tests cover them.

Unknown upstream fetch status/body/request-id/response metadata and raw
provider/candidate bytes from frozen r148 remain unavailable by contract. The
r149 Actor Replanner provider candidate and exact cause of its schema-invalid
result are also unavailable; no causal inference is made from the settlement
events.
