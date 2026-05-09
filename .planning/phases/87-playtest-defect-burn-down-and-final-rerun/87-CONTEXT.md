# Phase 87 Context: Playtest Defect Burn-Down and Final Rerun

Phase 87 burns down the current Phase 86 findings ledger. Phase 86 is still in progress, but the current ledger has enough repeated P0/P1/P2 evidence to draft executable plans.

## Accepted Planning Inputs

- `P86-CAL-001` P0: older Naruto x JJK campaigns fail `/game` SceneFrame construction.
- `P86-F001` P1: concrete pressure, actors, props, routes, obligations, or aftermath can appear in prose with `worldChanged=false`.
- `P86-F002` P0: accepted turns can settle with empty assistant text.
- `P86-F003` P2: `/game` repeatedly reports visible overflow candidates.
- `P86-F004` P1: GM drops recent route/social context and asks the player to resolve referents the system should hold.
- `P86-F005` P1: combat route stays in liminal tension instead of clear no-combat or tracked conflict state.
- `P86-F006` P1: English routes can produce Russian narration.
- `P86-OK-001` preservation: false claims about keys, permits, passes, access tokens, and authority are correctly challenged without free state grants.

## Fix Policy

- Do not disable tools as a substitute for correcting tool intent.
- Do not add content fallbacks that make the game pretend it worked.
- Do not shorten legitimate model turns to force superficial speed.
- Do not weaken `P86-OK-001` while fixing state persistence, context, combat, or narration.
- Prefer root-cause prompt/tool/world-state fixes with deterministic regressions and live rerun evidence.

## Source Coverage Audit

| Source | Item | Covered by |
|--------|------|------------|
| GOAL | Burn down concrete Phase 86 defects, rerun, preserve mechanics | 87-01 through 87-06 |
| REQ | P87-R1 accepted findings owners/root-cause traceability | 87-01 |
| REQ | P87-R2 P0/P1 root-cause fixes and regression evidence | 87-02, 87-03, 87-04, 87-05 |
| REQ | P87-R3 P2 fix or explicit rationale | 87-06 |
| REQ | P87-R4 no disabled mechanics, no fake fallbacks, preserve false-claim boundary | 87-01 through 87-05 |
| REQ | P87-R5 final multi-route rerun | 87-06 |
| REQ | P87-R6 closeout evidence and acceptance reconciliation | 87-06 |
| RESEARCH | Phase 86 evidence corpus, route matrix, per-turn JSONL/screenshots | 87-01, 87-06 |
| CONTEXT | No-fallback policy and final rerun gate | 87-01 through 87-06 |

## Exit Condition

- P0/P1 findings are fixed and rerun.
- P2 findings are fixed or explicitly accepted with rationale in `87-ACCEPTED-FINDINGS.md`.
- Final rerun covers at least one route per campaign plus every route type that had a P0/P1/P2 finding.
