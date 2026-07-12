# Task

Review the deterministic player-visible copy for Campaign Play visibility projection. Return a concise verdict and exact replacements where needed. Do not edit files.

# Product context

The player lives inside a world that continues without centering every event on them. The visibility service turns an earned, typed observation into a journal entry and an optional consequence. The narrator receives only this public packet.

Code owns observation facts, opaque handles, names already visible at the current location, route state, world time, and causal cues. Model text, player input, hidden goals, internal IDs, private actor state, and protected event payloads never enter these templates.

# Candidate templates

Observation titles:

- direct perception: `Seen nearby`
- local aftermath: `Signs left behind`
- route state: `Route update`
- witness report: `{visibleWitnessName}'s account`

Generic observation text:

- direct perception: `You notice a change nearby.`
- local aftermath: `Something changed here before you arrived.`
- route state without a committed route state: `Something has changed along the route to {visibleDestinationName}.`
- route state with a committed state: `The route to {visibleDestinationName} is {open|restricted|blocked}.`
- witness report: `{visibleWitnessName} tells you about a change they witnessed.`

Mechanical observation text where code has a safe typed result:

- player movement: `You arrived at {visibleLocationName}.`
- visible actor movement: `{visibleActorName} moved through {visibleLocationName}.`
- local movement aftermath: `Recent tracks show movement through {visibleLocationName}.`
- visible actor condition: `{visibleActorName} appears {occupied|strained|incapacitated}.`
- local pressure: `{visiblePressureName} has intensified.` or `{visiblePressureName} has eased.`

Location/route labels:

- location: `{visibleLocationName}`
- route: `Route to {visibleDestinationName}`
- time: `Day {oneBasedDay}, {HH}:{MM}`

Available action labels:

- current location observation: `Look around`
- route movement: `Go to {visibleDestinationName}`
- visible actor contact: `Talk to {visibleActorName}`
- waiting: `Wait`

# Review criteria

1. Copy reads like a restrained game journal rather than system telemetry.
2. Generic templates state only what the exposure channel proves.
3. Templates avoid implying a hidden cause, actor, goal, faction, or timeline detail.
4. Copy keeps the world independent from the player and avoids heroic framing.
5. Labels are short enough for a choice surface.
6. Apply `humanizer` and `deslop` criteria: direct language, no filler, grandiosity, AI cadence, em dash, or formulaic contrast.

# Constraints

- Preserve deterministic code-owned templates.
- Preserve earned visibility and opaque handles.
- Keep `your_action`, `direct_perception`, `visible_aftermath`, `route_change`, and `witness_report` as typed causal cues outside prose.
- No fallback text sourced from protected model output.
- No factions as a gameplay entity.
- No new lore or narrative embellishment.

# Output

Return `ACCEPT`, `ACCEPT WITH CHANGES`, or `REJECT`, followed by only material findings and exact replacement strings.
