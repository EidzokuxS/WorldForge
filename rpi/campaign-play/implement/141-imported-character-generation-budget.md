# Task 141 — Imported character generation budget

## Outcome

Character-card import keeps the existing structured synthesis and power assessment, but both import-only model calls now use generator reasoning bypass, one provider attempt, and a 45,000 ms transport timeout. The maximum provider budget for the two sequential import stages is 90 seconds.

## Evidence and decision

The fresh r81 lane submitted the canonical Brina card once. The synthesis provider call produced no response metadata for more than five minutes, while the rendered character surface remained disabled. The request was not repeated. This path used default GLM-5 reasoning, three pipeline attempts, and no transport timeout.

An imported card is already the authority for identity, personality cues, equipment, and source prose. Bypass changes only hidden reasoning effort; the same strict schema, priority merge, normalization, power-stat grounding, provider/model, and saved character contract remain. Parse, generate, research, canonical enrichment, and non-imported original-character assessment retain their existing reasoning and retry behavior.

## Verification

- Synthesis coverage proves import uses generator bypass and a 45-second timeout while parse retains default model construction.
- Power assessment coverage proves imported characters carry the import marker into the original-character assessor, which uses the same bypass and timeout.
- The focused ingestion suites, backend typecheck, and a fresh rendered card import must pass before acceptance.

## Acceptance contract

From a fresh Character page, one canonical-card upload creates one draft and restores the Continue control without duplicate ingestion. Synthesis plus power assessment may consume at most 90 seconds of provider time. The saved draft preserves card priority, structured fields, grounded power statistics, and the existing player-character workflow.
