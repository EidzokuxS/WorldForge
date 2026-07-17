# Task 27: actionable world time

Status: implemented and verified in the rendered Campaign Play surface.

A real conversation with Pietr Grenn completed with Judge elapsed bounds of zero to zero. It produced readable dialogue but left both mechanical world version and world time unchanged, so repeated local conversations could freeze the deterministic actor scheduler and make the supposedly living world wait indefinitely for the player.

Judge compilation now gives every deterministic or uncertain action a code-owned minimum of one world minute. The model still proposes semantic duration above that floor; pure movement still uses the route's canonical travel cost, suggested waiting still uses its fixed duration, and impossible or clarification-required results may remain at zero. This is mechanical normalization at the Judge/Rulebook boundary, not backend-authored narrative, fallback, compatibility handling, or a hidden model retry.

Prompt review:

- `humanizer`: keep as written; the sentence is precise operational instruction and does not imitate player-facing prose;
- `deslop`: pass; it contains no canned framing, rhetorical padding, fake quotation, repetition, or vague abstraction.

Verification:

- GitNexus upstream impact for `compile` in `backend/src/campaign-play/judge.ts` reported LOW risk with one direct dependent in the Campaign Play process;
- focused Judge and Game Master suites: 60 tests passed, including zero-to-one normalization for actionable contact and preservation of zero for an impossible action;
- backend typecheck passed with `NODE_OPTIONS=--max-old-space-size=4096`;
- the live UI action “Talk to Pietr Grenn: ask about Vohn's hiring terms” completed once as turn `turn-player-action:229666a54ea28a38ce7967000826` on GLM 5.2: Judge 36,014 ms, Game Master 61,429 ms, actor replanner 190,989 ms, and Narrator 121,305 ms, all accepted on their first attempt with no fallback, provider switch, or hidden retry;
- the model proposed two elapsed minutes, and Rulebook applied `advance_world_time`, moving world version 31 to 32 and world time 14 to 16 before recording the dialogue event;
- that time advance made Collector Kael Mirrus due for `plan_retry`; his accepted proposal created a durable `local_aftermath` event at his remote toll location, recording charcoal-marked unpaid ledger accounts;
- the player remained at Brackish Crossing and received neither Kael's remote event nor its sensory trace in consequences or narration;
- reload preserved Brackish Crossing, Day 1 at 00:16, Pietr, the five-copper debt, the completed dialogue, and the next choices;
- SQLite `integrity_check` returned `ok`, and `foreign_key_check` returned no rows.

Manual prose verdict: Pietr's answer is coherent and epistemically careful. He distinguishes past posted pay from terms he has not personally seen today, points toward the existing Warden Tessara Vohn at Outer Ring Gateworks, and does not make the player the center of unrelated world activity. The narrator paraphrase is readable but slightly over-explains Pietr's final motive after partially dropping quotation boundaries. This is a nonblocking prose finding to watch across subsequent turns, not evidence for a new correction layer.

The product-use pass demonstrates the intended living-world coupling: an ordinary local conversation consumes time, the same authoritative time transition wakes a remote actor, that actor leaves durable local evidence, and visibility keeps the remote aftermath hidden from the player until a justified observation path exists.
