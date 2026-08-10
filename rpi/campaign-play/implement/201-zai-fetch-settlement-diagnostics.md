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
authorized wrapper fan-out described above. The implementation commit and
push remain to be recorded.

## r149 live evidence

Pending. The single fresh lane is
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r149` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` on owned ports 4350/4351/4352. Canonical
materialization must match state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and Brina card SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## Acceptance handoff

Static acceptance must prove response, non-ok response, aborted rejection,
and non-abort rejection settlement behavior, exact response/error identity,
untouched readable bodies, bounded private payloads, and unchanged request
rewriting/failure semantics. Built acceptance requires one canonical setup and
the r149 read-before-click journey through 60 unique bindings plus same-page
reload, or a truthful freeze at the first genuine defect. Natural settlement
coverage and all unavailable criteria will be appended after the live lane;
synthetic tests do not substitute for that journey.

Unknown upstream fetch status/body/request-id/response metadata and raw
provider/candidate bytes from frozen r148 remain unavailable by contract.
