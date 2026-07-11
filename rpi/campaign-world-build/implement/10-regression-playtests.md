# Task 10: regression and live acceptance

Date: 2026-07-10
Status: complete. Final regression, both acceptance bundles, and repeated independent audits pass.

## Repairs found by live playtests and review

1. The structured-output registry now includes the Campaign World builder, and the store manifest includes all eleven Campaign World tables.
2. The connections prompt defines relation intensity and pressure urgency as integers from 1 through 5.
3. Forge derives its visible stage from the newest durable event when the state snapshot is behind the event stream.
4. The frame prompt requires `null` for macro parent references and an exact macro reference for sublocations.
5. Review presents saved research as Interpretation, Tonal anchors, and Research caveats.
6. Repository reads recompute the frozen source digest instead of comparing stored digest strings.
7. The mounted campaign WorldBook writer and its scaffold row writes were removed. Reusable Library intake remains.
8. Every generated string now has an exact whitespace contract. Cast and connections prompts expose explicit allowed reference sets, and invented references fail closed.
9. The whole-world validator now applies the one-goal background limit to people and collectives, matching the stage schema.
10. The campaign shell retains resolved campaign identity when World State is temporarily unavailable. Forge and Review also share one research presentation boundary, so Forge no longer exposes serialized JSON.
11. The shared presenter handles selected-worldbook context as readable franchise and key facts. Review keeps a persisted accepted world authoritative when the later shell refresh fails and reports that refresh as a separate status notice.

Diagnostic failures remain in their own bundles. They used one native JSON attempt and committed zero Campaign World domain rows. They are failure-contract evidence rather than promotion runs.

## Final regression matrix

| Check | Result |
|---|---|
| Shared build | PASS |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Backend full suite | PASS: 249 files, 1 skipped; 3,548 tests passed, 30 todo |
| Frontend full suite | PASS: 64 files; 488 tests passed |
| Backend production build | PASS |
| Frontend production build | PASS |
| Diff whitespace check | PASS; Git reported line-ending notices only |
| Active-path boundary checks | PASS: zero displaced Forge/Review imports, retired workstream test ids, donor completion flags, Phase registry labels, or standalone smoke references |
| Focused repair tests | PASS: validator 25 tests; research, Forge, shell, and Review 22 tests; final research/acceptance subset 11 tests |

Logs are stored in `output/verification/campaign-world-build/`. The post-audit frontend records are `frontend-tests-post-audit.log`, `frontend-typecheck-post-audit.log`, and `frontend-build-post-audit.log`. Frontend stderr contains existing checkpoint dialog description warnings and the production build reports the existing multiple-lockfile root warning. Every command exits successfully.

## Live acceptance A: premise only

- Campaign: `6fa1f0f2-e35f-465a-bb09-addd610b16a1`
- Build: `21321377-ea71-4104-8349-02863b8b56a6`
- Provider/model: `custom-zai-coding` / `glm-5.2`
- Source digest: `7f60b72ff6d6e1c98bda0056949964054baebd720b5c0b9a38066e20969a1364`
- Accepted version: `1`
- Content hash: `8942d85f77811aa958f044582ec2e054f7a112387bf67dd3a7f27f13e8d87a5c`
- World: 9 locations, 14 routes, 7 actors, 9 goals, 17 relations, 11 placements, and 5 pressures.
- Restart projection SHA-256: `912b59e4aa4e3e1f63e21479abf02d83d61c471f4b34b3e4c6ba747ac9c7316f` before and after restart.
- Bundle: `output/playtests/campaign-world-build/acceptance-a-premise-only-2026-07-10T05-58-19-726Z/`

The bundle includes a readable accepted Review at desktop and narrow width. Focused screenshots cover Thera Voss, Brann Selke, the Cinderfall Miners Guild, their goals and placements, directed relations, and linked pressures. `human-notes.md` records zero hard contradictions and four concrete developments that can proceed without a player.

## Live acceptance B: research and edited DNA

- Campaign: `cb95ab65-a792-4aff-b9a3-e9c1cdf47f1b`
- Build: `84cfd531-fa40-4065-81f0-12c89a2a3274`
- Provider/model: `custom-zai-coding` / `glm-5.2`
- Source digest: `bf129453048e51c3c0f112caec8213ede4afc8917cfd97015c0da54febf941f6`
- Accepted version: `1`
- Content hash: `ae1989c592573734b7b76fe34dc9f4231cc9eb918ecca10f8b93602c64c11014`
- World: 9 locations, 24 routes, 8 actors, 11 goals, 22 relations, 16 placements, and 6 pressures.
- Restart projection SHA-256: `1dc859d0cadcd094fff63df3c8a1df2198c29c3a4ea46b082fd87976becab308` before and after restart.
- Bundle: `output/playtests/campaign-world-build/acceptance-b-research-dna-2026-07-10T06-18-49-336Z/`

The source contains edited World DNA, saved research, and 11 normalized references. The request trace records the DNA save before build acquisition. Focused Review screenshots cover Aldric Vance, Mara Cole, the Labor Council, their goals and placements, directed relations, and linked pressures. `human-notes.md` records zero hard contradictions and several developments that continue without a player.

## Model and persistence evidence

Each lane has twelve ordered build events. Frame, cast, and connections each used one `native_json` attempt with repair, retry, and text fallback flags false. SQLite integrity is `ok`, foreign-key violations are zero, and the acceptance receipt matches campaign, version, and content hash.

Both before and after restart projections are byte identical. The request traces contain zero API errors, zero missing statuses, and zero traffic to displaced worldgen or Campaign Kernel build routes. Console artifacts contain development information messages only.

Each bundle has `artifact-inventory.json`. It records the original capture time, the evidence finalization time, byte count, and SHA-256 for every machine, browser, screenshot, and human-review artifact. Inventory verification reports zero missing files, byte mismatches, or hash mismatches.

## GitNexus scope

Final `detect_changes(scope: all)` reports CRITICAL scope: 45 indexed files, 57 changed symbols, and 22 affected processes. The report centers on the replaced Forge and Review entrypoints, shell status, and the shared campaign config reader used by source acquisition. The full backend/frontend regression, two live player paths, exact restart projections, source-digest checks, and fixed-string cutover checks cover those named surfaces. No commit is part of this task.

## Humanizer and deslop audit

The final notes name the actor, location, goal, relation, pressure, and observed result directly. They avoid promotional language, filler conclusions, hidden model reasoning, and unsupported claims. The added status copy states the committed result and the failed refresh in two short sentences. Droid GLM-5.2 returned `Plan is up-to-date.` Humanizer and deslop found no rewrite requirement. Review log: `.codex/agent-logs/droid-campaign-world-final-audit-repairs-20260710-143240.out.log`.

## Promotion gate

Promotion passes. The repeated Sol correctness audit returned `ALIGNED`, the repeated Terra maintainability audit returned `ALIGNED`, and the Terra evidence audit returned `PASS`. Both acceptance bundles retain exact inventory hashes and byte-identical restart projections.
