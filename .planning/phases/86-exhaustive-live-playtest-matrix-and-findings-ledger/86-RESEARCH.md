# Phase 86 Research

## Existing harnesses

The closest live gameplay harness is `e2e/84-rp-prompt-branchy-playtest.ts`. It already knows how to:
- Load `/game`.
- Restore a baseline checkpoint.
- Submit player actions.
- Wait for long model turns with periodic status logs.
- Capture screenshots.
- Write JSONL per turn.

Its current coverage is too small for Phase 86: three branches, two actions each, one campaign. Phase 86 should generalize the pattern into a manifest-driven matrix instead of replacing it with manual clicking.

Useful existing commands:

```powershell
$env:FRONTEND_URL='http://localhost:3000'
$env:BACKEND_URL='http://localhost:3001'
$env:ARTIFACT_DIR='output\playwright\phase-86-overnight'
npx tsx e2e\86-exhaustive-playtest.ts
```

## Candidate campaign settings

The matrix needs distinct stress shapes, not four versions of the same urban fantasy setup:

1. `urban-occult-crossover`
   - Purpose: known-IP mashup, canon pressure, high-power combat, source discipline.
   - Candidate sources: `X:\Models\Chars\main_SCP RP Lorebook_world_info.json` only if explicitly selected; otherwise no library source for clean JJK/Naruto prompt behavior.
   - Character candidates from `X:\Models\Chars`: `Yae Miko.card.png`, `main_yae-miko-bb160d02_spec_v2.png`, `main_hiroe-yuu-ac968859_spec_v2.png`.

2. `authority-devil-social`
   - Purpose: social domination, faction pressure, high-agency NPCs, coercion without instant player-centrism.
   - Character candidates: `Makima.png`, `main_makima-f1ea8f51_spec_v2.json`, `main_makima-the-control-devil-366486d1beae_spec_v2.png`, `main_quanxi-89e1b3a751e3_spec_v2.png`.

3. `mythic-frontier-survival`
   - Purpose: low-power player versus much stronger entities, resource pressure, travel, dangerous locations.
   - Character candidates: `Tiamat.json`, `Tiamat_EldenRing_Build.md`, `main_fantasy-rpg-asmora-02e63c9d9fe9_spec_v2.png`, `main_varienne-the-dominant-archdemon-ff5027be49e9_spec_v2.png`, `Ryo _ Delinquent.card.png`.

4. `anomaly-station-intrigue`
   - Purpose: space/containment weirdness, investigation, noncombat pressure, world changes offscreen.
   - Source candidates: `main_Voices of the Void LB_world_info.json`, `main_voices-of-the-void-nina-s-edit-9d09b2a6c310_spec_v2.png`, `main_SCP RP Lorebook_world_info.json`.

## Route taxonomy

Each campaign gets five route types:

- `tourist-observer`: player avoids the main plot, walks, eats, asks mundane questions, watches whether the world continues without them.
- `social-pressure`: player negotiates, lies, asks favors, refuses hooks, and tests NPC agency.
- `exploration-location-graph`: player moves through locations, backtracks, asks about exits, and tests whether places connect logically.
- `false-claim-boundary`: player asserts unsupported inventory/access/status and checks that the GM treats it as a claim, not truth.
- `combat-power`: player triggers conflict across mismatched power levels and checks backend/narrator consistency.

## Evidence dimensions

Every turn record should capture:

- Player action and route intent.
- Elapsed time as observation only, not a quality gate.
- Assistant visible text.
- Screenshot path.
- SSE/progress stage data.
- GM Read path, if available from logs.
- Tool calls, observations, failures, revised/skipped steps.
- World before/after hash or DB snapshot fingerprint.
- World delta summary: location, NPC presence, inventory, HP/status, facts, recent happenings.
- Combat state when present.
- Location graph movement proof.
- Visual state: stage nonblank, text readable, no overlap, effects/flash/shake/signal classes if triggered.
- Prose score: concrete, grounded, readable, not slop, no hidden truth leak.
- Gameplay feel score: would a player keep going?

