# Wave 2 Hidden Truth Leak Report

Status: GREEN

## What Changed

- Added `ActorFrame` so actor brains receive source-routed POV facts rather than raw scene/global context.
- Added `CommandNodeFrame` so faction/command brains can reason from reports, rumors, beliefs, and public records with provenance.
- Added `PlayerFacingPacket` as an explicit pre-narrator truth boundary derived from `NarratorPacket`.
- Routed final visible narration prompt formatting through `PlayerFacingPacket` without touching the CRITICAL `buildModelFacingScenePacket` GM/tool-planning surface.
- Hardened post-model visible narration validation so `forbiddenPrivateTerms` are rejected after generation, not only before prompt dispatch.

## Leak Fixtures

| Fixture | Boundary | Expected |
| --- | --- | --- |
| `Hidden Auditor` | ActorFrame / PlayerFacingPacket / output guard | Not formatted as visible identity. |
| `hidden-actor:*` | PlayerFacingPacket / final prompt / output guard | Not formatted. |
| `Forest Outpost` | PlayerFacingPacket / final prompt / output guard | Fails closed if it enters visible prose. |
| Raw canonical turn payload | PlayerFacingPacket prompt formatting | Not serialized into final-visible prompt. |

## Tests

- `npm --prefix backend run test -- src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/narrator-redaction.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts`
- `npm --prefix backend run typecheck`

Both passed on 2026-05-08 local time.

## Guardrail

Context budget trace is diagnostic. It records token pressure and exclusions; it does not trim generated text or silently clip model intent.
