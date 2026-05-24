# Phase 95 Browser Smoke Evidence

Date: 2026-05-24
Branch: `develop`
Commit under test: `31b025bae800e2cabe75abdf46108f79ae8b899b`
Browser surface: Codex in-app Browser fallback connection through the available
Playwright MCP page controls. The primary Browser `node_repl` bridge failed to
initialize before this smoke, so this is valid in-app UI evidence but also a
Browser tooling note.

## Scope

This is a workability smoke, not long-play acceptance.

Checked:

- `/game` loads at `http://localhost:3000/game`.
- The game reports `Ready`.
- Saves drawer opens and shows the checkpoint UI.
- A freeform player action can be submitted through the scene action dock.
- The turn returns to `Ready`.
- The submitted draft is cleared.
- The current scene beat updates from the backend response.
- Browser console has zero errors.

## Player Action

`I step toward Cinderman Hektor, show the sealed debt discharge certificate, and ask which route marker will open the safest dock path.`

## Result

The turn completed successfully in the in-app Browser. The scene beat updated to
describe the sealed debt discharge certificate satisfying dock access proof
requirements and identifying the Ridge Marker at the Ventwatch Ridge boundary as
the safest dock path. The action input was empty afterward, and the HUD returned
to `Ready`.

Console:

- errors: 0
- warnings: 2
- warning detail: Radix Dialog missing `Description` / `aria-describedby` on
  the Saves drawer; this is existing P2 UX/accessibility debt, not a gameplay
  turn failure.

Screenshot:

- `output/phase95-browser-smoke-20260524-1705.png`

## Remaining Gates

This smoke does not replace fresh/cloned 60-turn human-style campaigns, longer
soak/replay, rollback/replay evidence, or final Phase 95 gameplay acceptance.
