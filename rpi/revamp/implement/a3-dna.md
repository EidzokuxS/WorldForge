# A3 DNA Adapter Canvas

## Objective

Build the first Campaign Kernel module after draft creation: a pure function plus persistence step that maps the revamp create-campaign `seeds`, `premise`, and `worldgenResearchArtifact` into the `world_ready` portion of kernel state.

## Operating Contract

- Use old worldgen only as reference for seed shape and research-artifact handling.
- Keep A3 limited to DNA normalization, kernel phase transition, persistence, and proof.
- Read only fields written by the revamp create-campaign path: `seeds`, `premise`, `worldgenResearchArtifact`, `worldgenSourceHint`, and `worldgenResearchEnabled`.
- Persist A3 kernel state to `kernel.json` inside the campaign directory.
- Fail with an error and keep the kernel out of `world_ready` when `premise` or any required DNA seed field is empty.
- Leave World Build, Cast Registry, Starting Setup, Opening, and Chat Loop for later slices.
- Do not call `/api/worldgen/generate`.

## Agent Lanes

### L1 Source Lock
Status: complete
Owner: L1
Scope: Bind A3 to the revamp architecture and existing A0-A2 output.
Output:

- [sourced] Development order says A3 is `DNA adapter from current worldgen`.
- [sourced] A2 already routes `Create Campaign` to `/campaign/:id/revamp` with a draft kernel shell.

### L2 Current-State Map
Status: complete
Owner: L2
Scope: Locate current campaign config, seed, and research-artifact persistence.
Output:

- [inspected] `backend/src/campaign/manager.ts` reads `seeds`, `worldgenResearchArtifact`, `worldgenSourceHint`, and `worldgenResearchEnabled` from `config.json`.
- [inspected] `backend/src/routes/campaigns.ts` writes those fields through `createCampaign`.

### L3 Reference Extraction
Status: complete
Owner: L3
Scope: Extract only validation and coercion rules from current worldgen seed shape.
Output:

- [proposed] Map `geography`, `politicalStructure`, `centralConflict`, `environment`, and `wildcard` by trimmed string.
- [proposed] Map `culturalFlavor` by trimming non-empty array entries and joining them with `; `.

### L4 Kernel Protocol
Status: complete
Owner: L4
Scope: Define the minimal persisted `world_ready` kernel update.
Output:

- [proposed] A3 writes `kernel.json` beside `config.json`.
- [proposed] A3 may advance only `draft` or `world_ready` kernels and rejects later phases.

### L5 Proof Harness
Status: complete
Owner: L5
Scope: Prove A3 without starting old full worldgen.
Output:

- [executed] `backend/src/revamp/__tests__/dna-adapter.test.ts` proves seed mapping, missing-field failure, `kernel.json` persistence, research-artifact premise use, and phase guard.
- [executed] Focused A3 vitest passed: `5 passed`.

### L6 Cleanup/Risk
Status: complete
Owner: L6
Scope: Inspect code paths that still assume old worldgen owns DNA after campaign creation.
Output:

- [inspected] `backend/src/revamp/dna-adapter.ts` does not import old worldgen route or scaffold generator code.
- [inspected] A3 test imports only the research-artifact fixture from old worldgen tests.

## Integration Notes

- +1 decision: A3 is a small kernel module, not a UI flow and not a world builder.
- +1 proof target: create a campaign config with full seeds and research artifact, run the adapter, read `kernel.json`, and observe `phase: "world_ready"` plus six populated `RevampWorldDNA` fields.
- +1 GLM note: GLM-5.2 requested clearer wording, L1-L6 lane names, explicit persistence, and an explicit seed-to-DNA mapping. Those revisions are applied here.
