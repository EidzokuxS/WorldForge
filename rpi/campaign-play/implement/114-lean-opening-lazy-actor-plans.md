# Task 114 — Lean Opening and lazy actor plans

Status: implementation, focused automated verification, production build, fresh model replay, and disposable rendered acceptance complete.

## Outcome

Campaign Play Opening now asks the provider only for the player's grounded start, selected visible scene, and motivation-bound immediate premise. The compiler owns player placement, bootstrap commands, and eight deterministic actor schedules. Opening commits with no model-authored actor plans, no hidden consequence seed, and no actor execution in its critical path.

Each eligible actor keeps a durable future opportunity. A schedule begins with `plan_id = null`; when the actor first becomes due, the existing Actor Replanner rebuilds the current goal/location/knowledge frame and must accept a real validated plan before Actor Proposal can execute consequential work. Due times are deterministically staggered at 0, 5, 10, 15, 20, 25, 30, and 35 world minutes, so Opening and the first player action do not sweep the cast.

Opening Narrator uses the existing independent visibility packet and model. Its provider schema is narrowed to the scene contract's maximum of two beats, and only its output budget is capped at 4,096 tokens. Ordinary player-action Narrator behavior is unchanged.

Rejected alternatives: raising the 90-second stage deadline cannot satisfy the 120-second product target; generating even one actor plan inside Opening keeps unrelated agency on the player's critical path; broad causal-cone infrastructure would duplicate authority already owned by commit, visibility, and Narrator.

## Compatibility and authority

- New and migrated actor schedule/job plan references are nullable; the migration rebuilds both tables while retaining their indexes, foreign keys, triggers, and populated legacy rows.
- Legacy Opening artifacts with eager actor plans remain readable and continue through the compatibility branch. Compact artifacts require zero actor plans, all-null schedule plan IDs, and no opening exposure seed.
- Replay/idempotency, immutable accepted artifacts and receipts, explicit fresh-epoch Resume, late-result fencing, provider identity, and pristine accepted-world semantics remain under the existing turn runtime.
- A no-effect player action with no frozen due set no longer invents an actor opportunity at unchanged world time. An already-frozen due set still resumes unchanged.

## Frozen comparison and model evidence

The same immutable Lowwater Ledger template hash `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717` was used for r45 and the fresh disposable r02.

- r45 Opening Planner: 486,724 ms, 16,607 input / 20,716 output tokens, 40,755 artifact characters, eight actor plans and schedules.
- D111 Opening Planner: 205,439 ms, 5,352 input / 13,709 output tokens, 25,721 artifact characters, six actor plans and schedules.
- r02 compact Opening Planner: 24,256 ms, 5,316 input / 1,461 output tokens, 9,603 artifact characters, zero actor plans and eight all-null schedules.
- r02 Opening Narrator: 34,339 ms, 5,471 input / 2,049 output tokens, one orientation beat and four usable actions. The full authoritative server turn completed in 58,871 ms; the rendered scene was observed at 94,818 ms after the one Begin click.

r45 and r02 preserve the exact player placement, `alderman-hallway`, Dren Vask and Vedris Kast, both open routes, the full local intent catalog, the same eight actor identities, and the same accepted-world active goal identities. The intentional difference is plan materialization: r45 carried eight eager plans; r02 carried eight future opportunities with null plans. No remote actor, private goal, or hidden event entered the opening visibility packet.

The earlier disposable r01 proved the compact planner separately at 22,865 ms and 1,777 output tokens, but its uncapped Narrator reached the existing 90-second stage timeout. It was not resumed or retried. The two-beat/4,096-token Opening Narrator boundary was then validated only in fresh r02.

## Rendered acceptance

Entry point: `http://localhost:3183/campaign/6b85a49e-fef5-4359-95e2-051383f6fb66/play`, run root `output/playtests/campaign-world-runs/task-114-compact-opening-r02-20260730`.

One Brina Hael card was imported, saved once, and configured as `lower-wards / Local / Already here / Looking for work`. One Begin produced the proper `alderman-hallway` scene and four active choices within 94,818 ms. Screenshot: `opening-viewport.png`.

One rendered `Go to Dim Ward Market` action then completed in 83,818 ms and returned four active choices in `dim-ward-market`. Its due set contained only Dren Vask with `planId = null`. Actor Replanner accepted a real plan in 14,059 ms against goal `Maintain order at the alderman's hallway without escalating tensions`; the resulting Actor Proposal was accepted and the job settled. The other seven schedules remained planless and future-due. Screenshot: `player-action-complete.png`.

Final state: world version 14, runtime revision 39, world time 1, two completed turns, 16 receipts, 16 events, eight schedules, one real completed plan, one settled actor job, SQLite integrity `ok`, and zero foreign-key violations. Neither turn is interrupted or Resume-eligible.

## Verification and semantic review

- Focused Campaign Play suite: 11 files and 188 tests covering contracts, compact planner, Opening runtime, Narrator, scheduler, replanner, actor proposal, visibility, player-turn runtime, database migration, and mounted route integration.
- Backend typecheck passed. Shared/frontend/backend production build passed, including Next TypeScript and `/campaign/[id]/play` generation.
- The repository-wide typecheck reaches a pre-existing frontend lint error in the untouched Forge page at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105` (`react-hooks/set-state-in-effect`) and stops before repeating backend typecheck. This task does not modify or repair that page.
- `git diff --check` passed. GitNexus compare-to-main completed; its aggregate `critical` result spans 5,106 changed symbols in 497 files across the long-lived branch and shared dirty work. Every task-specific pre-edit impact was LOW or MEDIUM, with no task-specific HIGH or CRITICAL symbol.
- Humanizer review: the compact Opening prompt still asks for a specific present-tense interaction grounded in the selected actor, pressure, and player motivation; it does not collapse prose into a template.
- Deslop review: actor-plan exposition, duplicated simulation instructions, and finished player-facing prose were removed from Opening. Exact schema keys, route-restriction semantics, model boundaries, and grounding prohibitions remain literal. Verdict: accepted as written.
