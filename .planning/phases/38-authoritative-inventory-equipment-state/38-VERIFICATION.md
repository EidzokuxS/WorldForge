---
phase: 38-authoritative-inventory-equipment-state
verified: 2026-04-12T05:56:00.4786803Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "Reload preserves the same carried/equipped split in /game"
    expected: "After reloading the app or reopening the campaign, carried and equipped items match the pre-reload state with no fallback-only legacy items."
    why_human: "Automated tests verify route/parser wiring, but a full app reload crosses browser state and route hydration boundaries."
  - test: "Checkpoint load, retry, or undo do not resurrect legacy fallback items"
    expected: "After inventory changes, restoring a checkpoint or using retry/undo keeps prompts and /game aligned to authoritative item rows rather than old equippedItems/loadout projections."
    why_human: "Automated restore-path regressions pass, but the final player-visible flow still benefits from an end-to-end runtime check."
  - test: "Narration-driven pickup/drop/equip/unequip stays authoritative end-to-end"
    expected: "A normal gameplay turn that causes item movement updates both the next prompt context and /game inventory/equipment without any separate equip/unequip tool surface."
    why_human: "Tests prove transfer_item reachability and state mutation, but they do not prove a live model call chooses that path during real narration."
---

# Phase 38: Authoritative Inventory & Equipment State Verification Report

**Phase Goal:** Inventory and equipment use one authoritative persistence model across gameplay, prompts, restore flows, and player-facing reads.
**Verified:** 2026-04-12T05:56:00.4786803Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Player sees the same carried and equipped items before and after reload, with no fallback-only items appearing in prompts or gameplay state. | ✓ VERIFIED | `loadCampaign()` forces `ensureCampaignInventoryAuthority()` before campaign activation (`backend/src/campaign/manager.ts:223-285`); restore paths reopen through `loadCampaign()` (`backend/src/campaign/restore-bundle.ts:58-87`); prompt and `/world` tests reject legacy fallback reads (`backend/src/engine/__tests__/prompt-assembler.inventory-authority.test.ts`, `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts`); frontend reload-safe parsing/rendering tests pass. |
| 2 | Picking up, dropping, equipping, or unequipping an item updates one authoritative runtime state that later turns also read. | ✓ VERIFIED | `transfer_item` is the only storyteller mutation seam and writes `items.ownerId/locationId/equipState/equippedSlot` directly (`backend/src/engine/tool-schemas.ts`, `backend/src/engine/tool-executor.ts:977-1065`); `processTurn()` exposes that tool bag live (`backend/src/engine/turn-processor.ts:583-602`); runtime reachability and mutation tests pass (`tool-schemas.inventory-authority`, `tool-executor`, `turn-processor.inventory-authority`). |
| 3 | Starting loadout, live inventory changes, checkpoints, and restored gameplay all reflect the same item truth instead of diverging models. | ✓ VERIFIED | Fresh character creation seeds authoritative item rows (`backend/src/routes/character.ts:254-298`); item-row contract lives in schema (`backend/src/db/schema.ts:184-203`); legacy migration backfills and rewrites compatibility from authoritative rows (`backend/src/inventory/legacy-migration.ts:164-327`); checkpoint/retry/undo restore tests pass (`backend/src/campaign/__tests__/checkpoints.test.ts`, `backend/src/routes/__tests__/chat.inventory-authority.test.ts`, `backend/src/engine/__tests__/state-snapshot.test.ts`). |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/src/db/schema.ts` | Explicit item-row equipment contract | ✓ VERIFIED | `items` includes `equipState`, `equippedSlot`, `isSignature` (`184-203`). |
| `backend/src/inventory/authority.ts` | Shared authoritative inventory/equipment resolver | ✓ VERIFIED | Loads owned item rows and derives carried/equipped/signature plus compatibility projection (`70-169`). |
| `backend/src/inventory/legacy-migration.ts` | Idempotent legacy backfill and compatibility rewrite | ✓ VERIFIED | Builds desired authoritative rows, fails closed on contradictory player legacy state, rewrites compatibility from authoritative rows (`164-327`). |
| `backend/src/engine/tool-executor.ts` | Single authoritative runtime mutation seam | ✓ VERIFIED | `spawn_item` creates default authoritative rows; `transfer_item` handles pickup/drop/equip/unequip on the same row contract (`657-720`, `977-1065`). |
| `backend/src/engine/prompt-assembler.ts` | Prompt reads from authoritative item rows | ✓ VERIFIED | Player and NPC prompt sections call `loadAuthoritativeInventoryView()` and render those results (`291-360`, `464-535`). |
| `backend/src/routes/campaigns.ts` | `/world` exposes authoritative player inventory/equipment payloads | ✓ VERIFIED | Route loads authoritative inventory and emits structured `player.inventory` / `player.equipment` arrays plus compatibility strings (`157-189`). |
| `frontend/lib/api.ts` | Parser preserves authoritative inventory/equipment arrays | ✓ VERIFIED | `parseWorldPlayerInventoryItems()` and `parseWorldData()` map structured player inventory/equipment rows (`330-446`). |
| `frontend/app/game/page.tsx` | `/game` consumes authoritative player arrays directly | ✓ VERIFIED | Uses `player?.inventory` and `player?.equipment`, not filtered `world.items`, then passes them to `CharacterPanel` (`276-277`, `634-639`). |
| `frontend/components/game/character-panel.tsx` | Player-facing carried/equipped rendering | ✓ VERIFIED | Renders explicit `carriedItems` and `equippedItems` props with structured metadata and empty states. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `backend/src/routes/character.ts` | `backend/src/inventory/authority.ts` | Canonical loadout seeding | ✓ WIRED | Character save inserts `items` via `toAuthoritativeItemSeed(...)` (`290-297`). |
| `backend/src/campaign/manager.ts` | `backend/src/inventory/legacy-migration.ts` | Reopen-time authority seam | ✓ WIRED | `loadCampaign()` calls `ensureCampaignInventoryAuthority(id)` before activation (`271`). |
| `backend/src/campaign/restore-bundle.ts` | `backend/src/campaign/manager.ts` | Restore reopens through campaign load | ✓ WIRED | `restoreCampaignBundle()` ends with `await loadCampaign(campaignId)` (`87`). |
| `backend/src/engine/tool-schemas.ts` | `backend/src/engine/tool-executor.ts` | `transfer_item` execute callback | ✓ WIRED | Tool schema delegates `transfer_item` to `executeToolCall(...)`. |
| `backend/src/engine/turn-processor.ts` | `backend/src/engine/tool-schemas.ts` | Live storyteller tool bag | ✓ WIRED | `createStorytellerTools(...)` result is passed to `streamText(...)` (`585-599`). |
| `backend/src/engine/prompt-assembler.ts` | `backend/src/inventory/authority.ts` | Prompt authority read | ✓ WIRED | Player and NPC sections call `loadAuthoritativeInventoryView(...)` (`316`, `488`). |
| `backend/src/routes/campaigns.ts` | `frontend/lib/api.ts` | Structured world payload contract | ✓ WIRED | Backend emits structured rows; frontend parses them into `player.inventory` / `player.equipment`. |
| `frontend/app/game/page.tsx` | `frontend/components/game/character-panel.tsx` | Authoritative UI props | ✓ WIRED | Page passes `carriedItems={playerCarriedItems}` and `equippedItems={playerEquippedItems}` (`634-639`). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `backend/src/engine/prompt-assembler.ts` | `authoritativeInventory` | `loadAuthoritativeInventoryView()` | Yes — DB query over `items` rows (`backend/src/inventory/authority.ts:91-113`) | ✓ FLOWING |
| `backend/src/routes/campaigns.ts` | `playerInventory` | `loadAuthoritativeInventoryView()` | Yes — same DB-backed authoritative resolver | ✓ FLOWING |
| `frontend/lib/api.ts` | `player.inventory` / `player.equipment` | `/api/campaigns/:id/world` JSON | Yes — parser preserves structured rows, not hardcoded empties | ✓ FLOWING |
| `frontend/app/game/page.tsx` | `playerCarriedItems` / `playerEquippedItems` | Parsed `player.inventory` / `player.equipment` | Yes — direct prop flow into `CharacterPanel` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 38 backend migration/mutation/read regressions | `npm --prefix backend exec vitest run src/inventory/__tests__/inventory-authority.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` | 10 files passed, 71 tests passed | ✓ PASS |
| Phase 38 frontend parser/render regressions | `cd frontend && npx vitest run lib/__tests__/api.inventory-authority.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx` | 3 files passed, 32 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `RINT-04` | `38-01`, `38-02`, `38-03` | Inventory and equipment have one authoritative persistence model that gameplay, prompts, checkpoints, and UI all read and mutate consistently. | ✓ SATISFIED | Item-row authority contract in schema, load-time migration/backfill on reopen, `transfer_item` mutation seam, prompt and `/world` reads via authoritative resolver, and `/game` rendering from backend-authored player arrays. |

### Anti-Patterns Found

No blocker anti-patterns found in the Phase 38 implementation files. The scan found only normal guard-path `return []` / `return null` cases, not user-visible stubs or placeholder implementations.

### Human Verification Required

### 1. Reload Preserves Carried/Equipped Split

**Test:** Open a campaign with at least one carried item and one equipped item, then reload the app or reopen the campaign.
**Expected:** `/game` shows the same carried/equipped split before and after reload, with no extra legacy-only items.
**Why human:** Browser reload and route hydration are outside the unit-test boundary.

### 2. Restore Paths Stay on Authoritative Item Rows

**Test:** Make an inventory change, then use checkpoint load and also retry or undo on a later turn.
**Expected:** The restored game, `/game` inventory panel, and subsequent prompt context all reflect the restored authoritative item rows rather than `equippedItems` or creation-time loadout fallback.
**Why human:** Automated restore-path tests prove the seam, but not the final player-visible round trip.

### 3. Live Narration Uses the Authoritative Mutation Seam

**Test:** In normal gameplay, trigger a pickup, drop, equip, or unequip through narrated play.
**Expected:** The resulting `/game` inventory/equipment state and the next narrated turn both reflect the same item change, with no separate `equip`/`unequip` tool behavior.
**Why human:** Tests prove live tool reachability, but only a real model turn can confirm the end-to-end narration path.

### Gaps Summary

No automated gaps were found. Phase 38’s code, wiring, and targeted regressions support the roadmap goal and `RINT-04`. Remaining uncertainty is limited to live end-to-end runtime behavior across full app reload/restore and real narration-driven tool choice, so this phase is at human-verification checkpoint rather than automated-failure status.

---

_Verified: 2026-04-12T05:56:00.4786803Z_
_Verifier: Claude (gsd-verifier)_
