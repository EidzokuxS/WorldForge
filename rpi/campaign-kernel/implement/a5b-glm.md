# Task
Review the A5b campaign kernel character wiring plan for WorldForge.

# Context
The project is rebuilding mechanics step by step. Old code can be used as reference, but the campaign kernel path gets its own API and persistence boundary.

A3 added `kernel.json` persistence.
A5a added a pure cast registry adapter.
A5b should let the campaign forge shell create or import a player character, then persist that player as `castRegistry.playerCharacter`.

# Files to inspect
- `rpi/campaign-kernel/architecture.md`
- `rpi/campaign-kernel/implement/a5b-character.md`
- `frontend/app/(non-game)/campaign/[id]/forge/page.tsx`
- `frontend/app/(non-game)/campaign/[id]/character/page.tsx`
- `backend/src/campaign-kernel/dna-adapter.ts`
- `backend/src/campaign-kernel/cast-registry-adapter.ts`
- `backend/src/routes/character.ts`

# Review questions
1. Is this the right UX/UI slice for A5b, or is it too wide?
2. Should the campaign forge page build a small new player cast panel instead of reusing the old character page/components?
3. Is the planned API boundary clean enough: `/api/kernel/*` owns persistence, old `/api/worldgen/*` stays outside the campaign forge page?
4. What proof should block the next slice?
5. Which visible copy or controls should change before implementation?

# Constraints
- Do not implement code.
- Do not propose backwards compatibility.
- Do not route campaign kernel through `/campaign/:id/character`.
- Keep the answer practical.
- Start with `Verdict: approve` or `Verdict: revise`.
- If revise, list required changes as checkable items.
