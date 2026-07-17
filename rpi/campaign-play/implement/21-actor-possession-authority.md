# Task 21: actor possession authority

Status: implemented and verified through focused runtime tests and a clean rendered campaign.

## Contract change

Every newly authored opening or replanned actor step now declares one typed possession outcome:

- `none` keeps the existing autonomous world-event path;
- `acquire` names a positive quantity gained by that actor and compiles to one `adjust_actor_possession` command;
- move steps cannot acquire possessions;
- code derives the actor owner, possession identity, scopes, ordering, receipt, event, and persisted quantity;
- the model-authored observable trace supplies the public consequence instead of backend-written scene prose.

There is no persisted-plan default, compatibility adapter, automatic repair, extra model call, or duplicate `record_world_event`. Spending, transformation, cargo, and object ownership remain outside this slice.

## Verification

- Contract, opening-planner, and replanner tests require the discriminated outcome and reject move-plus-acquire proposals.
- Actor proposal compilation proves the exact own-actor possession command. The scheduler-to-visibility settlement fixture proves that command produces one applied receipt and a persisted quantity of two.
- Rulebook preflight proves actor-job authority can acquire a fresh possession only for its own actor.
- Visibility settlement drives scheduler, actor proposal, Rulebook, event exposure, and projection together; the authored summary appears as `Seen nearby` rather than generic change copy.
- Backend typecheck and the focused contract, prompt, planner, replanner, Rulebook, proposal, visibility, and Opening runtime suites pass.
- The actor scheduler suite remains red before its scheduler assertions because an existing deterministic wait fixture supplies `minimumMinutes: 0`, which the existing actionable-wait invariant rejects. The mounted route integration fixture still remains at Opening `processing`. Neither failure was changed or counted as passing evidence.

## Clean rendered campaign

Campaign `d76ce637-7536-47ff-9a7c-8b4ff09f8747` was copied from the pristine Bellglass Tides template and played through Opening plus seven player actions in the actual `/play` UI with GLM 5.2.

At Day 1, 00:13, the player waited ten minutes to test whether untouched amulets cracked at rest. World time advanced to 00:23 and admitted three autonomous jobs. Netta Scarpa and Collector Kael Mirrus settled their existing plans. Master Orsa Vail entered `plan_retry`, received a new first-attempt GLM 5.2 plan, and personally moved the remaining amulets into the crate. Her plan correctly declared `possessionOutcome: none`, so no actor possession row was invented for cargo handling. The direct-perception trace appeared as a separate `You notice` consequence and remained byte-for-byte present after reload.

The player-facing sequence is coherent: two attempted carries crack, Orsa explains trapped vibration and handling technique, waiting demonstrates that untouched pieces do not crack at rest, and Orsa's autonomous response moves the stock herself. It is readable and creates a causal world response. The repeated forced breakage and the resulting sixteen-copper debt remain mechanically unowned prose and are the next serious gameplay-authority defect, not part of this possession-acquisition slice.

Screenshot evidence:

- `output/playtests/campaign-play/pristine-natural-r29-actor-possession.session/screenshots/action-7-background-actor-visible.png`, SHA-256 `69559a81e72af6da4b2c314f3157552df8c2a8ab75bb2a89f8f920b4c8fa3681`.
- `output/playtests/campaign-play/pristine-natural-r29-actor-possession.session/screenshots/action-7-background-actor-after-reload.png`, SHA-256 `00f12eb6bba2a1e64780886177f66b57babb855b0642f21d1ad1ad3b609d83d6`.

SQLite integrity is `ok`, foreign-key check is empty, the completed turn advances world version 14 to 15 and time 13 to 23, and the reload preserves world version 15/runtime revision 255.

## Semantic review

Humanizer/deslop verdict: the two new prompt clauses are concise schema instructions, use direct verbs, and contain no decorative rhetoric, plot steering, or backend-authored fallback prose. No rewrite was needed. The live narration is concrete and causally legible; its duplicated paragraph in the DOM and the overly punitive double-break sequence are product findings rather than prompt-copy defects in this slice.

ProjectGameGod marker `pgg:knowledge:found-004` informed the evidence boundary: model proposal, code-normalized command, Rulebook receipt, persisted state, and presented consequence are checked separately. The clean campaign narrows that guidance by showing that cargo handling must remain `none` unless a genuine owned quantity is acquired.
