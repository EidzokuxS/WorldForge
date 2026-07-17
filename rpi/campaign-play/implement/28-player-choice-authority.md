# Task 28: player choice authority

Status: implemented and verified in the rendered Campaign Play surface.

The Gateworks playtest offered two mutually exclusive shifts: stone-lifter work on the north buttresses and timber-hand work at the lower gates. Narrator collapsed them into one suggested action, “Talk to Warden Tessara Vohn: accept a gate reinforcement shift.” Clicking that action did not identify a shift. Judge nevertheless ruled the input deterministic, and Game Master chose timber-hand work, signed Mara onto that posting, struck out its open slot, and set Mara's authoritative `occupied` condition. The model therefore made a player decision that the clicked action never authorized.

Campaign Play now closes that boundary at both semantic stages. Narrator suggestions that accept, select, order, take, or commit among visible mutually exclusive alternatives must name one supported alternative or use a different intent. Judge returns `clarification_required` when an input still omits the required choice and never infers it from list order, convenience, equipment, goals, or likely benefit. An actionable move still requires one exact route; only a route-choice clarification may retain `kind=move` with no route handle.

Clarification narration is also code-bounded to one `action_handoff` beat whose text exactly matches the Judge question and whose observation indexes are empty. Narrator cannot prepend movement, preparation, speech, or another player action. This validates model-authored presentation without replacing it with backend-authored prose.

Prompt review:

- `humanizer`: keep as written; the instructions use direct domain language and state one authority boundary without role-play or player-facing imitation;
- `deslop`: pass; no canned framing, rhetorical padding, stacked conclusion, vague intensifier, fake quotation, or repetitive warning remains.

Verification:

- GitNexus reported LOW upstream risk for Judge `prompt`, Narrator `buildPrompt`, Narrator `assertProposalForPacket`, and the Judge ruling schema; each path has one direct Campaign Play consumer;
- focused Judge, Narrator, and contract suites: 80 tests passed;
- backend typecheck passed with `NODE_OPTIONS=--max-old-space-size=4096`;
- the original unauthorized-choice turn is `turn-player-action:da8cacd94dcf3699189a7ba3c6448709d6dfbcd2`; its persisted Judge artifact contains no clarification, and its Game Master artifact selects timber-hand work and applies `set_actor_condition(occupied)`;
- live freeform turn `turn-player-action:a21e82c5ae5e594ba9739c712334cf17fd4727d9` exposed a conflicting old invariant: two valid GLM clarification proposals used `kind=move` with no chosen route and were rejected before mutation. The compiler and persisted ruling schema now allow that shape only for `clarification_required`;
- after the compiler fix, the same fenced turn accepted Judge in 13,956 ms and completed without Game Master, actor settlement, world mutation, or elapsed time; it preserved world version 40 and minute 63 and presented both exact routes;
- the first accepted clarification Narrator added an unauthorized preparatory beat (“turn to leave”), which motivated the exact single-beat contract;
- final real UI turn `turn-player-action:73516adeb17031384dde673b6863aeb0eda06f8d` accepted Judge in 28,297 ms and Narrator in 42,773 ms on GLM 5.2, both first attempts with no fallback, provider switch, repair, or hidden retry;
- the final rendered moment contains exactly one beat: “Which route do you want to take: the open route to brackish-crossing (5 travel units) or the open route to harvester-launch (2 travel units)?”;
- its suggested route actions name Brackish Crossing and Harvester Launch separately, world version remains 40, world time remains 63, and the campaign returns to `ready`.

Manual prose verdict: the final question is concise, preserves the exact mechanical route names and costs, and returns control without pretending Mara has moved or prepared to move. The earlier extra preparatory beat was readable but violated agency; the final contract removes that class of prose rather than polishing it.

Two separate findings remain outside this authority slice. The Gateworks work attempt used timber beams and iron bolts without possession or explicit supply authority, and the client kept displaying its pre-resume interruption card while the resumed server turn was processing. Both have direct live evidence and are the next repair candidates.
