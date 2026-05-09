# Phase 88 Live Deep Clone-Pool Proof

Date: 2026-05-09

## Intent

Run the final Phase 88 gameplay-distance proof without paying the cost of fresh world generation on every route. The test reuses fresh generated baseline campaigns by cloning their campaign directories and SQLite state, then assigns untouched route-specific clones to each live route.

This verifies gameplay, living-world pressure, source boundaries, rollback/retry behavior, memory/faction/report handling, combat pressure, latency, and narrator packet behavior. It does not retest world generation.

## Run

- Artifact: `output/playwright/phase-88-living-world/live-deep-clonepool-20260509-glm/`
- Mode/profile: `PHASE88_MODE=live`, `PHASE88_PROFILE=deep`
- Model path: current live settings using `glm-5-turbo`
- Clone pool: `PHASE88_CLONE_POOL_SIZE=30`
- Source campaigns:
  - Lacquer Signal: `16971bd0-9873-4cf1-b24c-b61f47b226d5`
  - JJK / chakra crossover: `8d9f2423-c9ad-4f4d-ad96-8f0fc8e93dcc`
- Started: `2026-05-09T06:18:16.279Z`
- Finished: `2026-05-09T07:04:29.562Z`
- Exit code: `0`

## Result

- Status: passed
- Routes: 8
- Turns: 14
- Hard failures: 0
- Soft-review samples: 14
- `findings.json`: not written because no hard findings were emitted.

Route coverage:

| Route | Turns | Hard failures | World changed | Average seconds |
| --- | ---: | ---: | ---: | ---: |
| `tourist-pressure` | 2 | 0 | 2 | 117.9 |
| `key-npc-offscreen` | 2 | 0 | 2 | 170.6 |
| `faction-report-latency` | 2 | 0 | 2 | 219.3 |
| `false-claim-boundary` | 2 | 0 | 2 | 130.5 |
| `combat-power-mismatch` | 2 | 0 | 2 | 188.9 |
| `memory-stress` | 2 | 0 | 1 | 87.8 |
| `rollback-sanity` | 1 | 0 | 1 | 321.1 |
| `latency-stress` | 1 | 0 | 1 | 200.6 |

## Trace Audit

- Turn logs referenced by route artifacts: 15 backend log files for 14 player-visible turns plus one intentional restore outcome.
- `turn.end` success outcomes: 14.
- Restore outcome: 1 expected checkpoint restore outcome during rollback/faction route handling.
- Turn rollback events: 0.
- `didClipModelOutput=true`: 0.
- `didClipModelOutput=false`: 14.
- Narrator packet guard passed: 12 recorded packet-guard checks.
- Narrator packet guard recovery: 0.
- Storyteller calls: 12.
- Storyteller retries: 0.
- LLM attempts observed: 25.
- Maximum output tokens in a single observed LLM attempt: 3271.
- Maximum reasoning tokens in a single observed LLM attempt: 2360.
- Total observed reasoning tokens across attempts: 25534.

Two structured LLM attempts returned invalid objects and were recovered by the existing retry/fallback path:

- `turn-0-4c471e3d.jsonl`: world forecast validation failed because one entry lacked `subjectRefs`.
- `turn-0-2b3aab9b.jsonl`: structured generation returned an array where an object was expected.

Both recovered without hard route failure, rollback, output clipping, or gameplay interruption. Treat them as prompt/schema tuning evidence, not a Phase 88 blocker.

## Gameplay Read

The clone-pool proof confirms the corrected direction:

- Passive/tourist play still receives world pressure through local signs, service NPCs, faction movement, and time passing.
- Key NPC/offscreen movement can surface as player-visible consequence without omniscient exposition.
- False claims remain claims/social provocations and do not become durable truth.
- Combat/power mismatch routes require adjudication and state mutation instead of free narration wins.
- Memory-stress routes can produce direct/local continuity without forcing mutation when no durable world write is required.
- Long turns are observed without arbitrary model-turn caps, and output is preserved instead of clipped.

## Residual Follow-Up

- Keep watching GLM structured-output reliability. The current retry/fallback behavior is acceptable for gameplay, but prompt/schema tuning may reduce recovered invalid attempts.
- Soft prose/playfeel samples are queued for LLM/human review. The harness deliberately does not pretend keyword heuristics can judge prose quality.
