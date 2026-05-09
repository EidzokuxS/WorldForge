---
phase: 72-worldgen-authority-propagation-regression-audit
plan: 02
subsystem: backend-worldgen
tags: [worldgen, research-artifact, zod, hono, vitest, gitnexus]

requires:
  - phase: 72-01
    provides: authority inventory, shared JJK/Naruto fixture helpers, and INV-72 aliases
provides:
  - Provider/search payload overflow regressions and ingress caps for artifact research
  - Nullable researchArtifact schema coverage
  - /generate stored artifact precedence over accidental null payloads
affects: [72-03, 72-04, 72-05, worldgen-research-authority]

tech-stack:
  added: []
  patterns:
    - Mechanical provider-ingress trim/slice before prompts and artifact parse
    - Null researchArtifact treated as omitted for stored artifact lookup, not as clear-artifact intent

key-files:
  created:
    - .planning/phases/72-worldgen-authority-propagation-regression-audit/72-02-SUMMARY.md
  modified:
    - backend/src/worldgen/__tests__/research-artifact.test.ts
    - backend/src/worldgen/__tests__/ip-researcher.test.ts
    - backend/src/routes/__tests__/schemas.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/worldgen/ip-researcher.ts
    - backend/src/routes/worldgen.ts

key-decisions:
  - "Provider search result jobId, title, description, and url are capped at provider ingress before they enter generated-context or sufficiency prompts."
  - "researchArtifact: null in /generate is omitted input, not clear-artifact behavior; stored campaign artifact remains authoritative when present."

patterns-established:
  - "Provider Boundary Sanitization: cap untrusted search provider strings before prompt use and strict artifact parsing."
  - "Artifact-First Route Lane: non-null body artifact wins; otherwise stored artifact wins; only no-artifact requests use legacy ipContext/premiseDivergence/researchFrame."

requirements-completed: [P72-R2, P72-R5]

duration: 7 min
completed: 2026-04-26
---

# Phase 72 Plan 02: Provider Payload And Nullable Artifact Semantics Summary

**Provider/search payload caps and /generate null handling now preserve artifact authority without widening artifact semantics.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-26T18:46:15Z
- **Completed:** 2026-04-26T18:52:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added RED regressions proving overlong provider title, description, and url were entering artifact prompts before caps.
- Added mechanical provider-ingress caps in `runArtifactSearchJobs` while leaving `WorldgenResearchArtifactV2` unchanged.
- Added schema coverage for `researchArtifact: null` on generate and suggest-seed request bodies.
- Added route regression proving `researchArtifact: null` cannot bypass a stored campaign artifact or forward stale legacy semantic fields.
- Fixed `/generate` so non-null body artifacts still win and are saved, while null/omitted artifacts fall through to stored artifact loading.

## Task Commits

1. **Task 1 RED:** `32f3be0` test(72-02): add provider payload hardening regressions
2. **Task 1 GREEN:** `32fee73` fix(72-02): cap provider search payloads at ingress
3. **Task 2 RED:** `6fda367` test(72-02): add nullable artifact route regression
4. **Task 2 GREEN:** `9e77dd8` fix(72-02): preserve stored artifact on null generate payload

## Files Created/Modified

- `backend/src/worldgen/__tests__/research-artifact.test.ts` - Uses the shared overlong-description fixture helper for parser cap coverage.
- `backend/src/worldgen/__tests__/ip-researcher.test.ts` - Covers provider ingress caps before generated-context prompts and sufficiency fact extraction prompts.
- `backend/src/routes/__tests__/schemas.test.ts` - Covers nullable `researchArtifact` schema payloads without assigning clear-artifact behavior.
- `backend/src/routes/__tests__/worldgen.test.ts` - Covers stored artifact precedence over accidental null plus stale legacy body fields.
- `backend/src/worldgen/ip-researcher.ts` - Caps provider search result `jobId`, `title`, `description`, and `url` before prompt use.
- `backend/src/routes/worldgen.ts` - Loads stored artifacts when body artifact is null or omitted.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/schemas.test.ts` failed as expected with 2 provider-ingress prompt cap failures.
- GREEN Task 1: same command passed, 240 tests.
- RED Task 2: `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` failed as expected because `loadWorldgenResearchArtifact` was not called for `researchArtifact: null`.
- GREEN Task 2: same command passed, 62 tests.
- Final focused bundle: `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/schemas.test.ts src/routes/__tests__/worldgen.test.ts` passed, 302 tests.

## GitNexus And Scope Evidence

- Orchestrator-provided binding prechecks were honored: `parseWorldgenResearchArtifact` CRITICAL impact was treated as parser-ingress-only; no production edit was made to `research-artifact.ts`.
- `gitnexus_impact(runArtifactSearchJobs, upstream)`: LOW, 5 impacted symbols, direct callers `researchWorldgenArtifact` and `evaluateResearchArtifactSufficiency`.
- `gitnexus_impact(researchWorldgenArtifact, upstream)`: LOW, 1 direct file-level caller.
- `gitnexus_impact(evaluateResearchArtifactSufficiency, upstream)`: LOW, 1 direct file-level caller.
- `gitnexus_impact(worldgen.ts, upstream)`: LOW, 0 upstream impacted symbols.
- `gitnexus_api_impact(file=backend/src/routes/worldgen.ts)`: mapped `/generate` with 0 direct consumers and LOW route impact.
- `gitnexus_detect_changes(scope=staged)` before task commits: low risk on each staged set; production Task 1 detected `runArtifactSearchJobs`, Task 2 file-level route edit had no indexed symbol delta.
- `npx gitnexus status` was stale after code commits, then `npx gitnexus analyze` completed successfully with no embeddings required; final status: indexed commit `9e77dd8`, up-to-date.
- Path-limited diff after task commits: `git diff --name-only -- <owned code paths>` returned no files.

## Threat Coverage

| Threat | Coverage |
| --- | --- |
| Provider/search payload overflow DoS | Overlong provider strings are capped before generated-context prompts, sufficiency extraction prompts, and final artifact parse. |
| Client null tampering at `/generate` | `researchArtifact: null` now falls through to stored artifact loading instead of suppressing campaign artifact authority. |
| Stale `ipContext` EoP beside artifact | Route test asserts stale body `ipContext`, `premiseDivergence`, and `worldgenResearchFrame` are not saved, loaded, or forwarded when stored artifact exists. |
| Scope proof via GitNexus/diff evidence | Impact, API impact, staged detect_changes, final GitNexus status, and path-limited diff evidence are recorded above. |

## Decisions Made

- Provider search results are capped at the provider-ingress helper in `ip-researcher.ts`, not by loosening downstream schemas.
- `/generate` has no clear-artifact behavior in this plan. A null request artifact is accidental/omitted input unless a future explicit API is added and tested.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GitNexus CLI status was stale after task commits. Ran `npx gitnexus analyze` as required; it emitted Node MaxListenersExceeded warnings but completed successfully and final status was up-to-date.
- `gsd-tools state record-metric`, `state add-decision`, and `state record-session` returned no-op because this project's `STATE.md` does not contain those optional sections. Existing state fields, recent updates, and accumulated context were updated directly.

## Known Stubs

None. Stub scan for `TODO`, `FIXME`, `coming soon`, `placeholder`, and `not available` across touched owned files returned no matches.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 72-03. Provider overflow and nullable artifact route semantics are locked, so scaffold/NPC authority propagation tests can rely on stored artifact lane behavior.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-02-SUMMARY.md`.
- Task commits found: `32f3be0`, `32fee73`, `6fda367`, `9e77dd8`.
- GitNexus status is up-to-date at commit `9e77dd8`.
- Path-limited owned code diff is empty after task commits.

---
*Phase: 72-worldgen-authority-propagation-regression-audit*
*Completed: 2026-04-26*
