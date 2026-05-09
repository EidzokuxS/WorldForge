# Phase 77 — Validation Strategy

## Purpose

Prove Phase 77 delivers a weekend-playable scene-first VN/RPG `/game` surface rather than another document/dashboard/debug cockpit. Validation must cover behavior, visual read, debug containment, and a short play session.

## Requirement Coverage

| Req ID | Behavior | Test Type | Automated Command | Evidence Artifact |
|---|---|---|---|---|
| P77-R1 | `/game` default renders `GameSceneShell` with scene backdrop/HUD/presence/docks instead of permanent admin columns | component/page | `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/game-scene-shell.test.tsx` | `77-VISUAL-QA.md` |
| P77-R2 | `Next`, `Auto`, and `Log` are local-only controls; `Send` and visible `Continue` create backend turns | unit/page | `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts components/game/play-surface/__tests__/narration-dock.test.tsx app/game/__tests__/page.test.tsx` | targeted test output |
| P77-R3 | Log, World/Map, Character, Lore/Journal, Inventory, Inspect, and Saves open as drawers/widgets and preserve draft/scene state | component/page | `npm --prefix frontend run test -- run components/game/play-surface/__tests__/drawer-host.test.tsx app/game/__tests__/page.test.tsx` | targeted test output |
| P77-R4 | Visible/interactable, sensed/same-area, and off-screen actors render as distinct bands | component/page | `npm --prefix frontend run test -- run components/game/play-surface/__tests__/presence-layer.test.tsx app/game/__tests__/page.test.tsx` | targeted test output |
| P77-R5 | Action dock supports one raw freeform input, visible `Continue`, busy-state protection, and per-campaign draft persistence without required Act/Speak/Observe modes | component/page | `npm --prefix frontend run test -- run components/game/play-surface/__tests__/action-dock.test.tsx app/game/__tests__/page.test.tsx` | targeted test output |
| P77-R6 | Oracle/mechanic output is fiction-facing by default, with raw chance/roll/reasoning only in Inspect/debug | unit/component/page | `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts components/game/play-surface/__tests__/inspect-drawer.test.tsx app/game/__tests__/page.test.tsx` | targeted test output |
| P77-R7 | Desktop and mobile screenshots read as game/VN, not newspaper/editorial/SaaS/debug | PinchTab/browser/manual | Browser screenshot checklist with PinchTab or Browser Use evidence | `77-VISUAL-QA.md` |
| P77-R8 | 10-turn session demonstrates Continue, freeform action, actor interaction, movement/world inspection, drawer use, and dice/choice beat | deterministic/live UAT | `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx` plus manual/live checklist | `77-PLAYTEST.md` |

## Required Commands

Run targeted commands per plan, then final phase gates:

```powershell
npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts components/game/play-surface/__tests__/narration-dock.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx components/game/play-surface/__tests__/drawer-host.test.tsx components/game/play-surface/__tests__/presence-layer.test.tsx components/game/play-surface/__tests__/inspect-drawer.test.tsx app/game/__tests__/page.test.tsx
npm --prefix frontend run test -- --run
npm --prefix frontend run lint
npm --prefix frontend run typecheck
```

If `typecheck` is not defined in `frontend/package.json`, record that explicitly in `77-VERIFICATION.md` and run the closest repo-supported typecheck/build command instead.

## Visual QA Gate

Create `.planning/phases/77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic/77-VISUAL-QA.md` during Plan 77-06.

Minimum viewports:

- primary desktop `2560x1440`
- standard desktop `1920x1080`
- wide laptop `1728x1117`
- lower-bound desktop `1440x900`
- lower-bound laptop `1366x768`
- mobile `390x844`
- mobile `360x740`

Required observations:

- first five seconds read as game/VN,
- current place is visually legible before prose,
- bottom narration/action dock is dominant,
- no permanent Location/Character/Lore/Oracle/admin sidebars,
- no raw `Oracle`, `Chance`, `Roll`, `Raw reasoning`, `JSON`, `payload`, or `scene-settling` in default view,
- visible/sensed/off-screen actor bands are distinguishable,
- no left/right dead side band larger than 25% of the first viewport at `2560x1440`,
- stage signals/effects persist until `Next` or a new turn boundary,
- typed draft survives opening and closing Log, World, Inventory, Journal, Character, Inspect, and Saves,
- mobile layout preserves scene -> beat -> action order and safe-area spacing.

Reject the result if more than one third of the first viewport reads as white, cream, parchment, tan paper, newspaper, editorial reader, SaaS dashboard, or debug cockpit.

## Playtest Gate

Create `.planning/phases/77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic/77-PLAYTEST.md` during Plan 77-06.

The playtest must include at least:

1. visible `Continue`
2. freeform action
3. actor interaction
4. movement or world/map inspection
5. opening at least one drawer
6. one fiction-facing mechanic/dice/choice beat
7. confirmation that raw debug was not required to understand the consequence

The gate may use a deterministic mocked campaign/session if live provider access is unavailable, but it must say which mode was used.

## Nyquist Notes

- Automated tests cover behavior and control semantics.
- Visual QA covers the screenshot/readability gap that jsdom cannot see.
- Playtest covers the product-quality gap that unit tests cannot infer.
- GitNexus impact checks must be run before source symbol edits in execution plans, then `gitnexus_detect_changes()` before any code commit.

## Closeout Evidence

Phase closeout must produce:

- targeted test output summary,
- full frontend test/lint/typecheck summary or recorded unavailable command,
- `77-VISUAL-QA.md`,
- `77-PLAYTEST.md`,
- `77-VERIFICATION.md`,
- GitNexus change detection summary.
