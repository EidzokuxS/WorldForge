# Support actor projection and visible reactions

## Manual campaign evidence

Template-backed Turbo run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r04` reached five completed player actions through the rendered Campaign Play UI. The player ignored the opening's toll-check lead, examined the household board, left both guards for Dim Ward Market, inspected the open stalls, and then used freeform input to ask an unnamed cord vendor about her goods. The game preserved that departure, kept the guards in their own scene, and materialized Torva as a persistent local actor with a goal, plan, schedule, placement, and immediate reply.

The fifth action also exposed two presentation and contract defects. Torva's `materialize_support_actor` event projected as the generic journal text `You witnessed a change nearby.` even though the committed command already carried a public summary. On the next suggested follow-up, Judge returned fewer than the three required `visibleActorReactions`; one explicit UI Resume returned all three entries but set every `reason` to null. Both attempts were rejected before artifact acceptance. Text fallback, hidden retry, model substitution, and state mutation did not occur.

The same run provided bounded evidence for the destination-owned Actor Replanner contract. Two model-authored plans reached compilation with move targets shaped as destination location handles instead of route handles. Neither produced the former `route_not_traversable_from_step_location` rejection. Grounding review rejected both complete plans for a separate unestablished other-actor action, preserving atomic authority.

## Repairs

Judge now receives the literal ordered `VISIBLE_ACTOR_REACTION_HANDLES` list and an explicit entry count. The prompt states that every listed actor appears once and every entry has a non-empty model-authored `reason`, including `reaction: none`. The strict schema and one-attempt runtime behavior are unchanged.

Visibility now renders a directly perceived Game Master `materialize_support_actor` event from its accepted command summary. It does not synthesize prose, infer hidden traits, or merge the separate dialogue event. The public journal therefore retains one receipt-correlated entry for materialization without the generic placeholder.

## Verification

- GitNexus reported LOW upstream risk: Judge `prompt` has one direct consumer, and visibility `publicEntry` has one direct consumer.
- The focused Judge prompt test asserts the exact reaction count, non-empty reason rule, and literal required handle list.
- The full support-actor runtime journey asserts that the materialization observation and consequence use the accepted public summary.
- Backend typecheck passes.
- `prompt-craft`, `humanizer`, and `deslop` review kept the new model instruction literal and short. It adds no motivational filler, repeated warning, compatibility path, or backend-authored narrative.

Run r04 remains diagnostic because its persisted placeholder and interrupted sixth action predate the repairs. Product acceptance requires the same journey on a fresh template-backed run.
