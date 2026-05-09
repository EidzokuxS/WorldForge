# Phase 83 Context - WorldForge V4 Full Visual Migration

## Why This Phase Exists

The approved visual target lives in `docs/WorldForge-v4`. The user explicitly does not want a minimal copy or safe partial skin. The real frontend must be migrated to the V4 visual language across actual product routes, while preserving real behavior and rejecting prototype-only fake state.

## Target Artifacts

- `docs/WorldForge-v4/index.html`
- `docs/WorldForge-v4/_shots/night2-*.png`
- `docs/WorldForge-v4/REALITY-AUDIT.md`
- `output/playwright/worldforge-v4-final/`
- `output/playwright/worldforge-v4-reality-audit/`

## Requirements

- P83-R1: Every migrated visible control/status is classified against current product truth as real current behavior, backend-backed target UI, or intentionally deferred; mock-only prototype controls are removed.
- P83-R2: Global shell, rail, typography, spacing, panels, tabs, drawers, cards, buttons, and responsive constraints move to the V4 visual language.
- P83-R3: Launcher, campaign creation, worldgen/DNA, review, character, settings, library/worldbook, and import flows preserve existing behavior while adopting the V4 layout rhythm.
- P83-R4: `/game` keeps the scene-first VN/RPG contract: stage, HUD, presence, narration dock, action dock, widgets/drawers, log/auto/next, and hidden debug.
- P83-R5: The migration removes ad hoc duplicate styling instead of pasting prototype HTML/CSS beside the real component tree.
- P83-R6: Screenshot QA compares real routes against V4 target shots at 1366, 1920, and 2560 widths, plus mobile/tablet overlap smoke.
- P83-R7: Interaction QA covers tabs, drawers, imports, settings persistence, game send/continue, log/auto/next, and route navigation.
- P83-R8: The final result is beautiful, coherent, and playable, not merely technically passing.

## Planning Note

Detailed execution plans are deferred until Phase 82 closes. This avoids migrating the full visual layer while the gameplay scene/tool behavior is still moving underneath it.
