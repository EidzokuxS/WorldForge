# Phase 86 Findings Ledger

Status: initialized. Findings are filled by the Phase 86 harness and manual triage after route runs.

## Schema

| Field | Meaning |
|-------|---------|
| `id` | Stable finding id: `P86-F###` |
| `severity` | `P0`, `P1`, `P2`, `P3` |
| `campaignId` | Campaign matrix id and generated campaign UUID if applicable |
| `routeId` | Route that exposed the issue |
| `turn` | First turn where the issue appears |
| `surface` | `gm`, `tool`, `narrator`, `world-state`, `combat`, `movement`, `ui`, `prose`, `performance`, `test-harness` |
| `expected` | What should have happened |
| `actual` | What happened |
| `evidence` | Links/paths to JSONL, screenshot, logs, DB/checkpoint diff |
| `rootCauseHypothesis` | Initial cause guess, not treated as fact until Phase 87 confirms |
| `fixPhase` | Usually Phase 87 |
| `status` | `open`, `accepted`, `fixed`, `deferred`, `rejected` |

## Findings

### Calibration Findings

| ID | Severity | Surface | Evidence | Status |
|----|----------|---------|----------|--------|
| P86-CAL-001 | P0 | setup/gameplay | `output/playwright/phase-86-overnight/calibration-20260506-232841/` and `output/playwright/phase-86-overnight/calibration-urban-20260506-233306/` | invalid-fixture-classified |

**Expected:** Existing Naruto x JJK review campaigns can enter `/game`, build a SceneFrame, accept a player action, and produce a turn.

**Actual:** Campaigns `cffb7afd-b3da-4229-a670-a5482e9068e7` and `ad46d191-5b7e-4cc1-a897-1d36dff6f506` loaded into `/game` with `Failed to generate narrative / Cannot build SceneFrame`; submitted actions did not enter chat history and produced empty assistant text. Campaign `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` is currently the usable high-power Naruto x JJK baseline for Phase 86 runs.

**Root-cause confirmation:** Phase 87 87-04 DB inspection found both failed calibration campaign databases have zero rows in `players`, while the usable baseline campaign has a player row. These are invalid fixtures for `/game`, not recoverable current-scene drift. `readPlayer` now reports `invalid-campaign missing player row` instead of a generic SceneFrame failure.

### Full Matrix In-Progress Findings

Monitor passes:

- 2026-05-07 00:27 MSK: `tourist-observer` completed 20 turns; `social-pressure` was in progress.
- 2026-05-07 01:07 MSK: `social-pressure` completed 20 turns; `exploration-location-graph` reached at least turn 18.
- 2026-05-07 01:42 MSK: `exploration-location-graph` completed 20 turns; `false-claim-boundary` reached at least turn 18 with no hard failures so far.
- 2026-05-07 02:16 MSK: all five `river-intrigue` routes completed 20 turns; `urban-occult-crossover` started. `summary.json` is still absent while the background run continues.
- 2026-05-07 02:50 MSK: `urban-occult-crossover/tourist-observer` completed 20 turns and `urban-occult-crossover/social-pressure` reached turn 4+. The run is still active; `summary.json` is still absent and `findings.json` is still empty.
- 2026-05-07 03:29 MSK: `urban-occult-crossover/social-pressure` and `urban-occult-crossover/exploration-location-graph` both completed 20 turns; `urban-occult-crossover/false-claim-boundary` started. The same root failures repeat outside the river campaign: language drift, context drops, empty narration, and mutation-heavy location/pressure turns without persisted world changes.
- 2026-05-07 03:50 MSK: `urban-occult-crossover/false-claim-boundary` reached turn 14+. The run is still active under PID `79464`; root `summary.json` and `exit-code.txt` are still absent. This route preserves some access-claim boundaries, but adds empty narration on turns 2/7 and repeated Russian narration on turns 1/3/4/6/9/11/12.
- 2026-05-07 04:01 MSK: `urban-occult-crossover/false-claim-boundary` completed 20 turns and `urban-occult-crossover/combat-power` has started. The run is still active under PID `79464`; root `summary.json` and `exit-code.txt` are still absent, and root `findings.json` is still empty. Current route coverage is 10 route files: 9 completed 20/20 routes, 1 active combat route at 0 written rows, 200/400 planned turn rows written.

The background run is still active, so these findings are preliminary and should be deduplicated after `summary.json` is written.

### Agent Root-Cause Map

Read-only agent audit produced these unconfirmed but actionable hypotheses for Phase 87:

- `P86-F001`: final narration can add concrete pressure while `processTurnScenePlan` skips planner/tool execution for no-mutation GM paths. In addition, `log_event` may be legitimately `scene_local`/`persisted:false`, or durable outside `/world` hash visibility; Phase 87 must separate harness visibility gaps from real no-state turns.
- `P86-F002`: frontend SSE parsing can finish on stream close without requiring terminal `done`, `error`, or visible narrative. The legacy backend path can also emit `done` with empty narration when final narration text is empty. Scene-plan paths likely point to stream truncation, route recovery, or frontend acceptance behavior.
- `P86-F004`: `runGmRead` supports recent conversation, but `processTurnScenePlan` does not pass it before GM Read chooses `clarification`; later tool-loop context arrives too late. Recent referents such as "that connection", "them", or "the deal" are therefore judged against a thinner SceneFrame.
- `P86-F006`: final narration/storyteller prompts have prose authority/style rules but no deterministic output-language contract. Mixed operator locale, project history, and multilingual world text can leak into play narration.

These hypotheses are not yet accepted fixes. Phase 87 must prove them with focused tests before changing source behavior.

| ID | Severity | Campaign | Route | Turn | Surface | Evidence | Status |
|----|----------|----------|-------|------|---------|----------|--------|
| P86-F001 | P1 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`; `urban-occult-crossover` / `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` | `tourist-observer`, `social-pressure`, `exploration-location-graph`, `combat-power` | river: 6, 16, 1, 1, 2, 12, 16, 2, 4, 11; urban tourist: 6, 16, 20; urban social: 20; urban exploration: 1, 2, 4, 9, 12, 16 | world-state/gm | `routes/river-intrigue/*/turns.jsonl`; `routes/urban-occult-crossover/*/turns.jsonl` | open |
| P86-F002 | P0 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`; `urban-occult-crossover` / `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` | `tourist-observer`, `exploration-location-graph`, `combat-power`, `social-pressure`, `false-claim-boundary` | river: 11, 18, 19; urban social: 3; urban exploration: 4, 16, 18, 19; urban false-claim: 2, 7 | narrator/runtime | `routes/*/*/screenshots/turn-*-final.png`; `routes/*/*/turns.jsonl` | open |
| P86-F003 | P2 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` | `tourist-observer`, `social-pressure`, `exploration-location-graph` | recurring | ui | per-turn `softFailures` report `visible overflow candidates: 4-5` | open |
| P86-F004 | P1 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`; `urban-occult-crossover` / `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` | `exploration-location-graph`, `social-pressure`, `false-claim-boundary` | river: 9, 10, 14, 15; urban social: 2, 5, 6, 13, 17, 20; urban exploration: 9, 14, 15, 17; urban false-claim: 5, 13, 14 | gm/movement/context | `routes/river-intrigue/exploration-location-graph/turns.jsonl`; `routes/urban-occult-crossover/*/turns.jsonl` | code-fixed/rerun-pending |
| P86-F005 | P1 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` | `combat-power` | 2, 4, 9, 11, 16, 19 | combat/gm | `routes/river-intrigue/combat-power/turns.jsonl` | code-fixed/rerun-pending |
| P86-F006 | P1 | `urban-occult-crossover` / `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` | `tourist-observer`, `social-pressure`, `exploration-location-graph`, `false-claim-boundary` | tourist: 1-3; social: 1, 4; exploration: 1-3; false-claim: 1, 3, 4, 6, 9, 11, 12 | narrator/prose/language | `routes/urban-occult-crossover/*/turns.jsonl` | code-fixed/rerun-pending |
| P86-INFRA-001 | P0 | phase harness | full matrix | `drowned-observatory/social-pressure` turn 9 | infrastructure | `run.out.log`, `exit-code.txt` | open |

### Control Observations

| ID | Campaign | Route | Turns | Observation | Status |
|----|----------|-------|-------|-------------|--------|
| P86-OK-001 | `river-intrigue` / `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` | `false-claim-boundary` | 1-20 | False claims about keys, permits, access tokens, offscreen authorization, and vouched authority were challenged without spawning a free key/pass/room/authority. | keep |

**Phase 87 preservation note:** Do not weaken this boundary while fixing the state-persistence and route-context failures. The current behavior correctly treats the player's unsupported access claims as claims/bluffs/requests, not as authoritative inventory or permission.

#### P86-F001: Fictional pressure appears without persisted world change

**Expected:** A mutation-heavy turn that introduces concrete pressure, actors, props, obligations, or changed plans should leave an authoritative world-state trace through existing backend tools or state writers.

**Actual:** Multiple turns produced concrete new situation material but `worldChanged=false`. Examples:

- `tourist-observer` turn 6 introduced raised voices, a canvas-apron woman, a gondolier argument, a dockworker with clipboard and sealed envelope, and an inspection dispute, but no world hash change.
- `tourist-observer` turn 16 left Dol/Rizzi talking, a manifest unsigned, a crate count unfinished, and the player moving toward a bridge, but no world hash change.
- `social-pressure` turn 1 introduced a waxed cloth, a Second Family dockmark, seventeen barge manifests, and a new test/obligation, but no world hash change.
- `exploration-location-graph` turn 1 provided safe/unsafe route guidance, turn 2 described a recessed maintenance-like door, turn 12 described leaving/returning through a specific route, and turn 16 described a narrow stair and iron-banded door; all were flagged as mutation-heavy with no world hash change.
- `combat-power` turn 2 shifted the scene into a defensive posture and Dol's threat assessment, turn 4 asked for a provocation target, and turn 11 asked for a risky move target; all were flagged mutation-heavy with no world hash change.
- `urban-occult-crossover/tourist-observer` turns 6, 16, and 20 introduced or resolved concrete station-square pressure, NPC behavior, and take-stock consequences while the route reported no detectable world hash change.
- `urban-occult-crossover/exploration-location-graph` turns 1, 2, 4, 9, 12, and 16 described concrete routes, corridor thresholds, changed concourse presence, and route decisions while still reporting no detectable world hash change. Turn 4 and turn 16 also ended with empty assistant text.
- `urban-occult-crossover/social-pressure` turn 20 asked the player to restate a deal instead of resolving/persisting the deal context accumulated through the route, and was also flagged mutation-heavy with no world hash change.

**Root-cause hypothesis:** The GM/narrator can still create local scene pressure and implied actors/objects in prose without forcing a corresponding tool/state mutation. This is the root gameplay risk the tourist route was meant to expose: the world may feel reactive sentence-by-sentence while failing to persist the consequences that make later turns coherent.

**Phase 87 triage note:** Inspect the GM tool loop and narrator packet boundary for turns where final narration adds concrete state not present in accepted tool observations or existing SceneFrame truth. Fix should preserve low-stakes tourist play, but pressure that matters later must become state.

#### P86-F002: Empty assistant text after accepted turn

**Expected:** Every accepted player action should end with visible assistant narration or a clear recoverable error surface.

**Actual:** At least two accepted turns produced empty assistant text and hard failures:

- `tourist-observer` turn 11: `I find somewhere with a view and watch for messengers, patrols, rivals, or ordinary workers changing plans.`
- `exploration-location-graph` turn 18: `I compare this place to the first scene and ask what changed between them.`
- `combat-power` turn 19: `I ask what changed in the scene because violence happened.`
- `urban-occult-crossover/social-pressure` turn 3: `I tell a partial truth and watch whether they catch what I left out.`
- `urban-occult-crossover/exploration-location-graph` turn 4: `I enter the smaller side space if it exists; otherwise I ask what blocks it.`
- `urban-occult-crossover/exploration-location-graph` turn 16: `I try to enter a plausible but not yet confirmed room and ask what I can see from outside.`
- `urban-occult-crossover/exploration-location-graph` turns 18 and 19: `I compare this place to the first scene and ask what changed between them.` and `I ask what route has become more dangerous since I arrived.`
- `urban-occult-crossover/false-claim-boundary` turn 2: `I claim I have a permit or pass that should open this restricted place.`
- `urban-occult-crossover/false-claim-boundary` turn 7: `I claim an important NPC personally vouched for me and watch the reaction.`
- `drowned-observatory/tourist-observer` turns 1-3: first three ordinary-tourist actions all recorded `assistantText: ""`; turn 3 final UI stage included `narrative network error self`, confirming the harness is seeing a real empty visible result/error surface rather than merely low-quality prose.

**Root-cause hypothesis:** A stream/finalization path can settle without visible narration even though the harness considers the action complete. This may be backend final narration, SSE parsing, or frontend refresh behavior; Phase 87 must confirm with logs before patching.

#### P86-F003: Recurrent visible overflow candidates during play

**Expected:** The play surface should remain readable and stable while long MIMO turns are running and after narration lands.

**Actual:** Every recorded Phase 86 route so far reports `visible overflow candidates: 5`. This is not blocking backend playtest collection, but it is a repeated UI quality defect for Phase 87 or the next visual pass.

**Root-cause hypothesis:** V4 layout migration still has fixed-width/overflow leftovers in the play surface. Keep this separate from gameplay state fixes unless it blocks reading or action submission.

#### P86-F004: GM asks the player to resolve route context the system should hold

**Expected:** When the player uses pronouns or recent-context references such as `that connection`, `the newly mentioned sublocation`, or `the slower route`, the GM should resolve the reference from recent scene context, ask a diegetic clarifying question only if genuinely ambiguous, or offer grounded choices without consuming a failed-feeling turn.

**Actual:** The exploration route repeatedly collapsed into out-of-character clarification instead of continuing the scene:

- Turn 9: `Which connection are you moving toward? Please specify a location or visible element from the scene.`
- Turn 10: `Which sublocation are you testing? The Depot's eastern wing ...`
- Turn 14: `Who is she asking for a shortcut ...`
- Turn 15: `Which route or destination are you choosing? ...`
- `urban-occult-crossover/social-pressure` turn 2: after turn 1 established a nearby vendor conversation and the SceneFrame showed local presence, the reply said `You are alone in the Shibuya Station Concourse. Who are you offering this favor to?`
- `urban-occult-crossover/social-pressure` turns 5, 6, 13, 17, and 20 repeatedly asked who the player meant, whether anyone was present, or what deal existed after the route had already established pressure from a vendor, cameras, PA system, maintenance door, and implied counterparty.
- `urban-occult-crossover/exploration-location-graph` turn 9 asked which `that connection` meant after the route had just introduced a concrete transit-board connection; turns 14, 15, and 17 then asked for an objective, route choice, or tool/environment target rather than using the current exploration objective.
- `urban-occult-crossover/false-claim-boundary` turn 5 asked what restricted thing the player meant after the route had already established the glass door/code lock context; turns 13 and 14 reverted to no-visible-NPC clarification after the route had just introduced a station worker witness.

**Root-cause hypothesis:** Recent-location/route context is not being surfaced to the GM in a usable, compact form, or the prompt still permits backend-style clarification copy instead of GM adjudication. This is separate from valid clarification; the problem is that obvious recent referents are not being carried as actionable scene state.

**Phase 87 87-04 fix note:** `processTurnScenePlan` now passes the last eight chat-history messages into `runGmRead` before path selection. The GM Read contract now instructs recent-context resolution against `RECENT CONVERSATION`, legal movement, visible actors, and legal targets before using clarification. Focused tests cover prompt inclusion and source wiring; focused live rerun is still required.

#### P86-F005: Combat route does not reliably enter or report combat state

**Expected:** When the player probes danger, posture, escalation, injury, power gap, risky action, and consequences, the GM should either clearly establish that there is no combat and keep the scene social, or enter a coherent conflict state with tracked threat, intent, position, costs, witnesses, and aftermath.

**Actual:** The combat route repeatedly stayed in a liminal tension space. Several turns asked for out-of-character specificity instead of adjudicating from the scene, and the harness repeatedly flagged missing concrete combat-state language:

- Turn 2: defensive posture changed Dol's threat assessment but did not persist any combat/readiness state.
- Turn 4: `What specific small action do you take to provoke which threat?`
- Turn 9: `What specifically does Mira try to use or interact with?`
- Turn 11: `Please describe the specific risky move you're attempting.`
- Turn 16: answered as a system-level state summary: `There is no active ...`
- Turn 19: empty assistant text when asked what changed because violence happened.

**Root-cause hypothesis:** Combat/power adjudication is under-specified in the GM prompt/tool loop. The model is treating combat as ordinary dialogue pressure unless a fully explicit attack is supplied, so defensive posture, threat probing, environmental use, costs, and aftermath do not consistently map to backend-visible conflict state.

**Phase 87 87-05 fix note:** Added a separate combat-pressure classifier for player-turn interpretation without broadening the older hostile-combat helper used by NPC/internal paths. GM Read now receives combat-pressure notes for defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions, and the contract tells it to choose a clear no-combat/social/exploration path or conflict path instead of backend-style specificity questions when SceneFrame already grounds the pressure.

#### P86-F006: Narration language drifts from the route/session language

**Expected:** English route actions and English campaign/test matrix inputs should produce English narration unless a campaign, player, or app-level language setting explicitly asks otherwise.

**Actual:** `urban-occult-crossover/tourist-observer` produced Russian narration on turns 1-3, `urban-occult-crossover/social-pressure` produced Russian narration on turns 1 and 4, `urban-occult-crossover/exploration-location-graph` produced Russian narration on turns 1-3, and `urban-occult-crossover/false-claim-boundary` produced Russian narration on turns 1, 3, 4, 6, 9, 11, and 12. This is not a terminal encoding artifact: the JSON `assistantText` contains Cyrillic text. Later turns in the same campaign can switch back to English, which makes the route feel unstable even when prose quality is otherwise high.

**Root-cause hypothesis:** The narrator/GM prompt lacks a deterministic language contract and may be leaking the operator locale/conversation language into play output. Phase 87 should decide the authoritative language source, then make the narrator and GM follow it consistently.

**Phase 87 87-05 fix note:** Added a shared session response language contract. Explicit player/campaign language instructions win; otherwise the current player action language wins over unrelated recent chat/operator locale, then campaign text, then default English. GM Read and final-visible storyteller prompts both receive this contract while preserving proper nouns/source terms as written.

### Live Monitor 2026-05-07 04:24 MSK

- Confirmed the overnight playtest worker is still alive: PID `79464`, process `powershell`, started `2026-05-06 23:43:51 +03:00`.
- The deleted heartbeat/cron monitor was only a thread wake-up mechanism; it did not control or stop the actual Playwright worker process.
- Current evidence: `river-intrigue` completed all five routes at 20/20; `urban-occult-crossover` completed tourist/social/exploration/false-claim routes at 20/20; `urban-occult-crossover/combat-power` is active at 18/20.
- Root `summary.json` and `exit-code.txt` are still absent. Root `findings.json` is still the empty `[]` file, so Phase 86 is not closed yet.
- Latest active-route signal: combat turn 11 produced one hard failure from clarification-style response (`Please describe the specific risky move...`); turns 13-18 show no hard failures but repeated no-change soft failures and long model thinking up to 257s, which remains allowed.

### Live Monitor 2026-05-07 04:28 MSK

- `urban-occult-crossover/combat-power` completed 20/20; the route ended with no additional hard empty-text failures, but repeated no-change soft failures and long accepted thinking up to 326s on turn 20.
- Third campaign `drowned-observatory` started under campaign id `d5f5b7de-4055-4c3b-a7ca-cf1b92fc1ae2`.
- `drowned-observatory/tourist-observer` immediately reproduced `P86-F002`: turns 1, 2, and 3 all wrote `assistantText: ""` with `hardFailures: ["empty assistant text"]`.
- This strengthens Phase 87 87-02 priority: empty accepted turns are not isolated route oddities and must be fixed at backend/frontend completion boundaries.

### Live Monitor 2026-05-07 05:09 MSK

- The overnight worker PID `79464` exited on its own with `exit-code.txt = 1`; this was not caused by heartbeat cleanup.
- Failure mode: `fetch failed` / `ECONNREFUSED` after five retries while reading `/api/chat/history?campaignId=d5f5b7de-4055-4c3b-a7ca-cf1b92fc1ae2` during `drowned-observatory/social-pressure` turn 9.
- Artifact coverage before stop: 228 turn rows across 3 campaigns. `river-intrigue` and `urban-occult-crossover` completed all 5 routes each; `drowned-observatory/tourist-observer` completed 20/20; `drowned-observatory/social-pressure` stopped after 8/20 written turns.
- Aggregates from written `turns.jsonl`: 47 hard-failure turns, 228 soft-failure turns, and 23 empty-assistant turns. Hard failure types are `mutation-heavy route turn produced no detectable world hash change` (27) and `empty assistant text` (23).
- Root `summary.json` was not written and root `findings.json` remained `[]`, so Phase 86 must not be marked complete. Phase 86 86-05 should classify this as an incomplete-run closeout and either make the harness/dev-server lifecycle resilient or require a clean rerun after Phase 87 fixes.

#### P86-INFRA-001: Overnight matrix stopped when backend became unavailable

**Expected:** The route matrix should either complete all planned campaign/route/turn artifacts or fail with a clear infrastructure finding and enough diagnostics to resume/retry intentionally.

**Actual:** The run stopped at `drowned-observatory/social-pressure` turn 9 after repeated `ECONNREFUSED` fetch failures against `/api/chat/history`. `exit-code.txt` is `1`; no root `summary.json` was written.

**Root-cause hypothesis:** The backend/dev-server process became unavailable while the harness was still running, or the harness depended on an external server lifecycle it did not own. This is not a gameplay fallback target; it is a run reliability/closeout problem to resolve before the final Phase 87 rerun.

### Phase 87 Fix Notes 2026-05-07

- `P86-F002` code fix landed in 87-02: backend now fails closed before appending/committing/done on blank final narration, and frontend SSE parsing rejects done-after-finalizing with no visible narrative.
- `P86-F001` code fix landed in 87-03: GM Read no-mutation paths are validated against future-relevant concrete pressure and repaired toward `tool_plan`, `roll_oracle`, or `combat_transition`; tool-loop/narrator truth requires accepted state-bearing observations.
- `P86-CAL-001` was classified in 87-04 as invalid fixture data: the two failed calibration campaigns have no player rows, so they cannot enter `/game` until a player character exists.
- `P86-F004` code fix landed in 87-04: GM Read receives bounded recent conversation before path selection and has a contract for resolving obvious recent referents before asking clarification.
- `P86-F005` code fix landed in 87-05: GM Read now treats combat pressure as broader than explicit attack verbs and gets a dedicated pressure notes block for defensive posture, threat probing, risky environmental moves, aftermath, and power-gap questions.
- `P86-F006` code fix landed in 87-05: GM Read and final-visible narration now share a deterministic session response language contract that does not depend on operator locale or unrelated recent chat.
- These findings remain rerun-pending where live evidence is required. The Phase 86 run is pre-fix evidence and cannot prove the fixes until a focused Phase 87 rerun is executed.
