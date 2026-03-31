# Phase 32-33 UI and Browser Verification Handoff

## Phase 32

### Implementation priorities

1. Introduce the shared non-game shell and route model.
2. Replace modal campaign creation with routed creation workspaces.
3. Redesign world review into list/detail desktop editing.
4. Redesign character creation around persona/template input, structured start conditions, and loadout preview.
5. Bring settings and library surfaces into the same shell language.

### Current-to-target mapping

| Current surface | Current route | Target direction |
| --- | --- | --- |
| Title screen | `/` | campaign launcher workspace |
| New campaign dialog | modal on `/` | `/campaign/new` and `/campaign/new/dna` |
| World review | `/campaign/[id]/review` plus legacy `/world-review` | keep canonical route, remove legacy drift, use shared shell |
| Character creation | `/campaign/[id]/character` plus legacy `/character-creation` | keep canonical route, remove legacy drift, use shared shell |
| Settings | `/settings` | same shell framing and inspector model |
| Library | embedded in dialog | dedicated workspace surface |

### Dependencies to honor

- The shell must reflect the new character/start/persona model from Phases 29-31.
- The visual language must stay aligned with `docs/ui_concept_hybrid.html`.
- Tailwind and shadcn are the implementation boundary; no custom CSS files.

## Phase 33

### Browser Verification

Phase 33 is a browser-first verification and polish phase for the redesigned non-game flows. Users should only need to open URLs and exercise flows; the agent should automate setup and verification steps around them.

## Critical Journeys

### Journey matrix

| Journey | Target routes | Purpose |
| --- | --- | --- |
| campaign creation | `/`, `/campaign/new` | start a new campaign from the redesigned launcher and concept workspace |
| DNA/world-generation entry | `/campaign/new/dna` | review, edit, and continue through the new DNA workspace |
| world review editing | `/campaign/[id]/review` | edit premise, locations, factions, NPCs, lore in desktop workspace |
| character creation | `/campaign/[id]/character` | create character through the redesigned authoring workspace |
| persona selection | `/campaign/[id]/character` | choose persona/template/archetype input path and verify it affects the sheet |
| starting situation resolution | `/campaign/[id]/character` | define and persist structured start conditions |
| known-IP flow | `/campaign/new` -> `/campaign/new/dna` -> review -> character | verify canon/divergence-aware flow after redesign |
| original-world flow | `/campaign/new` -> `/campaign/new/dna` -> review -> character | verify non-IP flow after redesign |

### Ordered journey steps

#### campaign creation

1. Open `/`.
2. Enter the routed creation workspace from the launcher.
3. Fill campaign name and premise or source-backed concept.
4. Verify source/library selection and research state remain visible in-shell.

#### DNA/world-generation entry

1. Continue to `/campaign/new/dna`.
2. Re-roll and edit enabled categories.
3. Verify custom values survive regeneration behavior as intended.
4. Create the world and land in the canonical next route.

#### world review editing

1. Open `/campaign/[id]/review`.
2. Verify desktop shell layout, left navigation/list-detail behavior, and right-side summary/validation context.
3. Edit at least one premise/location/faction/NPC/lore surface.
4. Save and continue.

#### character creation

1. Open `/campaign/[id]/character`.
2. Verify multiple authoring entry points are visible without modal hunting.
3. Confirm live sheet, loadout/start summary, and sticky actions behave correctly.

#### persona selection

1. Select a persona/template/archetype entry path.
2. Confirm the resulting character sheet reflects that source.
3. Confirm the choice survives save/continue.

#### starting situation resolution

1. Enter a structured starting situation.
2. Confirm resolved start data is richer than location-only behavior.
3. Save character and confirm the next flow receives the persisted scenario.

#### known-IP

1. Use a known franchise on `/campaign/new`.
2. Verify the creation flow preserves canon/divergence context and source summaries through DNA, review, and character creation.

#### original-world

1. Use an original premise with no franchise.
2. Verify the same shell, journeys, and save/continue behavior work cleanly without IP-specific assumptions.

## Regression Hotspots

- route drift between canonical campaign routes and old legacy routes
- persona selection not feeding the new character draft pipeline
- starting situation resolution collapsing back to location-only behavior
- review and character pages reintroducing giant stacked cards instead of desktop workspace editing
- library/source selection state being lost between concept and DNA routes
- known-IP flow losing divergence/canon context after the UI rewrite
- original-world flow inheriting IP-specific UI copy or assumptions

## Browser verification contract details

- Verify both known-IP and original-world journeys end-to-end through review and character creation.
- Verify campaign creation, DNA/world-generation entry, character creation, persona selection, starting situation resolution, and world review editing explicitly.
- Capture screenshots for desktop shell comparison at FHD and one wider desktop viewport approximating 1440p usage.
- Treat visual hierarchy, sticky actions, and route continuity as acceptance criteria, not just raw functional success.

## Non-Goals

- Do not expand verification to gameplay UI redesign.
- Do not add mobile-first acceptance criteria to this phase.
- Do not accept a redesign that depends on bespoke CSS files or app-wrapper-only behavior.
