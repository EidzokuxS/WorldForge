---
phase: 72-worldgen-authority-propagation-regression-audit
plan: 72-04
artifact: generic-ingestion-adjacency
created: 2026-04-26
---

# Generic Character Ingestion Adjacency

## Disposition: Explicit Deferral

Generic character ingestion is not an artifact-backed worldgen path in Phase 72.
No production code in `backend/src/character/ingestion/*` changed in this plan.

## Scan Command

```powershell
rg -n "worldgenResearchArtifact|researchArtifact|classifyCanonicalStatus\(|ingestCharacterDraft\(" backend/src/character backend/src/routes backend/src/worldgen -g "*.ts"
```

## Scan Output Summary

- `backend/src/character/ingestion/types.ts` defines `IngestionContext.campaign` with `premise`, `ipContext`, and `premiseDivergence`; it has no `worldgenResearchArtifact` or `researchArtifact` field.
- `backend/src/character/ingestion/pipeline.ts` calls `classifyCanonicalStatus(...)` with `ctx.campaign.ipContext` and `ctx.campaign.premiseDivergence`.
- `backend/src/routes/character.ts` calls `ingestCharacterDraft(...)` from parse, generate, research, and V2 card import character routes. `buildIngestionContext(...)` loads legacy `ipContext` and `premiseDivergence`; it does not load a v2 worldgen artifact.
- `backend/src/routes/worldgen.ts` owns artifact-backed `/suggest-seeds`, `/suggest-seed`, `/generate`, `/regenerate-section`, and `/save-edits` lanes. These routes pass artifacts into worldgen/scaffold/lore paths, but they do not call `ingestCharacterDraft(...)`.
- Worldgen scaffold and prompt modules consume `researchArtifact` directly through worldgen request types and scaffold step helpers, separate from generic character ingestion.

## Scope Guard

The generic character ingestion path remains an adjacent player/import/generate-character flow, not a Phase 72 artifact-backed worldgen flow. Future support for character import or player creation that intentionally uses `WorldgenResearchArtifactV2` needs a separate requirement, an explicit caller chain, and its own focused plan before backend ingestion production code changes.
