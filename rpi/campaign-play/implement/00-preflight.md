# Task 0: execution preflight

Date: 2026-07-10  
Branch: `feat/revamp`  
Commit: `a1e4d5c1935834946c2986c5453b9e98b0a57fbc`  
Verdict: GO for Task 1A.

## Entry contract

Campaign Play starts from the accepted Campaign World and ends with a durable player loop on mechanics-owned routes and stores. Accepted Review remains immutable provenance. Mechanical state uses `worldVersion` and `worldHash`; runtime processing uses `runtimeRevision` and `runtimeHash`. Opening runs as turn zero through the same fenced worker, Rulebook receipts, actor scheduling, visibility, narration, and recovery contracts as later player actions.

The cutover target is `/campaign/[id]/play` with mechanics-owned APIs. Task 15 removes `/game` and `/api/chat/*` from the active player path. The playtest counter advances when a player action completes. Opening has index zero, while worker activity remains operational evidence.

## Environment

| Item | Result |
|---|---|
| Branch | `feat/revamp`, tracking `origin/feat/revamp` |
| Commit | `a1e4d5c1935834946c2986c5453b9e98b0a57fbc` |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| GitNexus CLI | `1.6.1` |
| GitNexus index | Current at `a1e4d5c`; 7,379 symbols, 21,070 relationships, 300 flows |
| GitNexus embeddings | 6,006; the current index kept them intact |

Provider inspection returned presence flags and role assignments while secrets stayed redacted. `settings.json` exists and contains five providers. The active generation, storyteller, and judge roles use `custom-zai-coding` with provider default `glm-5.2`. That provider has a configured key. Built-in OpenAI, Anthropic, OpenRouter, and Ollama are unconfigured in this workspace. The embedder points at built-in OpenAI, and image generation is disabled. Research is enabled. The relevant process API-key environment-variable count is zero.

## Existing worktree ownership

The worktree already contained the completed Campaign World implementation, its planning and acceptance evidence, active-path removals, and Campaign Play planning package. Task 0 preserves all of it. The execution board added during this task shares the already modified `tasks/todo.md`. This preflight note is the other Task 0 write.

The exact status captured before this note was created follows:

```text
## feat/revamp...origin/feat/revamp
 M .gitignore
 M AGENTS.md
 M CLAUDE.md
 M backend/drizzle/meta/_journal.json
 M backend/src/ai/__tests__/generate-object-safe.test.ts
 M backend/src/ai/__tests__/structured-output-boundary.test.ts
 M backend/src/ai/generate-object-safe.ts
 M backend/src/campaign/__tests__/clone.test.ts
 M backend/src/campaign/__tests__/store-manifest-executor.test.ts
 M backend/src/campaign/__tests__/store-manifest.test.ts
 M backend/src/campaign/clone.ts
 M backend/src/campaign/index.ts
 M backend/src/campaign/manager.ts
 M backend/src/campaign/store-manifest-executor.ts
 M backend/src/campaign/store-manifest.ts
 M backend/src/db/schema.ts
 M backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts
 M backend/src/engine/gameplay-control-plane-contract.ts
 M backend/src/index.ts
 M backend/src/routes/__tests__/campaign-kernel.test.ts
 M backend/src/routes/__tests__/schemas.test.ts
 M backend/src/routes/__tests__/worldgen.test.ts
 M backend/src/routes/campaign-kernel.ts
 M backend/src/routes/schemas.ts
 M backend/src/routes/worldgen.ts
 M backend/src/worldgen/__tests__/worldbook-importer.test.ts
 M backend/src/worldgen/worldbook-importer.ts
 D frontend/app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx
 M frontend/app/(non-game)/campaign/[id]/forge/page.tsx
 D frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx
 M frontend/app/(non-game)/campaign/[id]/review/page.tsx
 M frontend/app/globals.css
 M frontend/components/non-game-shell/__tests__/app-shell.test.tsx
 M frontend/components/non-game-shell/app-shell.tsx
 M frontend/components/non-game-shell/app-sidebar.tsx
 M frontend/components/non-game-shell/campaign-status-provider.tsx
 M frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx
 D frontend/components/world-review/__tests__/character-record-inspector.test.tsx
 D frontend/components/world-review/__tests__/factions-section.test.tsx
 D frontend/components/world-review/__tests__/locations-section.test.tsx
 D frontend/components/world-review/__tests__/lore-section.test.tsx
 D frontend/components/world-review/__tests__/npcs-section.test.tsx
 D frontend/components/world-review/__tests__/premise-section.test.tsx
 D frontend/components/world-review/__tests__/regenerate-dialog.test.tsx
 D frontend/components/world-review/__tests__/tag-editor.test.tsx
 D frontend/components/world-review/__tests__/worldbook-import-dialog.test.tsx
 D frontend/components/world-review/character-record-inspector.tsx
 D frontend/components/world-review/factions-section.tsx
 M frontend/components/world-review/locations-section.tsx
 D frontend/components/world-review/lore-section.tsx
 D frontend/components/world-review/npcs-section.tsx
 D frontend/components/world-review/premise-section.tsx
 D frontend/components/world-review/regenerate-dialog.tsx
 D frontend/components/world-review/tag-editor.tsx
 D frontend/components/world-review/worldbook-import-dialog.tsx
 M frontend/lib/__tests__/api.test.ts
 M frontend/lib/__tests__/campaign-kernel-api.test.ts
 D frontend/lib/__tests__/world-data-helpers.test.ts
 M frontend/lib/api-types.ts
 M frontend/lib/api.ts
 M frontend/lib/campaign-kernel-api.ts
 D frontend/lib/world-data-helpers.ts
 M frontend/vitest.config.ts
 M shared/src/index.ts
 M tasks/lessons.md
 M tasks/todo.md
?? backend/drizzle/0024_campaign_world.sql
?? backend/drizzle/meta/0023_snapshot.json
?? backend/drizzle/meta/0024_snapshot.json
?? backend/src/campaign-world/
?? backend/src/routes/campaign-world.test.ts
?? backend/src/routes/campaign-world.ts
?? docs/goals/
?? frontend/app/(non-game)/campaign/[id]/forge/page.test.tsx
?? frontend/app/(non-game)/campaign/[id]/review/page.test.tsx
?? frontend/components/campaign-forge/
?? frontend/components/non-game-shell/campaign-status-provider.test.tsx
?? frontend/components/world-review/actors-section.test.tsx
?? frontend/components/world-review/actors-section.tsx
?? frontend/components/world-review/connections-section.test.tsx
?? frontend/components/world-review/connections-section.tsx
?? frontend/components/world-review/locations-section.test.tsx
?? frontend/components/world-review/overview-section.test.tsx
?? frontend/components/world-review/overview-section.tsx
?? frontend/components/world-review/world-review.test-support.ts
?? frontend/lib/campaign-world-api.test.ts
?? frontend/lib/campaign-world-api.ts
?? frontend/lib/campaign-world-research.test.ts
?? frontend/lib/campaign-world-research.ts
?? rpi/campaign-world-build/
?? scripts/
?? shared/src/campaign-world.ts
```

## Baseline proof

| Command | Result |
|---|---|
| `npx gitnexus status` | Current index at `a1e4d5c` |
| `npm --prefix backend test -- src/campaign-world src/routes/campaign-world.test.ts` | 10 files passed, 117 tests passed |
| `npm --prefix frontend test -- --run "app/(non-game)/campaign/[id]/forge/page.test.tsx" "app/(non-game)/campaign/[id]/review/page.test.tsx" lib/campaign-world-api.test.ts` | 3 files passed, 21 tests passed |

These suites prove the Campaign World handoff before Campaign Play changes its acceptance contract.

## Active caller inventory

| Surface | Current owner and callers | Planned owner |
|---|---|---|
| `/game` | `frontend/app/game/page.tsx`; entered by the home page, load dialog, character completion, `visual-v4-smoke.mjs`, and phase 84/88/94 E2E runners | `/campaign/[id]/play` in Tasks 13 through 15 |
| `/api/chat/*` | Mounted from `backend/src/index.ts`; frontend wrappers for history, action, opening, and resume are consumed by `GamePage`; phase 84/88 E2E also call history/action | Campaign Play API and service in Tasks 10A through 11 |
| Character handoff | `CharacterCreationPage` reads `generationComplete`, reads the old world projection, then calls `saveCharacter`; that posts to `/api/worldgen/save-character`, owned by `backend/src/routes/character.ts`; phase 88 calls it directly | Campaign-owned intake in Task 4, followed by play handoff in Task 15 |
| `generationComplete` | Written by `backend/src/campaign/manager.ts`; read by `requireGeneratedCampaign` and `CharacterCreationPage` | Accepted Campaign World plus player-actor readiness in Tasks 1A, 1B, 4, and 15 |
| Review acceptance | `WorldReviewPage` calls `handleAcceptWorld`, `acceptCampaignWorld`, `POST /:id/world/accept`, then repository `acceptWorld` | Immutable acceptance snapshot in Task 1A |
| Review Continue | Current acceptance terminates at `World accepted` | Explicit Character and Play handoff in Task 15 |
| Campaign Kernel play routes | `backend/src/routes/campaign-kernel.ts` mounts kernel/debug, player parse/import, cast/player, graph compose, setup/start, opening, chat/message, and state/apply. `createCampaignOpening` and `createCampaignChatMessage` each have that route file as their only production caller | Donor reference through Tasks 4 through 10; active ownership moves to Campaign Play |
| Old gameplay stores | `players`, `npcs`, `worldClocks`, `turnSagas`, and `cleanGameplayTurnRecords` in `backend/src/db/schema.ts`; scene-frame/cycle reads player, NPC, and clock state; Stage 4 writes them; old opening writes `turn_sagas`; clean cycle writes `clean_gameplay_turn_records` | Mechanics-owned Campaign Play tables in Tasks 2B1 through 3B |
| Current visual script | `frontend/scripts/visual-v4-smoke.mjs`; it enters `/game` and sets a global active/generated campaign | Real Campaign Play evidence harness in Tasks 15 through 19 |

## Planned ownership map

| Contract | Owner tasks |
|---|---|
| Frozen accepted-world provenance and player actor invariants | 1A and 1B |
| Shared play contract, schema, clone manifest, repository, and worker fencing | 2A through 3B |
| Player intake, opening plan, Rulebook, Judge, GM, actors, visibility, narration, and runtime | 4 through 10C |
| Resumable API and product surface | 11 through 15 |
| Deterministic promotion, real campaigns, 300-action soak, and independent audit | 16A through 20 |

## GitNexus blast radius

Every named Task 1 function impact reports LOW risk, the highest risk observed.

| Target | Direct impact | Required proof |
|---|---|---|
| `serializeCampaignWorldContent` | 2 direct callers; 5 total through depth 3 | Snapshot, hash, repository, and route tests |
| `calculateCampaignWorldContentHash` | 3 direct callers; 4 total through depth 2 | Snapshot and repository tests |
| `loadWorldInternal` | 0 indexed incoming callers; repository interface dispatch is outside the resolved call graph | Repository and route integration tests |
| `createCampaignWorldRoutes` | 2 direct callers; route file plus harness | Campaign World route suite |
| `POST /:id/world/accept` | 0 detected direct API consumers; 3 repository failure flows; LOW API risk | Backend route suite plus the known frontend client chain |
| `acceptCampaignWorld` | 2 direct callers; `handleAcceptWorld` and client test; 2 affected process groups | Frontend API and Review tests |
| `handleAcceptWorld` | 1 direct caller, `WorldReviewPage` | Review page tests |
| `WorldReviewPage` | Route entry with 0 indexed incoming callers | Review page tests and later player-path evidence |
| `validateCampaignWorldDraft` | 4 direct callers, including `loadWorldInternal` and build execution | Validator, repository, and build-service suites |
| `createCampaignWorldBuilder` | 3 direct callers; 4 total through depth 2 | Builder and route suites |

GitNexus resolves two `acceptWorld` symbols. The concrete repository method is `Method:backend/src/campaign-world/world-repository.ts:acceptWorld#1` at line 1238. Context reports zero indexed incoming calls and zero process participation. The impact endpoint accepts a name and selects the interface method at line 201; the concrete UID form produces a target lookup error. Fixed-string inspection proves the active call chain: Campaign World route -> repository `acceptWorld`. The route API impact is LOW.

GitNexus exposes `worldActorRoleValues`, `actors`, and `actorPlacements` through file text as their available representation. Task 1B must run impact on every indexed validator, builder, snapshot, and repository function it changes, then pair that result with schema caller inventory and focused migration tests.

## Prose and evidence review

Droid GLM-5.2 returned `ALIGNED` after independently reproducing the branch, commit, worktree listing, provider flags, GitNexus status, both baseline suites, symbol locations, and the 34-task board. Its read-only review found the GO verdict supported and the Task 1A entry contract precise.

The `humanizer` and `deslop` pass kept the technical structure and replaced negation-driven status phrases with direct contracts. Final scores: directness 10/10, rhythm 8/10, reader trust 10/10, authenticity 9/10, density 9/10.

## GO conditions for Task 1A

- Campaign World starts green at 117 backend tests and 21 frontend tests.
- GitNexus matches the checked-out commit and retains 6,006 embeddings.
- Task 1 targets have LOW graph risk. The acceptance route and Review client chain are known.
- Existing worktree changes have named ownership and remain in place.
- `tasks/todo.md` contains the complete 34-task execution board.

Task 1A may begin. It must freeze the exact accepted Review projection in the acceptance transaction and prove byte-identical Review output after live mechanical rows mutate.
