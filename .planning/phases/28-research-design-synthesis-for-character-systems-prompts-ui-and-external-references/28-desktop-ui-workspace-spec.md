# Desktop UI Workspace Specification

## Goal

Define the non-game desktop shell for WorldForge so Phase 32 can redesign campaign creation, review, character creation, settings, and library flows without rerunning discovery.

## Visual anchor

- Use `docs/ui_concept_hybrid.html` as the visual-language anchor.
- Preserve the deep charcoal base, serif/sans pairing, restrained `blood` and `mystic` accents, soft panel depth, and framed composition.
- Treat the concept as mood and hierarchy guidance, not as a literal copy target.

## Workspace

### Core shell regions

1. Global frame/header
2. Left rail navigation
3. Main workspace canvas
4. Right summary/inspector rail
5. Sticky action bar

### Region behavior

| Region | Purpose | Notes |
| --- | --- | --- |
| Header | campaign title, route context, save/generation status, primary actions | always visible on desktop |
| Left rail | route-level navigation across create/review/character/library/settings surfaces | persistent within non-game flows |
| Main canvas | list/detail editors, generators, review forms, preview panes | widest region; primary reading/editing surface |
| Right rail | context summaries, generation progress, validation warnings, selected-item detail | collapsible only on smaller widths |
| Sticky action bar | continue/save/generate/publish actions tied to current step | avoids bottom-of-page hunting on long editors |

## FHD

- Target default desktop layout for 1920x1080.
- Use a three-region frame comfortably: left rail 240-280px, main canvas 880-1040px, right rail 280-360px.
- Prioritize above-the-fold step comprehension: current step, key context, and next action should all be visible without scrolling.

## 1440p

- At 2560x1440, the shell should become denser rather than merely wider.
- Expand list/detail and inspector usage: show multi-column editors, side-by-side preview/detail, and larger summary panels.
- Avoid giant undifferentiated cards centered in space; use the extra width for hierarchy and productivity.

## Routes

### Current route problems

- `/` embeds campaign creation in a modal dialog instead of a route-owned workspace.
- Legacy standalone routes `/world-review` and `/character-creation` still exist beside canonical `/campaign/[id]/review` and `/campaign/[id]/character`.
- Library interactions are embedded inside the title dialog rather than having a stable workspace surface.

### Target route model

| Surface | Target route | Notes |
| --- | --- | --- |
| Title / campaign chooser | `/` | keep as landing shell with recent campaigns and entry points |
| Campaign creation concept | `/campaign/new` | route-owned workspace replaces oversized modal |
| World DNA | `/campaign/new/dna` | still part of creation workspace |
| World review | `/campaign/[id]/review` | keep route, redesign into workspace shell |
| Character creation | `/campaign/[id]/character` | keep route, redesign into workspace shell |
| Library | `/library` or `/campaign/new/library` | dedicated management surface for reusable sources |
| Settings | `/settings` | keep route, redesign into same non-game shell language |

### Route rules

- Non-game flows should share the same shell frame and navigation language.
- Legacy standalone routes without campaign ids should either redirect or be removed once the routed shell exists.
- `/game` stays out of scope for this phase; this spec covers non-game surfaces only.

## Screen patterns

### Title surface

- Replace the current centered menu with a campaign launcher workspace.
- Left side: recent campaigns and resume/load actions.
- Right side: "New Campaign", library entry, settings entry, and summary/help blocks.
- Use stronger framing and campaign metadata instead of isolated buttons floating in space.

### Campaign creation surface

- Convert the current `NewCampaignDialog` wizard into routed steps.
- Step 1: concept, franchise, research toggle, worldbook/library source selection.
- Step 2: DNA editing in a master-detail workspace rather than a transient dialog card grid.
- Right rail: selected sources, franchise/research state, generation warnings, and next-step summary.

### World review surface

- Replace tab-only editing with a list/detail editor model.
- Left pane: sections or entity lists.
- Center pane: active editor/detail.
- Right rail: validation warnings, counts, related entities, and unsaved-change summary.
- Lore editing should fit the same shell rather than feeling like an embedded mini-app.

### Character creation surface

- Use a split workspace:
  - left: input methods (free text, generate, archetype, import, persona/template selection)
  - center: structured character sheet and start-condition editor
  - right: live summary, loadout preview, ontology completeness warnings
- Character creation must become a desktop authoring tool, not a single stacked form plus one resulting card.

### Settings surface

- Keep routed tabs, but place them inside the same shell framing and action/status model.
- Make save state more explicit and less easy to miss.
- Use the right rail for provider health, current role bindings, and warnings.

### Library surface

- Separate reusable source management from campaign concept entry.
- Support browse/select/import in one desktop workspace.
- Keep campaign-specific selection lightweight when used from `/campaign/new`.

## Editing modes

### Recommended desktop modes

- master-detail for review entities
- split compose/preview for character creation
- sticky summary/validation inspector for creation and settings
- route-level progress rather than modal-step progress

## Tailwind

- Implementation must use Tailwind utility classes and existing design tokens where possible.
- Add or refine tokens in existing shared styling seams only when needed for the new shell language.

## shadcn

- Use shadcn-compatible primitives for shell scaffolding: navigation, tabs, dialogs, sheets, command menus, cards, scroll areas, resizable panes if needed, and form primitives.
- Favor composition of existing primitives over bespoke one-off widgets.

## No Custom CSS Files

- No new bespoke CSS files are allowed for Phase 32.
- The workspace design must be achievable with Tailwind, existing global tokens, and compatible component libraries.
- If a new visual pattern cannot be expressed that way, the pattern should be simplified rather than escaping into custom CSS.

## Interaction priorities

- save/continue actions stay visible
- generation progress stays contextual, not full-screen unless blocking
- validation and incomplete fields surface in the right rail
- route changes preserve enough summary context that users do not feel dropped into disconnected screens

## Phase 32 implementation notes

- Start by introducing the shared non-game shell layout before redesigning individual pages deeply.
- Migrate `/campaign/new` first so campaign creation stops being modal-bound.
- Then refactor `/campaign/[id]/review` and `/campaign/[id]/character` into the same shell and editing grammar.
- Treat settings and library as shell adopters, not isolated redesigns.
