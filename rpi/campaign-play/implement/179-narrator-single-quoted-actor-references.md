# Task 179: Narrator single-quoted actor references

## Contract

The Campaign Play Narrator may treat a visible actor name as a quoted reference only when every matched occurrence in an accepted observation and generated beat is inside a completed balanced straight or curly single- or double-quoted dialogue span. The referenced actor remains forbidden to speak, move, arrive, watch, act, or otherwise participate. Straight and curly apostrophes between Unicode letters or numbers are apostrophes, not quote boundaries, so contractions remain inside an outer single-quoted span. Unbalanced, mismatched, or bare apostrophe text grants no reference authority. Existing permitted participants, actorless false-attribution protection, warning coordinates, recovery feedback, schemas, persistence, deadlines, attempts, mechanics, and UI remain unchanged.

## Entry and frozen evidence

Entry source was `e6948160880361303e377437d2f4026a95c19653` on `feat/revamp`, equal to `origin/feat/revamp`. AGENTS.md and CLAUDE.md had pre-existing unstaged edits and were preserved byte-for-byte. Frozen r128 remains immutable. Its action 8 accepted observation used balanced straight single-quoted dialogue and named Dren Vask only as Vedris Kast's addressee; both Narrator attempts nevertheless rejected Dren as a forbidden actor under the prior double-quote-only rule.

## Graph review

A task-owned shadow clone was materialized at the exact entry commit and indexed with GitNexus. The refreshed graph contained 14,775 nodes, 42,414 edges, 797 clusters, and 882 flows at commit `e6948160880361303e377437d2f4026a95c19653`. Upstream impact was LOW for `balancedDoubleQuoteSpans` (11 impacted, 2 direct, one `narrate` process), `occurrenceInsideDoubleQuoteSpan` (11, 2), `buildObservationActorNameFrame` (10, 2), `assertProposalForPacket` (13, 1), `buildPrompt` (1, 1), and `createActorNameMatcher` (11, 2). The renamed dialogue helpers are local replacements with no pre-edit callers. No HIGH or CRITICAL edit target was found; no production flow outside Campaign Play Narrator was authorized.

## Semantic and prose review

Main's semantic verdict: the prompt literals align the instruction with quote formats already emitted in accepted observations and do not broaden participant authority. Humanizer verdict: retain the direct technical contract. Deslop verdict: concise and free of filler. The exact approved literals are:

`OBSERVATION_ACTOR_NAME_FRAME separates visible actor names for each observation index into permittedActorNames, quotedReferenceActorNames, and forbiddenActorNames. permittedActorNames are the performer and bound subjects. quotedReferenceActorNames are visible actors named only inside accepted dialogue enclosed by balanced straight or curly single or double quotes; they are referents, not participants. Apostrophes inside words are not quote boundaries.`

`For each beat, union each name list from every frame entry named by its observationIndexes. A permittedActorName may be described acting in the beat. A quotedReferenceActorName may appear only inside dialogue enclosed by balanced straight or curly single or double quotes that preserves a permitted speaker's accepted reference. It does not authorize a new claim about that actor, and the beat must not describe that actor speaking, moving, arriving, watching, or otherwise acting. Do not write a forbiddenActorName or a unique part of it anywhere in the beat.`

`Before finalizing each beat, check every visible actor name or unique name fragment. Outside balanced quoted dialogue, every name must belong to permittedActorNames. Inside balanced quoted dialogue, every other visible actor name must belong to quotedReferenceActorNames. Remove any unmatched actor reference.`

## Implementation

`backend/src/campaign-play/narrator.ts` now uses one balanced dialogue-span derivation for source observation classification and proposal validation. It recognizes straight and curly double quotes plus straight and curly single quotes. A straight `'` or curly `’` between Unicode letters or numbers, and a curly `‘` in that same word position, is treated as an apostrophe. Only completed spans are returned. The existing actor matcher, permitted/forbidden sets, mismatch warning, `narration_invalid`, safe recovery payload, and all runtime/persistence fences are unchanged.

`backend/src/campaign-play/narrator.test.ts` covers straight and curly single-quoted references with contractions, unbalanced/mismatched/bare apostrophes, references outside dialogue, possessive text outside dialogue, stable mismatch coordinates, and the exact three prompt literals.

## Initial automated evidence

- Narrator focused suite: 35/35 passed.
- Campaign Play turn-runtime suite: 72/72 passed.
- Campaign Play application suite: 15/15 passed.
- Backend typecheck: passed.
- Backend build: passed.
- `git diff --check`: passed.
- Staged GitNexus detect_changes reported only the Narrator flow (`narrate`) in `PrefersJsonObjectMode` and `CanonicalJson` with medium overall change risk.
- Implementation commit `cf3bd78625d1282710baa329c15c9f16940962a0` was pushed with local and `origin/feat/revamp` equal before r129.

## Rendered r129

The only fresh lane was `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r129` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using API/UI/CDP ports 4150/4151/4152 and the task-owned browser profile recorded in `runtime.json`. Materialization was once from `lowwater-ledger-pristine-93a09e46-20260719`; the source state hash was `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card hash `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was performed exactly once: one rendered Import card click and one file-selection dispatch. The parse request began at `2026-08-09T02:16:53.564Z` and ended at `2026-08-09T02:18:23.622Z` with HTTP 503, approximately 90,058 ms elapsed. The rendered page stayed on Character and showed `Campaign Play request failed with service_unavailable.`; Save/Continue and Begin were not clicked. Backend evidence at `backend.stdout.log:2-24,25-38,39-60` records ingestion classification, the Z.AI post-SDK failure diagnostic with `thinkingType=disabled`, `maxOutputTokens=32768`, `temperature=0.7`, and request-body shape hash `1a2a34e8afc38a83dc8ca70870724596bf2059a24374e2a354ffae484df934a`, followed by one `glm-5-turbo` attempt aborted locally after 90,017 ms with no response model, usage, finish reason, or retained provider coordinates. The provider status/body/cause remain unknown.

Read-only SQLite evidence in `probes/sqlite-boundary.json` shows setup phase `character_required`, zero characters, commands, turns, results, receipts, proper scenes, narration operations, narration attempts, and model stages, one runtime event, `integrity_check=ok`, and an empty `foreign_key_check`. The materialized state hash was the required source hash before runtime; after the single setup event the materialized state hash was `9d33937ea5dc2af52bc1bbbb79e4b0c7cb40b7b6d88ec6f5364bd719e9da0dbe`; config remained the required hash. Evidence hashes are setup-boundary `07e939726748f6b8124812c043790a5409db79f81e6267ac70652d2e531c8cc4`, SQLite-boundary `d40bca1ea52b458d282c7b22736cb1c04c96a1f84ec1de38870e170289b67810`, screenshot `aa4c1fd1f0ad084135cb58aacfa1b938015fddf0652fc2b8ecbe112c3bf38779`, and cleanup `65a1c875da4c63bfdc6802917171bd5ed9fa2ea400a1bf808d6ab243be457d1b`.

This is the first genuine setup/model transport boundary for this lane, so r129 hard-stopped before Opening, player action 1, the single-quote observation class, action checkpoints, recovery, 60-action endurance, and same-page reload. Those criteria are omitted rather than inferred. Cleanup closed the page and stopped backend PID 36556, frontend PID 48584, browser PID 9884, descendants 69976/55036/33108/66400/75704/31708/70800/70188/66932; ports 4150/4151/4152, CDP `http://127.0.0.1:4152`, the browser profile, and the task-owned shadow index were independently absent. Cleanup details are in `probes/cleanup.json`.

The setup service-unavailable boundary falsifies neither the single-quote semantics nor their focused test evidence; it prevents live coverage only. No source, runtime, provider, model, prompt, persistence, mechanics, UI, or recovery change was selected after the freeze.

## Unknowns and omitted criteria

The retained r128 evidence contains no rejected Narrator proposal bytes, so its exact candidate quote placement is unknown. Live r129 coverage of the single-quoted observation class, player actions, natural recovery, checkpoints, 60 bindings, and same-page reload is unavailable because the canonical card import froze at setup. The provider response status/body and upstream cause are unknown; the retained evidence proves only the local timeout and the rendered 503 boundary.
