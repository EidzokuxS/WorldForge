# Agency Debt Cases

Wave 4A defines agency debt as a wake signal, not as an automatic mutation.

## Cases Covered

- **Distant actor, no due time, no debt:** sleeps. A one-sentence dialogue turn does not poll every key NPC.
- **Present actor:** wakes as `required_before_done` because the actor can affect the player-visible scene.
- **Due time reached:** wakes as `proposal_after_done` when distant/off-screen.
- **Same broad location, hidden scene scope:** wakes through `exposed_scope_catch_up` so nearby off-screen state can catch up without pretending the actor was visible.
- **Agency debt threshold:** `agencyDebt >= 3` emits `agency_debt`; the scheduler routes it like any other non-present wake unless other signals require before-done handling.
- **Conflicting write scopes:** jobs sharing a scope such as `location:loc-main:presence` are serialized instead of running in parallel.

## Non-Goals In This Slice

- No LLM actor brain execution yet.
- No actor tool syscall execution yet.
- No old detached backend tick is reintroduced as authoritative world mutation.

Wave 4B is responsible for turning scheduled actor wakes into ActorDecisionPacket -> validated actor tools -> ToolResult authority records.
