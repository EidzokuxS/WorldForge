# Player history and beat authority

## Outcome

Keep the player character's past under player-owned evidence and make each rendered narration beat perform distinct work.

## Reproduced evidence

- Black Rain Passage Lane B r03 opening asked what Elena saw borrowed shadows do on the road although her CharacterRecord and selected start supplied no such event.
- After Elena explicitly denied that premise, action two again suggested that she offer what she witnessed on the road.
- Travel and observation actions four, five, eight, nine, and ten used two beats whose second beat repeated most or all of the first before adding one visible detail.
- Full evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r03-current.session/human-notes.md`.

## Decision

- Opening Planner treats motivation as a present desire, not evidence of prior experience. NPC questions cannot presuppose an unstated player event.
- Narrator treats NPC dialogue and assumptions as claims, not player-history authority. Suggested actions cannot adopt those claims unless player-authored input or explicit opening context established them.
- Narrator prefers one beat and combines travel or observation with its immediate visible aftermath when legible. Another beat must add a separate observation or a necessary unresolved reply without recapping earlier prose.
- This slice changes model instructions only. It adds no backend prose, lexical similarity rule, repair, retry, fallback, provider switch, compatibility path, or timeout.

## Validation

- `npm --prefix backend test -- src/campaign-play/opening-planner.test.ts src/campaign-play/narrator.test.ts`: 51/51 passed.
- `npm --prefix backend run typecheck`: passed after final cleanup.
- `humanizer` review: no rewrite required. The new text uses direct domain language and concrete counterexamples instead of abstract style guidance.
- `deslop` review: accepted. Parallel negative clauses remain only where they distinguish separate false authority sources; no throat-clearing, fake quotation, marketing cadence, or visible-player copy was introduced.
- Main-agent semantic verdict: the instructions preserve model authorship of scene prose while denying NPC dialogue authority over player history. Beat guidance prefers composition over backend deduplication and adds no hidden prose path.
- Clean-copy product pass: materialized `black-rain-passage-pristine-54df81f3` as `pristine-60-black-rain-54df81f3-r04-player-history`, then created Elena Bardi and played through the normal UI on localhost with GLM 5.2.
- Opening Planner attempt 1 and Narrator attempt 1 were accepted. The opening used Vela's present record-keeping as the hook, did not claim Elena had witnessed anything on the road, and all four suggested actions remained present-tense choices. Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/opening-player-history-authority.png`.
- Follow-up chose the real travel suggestion to Saint Orra Beacon Terrace. The first Game Master proposal was rejected before mutation for an extra schema field; one explicit UI Resume preserved Judge attempt 1 and accepted Game Master attempt 2. Narrator attempt 1 rendered one beat combining arrival, the visible requisition-form aftermath, and Poldo's presence without recapping the arrival in a second beat. Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/travel-aftermath-one-beat.png`.
- Product verdict: passed for the affected opening and travel journey. The prose was coherent and readable, player history stayed grounded, the scene exposed a usable clue, and the UI showed `THE MOMENT 1 of 1`.
