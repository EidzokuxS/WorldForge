---
phase: 06-npc-agents
verified: 2026-03-19T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 06: NPC Agents Verification Report

**Phase Goal:** Key Characters act autonomously -- they pursue goals, speak unprompted, move between locations, and react to the player's presence
**Verified:** 2026-03-19
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After each player turn, all Key NPCs at the player's location get individual LLM ticks | VERIFIED | `buildOnPostTurn` in `chat.ts` (lines 121-131) calls `tickPresentNpcs(campaignId, summary.tick, judgeProvider, player.currentLocationId)` after every `/action` and `/retry` |
| 2 | NPC agent can act (through Oracle), speak, move to adjacent location, or update own goals | VERIFIED | `npc-tools.ts` implements all four tools: `act` (calls `callOracle`), `speak`, `move_to` (adjacency-validated), `update_own_goal` |
| 3 | NPC actions go through callOracle() same as player actions — probability evaluation + D100 roll | VERIFIED | `act` tool in `npc-tools.ts` line 121: `const oracleResult = await callOracle(oraclePayload, judgeProvider)` |
| 4 | NPC ticks run sequentially to avoid conflicting state changes | VERIFIED | `tickPresentNpcs` in `npc-agent.ts` uses `for...of` loop (lines 279-298), not `Promise.all` |
| 5 | NPC tick failures are logged but never block gameplay | VERIFIED | Both `tickPresentNpcs` and `buildOnPostTurn` wrap in `try/catch`, log with `log.warn/log.error`, continue execution |
| 6 | Off-screen Key NPCs get batch-simulated every N ticks with structured location/action/goal updates | VERIFIED | `simulateOffscreenNpcs` in `npc-offscreen.ts`: checks `tick % interval !== 0`, calls `generateObject` with Zod schema, applies updates to DB |
| 7 | An NPC can be promoted from temporary to persistent to key tier via API endpoint | VERIFIED | `POST /api/campaigns/:id/npcs/:npcId/promote` in `campaigns.ts` (line 208) |
| 8 | Promotion is one-directional (only upward: temporary -> persistent -> key) | VERIFIED | `tierOrder` map + `if (newOrder <= currentOrder)` returns 400 "Can only promote upward" (lines 236-245) |
| 9 | Off-screen simulation results are written to DB but not narrated to the player | VERIFIED | `simulateOffscreenNpcs` calls `db.update(npcs).set(...)` silently; not sent to client SSE stream |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/engine/npc-agent.ts` | tickNpcAgent, tickPresentNpcs | VERIFIED | 302 lines, full implementation: context assembly, Judge LLM call via `generateText`, tool result collection |
| `backend/src/engine/npc-tools.ts` | createNpcAgentTools (4 tools) | VERIFIED | 272 lines, `act`/`speak`/`move_to`/`update_own_goal` with Zod inputSchema, DB operations |
| `backend/src/engine/npc-offscreen.ts` | simulateOffscreenNpcs, parseOffscreenUpdates, applyOffscreenUpdate | VERIFIED | 300 lines, `generateObject` with Zod batch schema, location + goal + episodic event writes |
| `backend/src/engine/__tests__/npc-agent.test.ts` | Unit tests | VERIFIED | 7 tests: tool factory shape, act Oracle call, move_to adjacency rejection, move_to success, update_own_goal, speak no-Oracle, empty tickPresentNpcs |
| `backend/src/engine/__tests__/npc-offscreen.test.ts` | Unit tests | VERIFIED | 6 tests: empty array cases, interval check, generateObject call, parseOffscreenUpdates, applyOffscreenUpdate DB writes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/src/routes/chat.ts` | `backend/src/engine/npc-agent.ts` | `tickPresentNpcs` in `buildOnPostTurn` | WIRED | Import line 19, called at line 122, passed to both `/action` (line 300) and `/retry` (line 394) call sites |
| `backend/src/routes/chat.ts` | `backend/src/engine/npc-offscreen.ts` | `simulateOffscreenNpcs` in `buildOnPostTurn` | WIRED | Imported line 19, called at line 135, wrapped in try/catch |
| `backend/src/engine/npc-agent.ts` | `backend/src/engine/oracle.ts` | `callOracle` in act tool via `npc-tools.ts` | WIRED | `npc-tools.ts` line 13 imports `callOracle`, line 121 calls it with NPC actor tags + environment tags |
| `backend/src/engine/npc-agent.ts` | `backend/src/engine/tool-executor.ts` | `executeToolCall` for act outcomes | WIRED | `npc-tools.ts` line 14 imports, line 125: `executeToolCall(campaignId, "log_event", ...)` |
| `backend/src/routes/campaigns.ts` | `backend/src/db/schema.ts` | promote endpoint updates `npcs.tier` | WIRED | Line 249: `db.update(npcs).set({ tier: newTier })` with `promoteNpcBodySchema` validation |
| `backend/src/engine/index.ts` | `npc-agent.ts`, `npc-tools.ts`, `npc-offscreen.ts` | barrel re-exports | WIRED | Lines 48-56 export `tickNpcAgent`, `tickPresentNpcs`, `createNpcAgentTools`, `simulateOffscreenNpcs` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NPC-01 | 06-01 | Key Characters have individual LLM calls per tick when in player's location | SATISFIED | `tickNpcAgent` calls `generateText` with Judge role + NPC tools; `tickPresentNpcs` orchestrates per-NPC ticks |
| NPC-02 | 06-01 | NPC Agent tools: act(action), speak(dialogue), move_to(target_node), update_own_goal(old, new) | SATISFIED | All 4 tools implemented in `npc-tools.ts` with Zod inputSchema and full execute logic |
| NPC-03 | 06-02 | Off-screen Key Characters simulated via batch LLM call every N ticks | SATISFIED | `simulateOffscreenNpcs` uses single `generateObject` call for all off-screen Key NPCs; interval-gated |
| NPC-04 | 06-02 | Character promotion: extras -> persistent -> key tier upgrades | SATISFIED | `POST /api/campaigns/:id/npcs/:npcId/promote` validates upward-only, updates `npcs.tier` in DB |
| NPC-05 | 06-01 | NPC actions processed through Oracle same as player actions | SATISFIED | `act` tool calls `callOracle` with `OraclePayload` (actorTags, environmentTags, intent); returns `OracleResult` with outcome tier |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO/FIXME/placeholder comments, no empty implementations, no stub returns found in any of the 5 phase files.

### Human Verification Required

None. All behaviors are backend-only and verifiable programmatically:
- NPC ticks fire server-side after player actions (no UI surface)
- DB writes confirmed via implementation and test coverage
- Promotion endpoint is a standard REST endpoint

### Test Results

```
2 test files, 13 tests — all passed
- npc-agent.test.ts: 7 tests (tools shape, Oracle wiring, adjacency, goal update, speak no-Oracle, empty orchestrator)
- npc-offscreen.test.ts: 6 tests (empty result, on-screen skip, interval gate, generateObject call, parse, apply)
TypeScript typecheck: clean (0 errors)
```

### Summary

Phase 06 fully achieves its goal. Key Characters now act autonomously:

- **Present ticks:** After every player turn, the post-turn hook queries all `tier='key'` NPCs at the player's location and calls `tickNpcAgent` sequentially for each. Each NPC gets a Judge LLM call with 4 tools — `act` routes through the Oracle (same probability + D100 system as player actions), `speak` stores dialogue as an episodic event, `move_to` validates adjacency and updates `currentLocationId`, and `update_own_goal` mutates the NPC's goals JSON in the DB.

- **Off-screen simulation:** Every 5 ticks, all off-screen Key NPCs are batch-simulated via a single `generateObject` call. Structured updates (location change, action summary, goal progress) are silently applied to the DB and stored as `npc_offscreen` episodic events.

- **Tier promotion:** A new REST endpoint allows NPCs to be promoted upward through the tier hierarchy (temporary → persistent → key), enabling extras to become autonomous agents when narratively warranted.

All 5 NPC requirements (NPC-01 through NPC-05) are satisfied. No gaps, no stubs, no orphaned artifacts.

---
_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
