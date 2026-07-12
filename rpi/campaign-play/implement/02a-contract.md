# Task 2A: Campaign Play contract

Date: 2026-07-10  
Plan: `docs/goals/campaign-play/PLAN.md`, Task 2A  
Verdict: implementation aligned; verification and review passed.

## Outcome

Campaign Play now has one shared public contract and one backend-owned protected contract. The shared package owns player-visible state, narration, choices, consequences, journal data, character intake, API requests, resumable turn reads, SSE events, and truthful errors. The backend owns Judge results, Rulebook commands and receipts, causal events, exposure records, actor plans and jobs, epistemic state, worker fencing, model-stage evidence, and runtime events.

The contract carries three separate clocks of truth:

- `acceptedWorldVersion` identifies immutable accepted-world provenance;
- `worldVersion` identifies current mechanical truth;
- `runtimeRevision` identifies current operational truth.

Validators reject stale expectations and any public projection whose mechanical version predates its accepted base.

`projectionHash` is a public consistency token for reload and client deduplication. It identifies the sanitized projection bytes and carries no protected event payload or runtime-state hash.

## Public lifecycle and turn delivery

The public lifecycle covers character setup, opening admission, settled play, active player actions, and narrator work. `opening_active` gives an admitted or interrupted opening turn a valid public state before starting placement exists. It requires an opening-kind turn and an empty scene projection. `turn_active` requires a player-action turn with an established location. `narration_pending` represents active or resumable narrator work after the scene exists.

Opening and player-action admissions share version expectations and idempotency keys. `CampaignPlayTurnReadResponse` returns processing, interrupted, completed, or failed durable results. Its validator binds the result status to the stored turn and binds completed narration to the same `turnId`.

The shared package exposes sanitized public progress and turn status. Raw turn stages remain backend-owned.

## Character intake

The public character contract accepts a created draft, generated draft, Character Card import, or research-backed draft. The normalized draft contains character identity, voice, motives, beliefs, drives, traits, bounded skills and inventory, and a source record. It carries no faction field.

Character bootstrap starts from the accepted world version and returns exactly the first mechanical version after that base. Backend bootstrap commands remain separate from GM-visible commands.

## Rulebook and causality

The backend contract defines eight ordinary Rulebook commands and four internal bootstrap commands. Each command has code-owned identity, batch order, causal parent, source, expected world version, bounded read/write scopes, exposure policy, and typed arguments.

Command metadata declares which kinds mutate mechanical truth. Batch, proposal, and receipt validators use the same metadata to advance versions. A mutating receipt advances one logical world version and changes the world hash. A ledger-only receipt preserves both.

Actor proposals identify their actor job as causal parent. Every proposed command belongs to the proposal batch, comes from the proposing actor, descends from the same job, follows contiguous order and version progression, and uses unique scopes. An accepted proposal carries exactly one unique receipt per command.

## Visibility and epistemic provenance

World events contain stable `CampaignPlayEventExposure` records rather than anonymous predicates. Each exposure has its own ID, campaign and event ownership, channel-specific predicate, and timestamp. Event validators reject duplicate IDs or foreign campaign/event ownership.

`CampaignPlayActorKnowledge` and `CampaignPlayObservation` persist event and exposure identity plus a typed epistemic source. The four supported channels are direct perception, local aftermath, route state, and witness report. Cross-record validators prove that knowledge and observations point to the same campaign, event, exposure, channel, location, route trigger, or witness as the source exposure.

The narrator receives an immutable bounded public packet. Narration choices must preserve the packet's opaque handles and labels, so prose cannot retarget a visible action.

## Bounds and errors

Text, IDs, handles, arrays, plans, scopes, packets, states, journal pages, choices, effects, events, and model evidence have explicit limits. Public objects use strict schemas and reject protected IDs, hashes, or extra fields at every reusable nested boundary.

Canonical public errors cover `404`, `409`, `422`, and `503` outcomes with status, retry policy, and truthful nullable version context. Protected model-stage evidence records requested and actual provider/model/strategy fields separately.

## Verification

| Command | Result |
|---|---|
| `npm --prefix shared run build` | passed |
| `npm --prefix backend test -- src/campaign-play/contracts.test.ts` | 1 file, 29 tests passed |
| `npm --prefix backend run typecheck` | passed |
| `git diff --check -- shared/src/campaign-play.ts shared/src/index.ts backend/src/campaign-play/contracts.ts backend/src/campaign-play/contracts.test.ts` | passed; line-ending notice only |

The 29 tests exercise every closed union through loops and tables rather than one test per literal. They cover lifecycle states, bounded opening choices, four turn-read results, every public error, all character operations, all Judge dispositions and uncertainty outcomes, twelve commands, twelve world-event kinds, four exposure channels, every actor-job and proposal result, runtime events, model stages, interruption, narration artifacts, stale versions, strict unknown-field rejection, protected-to-public leakage, collection caps, byte caps, causal ownership, and epistemic provenance.

Smoke-suite additions: 0. Focused contract fixtures prove the named risks directly.

## Review corrections

Independent review found and closed these contract gaps:

- admitted delegated openings lacked a legal in-flight public state;
- observations referenced exposure IDs before identified exposure and actor-knowledge records existed;
- actor proposals lacked proposal-level causality and complete receipt settlement;
- protected interruption eligibility could contradict the public resumable state;
- a turn read could attach narration from another turn;
- raw turn stages leaked into the shared public package;
- proposal and interruption validators lacked negative regression fixtures;
- the new character source literal used a version label instead of the domain name `character_card`.
- Task 12 found that chosen opening requests lacked public eligible location and condition handles. `openingOptions` now publishes bounded location, role, arrival, and immediate-situation choices. Chosen mode requires the complete public handle tuple; delegate mode gives the planner the complete choice.

Mechanical re-review returned `ALIGNED` after rerunning shared build, all 29 focused tests, and backend typecheck. Architecture re-review returned `ALIGNED` after proving exact proposal scope unions and plan synchronization. The final goal-backward verifier returned `PASS`: Task 2A is ready for the Task 12 public-contract freeze and the 2B storage tasks.

Droid GLM-5.2 returned `ALIGNED` with zero P0/P1 findings. It independently traced all ten required public surfaces, the public/protected boundary, the three version domains, Rulebook and proposal causality, epistemic provenance, retry truth, and exhaustive test coverage. Its only P2 observation was the public `projectionHash`; the consistency-token rationale above records that boundary explicitly. Humanizer/deslop scores were directness 8/10, rhythm 7/10, reader trust 8/10, authenticity 8/10, and density 8/10.

## GitNexus scope

GitNexus impact queries for the new phase, state, world-event, observation, and proposal symbols returned `Target not found` because Task 2A files and symbols are untracked in the current index. The graph therefore reports no indexed callers or execution flows for this new contract. Focused tests and independent reviews cover its current boundary.

`detect_changes(all)` reports CRITICAL across the inherited dirty worktree: 45 tracked files, 57 changed indexed symbols, and 22 affected processes accumulated across Campaign World and Campaign Play work. Task 2A owns only the four contract files, the canonical lifecycle amendment, and this evidence note.
