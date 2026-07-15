# Living World Reference and Playtest Plan

Date: 2026-07-10

Status: research recommendation for the campaign play slice. This document describes validation and evidence requirements. It supplies no implementation code and does not authorize promotion based on a generic smoke check.

## Source-grounded design references

| Source | Useful principle | WorldForge application | Boundary |
|---|---|---|---|
| [NarrativeEngine-P](https://github.com/Sagesheep/NarrativeEngine-P) | Bounded NPC goals, goal collisions, timeskip work, witness and faction knowledge scopes, and ambient, rumor, or direct consequences. | Schedule actor work by due time, goal pressure, and witnessable consequences. Project background outcomes through a visibility rule before narration. | Reimplement against WorldForge receipts and visibility contracts. Do not copy its runtime. |
| [AndreiNicu/World-Forge](https://github.com/AndreiNicu/World-Forge) | Intake acceptance scenarios, collision, near-miss, lull, and off-script probes, independent audit roles, and a persistent run ledger. | Treat build, opening, turns, and review as a single evidence chain. Include deliberate probes in each campaign. | Its SillyTavern prompt and lorebook package remains a behavioural QA reference. |
| [Universal Immersion Engine](https://github.com/GetfroggyHoe/universal-immersion-engine) | Facts-first RPG surfaces, staged action review, and user-controlled regeneration or swipe recovery. | Present receipts and current state as the source for HUD and action review. Keep regeneration out of pristine promotion lanes. | UIE derives state from chat. WorldForge must derive it from backend-owned state and receipts. |
| [Yozakura](https://github.com/mistval/yozakura) | One actor shape for people and AI characters, directed relations, graph movement, intentions, memories, and perspective-aware encounter windows. | Use one actor contract, directed relations, and a due-actor queue that reads location and knowledge scope. | WorldForge uses due work rather than a full cast sweep on each turn. |
| [Yuralume](https://github.com/Yuralume/yuralume-core) | Schedule aftermath becomes memory. Proactive delivery passes a heuristic, intention judge, and decider. | Treat background delivery as an explicit decision with an inspectable reason and a visibility gate. | The public repository is an alpha install and product reference. It is not a source-code donor. |
| TarotEngine local sibling, `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine`, branch `feature/memory-vault-router`, commit `010cdd373cc4ed508d2e43f80be188357f59cf6c` | Explicit stage owners, resolved mechanics before narration, campaign-local truth precedence, target-perspective packets, prompt-diff evidence, and temporary-game E2E cases. | Preserve clear ownership across Judge, command execution, actor work, visibility, and narration. Use deterministic target-perspective fixtures before live campaigns. | WorldForge owns canonical state, Rulebook receipts, actor scheduler, and visibility projection. |

## Optional Marinara prose sample

An isolated Marinara v2.0.9 profile used the existing GLM 5.2 connection for one opening and three connected player exchanges. The original profile, settings, campaigns, and repository stayed unchanged. The default Tarot background pipeline did not save its opening after more than four minutes, so the temporary profile disabled background agents and sampled the base GM only. This is one prose example, not a WorldForge target or a judgment of Marinara's complete pipeline.

The sample followed a flooded-quay problem through a missing daughter, an underwater bell, a recovered belltower chain, and a dry mortuary-tunnel lead. Its useful habits were concrete objects the player could manipulate, NPC feeling shown through behavior before exposition, and a turn rhythm where one answer creates new pressure. Each completed exchange ended on a physical change or an actionable person or place.

The sample also showed boundaries WorldForge should not copy: raw VN control tags, malformed choice markup, unsupported player actions, contradiction of the stranger premise, Chinese fragments inside Russian prose, and repeated melodramatic atmosphere. WorldForge keeps its own voice, Rulebook authority, living-world simulation, and earned-visibility contract.

Existing project sources already support this direction:

- [Launch-to-Longplay Gameplay Contract](../../../docs/playtest/launch-to-longplay-gameplay-contract.md) defines launch, opening, 10-turn, 30-turn, 60-turn, and long-horizon product gates.
- [Mechanics baseline](../../../docs/mechanics.md) requires proposal-first detached actor work, authority/version checks, and actor decision packets constrained to frame facts.
- [Reference and playtest review](../../../tasks/todo.md) records the five-lane model, pristine-lane policy, P0 failures, and initial live-provider evidence requirements.
- TarotEngine's `docs/goals/memory-vault-router/PLAN.md` and `PLAYTEST_EVIDENCE.md` provide examples of deterministic target-perspective E2E probes and the evidence each case retains.

## Evidence streams

Build events and gameplay turns describe different contracts. Keep them in separate logs and use separate schemas.

| Stream | Scope | Required fields |
|---|---|---|
| Build event | Pre-play world construction: source frozen, frame, cast, connections, validation, commit, acceptance. | `buildId`, sequence, stage, source digest, model strategy and attempt evidence, world version, content hash. |
| Gameplay turn | Post-Continue player action and its causal resolution. | `campaignId`, `runId`, turn number, prior and next world version, player input, perception-frame hash, Judge verdict, commands, receipts, actor work, visibility projection, narration, timing, tokens, estimated cost. |

A successful build proves that a world exists. Gameplay validation begins with the opening turn and supplies the evidence for autonomy, causality, secrecy, and long-horizon play.

## Validation lanes

### 1. Deterministic contract regression

Run in CI and whenever a defect is repaired. Fixtures use a seeded clock, RNG, IDs, provider stub, and frozen canonical state. They prove receipt authority, version conflicts, idempotency, restart/reload, visibility filtering, actor scheduling, causal references, and atomic persistence. Each accepted live failure receives a narrow deterministic fixture before another pristine run.

### 2. Seeded scenario replay

Run nightly with scripted 10, 30, and 60-turn scenarios. Cover route and travel, dialogue, custody, hidden-fact inquiry, wait or timeskip, background pressure, return to a changed location, and an impossible action. Replay each scenario twice in deterministic mode. Require the same canonical projection, receipt order, visibility result, and replay hash. Narrative text may vary only in a dedicated non-authoritative test mode.

### 3. Live adaptive diagnosis

Use a real provider and human tester for 20 to 30 turns while developing a slice. Test custom actions, adversarial prompts, deliberate lulls, direct conflict, and ambiguous observation requests. A diagnostic run may restore or retry, but it records a new attempt and cannot support promotion.

### 4. Pristine milestone acceptance

Start a fresh campaign with one provider, one model configuration, and one uninterrupted history. The tester uses the normal product UI. Manual database mutation, provider changes, action resubmission, restore, and player-facing failed turns end the lane. Require two fresh 60-turn campaigns before a broad playability claim.

### 5. Long-horizon soak

Run a 300-turn campaign before making a long-play claim. Use a controlled mix of normal play, intentional waits or timeskips, and observation probes for off-screen change. Audit every 25 turns. Perform restart and replay checks at turns 30, 60, 150, and 300. A 600-turn claim requires a separate approved run.

## Tester roles

| Role | Responsibility |
|---|---|
| Player | Plays naturally and records whether choices remain meaningful, consequences arrive, and prose matches perception. |
| Adversarial observer | Attempts secret extraction, invented facts, impossible routes, unwitnessed NPC knowledge, and unsupported custody claims. |
| World auditor | Inspects active goals, due work, proposals, commits, pressure trajectories, causal links, and restart projections. |
| Narrative reviewer | Scores grounding, continuity, consequence readability, repetition, and whether visible developments have a traceable cause. |
| Release steward | Validates artifact inventory, commit and dirty state, provider and model settings, budgets, and pristine-lane integrity. |

The player may also review narrative quality. The adversarial observer and world auditor should perform independent passes.

## Gameplay telemetry dictionary

Every event carries `campaignId`, `runId`, `turnKind`, `playerActionNumber` when relevant, `worldVersion`, `runtimeRevision`, `eventId`, `parentEventId`, `causationId`, `actorId` when relevant, `locationId` when relevant, visibility scope, elapsed milliseconds, token usage, provider, model, and estimated cost.

| Event | Meaning | Required proof |
|---|---|---|
| `turn.started` | The server accepted a uniquely identified player intent. | Input hash and idempotency key. |
| `worker.claimed` | One worker acquired a stage before deterministic or external work. | Stage, owner hash, new lease epoch, expiry, runtime revision, and no competing claim. |
| `perception.assembled` | The player-visible frame was assembled from authoritative state. | Perception hash and visibility scope. |
| `player.intent.received` | The supplied action entered adjudication. | Original text and parsed intent. |
| `judge.resolved` | Judge produced a bounded ruling before prose. | Verdict, bounds, and supporting frame hash. |
| `receipt.committed` | A validated command made an authoritative mutation. | Receipt ID, mutation scope, prior and next world version. |
| `actor.job.queued` | Scheduler found an actor due for work. | Due reason, actor goal, and base version. |
| `actor.job.skipped` | Scheduler withheld work. | Skip reason and next due condition. |
| `actor.proposal.created` | An actor proposed off-screen or present-scene change. | Actor-frame hash, allowed scope, and expiry. |
| `actor.proposal.committed` | Authority accepted a proposal. | Receipt IDs and causal parent. |
| `actor.proposal.rejected` | Authority declined a proposal. | Rejection reason and no-mutation proof. |
| `visibility.projected` | The product selected what the player may perceive. | Public projection hash and protected audit hash. |
| `narration.delivered` | Narrator rendered from committed, visible evidence. | Narration ID and cited public event IDs. |
| `turn.completed` | The turn reached a durable player-facing result. | Terminal receipt/version and elapsed time. |
| `turn.failed` | The turn ended without the required product result. | Error code, mutation audit, and lane disposition. |

Public bundles omit raw hidden facts and prompts. Protected audit payloads keep a hash that the public bundle can reference.

## Scorecards and hard thresholds

| Dimension | Promotion threshold |
|---|---|
| Mutation authority | 100% of mechanical mutations have validated bootstrap/Rulebook receipt and command IDs. Runtime mutations have fenced revision and campaign runtime-event evidence; turn-owned changes also have sanitized turn events. Prose-only durable mutation count is zero. |
| Restart and replay | At every checkpoint, canonical projection bytes, entity IDs, and content hash match after restart and deterministic replay. |
| Hidden information | Zero confirmed leaks across at least 20 adversarial probes per 60-turn lane. Each defect becomes a regression fixture. |
| NPC autonomy | Every key, support, and collective actor has an active goal and valid placement. When due actors exist, at least three independent off-screen proposals advance per 30 turns. |
| Narrative causality | At least 90% of sampled consequential statements link to committed receipts, events, or observations. Hard contradictions equal zero. |
| World motion | At least two sourced background changes reach the player by turn 30 and six by turn 60 through ambient, rumor, direct consequence, route change, or changed actor behaviour. |
| Player agency | At least 95% of accepted custom actions receive adjudication without forced replacement. Player-action seizure defects equal zero. |
| Continuity | Lost or duplicate input, stale acceptance, partial commit, missing terminal result, and projection divergence each equal zero. |
| Human review | Median score is at least 4 of 5 for opening grounding, readability, consequence clarity, and actor distinctness. Critical contradictions equal zero. |
| Runtime and cost | P95 player-facing turn time is at most 12 seconds, P99 at most 20 seconds, and run cost remains within the lane budget. |

Promotion stops for any lost or duplicated input, hidden-fact leak, receipt-to-narration contradiction, partial commit, replay divergence, forced player action, or required stage bypass. These are P0 findings.

## Time and cost budgets

| Lane | Turns | Human time | Provider budget rule |
|---|---:|---:|---|
| Contract regression and seeded replay | 10, 30, or 60 scripted | Automated | CI budget only. |
| Live adaptive diagnosis | 20 to 30 | 60 to 90 minutes | Weekly allowance at most 1.5 times the target 60-turn lane cost. |
| Pristine acceptance | 2 x 60 | 4 to 6 reviewer hours | Set a campaign cap before first turn. Alert at 80%. |
| Long-horizon soak | 300 | 8 to 12 reviewer hours with sampling | Separate approved cap and an audit every 25 turns. |

Each budget ledger records model, provider, tokens, estimated currency cost, retries, tool calls, queue depth, P50/P95 latency, and elapsed wall time. A budget breach ends the lane as `budget_exhausted`; the system does not silently change provider or model.

## Required artifact bundle

```text
output/playtests/campaign-play/<run-id>/
  manifest.json
  eligibility.json
  build/
  turns.jsonl
  inputs.jsonl
  browser-actions.jsonl
  network-trace.jsonl
  model-stages.jsonl
  budget.json
  runtime-events.jsonl
  receipts.jsonl
  actor-jobs.jsonl
  visibility.jsonl
  checkpoints/
  probes/
  transcript.md
  scorecard.json
  human-notes.md
  browser-console.json
  network-errors.json
  screenshots/
  inventory.json
```

`manifest.json` records commit, dirty status, campaign/run IDs, provider/model, timestamps, and budget. `build/` holds the separate build ledger and sanitized model-contract evidence. Checkpoints contain before/after canonical state, hashes, process restart evidence, entity-ID comparison, and pending-request replay evidence. `probes/` contains the secrecy, causality, autonomy, route, and custody cases. `inventory.json` records filename, byte count, SHA-256, and verification result for every retained artifact.

## Recommended execution sequence

1. Implement deterministic gameplay-turn contracts and receipts.
2. Deliver an opening and one complete player turn through the normal UI.
3. Add one off-screen actor proposal that reaches the player through a sourced visibility path.
4. Run a pristine 10-turn campaign.
5. Extend the same contract to a pristine 30-turn campaign with secrecy and autonomy probes.
6. Complete two fresh 60-turn campaigns and one clone or provenance campaign.
7. Complete the 300-turn soak with scheduled restart and replay checkpoints.

This sequence keeps deterministic fixtures ahead of expensive provider work and uses real player turns as the promotion evidence.
