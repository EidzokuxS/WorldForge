# Task 6A: Campaign Play Rulebook preflight

Date: 2026-07-11  
Status: complete.

## Outcome

Campaign Play now owns a pure Rulebook preflight. It accepts one frozen mechanical frame, one code-owned authority envelope, and one unknown command batch. It returns either a fully simulated accepted batch or a typed denial. The function imports no database, repository, route, world writer, or old gameplay surface.

Files:

- `backend/src/campaign-play/rulebook.ts`;
- `backend/src/campaign-play/rulebook.test.ts`;
- export in `backend/src/campaign-play/index.ts`.

Task 6B will execute only the accepted result inside one SQLite transaction.

## Authority and frame contracts

- Character bootstrap uses accepted-world provenance, null turn/actor authority, and exactly one code-owned `create_player_actor` command.
- Opening bootstrap uses the opening turn root and exactly one player placement, one zero-valued world clock, and one state for every accepted pressure.
- Player actions use the admitted player turn and either the human actor or Game Master source.
- Actor jobs retain their direct actor-job root on every command and require the owning actor as source. Scheduler impersonation fails.
- Every entity reference must exist in the simulated state and occur in the frozen authority allowlist. Known world events and knowledgeable witnesses use separate code-owned lists.
- Frozen frame validation binds accepted campaign/version/hash, phase/version lineage, unique human identity, current clock, pressure coverage, immutable placement/relation/goal fields, operative placement cardinality, and row ranges.
- People and the human player act only from `present`. Collectives act from every `base` and `influence` placement. Home/base/influence locations remain immutable.

## Command contracts

All twelve shared command variants are exhaustive:

- ordinary: world-time advance, person movement, route state, actor condition, directed relation, owned goal, anchored pressure, and receipt-bearing world event;
- character bootstrap: player actor creation;
- opening bootstrap: player placement, world clock, and pressure state initialization.

For every command, preflight validates exact read/write scopes, source, causal parent, expected world version, entity references, state transition, phase availability, and exposure policy. Earlier accepted commands mutate only the private simulation used by later checks. A later denial returns no partial simulation and leaves the input frame byte-for-byte unchanged.

Projectable exposure requires an authorized existing anchor and causal grounding in the affected location or route. Witnesses must be authorized knowledgeable people at an affected operative location. Local aftermath must remain live at the current world time. Semantic duplicate predicates fail.

## Verification

```powershell
npm --prefix backend test -- src/campaign-play/rulebook.test.ts
npm --prefix backend run typecheck
```

Results:

- focused suite: 1 file, 22 tests passed;
- backend TypeScript check passed;
- all 12 command kinds covered: 8 ordinary, 3 opening bootstrap, 1 character bootstrap;
- content-aware whitespace check found no whitespace errors; Git reported only the expected LF-to-CRLF warning for untracked files;
- persistence-boundary scan returned zero matches;
- standalone smoke additions: 0.

The denial fixtures cover unknown commands and fields, stale versions, bootstrap injection, hidden accepted IDs, scope expansion, broken causal lineage, earlier-step invalidation, collective movement, actor-job ownership/source/root, pressure result mismatch, expired and remote exposure, duplicate predicates, collective witnesses, human ID collision, prior player placement, generated placement-ID collision, immutable row drift, person home-versus-present locality, and incomplete opening coverage.

## Reviews

The first Sol semantic review found actor-job root/source mismatch, ungrounded exposure, incomplete bootstrap absence checks, mutable frozen-frame fields, duplicate predicates, human-ID collision, and person-home locality leakage. Each finding received a direct contract fix and regression. The fresh review returned `PASS` with zero P0, P1, or P2 findings after rerunning 22 tests and backend typecheck.

The Terra mechanical verifier returned `PASS` after independently rerunning the focused suite and typecheck, enumerating all twelve command variants, checking the barrel export, and confirming the pure import boundary.

No prompt, player-visible copy, production UI, fallback, compatibility surface, or standalone smoke suite was added.

GitNexus could not resolve the new untracked Rulebook symbol or the untracked barrel before editing. Final accumulated-worktree impact is recorded separately; all pre-existing and concurrent changes remain preserved.
