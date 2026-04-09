# Phase 40: Live Reflection & Progression Triggers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 40-live-reflection-progression-triggers
**Areas discussed:** Player-facing visibility, progression semantics

---

## Player-Facing Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Diegetic-first + secondary debug surface | Main signal comes through NPC behavior; a low-prominence card/modal drill-down may exist for inspection/debugging. | ✓ |
| Explicit meta notification | Show overt “NPC reflected / progression triggered” system notices. | |
| Mostly hidden | Keep reflection almost entirely invisible, even when it materially changes future behavior. | |

**User answer:** “Через поведение NPC + где-то неяввно в карточке персонажа в доп модалке чтобы можно было посмотреть что-то мейби? Для отладки.”
**Notes:** Main product signal stays diegetic. Extra visibility is acceptable only as a secondary/debug aid, not as the primary gameplay language.

---

## Progression Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Logic-first | Progression should fire when the evidence makes sense in-world, not to satisfy a target frequency. | ✓ |
| Rare by design | Keep progression intentionally scarce as a product goal. | |
| Frequent by design | Keep progression intentionally common as a product goal. | |

**User correction:** When offered “rare” as a framing, the user rejected it: “Оно не должно меняться часто или редко, оно должноменяться логично.”
**Notes:** Planning should optimize for evidence quality, not target frequency. Heavier changes like wealth/skill tier shifts should still require stronger proof than lighter belief/goal/relationship changes.

---

## the agent's Discretion

- Reflection signal source and accumulation seam
- Exact formula translating committed event importance into `unprocessedImportance`
- Exact threshold after live accumulation exists
- Exact evidence bar for wealth and skill upgrades
- Exact implementation of the secondary debug/inspection surface

## Deferred Ideas

- Full explicit reflection feed or codex/journal UI
- Stronger knowledge-propagation simulation
- Broader player-character progression redesign
- Checkpoint durability concerns beyond Phase 41
