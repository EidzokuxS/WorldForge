# Task 196 - Game Master mechanical-authority diagnostic coordinates

## Contract and frozen boundary

The frozen r143 run is immutable: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r143`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. At action 2 both Game Master attempts reached the Mechanical Authority Reviewer and repeated `mechanical_authority_rejected`; the private reviewer reason and rejected subclaim were not retained. The existing generic recovery instruction already forbids untyped possession, obligation, and route claims. Task 196 is diagnostics-only and does not infer a cause or add another recovery instruction.

The provider-facing Mechanical Authority Reviewer result now requires `failedChecks`. An accepted result must use `failedChecks: []`. A rejected result must use one to five entries from this exact enum, in provider output order before private canonicalization:

- `possession_authority_missing`
- `obligation_authority_missing`
- `route_authority_missing`
- `possession_transform_identity_incomplete`
- `other_mechanical_authority_mismatch`

Rejected reviews are canonicalized to the enum declaration order and deduplicated for one private `reviewFailedChecks` warning field. The existing warning name, model-contract error, denial, artifact boundary, generic `mechanical_authority_rejected` recovery feedback, recovery prompt, attempt limit, mechanics, persistence, provider/model/mode/deadline, and player-visible behavior remain unchanged. Reviewer reason, proposal/event summaries, player text, names, provider text, and raw candidate data are not logged or persisted in the rejected-review warning payload.

The exact reviewer instruction is intentionally unchanged from Main's approved literal:

> Set failedChecks to [] when verdict is accepted. When verdict is rejected, include each applicable safe check once: possession_authority_missing for an untyped possession or custody change; obligation_authority_missing for an untyped debt, payment, or duty change; route_authority_missing for an unsupported route or access claim; possession_transform_identity_incomplete when a typed transformation leaves retained possession identity incomplete; other_mechanical_authority_mismatch only when none of the specific checks applies. Do not copy event summaries, proposal text, player text, actor names, location names, provider text, or the free-form reason into failedChecks.

Prompt semantic review: Main's prompt-craft, humanizer, and deslop verdicts all approve the literal as direct, bounded, and non-sloppy. No other prompt or player-visible copy changed.

## Impact and implementation

Entry branch was `feat/revamp` at local/origin `43ba9aa68193bd5b112e77d772f1ed2fc5779680`; only the pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes were present. The registered GitNexus index was stale. A task-owned exact-entry shadow was rebuilt at `43ba9aa68193bd5b112e77d772f1ed2fc5779680` (`14,934` nodes, `42,704` edges, `882` flows).

The exact private schema target `mechanicalAuthorityReviewSchema` and prompt helper `mechanicalAuthorityReviewPrompt` were LOW risk. The nested `createCampaignPlayGameMaster.plan` implementation seam was LOW lower-bound with no indexed direct callers because 22 receiver callsites were unresolved. The exported outer factory `createCampaignPlayGameMaster` reported HIGH transitive impact (18 symbols, 3 direct callers, Campaign Play drive/recoverNarration/admitTurn and Engine transitive modules), but it is not the edited target and its exported signature is unchanged. No CRITICAL exact edited target was used and no other production owner was edited.

Implementation is limited to `backend/src/campaign-play/game-master.ts`: the private reviewer schema is a verdict-discriminated union; canonicalized failed-checks are carried only through an in-memory WeakMap to the existing private warning; the generic recovery feedback remains byte-for-byte equivalent. `backend/src/campaign-play/game-master.test.ts` inspects the Zod/provider JSON Schema, accepted/rejected shape boundaries, prompt literal, canonical ordering/deduplication, and diagnostic privacy.

## Static validation before r144

The focused Game Master suite passed 62/62 tests. The focused turn-runtime suite passed 72/72 tests, and the Campaign Play application suite passed 15/15 tests. Backend typecheck (`tsc --noEmit`) and build (`tsc -p tsconfig.json`) passed. `git diff --check` passed. A first path-prefixed Vitest invocation was a harness/command-path miss with no test files selected; the corrected package-relative command passed and is the acceptance result. Exact-entry shadow GitNexus `detect_changes --scope staged` reported 3 files, 9 symbols, 5 Plan flows, and MEDIUM risk: the expected private reviewer/schema and nested Game Master Plan path plus focused test symbols. The registered primary index returned no changes because it is stale at commit `1a06944`; the shadow result is authoritative for this staged patch. Protected `AGENTS.md` and `CLAUDE.md` remain byte-for-byte unchanged and unstaged. Generated r144 evidence is not part of the implementation commit.

## r144 journey

The fresh lane is `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r144`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using owned ports `4300/4301/4302`. Canonical setup hashes are template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The exact rendered setup, action/checkpoint, natural diagnostic, hard-stop or 60-action/reload result, authoritative SQLite/log anchors, evidence hashes, and cleanup will be appended after the one fresh lane. No diagnostic coverage will be claimed unless `reviewFailedChecks` occurs naturally.

## Acceptance handoff before r144

- Private generation contract: the reviewer schema and prompt literal are bounded to the allowlisted checks; no accepted/rejected semantics or recovery route changes.
- Diagnostic contract: a rejected review will expose only ordered/deduplicated `reviewFailedChecks`; raw reviewer/proposal/player/provider content remains excluded.
- Protected behavior: generic recovery feedback, prompt, one automatic recovery, mechanics, identity, deadlines, persistence, UI, and unrelated roles remain unchanged.
- Built product and persistence: unavailable until the single r144 lane reaches its first genuine defect or 60 unique bindings plus same-page reload.
