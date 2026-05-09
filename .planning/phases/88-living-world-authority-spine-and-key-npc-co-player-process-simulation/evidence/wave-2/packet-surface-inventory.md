# Wave 2 Packet Surface Inventory

## Current Surfaces

| Surface | Current Job | Risk |
| --- | --- | --- |
| `SceneFrame` | Full local scene frame with roster, perception, recent events, targets, movement, allowed tools, oracle/combat envelope. | Can contain private/background actor structures internally. Should not be sent raw to actor/narrator brains without filtering. |
| `ModelFacingScenePacket` | GM/tool-planning model view filtered to visible actors, hints, legal targets, legal movement, allowed tools, redacted oracle/combat context. | High blast radius; already central to many prompts. Do not rewrite during Wave 2. |
| `NarratorPacket` | Final visible narrator packet built from canonical turn packet plus visible scene actors/hints/guardrails. | Good base, but the project lacks a separately named PlayerFacingPacket audit artifact. |
| `assembleFinalNarrationPrompt` | Builds final visible prompt, currently formatting `NarratorPacket` directly when provided. | Low-risk place to insert PlayerFacingPacket safety/trace without touching GM prompt flow. |
| `prompt-contracts.ts` | Holds structured-output contracts and backend authority language. | Existing runtime tool contract has HIGH blast radius; add new contract helper only if needed. |

## Missing Contracts

- `ActorFrame`: source-routed facts from the actor's own POV.
- `CommandNodeFrame`: faction/command decision maker packet with report/resource provenance.
- `PlayerFacingPacket`: explicit player-visible truth packet with source ids, hidden exclusions, and budget/leak trace.
- `ContextBudgetTrace`: diagnostic record for prompt pressure and exclusions; it must not clip model output or silently drop semantics.

## Leak Candidates

- Hidden/background actor names in `SceneFrame.roster.background`.
- Hint-band actors where identity must stay hidden.
- Private actor rationale, unresolved proposals, and future offscreen jobs.
- Canonical turn packet events/responses/effects that are not perceivable by player.
- Tool failures or rejected tool proposals being formatted as visible success.
