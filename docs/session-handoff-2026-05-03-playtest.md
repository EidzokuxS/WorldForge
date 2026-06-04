# WorldForge Session Handoff - Playtest + GM Architecture

Date: 2026-05-03
Project: `R:\Projects\WorldForge`

## Why This Exists

The previous chat became heavy and laggy. This artifact is the compact handoff for a fresh session. Read this instead of replaying the whole conversation.

## Product Direction

WorldForge is a solo text RPG / VN-like roleplaying engine.

The intended feel:
- player writes natural fiction, not commands;
- the GM/LLM behaves like a human GM: interprets intent, plans the beat, uses tools when the world must change;
- backend is the rulebook and truth of the world: state, IDs, validation, persistence, rolls, rollback, clocks, inventory, relationships, locations;
- UI should feel like an immersive game surface, not a debug cockpit or admin JSON editor;
- Marinara Engine is a flow/reference inspiration, not something to copy directly.

## Most Important User Preferences

- Do not let backend "understand" prose with semantic regex/heuristics. Backend can gather neutral evidence and validate deterministic rules.
- LLM/GM decides target, hostility, whether a roll is needed, and what legal tool call to request.
- Backend validates and persists; it does not invent meaning.
- Avoid fake UI statuses, fake roles, prototype-only labels, and duplicated controls.
- Use real route + real campaign data for UI QA, not just static prototype screenshots.
- Use agents/subagents for large GSD work. Do not interrupt agents once assigned; wait for completion.
- `cursor-agent` is spelled with a hyphen.

## What Was Done Recently

### Phase 77 / Play UI

The Play screen was converted from a bugged floating layout into a more coherent scene-first VN/RPG screen.

Latest focused files:
- `frontend/app/game/page.tsx`
- `frontend/app/game/use-game-play-surface-state.ts`
- `frontend/components/game/play-surface/game-scene-shell.tsx`
- `frontend/components/game/play-surface/scene-backdrop.tsx`
- `frontend/components/game/play-surface/scene-hud.tsx`
- `frontend/components/game/play-surface/narration-dock.tsx`
- `frontend/components/game/play-surface/action-dock.tsx`
- `frontend/components/game/play-surface/stage-overlay.tsx`
- `frontend/components/game/play-surface/presence-layer.tsx`
- related frontend tests

Key Play UI outcomes:
- centered reader/input lane;
- `Continue` and controls are near the readable text area;
- no separate `Speak` helper mode on the live play lane;
- no fake central title/prop/actor markers in the backdrop;
- top HUD suppresses duplicate scene/location text;
- side stage cards use real player HP, inventory/equipment, routes, presence, and items;
- selected NPC panel no longer receives fake HP/profile placeholders;
- stage messages persist until the current beat changes;
- stage cards no longer overlap the reader/action dock or right widget rail at 1440/1920/2560 widths.

Screenshots:
- `output/playwright/game-play-1440-polished-2.png`
- `output/playwright/game-play-1920-polished.png`
- `output/playwright/game-play-2560-polished.png`

Verification passed:
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend exec vitest run components/game/play-surface/__tests__/game-scene-shell.test.tsx components/game/play-surface/__tests__/narration-dock.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx components/game/play-surface/__tests__/presence-layer.test.tsx`
- from `frontend/`: `npm exec vitest run app/game/__tests__/page.test.tsx`

### Phase 78 / GM-First Orchestration

Phase 78 is documented/planned but still listed as unfinished in `tasks/todo.md`.

Intent:
- move freeform play from backend-authored meaning toward GM-authored interpretation;
- preserve backend as deterministic rulebook;
- stop backend semantic pre-passes from deciding target/hostility/intent as product truth.

### Phase 79 / GM Epistemic Context And Tool Grounding

Phase 79 is mostly executed and documented.

Important outcomes:
- model-facing scene view/prompt leak harness;
- tool grounding and remote spawn rejection;
- durable-only event discipline;
- scene-local events should not pollute durable memory;
- narration prompt isolation when a NarratorPacket exists;
- local/remote context should not leak unrelated Forest Outpost-style information into Shibuya narration.

### Phase 80 / Forecast-Led GM Beat Planning

Phase 80 is planned/reviewed but not fully executed.

Remaining checklist in `tasks/todo.md`:
- execute forecast/world trajectory layer;
- execute per-turn beat planning layer before tools/narration;
- verify GM turns cannot execute tools without an explicit beat plan.

## Known Dirty Worktree State

The worktree is broad and dirty. `git status --short` includes:
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- many backend engine files/tests from Phase 79/80;
- frontend Play screen files/tests;
- `tasks/lessons.md`;
- untracked Phase 79/80 planning dirs;
- untracked backend files like `gm-beat-plan.ts`, `model-facing-scene.ts`, `tool-execution-context.ts`, `world-forecast*.ts`;
- untracked `output/` screenshots.

Do not revert unrelated files. If continuing a focused task, first identify ownership and scope.

GitNexus:
- `detect_changes(scope: "all")` reports critical risk because it sees the whole dirty tree.
- For focused frontend work, interpret only the frontend play-surface changed symbols as belonging to the latest UI pass.

## Environment State

User asked to stop servers.

Current expected state:
- frontend port `3000` stopped;
- backend port `3001` stopped.

To restart for playtest, use the project’s usual dev commands. If using the existing campaign, load:

`0ca0dc4e-cc7e-44e3-8099-0820d3b9494b`

Note: backend active campaign can reset on dev reload. For Playwright, force-load campaign with:

```js
await fetch(`http://localhost:3001/api/campaigns/${campaignId}/load`, { method: "POST" });
await page.addInitScript((id) => localStorage.setItem("worldforge:lastActiveCampaignId", id), campaignId);
```

## Current Best Next Step

The user was about to playtest. In a fresh chat, do one of these:

1. If user brings logs/screenshots, debug that concrete issue.
2. If user wants to playtest now, restart backend/frontend and watch logs.
3. If user wants to continue architecture, resume Phase 78/80 GSD flow from `tasks/todo.md`.

## Playtest Things To Watch

UI:
- Does `/game` feel readable for 10-20 turns?
- Does the input lane stay comfortable?
- Do side stage cards help or distract?
- Do `Next`, `Continue`, `Log`, and right rail feel coherent?
- Do stage messages persist correctly until `Next`?

Runtime:
- Does GM call tools for sane reasons?
- Are tool arguments grounded in current scene/location data?
- Does unrelated distant context leak into narration?
- Does background simulation delay player-facing turns too much?
- Are durable events only persisted when future-relevant?
- Does the game recover cleanly from invalid tool calls without user-visible failure?

## Recent Important Lesson

Added to `tasks/lessons.md`:

UI polish must be proven on the real route with real data. Do not accept prototype-only screenshots as evidence. Audit every visible label/status/control against real frontend/backend state and verify geometry with Playwright at user-class desktop widths.
