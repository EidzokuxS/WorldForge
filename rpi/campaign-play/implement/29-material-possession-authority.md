# Task 29: material possession authority

Status: implemented and verified in the rendered Campaign Play surface.

A Gateworks field turn exposed a missing authority boundary. Mara was assigned to a timber-hand shift and carried `Simple hand tools`, but owned no timber beams or iron bolts. Judge treated that context as enough to use fresh bolts, Game Master recorded them as driven into masonry, and Narrator presented the work as completed even though no typed acquisition, quantity, receipt, or persisted possession existed. Visible stock, handling, work assignment, and general tool ownership had become mechanical custody by implication.

Campaign Play now separates semantic permission from authoritative possession. Judge emits one `possessionEffectAuthority` or explicit `none`. `required` means that a qualifying result must compile to exactly one matching acquire, spend, or transform effect. `permitted` means that a targeted present actor may grant or refuse one exact transfer, so Game Master may emit zero or one matching effect based on that actor's goals and situation. Every unmatched or duplicate possession effect is rejected before Rulebook preflight. General tools do not include raw materials, fasteners, or consumables, and neither prose nor environmental visibility can substitute for an owned positive quantity.

The compiler remains mechanical rather than narrative: Judge owns the typed authority, Game Master owns the semantic decision inside that boundary, and Rulebook owns identity, quantity, ordering, persistence, receipt, event, and exposure. No backend-authored scene text, compatibility path, provider fallback, timeout, or hidden retry was added.

Prompt review:

- `humanizer`: keep as operational instruction; the new text is direct, concrete, and does not imitate player-facing prose or prescribe a canned dramatic voice;
- `deslop`: pass after consolidating the custody rules around one typed authority; no stacked warning, rhetorical padding, vague abstraction, fake quotation, or backend-authored narration remains.

Verification:

- GitNexus upstream impact was LOW for Judge `prompt`, Game Master `prompt` and `compile`, Narrator `buildPrompt`, `campaignPlayJudgeRulingSchema`, `campaignPlayPossessionEffectAuthoritySchema`, `judgeProposalSchemaForFrame`, and the adjusted actor-scheduler fixture;
- focused contract, Judge, Game Master, Narrator, turn-runtime, actor-proposal, actor-scheduler, and actor-replanner suites completed 176 passing tests after the hard-cutover field rename and fixture correction; the combined Vitest process then reported an `onTaskUpdate` worker RPC timeout, classified as a verification defect, and the 37-test turn-runtime suite passed cleanly when rerun in one worker;
- backend typecheck passed with `NODE_OPTIONS=--max-old-space-size=4096`;
- the original unauthorized-material turn is `turn-player-action:887f3aecfc11ef340972c4273ad0f803d9c08a19`; it used fresh bolts without an authoritative acquisition or positive possession;
- negative live turn `turn-player-action:65e32906c610f2c6212343b2ac0fdbc24293d14b` accepted Judge and Narrator on GLM 5.2 first attempts, performed no Game Master or actor settlement, and preserved world version 41 because the requested third bolt also lacked sound masonry;
- acquisition turn `turn-player-action:f31b130ab6a17403dee25dd614021631eabd86a0` used `permitted acquire`: Judge 97,138 ms, Game Master 80,556 ms, and Narrator 76,554 ms, all GLM 5.2 first attempts with valid strict objects; Tessara independently chose to issue one `Gate-reinforcement kit (timber beams and iron bolts)`, and Rulebook persisted quantity 1 with possession ID `possession:8ade1e0eaaddb741b9aba528e8f3c6fb2deb6c2dc8b2b444`;
- spend turn `turn-player-action:fb4f5f854c81d6460eb7068024210067fec68c06` used `required spend` against that exact possession: Judge 108,032 ms, Game Master 98,469 ms, actor replanner 150,300 ms, and Narrator 114,329 ms, all GLM 5.2 first attempts with valid strict objects;
- Rulebook advanced 40 minutes, spent exactly one kit under receipt `receipt:c4425d98cb17e1bcda7a9a7d1bf9b651`, persisted its quantity as 0 at world version 45, recorded a partial brace, and then settled two independently due actors to world version 46;
- the remote actor movement and ledger work persisted but were not exposed to Mara at Outer Ring Gateworks;
- the rendered `Carrying` list omits the exhausted kit, `What changed` matches the authoritative spend and scene event, and every suggested action remains possible without the missing materials;
- rendered evidence: `output/playtests/campaign-play/pristine-natural-r30-actor-obligation.session/screenshots/action-material-spend-authority.png`, SHA-256 `9D058FCF683E74F4B199BEA6063D50B058BDA35768F5D93843238506DF74E726`.

Manual prose verdict: the acquisition scene makes Tessara an acting world participant rather than a vending-machine fallback; she checks the tally, issues bounded ward stock, and gives a grounded condition for its use. The spend scene reads as a coherent setback: one beam holds, the other fails against waterlogged stone, the leak remains, and the text explicitly closes the material ledger by saying the kit is spent. It neither centers the remote world on Mara nor exposes unseen actor activity. The four follow-up choices are concrete and mechanically grounded. The only stylistic blemish is mild repetition between `What changed` and `The moment`, which is existing presentation behavior and does not undermine this authority slice.

This live evidence confirms `pgg:knowledge:found-004` for the current implementation: object handling and narration are not possession; authoritative acquisition and spending require a typed transition joined to actor, persisted identity and quantity, receipt, and correlated presentation.
