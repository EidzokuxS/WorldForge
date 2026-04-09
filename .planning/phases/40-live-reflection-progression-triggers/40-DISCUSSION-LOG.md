# Phase 40: Live Reflection & Progression Triggers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 40-live-reflection-progression-triggers
**Areas discussed:** Reflection signal source, cadence semantics, consequence priority, player-facing visibility

---

## Reflection Signal Source

| Option | Description | Selected |
|--------|-------------|----------|
| Live event-driven accumulation | Feed reflection from normal episodic events and post-turn simulation writes already produced by gameplay. | ✓ |
| Separate reflection-only event pipeline | Add a new parallel tracking path just for reflection triggers. | |
| Manual / repair-driven accumulation | Use scripts, admin repair, or bespoke hooks to push NPCs over the threshold. | |

**Selection basis:** The current runtime already writes importance-bearing episodic events, while `unprocessedImportance` has no live accumulation path. Reusing the committed event flow fixes the missing seam without inventing a second source of truth.

---

## Cadence Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Ordinary-play reachable | Repeated notable interactions across a short arc should be enough to trigger reflection. | ✓ |
| Rare dramatic only | Reflection should fire only for exceptional, campaign-level drama. | |
| High-frequency ambient | Reflection should trigger from minor scene noise and frequent routine actions. | |

**Selection basis:** Phase 40 exists to make reflection operational, so “rare enough to almost never happen” fails the milestone. At the same time, trivial every-turn firing would drown the system in low-value churn.

---

## Consequence Priority

| Option | Description | Selected |
|--------|-------------|----------|
| Beliefs/goals/relationships first | Make the core reflection outputs behavior-driving state changes; treat wealth/skill upgrades as stronger-evidence secondary effects. | ✓ |
| All progression outputs equal | Wealth, skills, goals, and relationships are treated with the same trigger weight. | |
| Wealth/skill first | Emphasize visible progression tiers before social/cognitive state shifts. | |

**Selection basis:** Beliefs, goals, and relationships most directly affect later NPC behavior. They are the clearest proof that reflection became live. Wealth/skill upgrades remain valuable, but they should not become noisy pseudo-XP.

---

## Player-Facing Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Diegetic-first | Let players observe reflection through changed behavior, changed relationships, and changed follow-up scenes, with at most subtle UI support. | ✓ |
| Explicit meta notification | Show overt “NPC reflected / progression triggered” system notices. | |
| Mostly hidden | Keep reflection almost entirely invisible, even when it materially changes future behavior. | |

**Selection basis:** The game’s tone and architecture fit world-state consequences better than gamified popups. Completely hiding it would make Phase 40 hard to validate in play, so a light supporting signal remains acceptable if planning needs it.

---

## the agent's Discretion

- Exact formula translating committed event importance into `unprocessedImportance`
- Exact threshold after live accumulation exists
- Exact evidence bar for wealth and skill upgrades
- Whether subtle UI support is needed beyond diegetic behavior

## Deferred Ideas

- Full explicit reflection feed or codex/journal UI
- Stronger knowledge-propagation simulation
- Broader player-character progression redesign
- Checkpoint durability concerns beyond Phase 41
