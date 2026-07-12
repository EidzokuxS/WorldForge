# Campaign Play Task 9 — Visibility and Public Projection

Date: 2026-07-11  
Branch: `feat/revamp`

## Result

Task 9 adds one mechanics-owned visibility boundary from an exact `actors_settled` lease to `visibility_projected`. SQLite remains the authority for committed events, executable exposure predicates, actor placement, applied command receipts, actor knowledge, player observations, and the pending narrator packet.

The slice uses the existing 0028–0030 storage contract, mechanics-owned imports, current API/UI boundary, and focused integration/regression suites.

## Implemented contract

- `direct_perception` evaluates each actor against the event's stored after-snapshot placement.
- `local_aftermath` requires the exact actor's later placement-entry event, current placement at that destination, and an inclusive, unexpired world-time bound.
- `route_state` requires an applied receipt from the same turn whose typed command proves `inspect`, `attempt`, or `traverse` on the exact route at or after the exposed event.
- `witness_report` requires a co-located dialogue/interaction event at or after the exposure plus witness knowledge earned before that report boundary.
- Direct, aftermath, and route knowledge is inserted before witness knowledge. Human observations are inserted only after their exact knowledge provenance exists.
- Stable, domain-separated IDs own knowledge, observation, narration, entity handles, and choice handles.
- Public journal text comes from reviewed code templates and safe display fields. Protected command summaries, player input, event snapshots, goals, relations, provider/model fields, CharacterRecord fields, and pressure trajectories never enter the packet.
- The public state projection reads the latest strict packet and whitelists location, visible actors/routes/pressures, consequences, journal entries, narration, versions, phase, and world time. Canonical player, location, and route IDs remain in mechanical/runtime/protected domains.
- Event exposures now participate in the protected-audit hash.
- Knowledge, observations, packet bytes/hash, narration row, turn stage, runtime revision/hash, runtime event, and sanitized turn event commit through one `CampaignPlayTurnRepository.commitDeterministic` transaction. Mechanical world version remains fixed.

## Real campaign proof

`visibility-service.test.ts` creates and accepts a migrated Campaign World, creates the human character, admits opening turn zero, accepts a compiled opening artifact, executes the production Rulebook bootstrap, persists applied projectable events and receipts, settles actors, claims the visibility lease, and invokes the production service.

The positive scenario orders a source event, a co-located report, player movement, an independent local event, a later distant event, an expired trace, and a time advance. It produces five observations:

- direct perception of a player-caused event;
- local aftermath earned by entering its location after the source event;
- an inspect-earned route observation;
- a report from a co-located witness who learned the same event directly;
- direct perception of an independent Game Master event.

All five consequences bind to their observation handles. Four carry `your_action`; the independent event carries `direct_perception`. A same-token retry leaves knowledge, observation, and narration counts unchanged. The later distant event carries direct, route, and informed-witness exposures; earlier inspection/contact cannot reveal them. The expired trace also remains hidden. A second real campaign proves that the available `inspect` and `traverse` receipts do not satisfy an `attempt`-only route predicate.

The packet is checked against twenty-three named leak probes, including canonical actor/location/route IDs, hidden summaries, goals, relations, provider/model fields, CharacterRecord digests, provenance IDs, and pressure trajectory.

This is runtime integration evidence for opening turn zero. It contains `0` completed player actions; multi-action playtests remain owned by Tasks 17–19.

## Copy gate

Droid GLM-5.2 returned `ACCEPT WITH CHANGES`. Applied changes:

- `Signs left behind` → `Signs of change`;
- `Route update` → `Along the route`.

The remaining deterministic templates, labels, typed route states, causal cues, and action labels were accepted unchanged after the `humanizer` and `deslop` review.

Review request: `rpi/campaign-play/implement/09-visibility-copy-review-request.md`  
Review output: `rpi/campaign-play/implement/agent-logs/09-visibility-copy-glm-20260711-170601.out.log`

## Verification

- `npm --prefix backend run typecheck` — passed.
- `npm --prefix backend test -- --run src/campaign-play/visibility-service.test.ts` — 2/2 passed.
- `npm --prefix backend test -- --run src/campaign-play` — 15 files, 239/239 passed.
- Final independent semantic suite — 4 files, 62/62 passed; fresh Sol verdict `PASS`, remaining P0/P1 `0`.
- `git diff --check` — passed; only inherited line-ending warnings were emitted.
- GitNexus impact checks for the new/touched Campaign Play symbols returned `target not found` because the Campaign Play tree is still untracked and absent from the current index. Its whole-worktree change detector reports `CRITICAL` across 45 inherited tracked files and 22 existing flows; Task 9 remains inside the untracked Campaign Play scope and is absent from that graph report. Source-level callers and the full suite supplied the Task 9 blast-radius evidence.
- Terra mechanical verification passed typecheck and the then-current four-file suite; its observations about broad `INSERT OR IGNORE` and actor-controller typing were repaired with exact conflict targets and the authoritative `human | agent` union.
- The first independent Sol review found three P1 temporal/public-boundary defects. A second review found two P1 ordering defects: later knowledge paths could hide earlier witness evidence, and caller timestamps could select an older public packet. The implementation now keeps the earliest qualifying provenance, selects packets by authoritative runtime revision, requires ordered entry/interaction/report evidence, and strictly parses plus whitelists public journal/scene fields. The final fresh Sol review returned `PASS` with P0/P1 `0`.

## Scope note

The worktree contains substantial inherited Campaign World, Campaign Play, frontend, and documentation changes. Task 9 touched only its execution packet's listed files plus the existing turn-repository test required to replace the historical loose packet fixture with the strict public contract. Nothing was staged or committed.
