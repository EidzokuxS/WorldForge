# Task
Review the A5b revamp character wiring plan for WorldForge.

# Context
The project is rebuilding mechanics step by step. Old code can be used as reference, but the revamp path gets its own API and persistence boundary.

A3 added `kernel.json` persistence.
A5a added a pure cast registry adapter.
A5b should let the revamp campaign shell create or import a player character, then persist that player as `castRegistry.playerCharacter`.

# Files to inspect
- `rpi/revamp/REVAMP_ARCHITECTURE.md`
- `rpi/revamp/implement/a5b-character.md`
- `frontend/app/(non-game)/campaign/[id]/revamp/page.tsx`
- `frontend/app/(non-game)/campaign/[id]/character/page.tsx`
- `backend/src/revamp/dna-adapter.ts`
- `backend/src/revamp/cast-registry-adapter.ts`
- `backend/src/routes/character.ts`

# Review questions
1. Is this the right UX/UI slice for A5b, or is it too wide?
2. Should the revamp page build a small new player cast panel instead of reusing the old character page/components?
3. Is the planned API boundary clean enough: `/api/revamp/*` owns persistence, old `/api/worldgen/*` stays outside the revamp page?
4. What proof should block the next slice?
5. Which visible copy or controls should change before implementation?

# Constraints
- Do not implement code.
- Do not propose backwards compatibility.
- Do not route revamp through `/campaign/:id/character`.
- Keep the answer practical.
- Start with `Verdict: approve` or `Verdict: revise`.
- If revise, list required changes as checkable items.
