# Phase 87 Finding Rerun Matrix

This matrix maps accepted Phase 86 findings to focused rerun filters. It intentionally reuses Phase 86 campaign and route keys so the harness can rerun the same surfaces.

## Harness Filters

Use these environment variables with `e2e/86-exhaustive-playtest.ts`:

- `PHASE87_FINDING_FILTER`: comma-separated accepted finding IDs.
- `PHASE87_ASSERT_FIXED=1`: promote fixed-finding checks to hard failures.
- `CAMPAIGN_FILTER` and `ROUTE_FILTER`: optional extra narrowing after the finding filter.
- `ARTIFACT_DIR`: expected under `output/playwright/phase-87-rerun/`.

## Matrix

| Finding | Campaign Filter | Route Filter | Evidence Turns | Focused Assertion |
|---------|-----------------|--------------|----------------|-------------------|
| P86-CAL-001 | manual legacy calibration | manual `/game` load | `cffb7afd-b3da-4229-a670-a5482e9068e7`, `ad46d191-5b7e-4cc1-a897-1d36dff6f506` | SceneFrame load either works or fixture is classified invalid; 87-04 confirmed these two fixtures have `players=0` |
| P86-F001 | `river-intrigue,urban-occult-crossover` | `tourist-observer,social-pressure,exploration-location-graph,combat-power` | river: tourist 6/16, social 1, exploration 1/2/12/16, combat 2/4/11; urban: tourist 6/16/20, social 20, exploration 1/2/4/9/12/16 | Mutation-heavy pressure cannot remain prose-only |
| P86-F002 | `river-intrigue,urban-occult-crossover` | `tourist-observer,social-pressure,exploration-location-graph,false-claim-boundary,combat-power` | river: tourist 11, exploration 18, combat 19; urban: social 3, exploration 4/16/18/19, false-claim 2/7 | Accepted action cannot complete with empty assistant text |
| P86-F003 | `river-intrigue,urban-occult-crossover` | all five route types | recurring visible overflow candidates | No visible overflow candidates at tested viewport |
| P86-F004 | `river-intrigue,urban-occult-crossover` | `exploration-location-graph,social-pressure,false-claim-boundary` | river: exploration 9/10/14/15; urban: social 2/5/6/13/17/20, exploration 9/14/15/17, false-claim 5/13/14 | Recent referents are resolved from context or clarified diegetically |
| P86-F005 | `river-intrigue,urban-occult-crossover` | `combat-power` | river combat 2/4/9/11/16/19; urban combat in progress | Combat route enters clear no-combat or tracked conflict state; 87-05 added combat-pressure prompt coverage for defensive posture, threat probing, risky moves, aftermath, and power-gap questions |
| P86-F006 | `urban-occult-crossover` | `tourist-observer,social-pressure,exploration-location-graph,false-claim-boundary` | tourist 1-3, social 1/4, exploration 1-3, false-claim 1/3/4/6/9/11/12 | English route/session does not produce Cyrillic narration; 87-05 added deterministic session response language contract to GM Read and final narrator |
| P86-OK-001 | `river-intrigue,urban-occult-crossover` | `false-claim-boundary` | river false-claim 1-20; urban false-claim 1-20 | Unsupported access/item/authority claims do not become truth |

## Suggested Commands

```powershell
$env:PHASE86_DRY_RUN='1'
$env:PHASE86_MODE='pilot'
$env:PHASE87_FINDING_FILTER='P86-F002'
$env:ARTIFACT_DIR='output/playwright/phase-87-rerun/dry-run'
npx tsx e2e/86-exhaustive-playtest.ts
```

```powershell
$env:PHASE86_MODE='full'
$env:PHASE87_FINDING_FILTER='P86-F002,P86-OK-001'
$env:PHASE87_ASSERT_FIXED='1'
$env:TURNS_PER_ROUTE='20'
$env:ARTIFACT_DIR='output/playwright/phase-87-rerun/f002-ok-final'
npx tsx e2e/86-exhaustive-playtest.ts
```
