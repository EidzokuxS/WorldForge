# Phase 86 Context: Exhaustive Live Playtest Matrix

## Why this phase exists

Phases 81 through 85 changed the core gameplay contract: GM Read, sequential tool loop, dynamic scene expansion, RP prompts, and final Narrator prose. Deterministic tests and short branchy gates prove pieces of that stack, but they do not prove that the game feels playable over time.

Phase 86 is the long-horizon UAT gate. It must exercise the system as a player would: multiple worlds, multiple play styles, long enough route depth to reveal drift, and enough evidence to explain every failure without guessing.

## Boundary

This phase is primarily testing and evidence gathering.

Allowed:
- Add or extend Playwright/Node playtest harnesses.
- Add route manifests, artifact schemas, and report generators.
- Create campaigns/checkpoints for test evidence.
- Produce a findings ledger with root-cause hypotheses.

Not allowed:
- Product fixes except trivial test harness support.
- Disabling tools, hiding mechanics, or adding fallbacks to make the run look green.
- Counting turns without state/prose/tool/UI evidence.

## Active model target

The live role model target is MIMO Pro 2.5. Preflight must verify that the active `judge`, `storyteller`, and `generator` role settings point at the configured MIMO Pro 2.5 model before the matrix is treated as valid evidence. Provider secrets must not be printed in artifacts.

## Required outputs

- `output/playwright/phase-86-overnight/manifest.json`
- `output/playwright/phase-86-overnight/campaigns.json`
- `output/playwright/phase-86-overnight/routes/<campaign>/<route>/turns.jsonl`
- `output/playwright/phase-86-overnight/routes/<campaign>/<route>/screenshots/`
- `output/playwright/phase-86-overnight/findings.json`
- `output/playwright/phase-86-overnight/summary.json`
- `.planning/phases/86-exhaustive-live-playtest-matrix-and-findings-ledger/86-FINDINGS.md`

