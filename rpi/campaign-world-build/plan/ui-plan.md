# Campaign World UI plan

Status: ALIGNED — DROID GLM-5.2

## Visual source

`docs/UI Concept.html` is the style authority. The current frontend already carries its core tokens and component language in `frontend/app/globals.css`:

- near-black layered surfaces from `#08080a` through `#1f1f26`;
- bone text with ember, cold blue, gold, warning, and success accents;
- Fraunces for display, Inter Tight for prose, Inter for controls, and JetBrains Mono for labels and telemetry;
- low radii, fine borders, restrained gradients, editorial spacing, and uppercase mono kickers;
- 120ms control feedback, 240ms layout transitions, and a single opacity-only ember marker for active work.

The Campaign World slice reuses this system. Initials, domain glyphs, CSS marks, and existing tarot silhouettes cover the required graphics. This slice requires no generated image asset.

## Product boundary

Forge owns source review, optional World DNA editing, build start, durable progress, failure recovery, and the handoff to World Review. World Review owns the persisted world projection and acceptance. The current goal ends at an accepted world; Player Character and session launch remain unavailable.

Player-facing build stages map directly to persisted events:

| Player label | Durable stage |
|---|---|
| Locations | `world_frame` |
| Actors | `world_cast` |
| Connections | `world_connections` |
| Review preparation | `validation` and `persistence` |

The active build surface presents event-derived stage state and elapsed time. Entity cards appear after the atomic world commit, because the API publishes the completed world rather than partial model packets. Provider output, reasoning, prompt text, and debug trace stay outside the player surface.

## Forge workspace

### Source editing

- Keep the campaign shell and Campaign World breadcrumb.
- Use the generation workspace structure already expressed by `wf-gen-shell`: a stage rail plus one editorial main column.
- Lead with the campaign premise in a readable prose panel.
- When World DNA exists, render six compact editable seed cards in the established DNA card language. Premise-only campaigns show the premise as the complete source and offer an optional World DNA editing section.
- Place `Create world` as the single primary action. A changed DNA draft saves through the Campaign World DNA endpoint before build creation.
- Treat DNA edits as a local draft until `Create world` is activated. Navigation or reload discards edits that have not started a build; the surface adds no autosave, blur persistence, leave persistence, or secondary Save control.
- Show source references and research summary through a collapsed provenance section after the primary source content.

### Active build

- The rail shows Locations, Actors, Connections, and Review preparation with pending, active, and completed states.
- The active row uses a new opacity-only ember stage marker; it does not reuse the existing box-shadow `pulse-ember` keyframe. Completed rows use the existing success mark. Pending rows retain muted mono labels.
- The header shows `Building the world.` with elapsed time and persisted sequence progress.
- The main activity panel names the current stage and describes its product result in one sentence. It contains no model thought stream.
- A compact ledger below the activity panel lists committed stage-lifecycle events by sequence: build start, stage start, stage completion, build completion, and a terminal failure state. It supports reload and SSE resume without becoming a debug console. A `build_failed` event changes the terminal row state; its `errorCode` never appears as progress telemetry, and its player-safe `message` appears only in the failure notice.
- Controls remain limited to navigation away from the screen; the build continues independently from the subscriber.

### Failure

- Replace the activity panel with a bordered failure notice using the stable player-safe message from the API.
- Keep completed stage marks and the final failed stage visible in the rail.
- Restore the editable source surface below the notice when the state is `failed`.
- Provide one primary `Start build again` action. The next click creates a separate build attempt.

### Review-ready and accepted

- After a terminal completion event, reload `/world/state` and transition only when the persisted status is `review`.
- Show a short review-ready confirmation while routing to World Review.
- An accepted campaign renders a compact source summary with `Open World Review`; source controls remain read-only.

## World Review

### Header and navigation

- Keep the concept's editorial header, sticky top boundary, horizontal mono tabs, and ember underline.
- Header copy uses the campaign name and a concise source summary.
- Review tabs are `Overview`, `Locations`, `Actors`, `Connections`, and `Source`.
- The header primary action is `Accept world` in `review`. In `accepted`, replace it with an accepted status mark and preserve the same inspectable content.

### Overview

- Show five compact stats: locations, routes, people, collectives, and pressures.
- Present the persisted world summary at a maximum 64-character reading measure.
- Add source provenance: premise, optional World DNA presence, research/source reference count, world version, and a shortened content hash.
- Link to Locations, Actors, and Connections with ordinary focusable buttons.

### Locations

- Adapt the concept's location rows: stable location label, name, kind, description, starting marker, parent location, and outgoing route count.
- Selecting a location reveals its directed outgoing routes and their travel costs. Route endpoints navigate by persistent location ID.
- Starting location uses ember; ordinary routes use neutral borders; route emphasis uses cold blue.

### Actors

- People and collectives share one card grammar and one details surface.
- Group cards by key, support, and background role while retaining a visible `person` or `collective` kind label.
- Each card shows name, summary, traits, placement summary, and active-goal count.
- Selecting a card opens details for goals, placements, and directed relations. Every actor and location link navigates by persistent ID.
- Initials and the existing tarot silhouette provide visual identity. Collective actors use the same silhouette with a collective glyph label.

### Connections

- Split the surface into `Relations` and `World pressures`.
- Relation rows show source actor, direction, relation type, target actor, summary, and intensity. Actor names are focusable stable-ID links.
- Pressure cards show name, description, trajectory, urgency, actor anchors, and location anchors.
- Urgency 4–5 uses an ember high-urgency label and border, urgency 3 uses a gold medium-urgency label and border, and urgency 1–2 uses a neutral low-urgency label and border.
- Relation intensity renders as explicit text such as `3 of 5` plus a five-tick meter. The text is the authoritative value; the meter is a redundant visual cue rather than a color-only encoding.
- Cold blue marks navigable anchors. Text and icons carry the same meaning for color-independent reading.

### Source

- Show the exact persisted source snapshot used for the build: premise, optional World DNA, research summary, and source references.
- Keep source content read-only in review and accepted states.

### Acceptance and conflict

- `Accept world` submits the displayed version and content hash.
- While the request is pending, keep the button disabled and preserve the displayed review.
- A matching receipt changes the header to accepted and survives reload.
- A stale conflict places an inline notice under the header, reloads current state, and keeps acceptance available against the refreshed version.

## Narrow viewport

At widths up to 1024px:

- the Forge stage rail becomes a horizontally scrolling strip above the main column;
- headers stack, progress occupies the full width, and content gutters reduce to 20–24px;
- primary actions span the available width when needed and remain clear of safe-area insets;
- review tabs scroll horizontally with visible focus treatment;
- overview stats use two columns, with the final stat spanning the row when necessary;
- location rows become a single-column reading order;
- actor cards use one column and actor details appear directly below the selected card;
- relation endpoints and pressure anchors wrap without horizontal page overflow.

## Accessibility and motion

- Meet WCAG AA contrast for all text and controls.
- Use `--fg-2` or a lighter token for every small mono kicker, stage sub-label, badge, sequence/progress value, count, and other informational text. Reserve `--fg-3` for non-text separators, inactive rail chrome, and decorative marks because it does not meet normal-text contrast on `--bg`.
- Use semantic headings, tabs, buttons, lists, and status regions.
- Announce persisted build events through one polite `aria-live` region without repeating the entire ledger.
- Preserve keyboard order from stage rail to main content to primary action.
- Focus rings use the existing ember ring plus a visible outline offset.
- The Campaign World active-stage pulse and arrival transitions use opacity and transform only.
- Add a global `@media (prefers-reduced-motion: reduce)` rule that disables `pulse-ember`, `shimmer`, `pulse-text`, `blink`, the Campaign World stage pulse, and arrival/entrance animations while preserving completed, active, failed, and accepted colors and marks.
- Color always pairs with text, icon, border, or status wording.

## Campaign shell status

- Derive campaign shell state exclusively from `/api/campaigns/:id/world/state`; `generationReady` and `generationComplete` cease to be navigation or status inputs.
- Render the five lifecycle labels as `World awaits creation`, `World is taking shape`, `World ready for review`, `World build needs attention`, and `World accepted` for `unbuilt`, `building`, `review`, `failed`, and `accepted` respectively.
- Route unbuilt, building, and failed campaigns to Forge. Route review and accepted campaigns to World Review.
- These strings were checked against the humanizer and deslop guidance for direct, product-specific language and remain subject to the repeated GLM plan review below.

## Required screenshots and tests

Implementation captures desktop and narrow viewport screenshots for:

- Forge source editing;
- active build at Connections;
- terminal failure;
- review Overview;
- review Actors with a selected collective;
- review Connections;
- accepted World Review.

Component tests cover premise-only source, edited DNA, active event replay, reload and sequence deduplication, terminal failure, review persistence, stable-ID navigation, stale acceptance, matching acceptance, and accepted reload.

## Review record

- Prompt: `.codex/droid-prompts/campaign-world-ui-plan-review.md`
- Model: `custom:GLM-5.2-(Z.AI-Coding)-0`
- First verdict: `REVISE` — motion/reduced-motion, contrast, shell copy, urgency/intensity, failure-ledger, and DNA-draft semantics required clarification.
- First stdout: `.codex/agent-logs/droid-campaign-world-ui-plan-20260710-020043.out.log`
- First stderr: `.codex/agent-logs/droid-campaign-world-ui-plan-20260710-020043.err.log` (known MCP reload warning only)
- Humanizer/deslop note: shell labels and added interaction copy use concrete domain language, short sentence shapes, and no generic assistant phrasing.
- Re-review verdict: `ALIGNED`
- Re-review stdout: `.codex/agent-logs/droid-campaign-world-ui-plan-rereview-20260710-020710.out.log`
- Re-review stderr: `.codex/agent-logs/droid-campaign-world-ui-plan-rereview-20260710-020710.err.log` (known MCP reload warning only)
