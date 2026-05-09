# Phase 83 UI Spec - WorldForge V4 Full Visual Migration

Date: 2026-05-05
Status: Active implementation contract

## Intent

Move the real frontend to the approved WorldForge V4 visual direction while keeping product truth honest. The prototype is a visual and interaction reference, not a source of backend-backed facts. Any visible status/control must be real, explicitly target UI, or removed/demoted.

## Product Surfaces

- Non-game shell: launcher, campaign concept, World DNA, review, character, library, settings.
- Game shell: `/game` stage, HUD, presence, narration dock, action dock, widget rail, drawers.
- No standalone fake import route. Import stays where real flows already exist: library, concept source upload, review worldbook import, character V2 import.

## Visual Contract

- Background: dark real workspace, no radial orb decoration.
- Rail: 248px desktop target, 64px collapsed/mobile target, sharp border split, brand as `World` + ember `Forge`.
- Radii: 2px to 6px for app surfaces; no large rounded product frame.
- Type: serif display for product/page/entity names; tight sans for prose and controls; mono for metadata and labels.
- Palette: charcoal base, ember action/accent, cold blue only for debug/system, gold sparingly for authored/lore emphasis.
- Layout rhythm: 8/12/16/24/36px spacing, flat bordered sections, no nested decorative cards.
- Buttons: icon+text for commands, icon-only where meaning is familiar and tooltip/title exists.

## Page Requirements

- Launcher becomes a real first-screen workspace: current campaign/action area plus recent campaign library. No fake lifecycle states, token counts, queue states, or invented telemetry.
- Campaign creation keeps real fields only: name, premise, franchise/IP, research mode, worldbook sources, manual/AI DNA, create/continue.
- World DNA uses six real DNA cards and real progress copy. No simplified fake pipeline claims.
- Review keeps real tabs/data, improves hierarchy, and avoids debug/oracle facts in player-facing panels.
- Settings keeps real tabs: Providers, Roles, Images, Gameplay, Research. Autosave/load blocking remains intact.
- Library keeps real import/list functionality. Export/Delete cannot be shown as active commands until handlers exist.
- `/game` remains immersive, rail-free, 100dvh, scene-first. It keeps Next/Auto/Log as local reveal controls and Send/Continue as backend turn controls. No separate Speak control.

## Responsive/QA Contract

- Primary visual target: 2K / 2560x1440. The interface should feel composed and intentional at this size, not merely stretched from 1080p.
- Browser screenshot QA: desktop 1366, 1920, 2560; tablet/mobile at least 768 and 390.
- UX interaction QA: route navigation, settings tabs, library import affordance, launcher load/delete affordances, game Send/Continue disabled/busy states, Next/Auto/Log, Log drawer.
- Text must not overflow buttons, tabs, rows, cards, or docks at tested widths.
- `/game` must show a nonblank stage, centered reading/action lane, visible HUD, and reachable widget/drawer controls.

## Explicit Non-Goals

- Do not paste `docs/WorldForge-v4/index.html` into app code.
- Do not expose prototype-only campaign statuses, hardcoded counts, token/cost/latency values, fake inventory/map/journal labels, or hidden oracle trace as normal player UI.
- Do not change backend transport or gameplay semantics while migrating visual presentation.
