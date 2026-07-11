# Task 2A Evidence: Campaign Source

## Contract

- `withCampaignWorldSourceLock` serializes one campaign key, permits different keys to overlap, releases in `finally`, and removes only its own tail.
- `CampaignWorldSourceService.load` derives a normalized source and SHA-256 digest from the campaign premise, optional complete DNA, saved research artifact or selected-worldbook research context, and source references.
- `CampaignWorldSourceService.saveDna` requires a state guard, executes that guard and `saveWorldSeeds` inside the source mutex, then reloads the normalized source.
- `assertCampaignWorldSourceWritable` permits `unbuilt | failed`, maps `building` to `world_build_running`, and maps `review | accepted` to `campaign_world_exists`.

## Strict source boundary

- The adapter calls the existing `readCampaignConfig` through the public campaign index and reads raw `config.json` only to prove field presence and strict source shape. DNA comes from the normalized config result after the raw guard passes.
- Existing `readCampaignConfig` remains unchanged because GitNexus reports HIGH impact: 10 direct callers and 18 affected symbols.
- Stored DNA requires exactly six fields. Cultural flavor remains a string array in config, joins with literal `; ` in the source contract, and splits only on literal `;` during save.
- Empty flavor entries and a stored entry containing `;` fail with `campaign_dna_invalid`; commas remain ordinary content.
- Worldbook references include the normalized source hash in their ID. Research-result references include a hash of job and URL identity. Either source change updates the source digest.
- Selected-worldbook `ipContext` supplies research content when no research artifact exists. Donor canonical organization names map to `collectives` inside the Campaign World source summary.
- A premise or normalized research summary supplies build context. A hint or provenance reference alone fails with `campaign_source_invalid`.
- No Campaign World source file imports `backend/src/worldgen/**` or writes `kernel.json`.
- The adapter imports the existing `WorldgenResearchArtifactV2` type from the shared public package because `config.json` already stores that intake shape. The adapter projects it into Campaign World source data and creates no dependency on `backend/src/worldgen/**`.

## Verification

- Focused source and mutex tests: 2 files, 20 tests passed.
- Backend typecheck: passed.
- Same-source digests are stable; premise, DNA, saved research artifact, selected-worldbook context, changed source hash, and changed research URL fixtures are covered.
- DNA save calls `saveWorldSeeds` once, reloads the identical canonical DNA, preserves commas, and leaves fixture `kernel.json` byte-identical.
- Same-campaign serialization, cross-campaign overlap, failure release, invalid JSON, partial DNA, delimiter rejection, and state eligibility are covered.
