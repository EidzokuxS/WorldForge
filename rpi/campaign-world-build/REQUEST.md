# Campaign World Build request

## Product request

Rebuild the first campaign mechanics slice around a world-centered simulation. A player creates a campaign from a premise, may add World DNA and research context, builds a world, reviews it, and accepts it before player-character setup.

The built world contains locations, routes, people, collective actors, goals, placements, relations, and starting pressures. Collective organizations use the same actor contract as other world participants. A separate faction entity is outside the target model.

## Development request

- Use Krypton Planning before implementation.
- Use domain names from the project naming convention.
- Keep current routes, symbols, tests, and copy free of workstream, version, age, and experiment labels.
- Establish one truth owner and one build contract.
- Cut Forge and Review away from the scaffold generator and Campaign Kernel prototypes.
- Use strict structured output. A contract failure ends the stage.
- Prove the result through real player-path playtests with a live provider and persisted database evidence.
- Add a smoke test only when it proves a distinct risk that focused tests and the live path cannot prove.

## Acceptance boundary

This goal ends after World Review accepts a versioned world and a backend restart reloads the same hash and entity IDs. Player actor creation, opening, turns, background simulation, narration, and longplay form later goals.

## Source material

- Local TarotEngine sibling at `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine`
- `Sagesheep/NarrativeEngine-P`
- `AndreiNicu/World-Forge`
- `GetfroggyHoe/universal-immersion-engine`
- `mistval/yozakura`
- `Yuralume/yuralume-core`
- `docs/UI Concept.html`

These projects supply behavioral references. WorldForge implements its own contracts and code.
