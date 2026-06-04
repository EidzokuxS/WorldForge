# WorldForge-v4 Reality Audit

Date: 2026-05-02

Scope: `docs/WorldForge-v4/index.html` visual prototype only. This is not Phase 77 execution and does not claim the real app has been redesigned.

## Audit Method

I compared visible prototype controls against the current app contracts in:

- `frontend/components/campaign-new/concept-workspace.tsx`
- `frontend/components/campaign-new/dna-workspace.tsx`
- `frontend/components/title/utils.ts`
- `frontend/app/(non-game)/settings/page.tsx`
- `frontend/components/settings/*`
- `frontend/components/character-creation/*`
- `frontend/components/library/library-workspace.tsx`
- `frontend/components/non-game-shell/app-sidebar.tsx`
- `shared/src/settings.ts`
- `shared/src/types.ts`

## Evidence Snapshot

- Campaign concept fields: `frontend/components/campaign-new/concept-workspace.tsx:55`, `:66`, `:83`, `:96`, `:170`.
- World DNA card set: `frontend/components/title/utils.ts:21-31`.
- Settings tabs: `frontend/app/(non-game)/settings/page.tsx:87-108`.
- Provider management: `frontend/components/settings/providers-tab.tsx:221`.
- Role config testing/routing surface: `frontend/components/settings/roles-tab.tsx:44-113`, `frontend/components/settings/role-config-card.tsx:64`.
- Image settings: `frontend/components/settings/images-tab.tsx:38`.
- Gameplay raw reasoning: `frontend/components/settings/gameplay-tab.tsx:30`.
- Research settings: `frontend/components/settings/research-tab.tsx:38`.
- Built-in providers and role names: `shared/src/settings.ts:8-72`, `shared/src/types.ts:46-59`, `:101-104`.
- Character import modes and accepted files: `shared/src/types.ts:596`, `frontend/components/character-creation/character-form.tsx:83`, `:185-186`, `:348`, `:365-366`.
- Worldbook library import/list/export/delete: `frontend/components/library/library-workspace.tsx:30`, `:59-67`, `:93`, `:134-137`.
- Non-game shell routes/unlocks: `frontend/components/non-game-shell/app-sidebar.tsx:47`, `:65-78`, `:141`.

## Status Legend

- `REAL`: exists in current product code or shared types.
- `TARGET-UI`: desired design direction, but not guaranteed by current backend/frontend.
- `NEEDS-BACKEND`: visible idea is useful but must not be presented as existing behavior.
- `REMOVED`: was speculative or contradicted the product and has been removed from visible prototype UI.

## Reality Matrix

| Surface | Prototype state after audit | Reality status | Evidence |
| --- | --- | --- | --- |
| New Campaign: name, premise | Kept | REAL | `concept-workspace.tsx` has `Campaign Name` and `Premise`. |
| New Campaign: Franchise / IP | Kept | REAL | `concept-workspace.tsx` exposes `campaignFranchise`. |
| New Campaign: Research Mode | Kept | REAL | `concept-workspace.tsx` exposes research toggle. |
| New Campaign: source/worldbook selection | Renamed from "Ingredients" to "Sources" | REAL | `concept-workspace.tsx` supports worldbook source selection and `Open Library`. |
| New Campaign: Tone chips | Removed | REMOVED | No matching field in current campaign creation flow. Tone may emerge from prompt/DNA later, but is not a current input control. |
| New Campaign: Player seat | Removed | REMOVED | Current player character is created after generation via character flow, not in concept form. |
| New Campaign: stage sequence | Changed to Concept -> World DNA -> Generate world -> World Review -> Character | REAL-ish | Matches current flow better than the previous invented 5-stage phrasing, though copy remains prototype-level. |
| World DNA cards | Changed to Geography, Political Structure, Central Conflict, Cultural Flavor, Environment, Wildcard | REAL | `WORLD_DNA_CARDS` in `frontend/components/title/utils.ts`. |
| Worldgen live progress | Kept as target presentation | TARGET-UI | Real SSE progress exists, but the exact cinematic stream layout is prototype UI. |
| World Review: tabs/cards | Kept as inspection concept | TARGET-UI | Real world review exists; dossier/tarot styling and hidden-thread presentation are visual targets. |
| Character import formats | Changed to `.json` and `.png with tEXt chunk` | REAL | `character-form.tsx` accepts `.json,.png` and names SillyTavern V2/V3. |
| Character import mode | Changed to Native resident / Outsider | REAL | `CharacterImportMode = "native" | "outsider"`. |
| Character import roles: Player / Named NPC / Flashback voice / Ghost | Removed | REMOVED | The real import flow chooses native/outsider and saves player draft; these role choices do not exist. |
| Character import "Save card to library" | Removed | REMOVED | No current character-card library save action was found. |
| Import confidence / token estimates | Removed from visible meaning; replaced with provenance-style facts | REMOVED/NEEDS-BACKEND | The current flow has provenance/import mode; confidence/tokens were mock-only. |
| Settings tabs | Changed to Providers, Roles, Images, Gameplay, Research | REAL | `settings/page.tsx` tab list. |
| Provider management | Added visible `+ Add provider` and configured provider cards | REAL | `providers-tab.tsx` has `Add Provider`, edit/test/delete. |
| Built-in providers | OpenAI, Anthropic, OpenRouter, Ollama | REAL | `shared/src/settings.ts`. |
| Role routing | Changed to Judge, Storyteller, Generator, Embedder | REAL | `shared/src/types.ts` and `roles-tab.tsx`. |
| Settings: Senses / Playback / Data & saves | Removed from rail | REMOVED | Not current settings tabs. |
| Settings: raw reasoning | Kept under Gameplay | REAL | `gameplay-tab.tsx` has `Show raw reasoning`. |
| Settings: image generation | Kept | REAL | `images-tab.tsx` has enable/provider/model/style settings. |
| Settings: research agent | Kept | REAL | `research-tab.tsx` has enable/max steps/search provider. |
| Home active campaign context | Simplified | REAL-ish | Real launcher has campaigns and load/delete; prototype visual treatment remains target UI. |
| Home fake tags like "Oracle pending" / plot-specific watcher tags | Removed from visible cards | REMOVED | These were invented status tags, not current global state. |
| Play VN stage, Next/Auto/Log, effect cards | Kept | TARGET-UI | This is the desired Marinara-inspired play surface, not a claim that backend already emits typed visual effect beats. |
| Play debug drawer / oracle trace | Kept as debug-mode concept | TARGET-UI/NEEDS-BACKEND | Real observability exists in pieces; the exact drawer is a design target. |
| Worldbook library | Kept | REAL/TARGET-UI | JSON import/list/export/delete exist; card styling and "token" copy must stay conservative. |

## 2026-05-02 Follow-up Audit Notes

The current prototype direction remains usable as a visual base, but it still diverges from product reality in these places:

- Play has an attractive scene stage, but the side space is underused. The stage needs attached game widgets such as player mini-card, location/map hint, inventory/journal, visible actors, and scene clocks rather than a detached icon rail floating in empty black space.
- The VN dock is not yet ergonomic enough: text, controls, `Continue`, and freeform input must share a centered reading/action lane. Remove player-facing chunk counters and remove the separate `Speak` button.
- Home and campaign library still duplicate resume affordances. `Play`, `Continue Session`, and campaign row click need distinct meanings or one of them should be demoted.
- Campaign statuses like `Active`, `Paused`, `Retired`, `Bleeding`, and fake `Playing` chips are not supported as current campaign lifecycle states. Do not use them as product truth.
- `Worlds in Progress` is imprecise. Use `Campaigns`, `Worlds`, or a real state-specific label such as `Generating`.
- World DNA cards need room for real one-to-five sentence content and per-card/reroll-all controls.
- Worldgen must show the actual ten-step post-DNA pipeline, not a simplified five-stage fiction.
- NPC import belongs in the World Review NPC tab before play. Player character creation is a separate post-review flow after saving the world.
- Character/NPC lists need a click-through detail surface for powers, weaknesses, goals, personality, placement, and advanced record before the prototype can be considered implementation-ready.
- Section names should be less theatrical where they are controls or review tools: prefer `Characters`, `NPCs`, `World DNA`, `Campaigns`, and `Review` over prophecy-style labels.

## Corrections Applied

- Removed visible campaign controls that do not exist: `Tone`, `Player seat`.
- Removed invented import roles: `Named NPC`, `Flashback voice`, `Ghost`.
- Removed invented import action: `Save card to library`.
- Replaced fake settings categories with the real settings tabs and role names.
- Added visible provider management before role assignment.
- Replaced made-up DNA labels with the real six `WORLD_DNA_CARDS`.
- Removed fake preview state tags from Home cards.
- Removed duplicate Home breadcrumb/model strip and rail provider status; the rail owns navigation context, Settings owns provider routing.
- Recorded remaining mismatches: duplicate resume controls, invented campaign lifecycle states, short DNA cards, fake generation step count, standalone import page, and missing character detail drill-in.

## Remaining Design Target Boundaries

The Play screen intentionally remains ahead of current implementation because it is the visual target for the approved direction: scene-first VN/RPG presentation with persistent text chunks, log, autoplay, effect beats, and hidden debug drawers. Until backend/frontend work lands, those pieces must be treated as `TARGET-UI`, not as existing product behavior.

Future implementation plans must split each target into:

1. Existing data already available.
2. Adapter/UI work only.
3. Backend event/state work needed.
4. Mock copy that must be replaced by live data.

## Rule For Future Prototype Work

Every visible control or status chip in a WorldForge prototype needs one of these labels in the design artifact: `REAL`, `TARGET-UI`, `NEEDS-BACKEND`, or `MOCK-COPY`. If it cannot be classified, remove it until the product contract is clear.
