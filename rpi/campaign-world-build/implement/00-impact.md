# Task 0: execution preflight and impact map

Date: 2026-07-09
Branch: `feat/revamp`
HEAD: `a1e4d5c1935834946c2986c5453b9e98b0a57fbc`
Plan: `docs/goals/campaign-world-build/PLAN.md`
Status: complete

## Execution contract

Goal: build, review, accept, restart, and reload a canonical Campaign World before player setup.

Intent: replace the scaffold writer with a mechanics-owned world path containing locations, routes, actors, goals, placements, relations, and pressures.

Truth owner: campaign `state.db` after build. `config.json` owns premise, World DNA draft, research, and selected sources until build acquisition freezes the normalized snapshot in SQLite.

Contract boundary: `@worldforge/shared`, `backend/src/campaign-world/`, `/api/campaigns/:id/world/*`, and `frontend/lib/campaign-world-api.ts`.

Cutover: Forge, Review, and shell status read Campaign World. Campaign Kernel and worldgen lose their mounted post-creation world writers.

Displaced path: `/api/worldgen/generate`, `/regenerate-section`, `/save-edits`, Campaign Kernel DNA apply/suggest routes, old scaffold clients, and faction/NPC review sections.

Acceptance evidence: premise-only and edited-DNA-plus-research live campaigns with build events, sanitized model strategy records, SQLite integrity, review screenshots, acceptance receipt, restart, and stable IDs/hash.

Kill criteria: one world owner, no faction entity in the new contract, no old build traffic from Forge/Review, stale acceptance rejected, failed builds leave no partial rows, and both live lanes meet the scorecard.

Forbidden moves:

- no fallback, repair, schema coercion, automatic retry, or compatibility importer;
- no direct Campaign World dependency on `backend/src/worldgen/**`, `backend/src/engine/**`, chat, game, or character routes;
- no production UI edit before the Droid GLM UI gate;
- no standalone smoke suite;
- no workstream/version/age labels in current names or copy;
- no production symbol edit before its GitNexus impact check.

## Initial worktree

The initial dirty tree contained the approved plan package and its tracking changes:

- `.gitignore`
- `tasks/todo.md`
- `tasks/lessons.md`
- `docs/goals/campaign-world-build/**`
- `rpi/campaign-world-build/**`

GitNexus refresh added count-only changes to `AGENTS.md` and `CLAUDE.md`. The project rules remained intact.

## Index refresh

- Previous indexed commit: `bd762b7ea3db2e7584e50ea829083fdd664b2e1c`
- Current indexed commit: `a1e4d5c1935834946c2986c5453b9e98b0a57fbc`
- Embeddings before: 5723
- Embeddings after: 5729
- Command: `npx.cmd gitnexus analyze --embeddings`
- Result: 6948 nodes, 20420 edges, 537 clusters, 300 flows
- Analyzer warning: repeated Node `MaxListenersExceededWarning`; exit code remained 0 and the final index metadata matches HEAD.

## Impact results

| Target | GitNexus result | Direct evidence | Execution rule |
|---|---|---|---|
| `CampaignForgePage` | LOW, 0 upstream dependents | Calls Campaign Kernel clients and `loadCampaign`; current page owns the route surface | Rewrite only in Task 7 after UI gate |
| `WorldReviewPage` | LOW, 0 upstream dependents | Calls lore, regeneration, save-edits, and scaffold projection helpers | Rewrite only in Task 8A after client and UI gate |
| `handleCreateWorld` | LOW, 0 upstream dependents | Local Forge event handler | Replaced inside the Task 7 page cutover |
| `generateWorld` | LOW, 1 direct caller | d=1: `handleCreateWorld`; focused API and Forge tests also import it | Remove after Forge uses Campaign World |
| `saveWorldSeeds` | LOW from impact; context shows one direct mounted caller | d=1: `backend/src/routes/campaign-kernel.ts` | Campaign World becomes the sole post-creation writer; old route removed in Task 9 |
| `safeGenerateObject` | tool reported LOW; context shows 28 production callers | 81 backend files contain the symbol including tests | Treat as HIGH. Task 3 adds only `getSafeGenerateObjectTrace(error)` and changes no generation behavior |
| `locations` | symbol unavailable in graph | 129 backend files mention it | Definition stays unchanged; repository inserts canonical rows using existing defaults |
| `locationEdges` | symbol unavailable in graph | 16 backend files mention it | Definition stays unchanged; route cost remains validated in application code |

The `safeGenerateObject` discrepancy is resolved conservatively: context output overrides the empty impact traversal for risk classification. The full `generate-object-safe` suite is mandatory after the additive accessor.

## Displaced route map

GitNexus identifies `/generate`, `/regenerate-section`, and `/save-edits` in `backend/src/routes/worldgen.ts`. Route consumer extraction reports no clients, so fixed-string source evidence remains authoritative:

- `generateWorld`: Forge page and Forge/API tests.
- `regenerateSection`: Review page and Review tests.
- `saveWorldEdits`: Review page and Review tests.

The missing graph consumers are recorded as an index limitation, not proof of zero callers.

Additional explorer findings:

- Forge defines two local `handleCreateWorld` functions. GitNexus merges them into one UID; the direct `generateWorld` caller is the page-level function near line 836, so Task 7 uses source-level caller proof.
- `readCampaignConfig` applies permissive seed parsing. Task 2A will validate the raw campaign config at the Campaign World adapter boundary so malformed stored DNA cannot become premise-only input.
- An exhausted one-attempt `safeGenerateObject` error is wrapped with `strategy: "full_retry"`. Task 3 evidence must recover the underlying primary trace and explicit attempt count through an additive accessor, leaving generation behavior unchanged.
- The clean-campaign gate will use an explicit forbidden-row inventory covering scaffold, player, world-thread, clock, actor-process, wake-signal, saga, saga-event, and clean-turn records.
- The campaign router already owns bare `GET /:id/world`. Task 5B mounts only strict Campaign World subpaths under `/api/campaigns`.
- Drizzle journal entries reached `0023` while snapshots stopped at `0011`. Task 1 must establish and verify a `0023` current-schema snapshot before generating the Campaign World delta.

## Ordered task board

| Task | Owner | Input | Allowed files | Output/evidence | Depends on | Parallel safe |
|---|---|---|---|---|---|---|
| 1 | main agent | approved shared contract | shared contract/index, DB schema, migration | build, typecheck, SQL/FK inventory | 0 | blocks later code |
| 2A | main agent | Task 1 types | source lock/source files and adjacent tests | digest, DNA round trip, mutex proof | 1 | with 2B |
| 2B | main agent | Task 1 types | contracts/prompts/tests, prompt review note | strict schema fixtures and GLM verdict | 1 | with 2A |
| 3 | main agent | Tasks 1, 2A, 2B | builder/validator/snapshot, additive AI trace accessor | strict stage and hash evidence | 1, 2A, 2B | with 4 after shared seams land |
| 4 | main agent | Task 1 schema | database/repository and tests | atomic commit, isolation, integrity, accept proof | 1 | with 3 |
| 5A | main agent | source, builder, repository | build service/index and tests | background/recovery/race evidence | 2A-4 | no |
| 5B | main agent | Task 5A | Campaign World route/index and tests | API, replay, resume, 202/409 proof | 5A | no |
| 6 | main agent with Droid reviewer | plan and UI canon | UI/copy review artifacts only | aligned UI plan | may overlap 5A/5B review | no production UI |
| 7 | main agent | API and UI verdict | Campaign World client, Forge workspace/page/tests | persisted build flow and screenshots | 5B, 6 | no |
| 8A | main agent | Task 7 client | Review page/sections/tests | persisted actor/connection review | 5B, 6, 7 | no |
| 8B | main agent | Review/client | shell status and caller-proof deletion | Campaign World shell state | 7, 8A | no |
| 9 | main agent | current path complete | old route/client writers and tests | 404 and fixed-string cutover proof | 7, 8A, 8B | no |
| 10 | main agent plus POST reviewers | integrated build | regression and playtest artifacts | two pristine bundles and aligned final reviews | 1-9 | no |

Files forbidden to every task stay those named in `PLAN.md`. Implementation remains with the main agent. Read-only explorer/reviewer roles may inspect and report.

## Gate result

Task 0 passes. No Task 1 edit touches a HIGH/CRITICAL existing symbol: it adds new shared and schema exports beside unchanged location tables. The HIGH-risk AI boundary remains deferred to Task 3 with the additive-only constraint above.
