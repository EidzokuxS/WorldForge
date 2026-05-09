# Phase 77: Scene-First VN/RPG Play Surface and Weekend Playable UX Slice - Context

**Gathered:** 2026-05-01
**Status:** Ready for UI design contract and planning
**Source:** Design Lab synthesis from Open Design, Codex 5.5 review, Marinara flow reference, and user direction

<domain>
## Phase Boundary

Phase 77 turns `/game` into a weekend-playable scene-first solo RPG/VN surface.

This phase is not a full product redesign and not a backend simulation rewrite. It focuses on making the existing runtime truth playable and readable:

- visible place first,
- latest staged beat second,
- player input third,
- mechanics/debug hidden behind inspect/drawers,
- a 10-turn playtest gate that proves the user wants to keep playing.

</domain>

<decisions>
## Locked Design Decisions

### Live Play Is A Game Surface

- The default `/game` view must not look like a newspaper, Notion page, SaaS dashboard, or debug cockpit.
- The first five-second read must be "I am in a scene," not "I am reading an admin document."
- The live play layout must use a scene/background layer, compact HUD, visible actor presence, and bottom narration/input dock.

### Marinara Is A Flow Reference, Not A Skin

- Keep Marinara-like presentation functions only when they answer a WorldForge player question.
- Use `Next`, `Auto`, and `Log` cadence to stage text locally.
- Use party/actor presence, map, inventory, journal/log, choice/QTE/dice beats, and scene/text effects as game affordances.
- Do not copy Marinara's exact chrome, spacing, or visual polish.

### Backend Authority Is Deterministic

- `Next`, `Auto`, and `Log` are presentation controls and must never create backend turns.
- `Send` and `Continue` create backend turns.
- Presentation effects are display events layered over settled state, not source-of-truth mutations.
- Backend validation, concrete tool execution, persistence, rollback, IDs, and requested rolls remain deterministic authority.
- Backend must not become the authority for interpreting freeform player text. Target choice, hostile/social/exploration framing, and whether a roll matters belong to the GM/LLM layer and are a follow-up architecture phase.

### Debug Is Optional Inspection

- Oracle math, raw reasoning, JSON, and event payloads must be hidden by default.
- Inspect/debug remains available for audit, but it cannot dominate the normal play surface.
- Player-facing mechanic results should be fiction-facing beats first, raw data second.

### Actor Presence Must Stay Honest

- The UI must distinguish visible/interactable actors from same-area/sensed nearby actors and off-screen anchors.
- Same broad location or persistent sublocation does not imply actors are in arm's reach or visible.
- World/Map drawer can show broader known presence; the scene layer should show only what is present to the player.

### Input Must Support Freeform Play

- Player can write freeform scene text or simply `Continue`.
- No command syntax should be required.
- Do not require `Act`, `Speak`, `Observe`, or similar command modes. A future GM/OOC side channel may exist separately, but it must not classify in-fiction action.
- Input draft must persist per campaign and survive drawer/open-close navigation.

### Visual Palette Correction

- The Sonnet prototype and Opus prototype's warm paper palette are not the final target.
- Opus is useful for topology/state coverage only.
- `docs/WorldForge-v4/index.html` plus `_shots/night2-*` are the latest visual/design correction reference. Treat them as direction and layout proof, not as production copy or fake data authority.
- Live play should move toward cinematic dark/neutral, rainy/neon, translucent game panels, and a place-first visual read.
- Production UI must not preserve prototype-only fake statuses, filters, or fields such as `Worlds in Progress`, `Active`, `Paused`, `Retired`, `Bleeding`, player-facing `canonical status`, player-facing `source kind`, visible chunk counters, or required `Speak`/`Act` modes.

### the agent's Discretion

- Exact component names and file split may follow frontend patterns.
- Background art can start as CSS/stylized/generated placeholder if it reads clearly as a place.
- Optional meta/GM addressing may be explored later as a separate lane, but Phase 77 must not introduce required in-fiction action modes.
- Inventory/journal/map can begin as functional drawers reusing current data before richer mechanics land.

</decisions>

<canonical_refs>
## Canonical References

Downstream agents must read these before planning or implementing.

### Design Contracts

- `.planning/research/worldforge-screen-flow-contract.md` — screen topology, route/drawer states, persistence rules.
- `.planning/research/worldforge-visual-target-contract.md` — rejected visual direction and target VN/RPG play-surface contract.
- `.planning/research/worldforge-design-agent-brief.md` — compact mission brief for design/planning agents.
- `.planning/research/worldforge-design-lab-results.md` — synthesis of Open Design Opus and Codex 5.5 results.
- `.planning/research/marinara-gm-flow-reference.md` — Marinara GM/RPG flow reference and WorldForge adaptation notes.

### Current Frontend

- `frontend/app/game/page.tsx` — current `/game` layout, state, turn handling, current panels.
- `frontend/components/game/narrative-log.tsx` — current scrollback narration implementation to split into latest-beat presenter plus Log drawer.
- `frontend/components/game/action-bar.tsx` — current input/action affordance surface.
- `frontend/components/game/oracle-panel.tsx` — current Oracle output surface to move behind Inspect by default.
- `frontend/components/game/location-panel.tsx` — current location/travel affordance source for scene/world drawer.
- `frontend/components/game/character-panel.tsx` — current character/status source for character drawer.
- `frontend/components/game/lore-panel.tsx` — current lore source for journal/inspect drawer.

### Open Design Reference Artifacts

- `R:\Projects\open-design\.od\projects\worldforge-screen-flow-opus-1777656631094\worldforge-screen-flow-v2.html` — topology/state reference only; do not copy warm paper palette.
- `R:\Projects\open-design\.od\projects\worldforge-play-surface-1777655079953\index.html` — rejected negative visual reference.
- `docs/WorldForge-v4/index.html` — current approved-ish local prototype for visual direction after user correction.
- `docs/WorldForge-v4/_shots/night2-play-2560.png`, `night2-home-2560.png`, `night2-worldgen-2560.png`, `night2-review-2560.png`, `night2-settings-2560.png`, `night2-character-2560.png` — screenshot evidence for the latest corrected prototype.

</canonical_refs>

<specifics>
## Required Implementation Shape

Phase 77 should plan around these likely frontend pieces:

- `GameSceneShell`
- `SceneBackdrop`
- `SceneHUD`
- `PresenceLayer`
- `NarrationDock`
- `DisplayBeat` adapter
- `ActionDock`
- `WidgetRail`
- `DrawerHost`
- `InspectDrawer`
- `WorldDrawer`
- `LogDrawer`
- `InventoryDrawer`
- `JournalDrawer`
- `CharacterDrawer`

The exact file layout is discretionary, but the plan must keep the change incremental and testable.

## Required Acceptance Gates

- Desktop screenshot gate: `/game` reads as a game/VN within five seconds at `2560x1440`, `1920x1080`, and wide laptop sizes, with `1440x900` only as a lower-bound regression width.
- Mobile screenshot gate: scene, narration, input stack cleanly with no permanent debug sidebars.
- Drawer persistence gate: type a draft, open/close Log/World/Inspect/Character, draft remains.
- Presentation cadence gate: `Next`/`Auto`/`Log` are local and do not call backend turn routes.
- Backend turn gate: `Send` and `Continue` call backend turn routes.
- Actor presence gate: visible/sensed/off-screen actors are visually and semantically distinct.
- Debug containment gate: raw Oracle/JSON/reasoning hidden by default.
- Playtest gate: 10-turn session with Continue, freeform action, actor interaction, movement/world inspection, one drawer, and one dice/choice beat.

</specifics>

<deferred>
## Deferred Ideas

- Full generated-background pipeline.
- Sound system.
- Real QTE engine.
- Full product-wide visual overhaul outside the supporting contracts needed for `/game`.
- Complete inventory economy/mechanics rewrite.
- Complex map visualization.
- Backend presentation-event schema unless a tiny frontend adapter requires a stable local type.
- Detailed provider/settings redesign beyond hiding debug from the play surface.

</deferred>

---

*Phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic*
*Context gathered: 2026-05-01 via Design Lab synthesis*
