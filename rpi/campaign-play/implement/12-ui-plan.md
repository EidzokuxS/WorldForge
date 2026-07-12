# Task 12: Campaign Play UI and copy contract

Date: 2026-07-10  
Route: `/campaign/[id]/play`  
Visual canon: `docs/UI Concept.html`  
Public truth: `CampaignPlayState`, durable turn reads, Campaign Play SSE, public errors, and journal pages  
Status: approved by Droid GLM-5.2 after documentation corrections.

## Player outcome

The page presents one lived moment in the accepted world. It shows only the location, actors, routes, pressures, consequences, and narration that the visibility projection has made public. Suggested actions and freeform text enter the same turn path. The current scene remains readable while a turn runs, and reload restores the durable turn rather than fabricating a local result.

The player can choose a bounded starting location and role, optionally refine arrival and immediate situation, or delegate all starting conditions to the opening planner. Opening runs as turn zero.

## Information architecture

The full-screen play layout has five regions in semantic order:

1. Context strip: campaign navigation, current location, visible presence, and local connection status.
2. Scene context: location description, public player identity, visible routes, visible pressures, and recent consequences.
3. Narration: completed beats and display text.
4. Action dock: up to four suggestions, freeform input, progress, or recovery.
5. Secondary surfaces: compact Character drawer and paginated Journal drawer.

Desktop keeps the stage and action dock visible together. Narrow layouts preserve the same reading order, make the action dock full width, and open Journal as a full-screen drawer.

## Truth ownership

| Visible element | Public owner | Local presentation state |
|---|---|---|
| Phase and input lock | `CampaignPlayState.phase`, `activeTurn.status`, `activeTurn.progress` | none |
| Opening choices | `openingOptions` and their opaque handles | current selection before submit |
| Player identity | `character.name`, `monogram`, `descriptor`, `accent` | drawer open state |
| Current place | `currentLocation.name`, `description` | none |
| Present actors | `visibleActors` | horizontal scroll position |
| Ways onward | `visibleRoutes` | none |
| Immediate pressure | `visiblePressures` | none |
| Narration | `narration.beats`, `displayText` | current beat, Auto preference |
| Suggestions | `narration.suggestedActions` | focus only |
| Stage effects | `narration.effects` | accepted-effect dedupe |
| Consequences | `consequences.causalCue`, `whatChanged`, `whereOrRoute`, `worldTimeLabel` | cue-label mapping and dismissed toast state |
| Journal | `CampaignPlayJournalPage` | drawer, loaded-page cache, focus return |
| Turn recovery | durable turn read `result`, public `errorCode`, `retryEligible` | resume request pending |
| Admission feedback | `CampaignPlayTurnAdmissionResponse` accepted with `202` | local confirmation only; promises admission, not completion |
| Request failure | `CampaignPlayErrorResponse.code` | alert dismissal |
| Consistency | `projectionHash`, `lastEventSequence` | replay and deduplication, hidden from player |
| Connection | transport state | reconnect status only |

Local state never creates narration, player messages, world facts, visible actors, route changes, pressure changes, consequences, suggestions, or turn completion.

## State contract

### Character required

The play route links to campaign character setup. It shows the player-safe message `Create a player character before entering the world.` and the action `Create character`. The page renders no empty stage.

### Opening required

Render a centered arrival card over restrained generic ambience.

- Heading: `Choose your arrival`
- Supporting copy: `Pick a starting point and role, or let the world place you.`
- Location cards: `openingOptions.locationHandle`, `name`, and `description`
- Required selectors: `roles`, `arrivalModes`, and `immediateSituations`
- Secondary action: `Let the world decide`
- Primary action: `Begin`

The chosen request submits only the selected opaque handles. Delegation submits `{ mode: "delegate" }`. The primary action remains disabled until the selected handles still belong to one location option.

### Opening active

The stage carries no location, presence, route, pressure, or narration. The arrival card becomes a progress surface and keeps the character identity visible. `opening_active` ends before public progress reaches `narrating`.

| Public progress | Visible copy |
|---|---|
| `interpreting` | `Preparing your arrival` |
| `settling` | `Placing you in the world` |
| `world_acting` | `The world is moving` |
| `revealing` | `Finding what reaches you` |

An interrupted opening replaces progress with `The opening stopped before it finished.` and one `Resume` action. The page retains the durable opening turn across reload.

### Ready

Render the committed scene and unlock action input.

- Location header uses `currentLocation.name`.
- Scene card uses `currentLocation.description`.
- Presence chips use `visibleActors` only.
- Route affordances use destination, state, and travel-time label from `visibleRoutes`.
- Pressure cards use the public label and summary from `visiblePressures`.
- Narration renders completed beats in order, then the suggestion grid.
- Freeform input label: `Your action`
- Placeholder: `What do you do?`
- Submit action: `Act`

The textarea draft survives reload and reconnect until admission succeeds. A successful `202` clears the submitted draft after the client stores the returned turn identity.

### Turn active

Keep the last committed scene and narration readable. Lock suggestions and freeform input. Show progress in the action dock with player-action copy:

| Public progress | Visible copy |
|---|---|
| `interpreting` | `Reading your action` |
| `settling` | `Applying the result` |
| `world_acting` | `The world is moving` |
| `revealing` | `Finding what reaches you` |

Admission feedback says `Action received`, which promises admission only.

The client renders no optimistic player line and applies no local world mutation.

### Narration pending

The committed scene may already reflect Rulebook results. Input remains locked. Public `narrating` progress reads `Writing the opening` when `activeTurn.turnKind` is `opening`, and `Writing the moment` when it is `player_action`. New narration appears only from the authoritative terminal projection or durable turn result.

### Interrupted turn

Show `The turn stopped before it finished.` with `Resume` when `retryEligible` is true. Transport loss uses separate copy: `Connection lost. The turn may still be running.` The client reconnects and replays before it offers any recovery action.

### Failed turn

Display the error mapped from the public code, refetch `/state`, and unlock according to the refreshed phase. Failed results never offer Resume.

### Journal

The Journal drawer renders earned entries from `CampaignPlayJournalPage`: title, text, world-time label, and consequence cue. Pagination uses `nextCursor`. The UI Concept speaker-attributed transcript Log (`.play__log`) becomes this observation-sourced Journal; no speaker transcript or turn-marked log renders. Search, unread counts, and hidden state remain outside the first slice.

## UI Concept decisions

| UI Concept element | Decision | Public basis or player-value rationale |
|---|---|---|
| Full-screen dark stage and restrained atmospheric plate | Keep | Visual frame only; generic ambience claims no world fact |
| Current-scene card | Keep | `currentLocation`, visible routes, pressures |
| Minimal player card | Keep | Public character identity only |
| Presence chips | Keep | `visibleActors`; accent replaces faction color |
| Narration dock, Next, Auto | Keep | Completed narration; controls change presentation only |
| Choice cards | Keep | `suggestedActions.label` and `choiceHandle` |
| Freeform action input | Keep | Freeform turn admission |
| Stage effects | Keep with restraint | `narration.effects`; prose retains semantic meaning |
| Toast | Keep with constrained copy | Request and turn status only |
| Character drawer | Keep compact | Public identity summary only |
| Journal drawer | Keep | Paginated earned observations |
| Character sprites | Defer | Requires assets and a public asset-binding rule |
| Dynamic location art | Defer | Requires a public visual key; generic ambience serves the first slice |
| Inventory | Defer | Mechanical inventory authority belongs to a later contract |
| Global Map | Defer | Current public truth contains visible routes, not full topology |
| Journal search and unread badge | Defer | Query and unread ownership are absent |
| Special Continue | Remove | Wait remains an ordinary visible suggestion through the Judge path |
| Oracle control, badge, roll card, or reasoning log | Remove | Public state exposes no Oracle discriminator or hidden reasoning |
| Debug tray and raw log | Remove | Protected runtime and provider state |
| Scene quote attribution and named dock speaker | Remove | Narration carries text and beats without a speaker owner |
| Stage scene-quote overlay (`.play__quote`) | Remove | Narration beats carry the text; public state has no speaker owner for attribution |
| Turn and scene numbers | Remove | Opaque IDs have no player-facing ordinal meaning |
| HP, equipment pills, item counts | Remove | Current mechanics owns none of these values |
| Faction styling and labels | Remove | Factions are absent from the product entity model |
| Hidden nearby actors and `oracle pending` | Remove | Visibility has not made them public |
| Save time or autosave claim | Remove | Public DTO carries consistency tokens rather than a save timestamp |

## Component contract

Task 13 owns transport and durable page state. Tasks 14A and 14B implement these components:

| Component | Required states |
|---|---|
| `CampaignPlayPage` | eligibility guard, opening setup, opening active, ready, active turn, narration pending, interrupted, failed |
| `CampaignPlayStage` | generic ambience, settled scene, reduced motion |
| `SceneCard` | location, presence, routes, pressures, consequences |
| `NarrationDock` | completed beats, local Next/Auto, empty during opening setup |
| `ActionDock` | suggestions, freeform draft, locked progress, resume, public error |
| `TurnProgress` | five public progress labels, reconnect state |
| `ConsequenceCard` | cue label from `causalCue`, `whatChanged`, `whereOrRoute`, `worldTimeLabel` |
| `JournalDrawer` | loading, page, pagination, empty earned journal, failure |

## Responsive contract

Desktop at 1440px and above:

- narration stays within 78ch;
- choices use a responsive grid with up to four cards;
- Character and Journal triggers remain visible;
- scene context and action dock fit in one viewport at common 16:9 sizes.

Narrow at 390px:

- use `100dvh` and safe-area padding;
- order location, presence, scene context, narration, suggestions, and freeform input vertically;
- make presence a horizontal scroller;
- use one choice per row;
- keep textarea and `Act` visible above the software keyboard through an internally scrollable dock;
- open Journal full screen;
- omit decorative player and scene cards when they duplicate visible content.

The page uses 44 by 44 pixel minimum targets. Persistent labels replace hover-only meaning. The textarea has a visible label.

## Motion and effects

Effects run once per accepted narration artifact and beat. SSE replay and reload never retrigger them.

Default motion:

- `fade`: opacity transition;
- `flash`: short luminance pulse;
- `shake`: brief stage translation;
- `danger`: static tint with one restrained pulse;
- `pause`: beat timing only.

With `prefers-reduced-motion: reduce`:

- render all completed beats immediately;
- default Auto to off;
- suppress cursor blink, typewriter behavior, entrance motion, shake, flash, pulse, smooth scrolling, and forced pauses;
- translate each effect into a static border, tint, or icon treatment;
- keep the effect's meaning in narration text.

## Accessibility and focus

- Use a polite status region for progress and connection changes.
- Use an alert region for errors.
- Announce a completed narration beat once; character-by-character updates remain silent.
- After admission, move focus to progress.
- After completion, move focus to narration or the suggestions heading.
- Escape closes drawers and restores trigger focus.
- Full-screen narrow drawers trap focus while open.
- Disable single-key shortcuts while textarea or selector controls own focus.
- Pair every color cue with text, shape, or icon.
- Preserve semantic order: context, scene, narration, choices, freeform action, secondary drawers.

## Public cue and error copy

Consequence cue labels are a local exhaustive mapping over the public union:

| Public cue | Visible label |
|---|---|
| `your_action` | `Your action` |
| `direct_perception` | `You notice` |
| `visible_aftermath` | `Visible aftermath` |
| `route_change` | `Route changed` |
| `witness_report` | `Reported to you` |

| Error code | Player copy | Next action |
|---|---|---|
| `campaign_not_found` | `Campaign unavailable.` | `Return to campaigns` |
| `world_not_accepted` | `Accept the world before play.` | `Open World Review` |
| `world_not_playable` | `This world needs attention before play can begin.` | `Open World Review` |
| `character_required` | `Create a player character before entering the world.` | `Create character` |
| `character_already_exists` | `This campaign already has a player character.` | `Reload character` |
| `opening_required` | `Choose how you enter the world.` | `Choose arrival` |
| `opening_already_completed` | `The opening has already been played.` | `Reload scene` |
| `invalid_character` | `Review the character details and try again.` | `Review character` |
| `invalid_starting_conditions` | `Those starting conditions are no longer available.` | `Choose again` |
| `invalid_intent` | `Describe an action grounded in the current scene.` | `Edit action` |
| `invalid_choice` | `That option is no longer available.` | `Reload scene` |
| `stale_world_version` | `The world changed before the action was accepted.` | `Reload scene` |
| `stale_runtime_revision` | `The turn state changed before the action was accepted.` | `Reload scene` |
| `turn_in_progress` | `A turn is already in progress.` | `View progress` |
| `turn_not_found` | `That turn is unavailable.` | `Reload scene` |
| `turn_not_resumable` | `This turn cannot resume.` | `Reload scene` |
| `turn_interrupted` | `The turn stopped before it finished.` | `Resume` |
| `service_unavailable` | `The game service is temporarily unavailable.` | `Try again` |

The UI displays none of the internal phase, version, revision, turn ID, provider, model, strategy, prompt, or protected payload fields included in the machine-readable error.

## Implementation evidence targets

Task 14 captures these product states from the real route:

1. `opening-required-desktop.png`, 1440 by 900, chosen and delegated entry visible.
2. `opening-required-narrow.png`, 390 by 844, selector and primary action usable.
3. `opening-active-processing.png`, empty scene with authoritative progress.
4. `opening-active-interrupted.png`, persistent Resume state after reload.
5. `ready-scene-desktop.png`, location, visible actors, narration, four or fewer suggestions, and freeform dock.
6. `ready-scene-narrow.png`, single-column reading and action flow.
7. `turn-active.png`, committed scene preserved with locked input and progress.
8. `narration-pending.png`, settled scene with narrator progress.
9. `journal-desktop.png` and `journal-narrow.png`, earned entries and pagination.
10. `public-error.png`, player-safe copy and correct next action.
11. `reduced-motion.png`, static effect treatment with the same narration.
12. `turn-interrupted.png`, committed scene preserved with Resume during a player-action interruption.
13. `character-required.png`, guard message and Create character action with no empty stage.
14. `turn-failed.png`, terminal failed-turn copy after the authoritative refetch; `public-error.png` remains the request-failure case.

Later keyboard and browser checks verify focus order, target size, contrast, software-keyboard behavior, drawer focus, live-region announcements, and replay-safe effects.

## Verification gate

Task 12 changes documentation and the Task 2A public contract amendment only. Production UI stays untouched. Verification requires:

- every visible datum mapped to a public owner or local presentation state;
- zero placeholder Inventory, Map, Debug, Oracle, faction, speaker, save-time, or turn-number data;
- shared build, focused contract tests, and backend typecheck after the opening-options amendment;
- Droid GLM-5.2 Coding Plan verdict with zero blockers;
- humanizer/deslop review of all visible copy;
- exact component states and screenshot targets recorded above.

Standalone UI smoke additions: 0.
