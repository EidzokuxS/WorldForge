# WorldForge Playability Recovery Implementation Plan

**Intent:** Make WorldForge playable from normal launch through opening scene,
first custom action, and the first 10-30 turns before claiming long-play
stability.

**Current Behavior:** The project has many green slice tests and narration
proofs, but the real launch path can still produce a first screen that feels
like a world-state/debug dump. Broad-location NPCs, hidden-nearby counts, and
thin opening evidence can appear as player-facing scene truth.

**Expected Outcome:** A player can generate/load a world, create/enter a
character, press Continue, receive a directed playable opening scene, type a
custom action, and play at least 10 turns without seeing debug state, hidden
rosters, fallback/recovery as gameplay, or receipt prose.

**Target-Perspective Output:** The player sees a concrete scene, immediate
pressure, visible/sensed handles, usable routes/actions, quick suggestions, and
an always-available custom action box. The scene reads like a GM opening, not a
database report.

**Truth Owner:** Backend typed owners own hard facts: movement, custody, time,
injury/condition, resources, routes, hidden facts, relationships, durable world
events, important affordances, saves, and recovery. Stage 6 owns presentation
only. UI owns player-facing perception and should be stricter than raw backend
state.

**Contract Boundary:** Opening and normal turns cross from typed backend facts
to narrator/UI through player-perceivable packets. Broad location, hidden
actors, internal refs, draft/provenance data, and debug counters do not cross as
scene truth.

**Cutover:** Treat `docs/playtest/launch-to-longplay-gameplay-contract.md` as
the acceptance baseline. Treat the Opening Gameplay Gate as the next required
shipping gate before any broader prose or long-play claim.

**Displaced Path:** Demote slice-only proof, broad-location visible fallback,
hidden-nearby UI counts, one-line opening smoke, and any legacy/fallback path
that can create wrong player-facing scene truth.

**Value Density:** Highest value is the smallest real game loop: Continue ->
opening scene -> first custom action -> 10-turn coverage. Long-play work waits
until this loop is clean.

**Acceptance Evidence:** A real launch-path proof with artifacts: world/player
state, opening SSE, first screen screenshot or transcript, world payload,
narration prompt/output, first custom action result, and 10-turn transcript with
per-turn state deltas.

**Evidence Lane:** Fresh generated or cloned zero-turn campaign using a known
failure premise such as Shibuya/Kafka/Esdeath. Then a 10-turn manual lane, then
30-turn lane with at least one background-world signal.

**Kill Criteria:** Remove or disable live broad-location actor fallback for
gameplay presence. Remove hidden-nearby player-facing counts. Do not keep a
second opening path. Do not accept compatibility paths in live gameplay unless
they have a named migration and removal date.

**Architecture Slice:** Launch/opening/UI seam first:
`backend/src/routes/chat.ts`, `backend/src/engine/turn-processor.ts`,
`backend/src/engine/scene-assembly.ts`, `backend/src/engine/scene-presence.ts`,
`backend/src/routes/campaigns.ts`, `frontend/app/game/page.tsx`,
`frontend/components/game/play-surface/presence-layer.tsx`, quick-action and
narration-dock surfaces as needed.

**Plan Review Gate:** Requires PRE review before execution. Current partial
opening/UI edits in the worktree are considered implemented but unproven until
they pass this plan's Opening Gameplay Gate.

## Source Artifacts

- Product contract:
  `docs/playtest/launch-to-longplay-gameplay-contract.md`
- Oracle request:
  `tasks/oracle-launch-to-longplay-diagnosis-prompt.md`
- Oracle response:
  `tasks/oracle-launch-to-longplay-diagnosis-response.md`
- Prior prose proof:
  `docs/narration/p336-live-prose-review-r29.md`
- Prior soft-prose handoff:
  `tasks/handoff-2026-06-15-p334-stage6-soft-prose-contract.md`

## Phase 0: Freeze The Frame

Allowed scope:

- Document the baseline and current partial patch state.
- Do not commit current opening/UI patch as accepted.
- Run GitNexus impact before editing any symbol.

Expected output:

- Plan and goal files exist.
- `tasks/todo.md` records that launch-to-longplay acceptance supersedes
  slice-only playability claims.

Verification:

- `git status --short` lists only intentional planning/current partial files.

Acceptance evidence:

- This plan plus Oracle response are present and referenced.

Parallelizable: no.

## Phase 1: Opening Gameplay Gate

Allowed files:

- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/scene-presence.ts`
- `backend/src/routes/campaigns.ts`
- `frontend/app/game/page.tsx`
- `frontend/components/game/play-surface/presence-layer.tsx`
- focused tests beside those modules

Implementation intent:

- Opening packet contains immediate player-perceivable scene evidence, not broad
  roster summaries.
- Macro starts use a local playable lens as scene presentation, with the macro
  only as parent context.
- Visible actor chips come only from clear immediate scene actors.
- Hidden/broad counts are absent from player-facing gameplay UI.
- Hint signals are non-identifying and actionable or omitted.
- Opening produces 2-5 playable beats and a control handoff.
- Custom action box remains available once ready.

Displaced path:

- Broad-location fallback as gameplay presence.
- Hidden-nearby player-facing counts.
- One-line opening smoke.

Verification commands:

- Focused backend tests for opening packet/presence projection.
- Focused frontend tests for presence layer/game page.
- `npm --prefix backend run typecheck`
- frontend type/test command used by the repo for game page components.

Acceptance evidence:

- Fresh Shibuya/Kafka/Esdeath opening does not name Kafka/Esdeath unless directly
  clear in immediate scene.
- No "nearby, not visible" player-facing UI.
- Opening has playable scene, pressure, visible/sensed handles, routes/actions.
- First custom action, e.g. "look around", resolves through normal runtime.

Parallelizable: backend and frontend focused tests can run in parallel after
impact analysis and code changes.

## Phase 2: First 10-Turn Gate

Allowed files:

- Runtime prompt/settlement/stage4 files only if the 10-turn lane exposes a
  real ownership gap.
- Test/proof scripts may be added only if they record actual manual choices and
  artifacts.

Required coverage:

- look/direct scene;
- custom action;
- quick action or continue;
- movement or route inquiry;
- dialogue or no-match speaker handling;
- ordinary prop/surface action;
- hidden/mechanical follow-up;
- inventory/status when applicable;
- wait/ignore crisis or low-stakes action;
- first visible background-world signal if available.

Verification:

- Manual play through actual backend/app path.
- Store transcript, SSE, world payload before/after each turn, state deltas,
  current scene payload, quick-action payloads, and human notes.

Acceptance evidence:

- No player-facing failed turn.
- No restore/replay/fallback as normal gameplay.
- No private/backend refs.
- Prose readable by human review.
- Custom actions remain first-class.

Parallelizable: no, because actions are manually chosen from the current state.

## Phase 3: First 30-Turn Gate

Required coverage:

- several location moves;
- route options and route status;
- visible actor interaction;
- support actor materialization or bounded no-match;
- item custody or explicit transfer;
- ordinary soft detail later targeted and adjudicated;
- hidden/mechanical follow-up;
- one committed background-world signal reaches player-facing channels.

Verification:

- Same artifact shape as Phase 2.
- Add a short human prose/playability review packet.
- Run advisory prose audit only as secondary evidence.

Acceptance evidence:

- The game feels like an ongoing session, not a room demo.
- World state changes are visible through normal channels.
- Soft prose stays non-authoritative until targeted.

Parallelizable: no for play; audit/report generation can run after.

## Phase 4: 60-Turn And Long Horizon

Defer until Phases 1-3 pass.

Required evidence:

- Two fresh zero-turn worlds to 60 manually chosen turns.
- One clone/provenance run.
- Longer 300+/600+ soak or replay with manifest.

Manifest fields:

- commit and dirty status;
- campaign/clone ids;
- transcript;
- per-turn artifacts;
- world clock/version;
- accepted state deltas;
- due-world/proposal outcomes;
- pending narration/recovery status;
- human notes.

Acceptance evidence:

- Stable readable play over distance.
- Autonomous world motion reaches the player without prose mining.

Parallelizable: lanes can run independently after gate readiness.

## Files To Avoid Initially

- Large Stage 6 prose rewrites before opening/UI projection is fixed.
- New validators, regex filters, repair loops, fallback narrators, or
  deterministic narrator replacement.
- Legacy compatibility paths except for explicit deletion/demotion work.
- Worldgen rewrites unless launch proof shows generated data cannot supply a
  playable opening scene.

## PRE Review Questions

Before implementation, review:

1. Does this plan remove or demote every path that can show broad-location
   roster as immediate scene truth?
2. Does the opening packet have enough player-facing evidence for a real first
   beat?
3. Does UI perception stay stricter than raw world state?
4. Does first custom action prove the same runtime path as quick actions?
5. Is the live proof real launch-path evidence, not a clone-only narration lane?
6. Are all fallbacks deleted, demoted, or scoped as migrations with kill
   criteria?
