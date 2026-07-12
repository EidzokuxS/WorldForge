# Task 4: Campaign Play character intake

Date: 2026-07-11  
Status: complete.

## Outcome

Campaign Play now owns a pure character intake boundary. It accepts a complete Character Card V2 envelope, generated concepts, and research-backed concepts. The service produces one strict public draft plus stable source and profile digests. Task 6C will own persistence and actor bootstrap.

Files:

- `backend/src/campaign-play/character-service.ts`;
- `backend/src/campaign-play/character-service.test.ts`;
- one export in `backend/src/campaign-play/index.ts`.

The service imports the generic ingestion pipeline and CharacterRecord adapter through explicit boundaries. It has no database, repository, route, Campaign Kernel, player-flow, or world-writer dependency.

## Contracts proved

- The card parser accepts the `chara_card_v2` / `2.0` envelope. Root-level cards, other versions, partial data, unknown root or data fields, malformed character books, and oversized JSON fail before model work.
- Card system prompts, post-history instructions, creator notes, greetings, character books, extensions, and tags stay outside the donor model input.
- Accepted world context must belong to the campaign and contain a completed acceptance. The donor receives canonical accepted context, sorted location names, and `factionNames: []`.
- Research returns a bounded summary with `sources: []`, matching the evidence exposed by the donor. Empty, oversized, and failed research returns a typed service error.
- `character_card` requires `native` or `outsider`. Created, generated, and research sources require a null import mode. Contradictory provenance stops before profile materialization.
- Prepared records use the player/key tuple, HP 5, and idle activity. They carry inventory seed and signature items while leaving faction, placement, relationships, equipped items, player goals, and starting conditions for their owning tasks.
- Source digests bind the normalized public intake under `campaign_play_character_source`. Profile digests bind the full canonical CharacterRecord under `campaign_play_character_profile`. Repeated preparation produces identical bytes and digests; actor identity changes only the profile digest.
- Campaign and actor identifiers use the Campaign Play identifier alphabet and byte bounds before canonicalization.

The CharacterRecord adapter exposed one optional `powerStats: undefined` property. Campaign Play removes that property before canonical JSON generation because its projection format admits JSON values only. The shared adapter remains unchanged.

## Verification

```powershell
npm --prefix backend test -- src/campaign-play/character-service.test.ts src/character/__tests__/record-adapters.test.ts src/character/ingestion/__tests__/pipeline.test.ts
npm --prefix backend run typecheck
git diff --check
```

Results:

- 3 test files passed;
- 53 tests passed: 37 Campaign Play character tests, 8 record-adapter regressions, and 8 ingestion-pipeline regressions;
- backend TypeScript check passed;
- diff check passed, with the repository's existing line-ending warnings only;
- standalone smoke additions: 0.

The deterministic fixture contains a complete V2 envelope with realistic card content and every instruction-bearing field. Generated and research-backed fixtures pass through the same donor boundary. This task exposes no route or player surface, so live campaign playtesting starts at the planned integrated bootstrap and first-playable gates.

## Reviews

The mechanical Terra verifier returned `PASS` after running the exact test and typecheck commands. It confirmed the pure service scope and found no database, repository, or route imports.

The first Sol semantic review found one P1: source kind and import mode could contradict each other. The local cross-field invariant and four rejection cases now close that path. It also requested object validation for `character_book`; the parser now accepts object, null, or absence and rejects scalar values. The fresh follow-up returned `PASS` with zero P0, P1, or P2 findings after rerunning all 53 tests and typecheck.

GLM/Droid remained unavailable after the documented repair attempts. The owner authorized forward progress, so the failure is retained as advisory evidence rather than a product blocker. The review prompt remains at `.codex/droid-prompts/campaign-play-character-intake.md`.

Humanizer and deslop checks found the final note direct, technical, and free of promotional filler. No production UI or player-visible copy changed.

GitNexus pre-edit impact could not resolve the untracked Task 4 files or the barrel file. The imported high-risk CharacterRecord adapter stayed unchanged. Final `detect_changes` reported the accumulated dirty worktree as critical across 45 tracked files; it did not attribute a changed indexed symbol or execution flow to the new Task 4 service. This task preserves all earlier worktree changes.
