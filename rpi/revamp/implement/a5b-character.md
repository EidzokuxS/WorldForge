# A5b revamp character wiring canvas

Objective:
- Wire player character create/import into the revamp Campaign Kernel without calling the old `/api/worldgen/*` character routes from the revamp UI.

Operating contract:
- Revamp owns a new API surface under `/api/revamp`.
- The old character creation page and old worldgen routes are reference material.
- A5b persists only the player cast member into `kernel.json`.
- A5b keeps generated NPC cast wiring for a later slice.
- A5b accepts only valid `CharacterDraft` output from the character ingestion path or from an imported-card ingestion path.
- A5b advances the kernel to `cast_ready` only when `castRegistry.playerCharacter` exists.
- A5b preserves `worldDna`, `worldGraph`, `startingSetup`, `chatSession`, and `turnIndex`.

Planned backend files:
- `backend/src/revamp/cast-kernel.ts`
- `backend/src/revamp/__tests__/cast-kernel.test.ts`
- `backend/src/routes/revamp.ts`
- `backend/src/routes/__tests__/revamp.test.ts`
- `backend/src/index.ts`

Planned frontend files:
- `frontend/lib/revamp-api.ts`
- `frontend/app/(non-game)/campaign/[id]/revamp/page.tsx`
- `frontend/app/(non-game)/campaign/[id]/revamp/__tests__/page.test.tsx`

Non-goals:
- Do not save the player into the old `players` table.
- Do not route the revamp page through `/campaign/:id/character`.
- Do not call frontend helpers `saveCharacter`, `parseCharacter`, `generateCharacter`, `researchCharacter`, or `importV2Card` from the revamp page.
- Do not revive full world generation.
- Do not build Starting Setup or GM Opening in this slice.
- Do not add compatibility fallbacks.

### A1 Source Lock
Status: complete
Owner: A1
Scope: Lock the contract and source hierarchy.
Output:
- [inspected] `REVAMP_ARCHITECTURE.md` names A5b as `Revamp import/create character wiring`.
- [inspected] A5a already provides `buildRevampCastRegistry`.
- [decided] A5b persists player cast only; generated and imported NPC cast stay outside this slice.

### A2 Current-State Map
Status: complete
Owner: A2
Scope: Identify existing routes, UI references, and kernel persistence.
Output:
- [inspected] A3 persists `kernel.json` through `readCampaignKernel` and `writeCampaignKernel`.
- [inspected] Existing `/campaign/:id/character` saves into old runtime tables and pushes `/game`.
- [inspected] Existing frontend character helpers call `/api/worldgen/*`.
- [decided] Revamp uses new frontend helpers and new `/api/revamp/*` routes.

### A3 Reference Extraction
Status: complete
Owner: A3
Scope: Pull reusable concepts without copying old flow ownership.
Output:
- [inspected] Existing `CharacterDraft` schema is the input contract.
- [inspected] Existing V2 parser can still parse client files before sending card fields.
- [inferred] Character ingestion can remain a shared service if the revamp route owns the API boundary and persistence.

### A4 Kernel Protocol
Status: in_progress
Owner: A4
Scope: Define the exact kernel transition.
Output:
- [proposed] `saveRevampPlayerCharacter(campaignId, draft, source)` reads an existing kernel or creates a draft kernel from campaign config.
- [proposed] Allowed phases: `draft`, `world_ready`, `cast_ready`.
- [proposed] Duplicate player save replaces `playerCharacter` and keeps imported/generated buckets.
- [proposed] Empty or NPC-role drafts fail closed.

### A5 Proof Harness
Status: pending
Owner: A5
Scope: Define tests that prove the wiring.
Output:
- [proposed] Backend unit test: draft kernel -> player cast -> `cast_ready` -> persisted `kernel.json`.
- [proposed] Backend route test: parse/import route returns a draft, save route writes cast, invalid role returns 400.
- [proposed] Frontend test: revamp page renders player creation controls and calls revamp helpers, with old character helpers absent from mocks.
- [proposed] Static search: revamp page must not import old frontend character helpers.

### A6 Cleanup and Risk
Status: pending
Owner: A6
Scope: Identify stale surfaces and adoption risk.
Output:
- [proposed] Keep old `/campaign/:id/character` route untouched until a later deletion slice.
- [proposed] Keep old worldgen character routes untouched for existing flows.
- [proposed] Mark A5b proof in `tasks/todo.md` after local tests pass.

### +1 Integration
Status: in_progress
Owner: +1
Scope: Choose the smallest shippable A5b slice.
Output:
- [decided] Build a minimal player cast path: parse/import into draft, save into kernel, render saved player summary.
- [rejected] Reusing the old character page as the revamp UI because it saves old runtime state.
- [rejected] Writing generated NPC cast in A5b because A5a covered only mapping, not world placement and graph integration.
