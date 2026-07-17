# Task 31: Game Master world-time authority

Status: implemented and verified in the rendered Campaign Play surface.

A recovered Gateworks observation exposed temporal drift. At authoritative time Day 1, 02:13, Game Master materialized a tide schedule that called the next high tide “mid-morning” while also placing it roughly two hours away. Narrator preserved those accepted facts, so the prose was fluent but internally impossible.

Game Master now receives `WORLD_TIME_AUTHORITY` with code-derived action-start coordinates and the earliest and latest result coordinates allowed by the Judge elapsed bounds. The model still authors the schedule, event, and prose. It must make clock times, named parts of day, dates, deadlines, durations, and relative intervals agree with its chosen elapsed time and with one another. Code does not parse temporal prose, rewrite an accepted summary, retry the model, switch providers, or supply fallback narration.

Prompt review:

- `humanizer`: keep; the instruction uses direct operational language and leaves scene voice and concrete schedule values to the model;
- `deslop`: pass; one authority rule replaces the missing context without stacked warnings, rhetorical framing, repetition, fake quotation, or vague abstraction.

Verification:

- GitNexus upstream impact for Game Master `prompt` was LOW with one direct `plan` consumer across the existing Campaign Play processes;
- the Game Master suite passed 31 tests, including the exact Day 1 00:10 action-start and 00:11–00:13 result-range projection;
- backend typecheck passed with `NODE_OPTIONS=--max-old-space-size=4096`;
- before the repair, recovery turn `turn-player-action:e8d83402e63b33868c4333715f7bf958b6aa352c` at Day 1, 02:13 combined “mid-morning” high tide with “within roughly two hours” in both the accepted Game Master event and Narrator prose;
- the product-use repeat ran against isolated campaign-root copy `output/playtests/campaign-world-runs/pristine-natural-r32-world-time-authority/campaigns`; the source `pristine-natural-r30-actor-obligation` campaign was restored afterward at world version 46, runtime revision 998, phase `ready`;
- the same rendered action “Examine the tide-schedule on the notice board” completed as turn `turn-player-action:2c1ad0ead304c2c8e21ed855eda3095a8e4c452c` on GLM 5.2: Judge 27,556 ms, Game Master 31,082 ms, and Narrator 150,084 ms, all accepted as valid strict objects on attempt 1;
- Game Master chose one internally consistent schedule from result time Day 1, 02:13: low water at hours 4 and 16, high water at hours 10 and 22, without an incompatible relative claim;
- Narrator preserved those values and correctly stated that it was just past hour 2, low water at hour 4 was less than two hours away, and high water would arrive at hour 10;
- the turn advanced world version exactly once from 46 to 47 and returned the UI to `ready`;
- rendered evidence: `output/playtests/campaign-play/pristine-natural-r32-world-time-authority.session/screenshots/time-coherent-schedule.png`, SHA-256 `4B79657D3E5BF9BF27ECD2C4257391BA9ECC2C2010D932615D4CF4ED20670FE4`.

Manual prose verdict: the repaired scene is coherent and more playable than the original. It turns an informational observation into an understandable pressure: the next low water is close, the dangerous high water follows later, the storm raises the posted mark, and Mara has already spent the issued kit. The prose is somewhat dense but remains readable, remembers prior mechanical state, and gives four distinct grounded continuations. Crucially, time now creates stakes instead of revealing that the world is improvising incompatible clocks.
