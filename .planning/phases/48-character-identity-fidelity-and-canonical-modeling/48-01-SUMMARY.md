---
phase: 48-character-identity-fidelity-and-canonical-modeling
plan: 01
subsystem: character-modeling
tags:
  - character-identity
  - canonical-modeling
  - adapters
  - schemas
requires:
  - Phase 29 shared CharacterDraft/CharacterRecord lane
  - Phase 30 start-condition, loadout, and persona-template compatibility seams
provides:
  - layered identity fields on the shared character contract
  - provenance-aware source-bundle and continuity metadata
  - adapter-owned backfill and compatibility projection from richer identity
affects:
  - shared/src/types.ts
  - backend/src/character/record-adapters.ts
  - backend/src/routes/schemas.ts
tech-stack:
  added: []
  patterns:
    - layered identity normalization
    - source-bundle helper seam
    - richer-to-legacy compatibility projection
key-files:
  created:
    - backend/src/character/canonical-source-bundle.ts
    - backend/src/character/__tests__/record-adapters.identity.test.ts
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - backend/src/character/record-adapters.ts
    - backend/src/routes/schemas.ts
    - backend/src/character/__tests__/record-adapters.test.ts
    - backend/src/routes/__tests__/schemas.test.ts
key-decisions:
  - Keep one shared CharacterDraft/CharacterRecord ontology and add richer identity inside `identity`, not a canonical-only record type.
  - Model canon fidelity as optional `sourceBundle` and `continuity` extensions so imported/key characters get stronger provenance without forking the lane.
  - Derive legacy persona/goals/beliefs compatibility views from normalized rich identity when shallow fields are stale.
requirements-completed:
  - CHARF-01
duration: "8 min"
completed: "2026-04-12T16:46:30Z"
---

# Phase 48 Plan 01: Shared Identity Fidelity Summary

One richer shared character contract with three explicit identity layers, optional canon/source fidelity metadata, and adapter-owned compatibility backfill.

Start: `2026-04-12T16:37:31Z`  
End: `2026-04-12T16:46:30Z`  
Duration: `8 min`  
Tasks: `2`  
Files changed: `8`

## Outcomes

- Extended `CharacterIdentityDraft` / `CharacterIdentity` with `baseFacts`, `behavioralCore`, and `liveDynamics`, and added optional `sourceBundle` / `continuity` extensions on the shared draft-record lane.
- Added `backend/src/character/canonical-source-bundle.ts` as the pure normalization seam for canon-facing citations, secondary cue sources, and WorldForge-owned synthesis metadata.
- Normalized legacy player/NPC hydration and stored-record rehydration through the richer identity model while preserving additive legacy compatibility outputs.
- Extended route schemas and transforms so richer identity fields survive draft parsing, `saveCharacterSchema`, `saveEditsSchema`, and persona-template patch payloads.

## TDD Commits

- `0270888` — `test(48-01): add failing tests for richer identity schema`
- `ae4a42b` — `feat(48-01): add richer identity and fidelity contracts`
- `22d337a` — `test(48-01): add failing compatibility backfill regressions`
- `24bd362` — `feat(48-01): backfill compatibility from richer identity`

## Verification

- `npx vitest run backend/src/character/__tests__/record-adapters.identity.test.ts backend/src/routes/__tests__/schemas.test.ts`
- `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/character/__tests__/record-adapters.identity.test.ts backend/src/routes/__tests__/schemas.test.ts`
- Final result: `194` tests passed across the adapter/schema regression suite.

## Decisions Made

- Richer identity layers live under `identity` because Phase 48 research and the existing shared-lane contract both pointed to one ontology with stronger structure, not a side-path model.
- `sourceBundle` and `continuity` stay optional extensions on the shared record so canonical/imported fidelity can be preserved without forcing every character through the same provenance burden.
- Adapter normalization now fills shallow compatibility fields from richer identity only when those shallow fields are empty, which preserves backwards compatibility while keeping the richer seam authoritative.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Known Stubs

None.

## Next Phase Readiness

Phase 48 can now build downstream generation/import, prompt, and frontend seams on one richer shared character model instead of inventing parallel canonical-only shapes.

## Self-Check: PASSED

- Summary file exists on disk.
- Task commits `0270888`, `ae4a42b`, `22d337a`, and `24bd362` are present in git history.
