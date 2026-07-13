# Lessons

## Operating Rules

- A failed advisory/review tool gets one focused repair attempt, then an evidence note and forward progress when the owner explicitly authorizes skipping it; advisory infrastructure must not hold the product plan hostage.
- Inspect configuration schemas or selected non-secret fields instead of printing whole settings files; provider settings can contain live API keys and must stay out of tool logs.
- Keep secret-bearing configuration reads side-effect free. Only an explicit save may rewrite `settings.json`, and every rewrite must preserve rotating recovery generations.
- Treat long reasoning-model latency as normal until a configured timeout, transport error, or terminal event proves failure; elapsed time alone is not a hang diagnosis.
- Give every thinking-model gameplay stage at least a 32k provider output window. Apply visible-content limits after subtracting reported reasoning tokens, while retaining full provider usage for billing and evidence.
- Size aggregate playtest token budgets from measured per-action usage with headroom. A per-call 32k output floor and a whole-run evidence budget are different limits.
- Once Judge normalizes a movement route and destination, code owns the player actor, origin, route, and destination handles; the model must not reconstruct mechanical movement authority.
- Record isolated mixed-language tail tokens as cosmetic prose findings when the response remains coherent; reject a playtest for overall meaning, causality, continuity, or readability failures instead.
- For strict discriminated unions, tell the model the complete field set for every variant and name fields that belong to only one variant. A schema alone may not stop a reasoning model from copying a plausible field across variants.
- A move choice needs only a route handle when accepted topology owns its endpoints. Derive the destination from the frozen route instead of requiring Judge or the model to restate it.
- Build and validate local prompt/frame contracts outside provider transport catches. Otherwise a synchronous contract exception is misreported as provider unavailability and invites useless retries.
- Keep UI presentation metadata such as card colors and monograms out of model-facing narrative packets. A model can turn any visible token into fictional prose, even when the token is harmless to the frontend.

- Keep active task files short. Long forensic history belongs in git history or current docs that still serve the mechanics rebuild.
- Treat fallback and backward-compatibility paths as defects unless the user explicitly authorizes a migration window.
- Fix root causes. Do not add guard piles, compatibility shims, or regex prose gates to hide broken ownership.
- Before editing code symbols, run GitNexus impact. Before committing, run GitNexus `detect_changes`.
- Separate cleanup commits from gameplay/mechanics commits.
- If cleanup hits locked files, stop, identify the owning process, stop only that process, then retry the narrow cleanup.
- When cleaning visible root noise, inspect inside visible workflow folders too; `tasks/` should stay as `todo.md` plus `lessons.md` unless a current task requires more.
- For repo presentation cleanup, sweep every top-level directory in one pass; do not hide obsolete tracked evidence inside another visible folder when the goal is a clean workspace.
- Never delete ignored local configuration or secret-bearing files such as `settings.json`, `settings.json.bak`, `.env`, or provider key stores during cleanup. Move them to a named local backup outside the repo first.
- Use short, human-readable project filenames. Prefer `a5b-character.md` over long all-caps generated labels.
- When the user says to stop stopping, treat every known next architecture item as active work. Commit and push verified blocks instead of ending with a dirty tree and a progress report.
- In this project, a completed and verified task boundary authorizes a scoped checkpoint commit. Do not wait for a separate commit command, and do not carry finished mechanics work into the next task's diff.
- After `npx gitnexus analyze`, inspect `AGENTS.md` before committing. The generator can refresh the GitNexus block and drop project-specific rules that must stay.
- After `npx gitnexus analyze`, keep root `CLAUDE.md` if the generator recreates it. Do not delete it as cleanup unless the owner explicitly asks for that file to be removed.
- For manual UI playtests, use the in-app browser when it is available; reserve external browser automation for headless regression artifacts or explicit requests.
- In `feat/revamp`, legacy code is quarantine reference: mechanics player paths, APIs, and UI land on mechanics-owned routes with explicit adapter boundaries for legacy data shapes.
- Workstream and version labels are internal bookkeeping. Player-facing routes, UI text, current files, symbols, test titles, helpers, and acceptance gates use domain outcomes from the AGENTS naming convention.
- Treat `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine` as WorldForge's sibling reference when the owner says TarotEngine. Inspect the local sibling and its git state before considering public repositories with the same name.
- Background campaign work owns a dedicated campaign-scoped SQLite handle for its full lifetime. The global active-campaign connection can close or switch independently.
- Commit domain state, terminal operation status, lock release, and the terminal event in one transaction so crash recovery cannot report a completed write as a failed operation.
- When config supplies a build source and SQLite owns the build lock, linearize source mutation and build acquisition per campaign, then freeze the exact source snapshot in the build row.
- Removing a player-flow caller does not remove a duplicate writer. Unmount every competing mutation endpoint before declaring a new owner exclusive.
- Pair universal invariants with non-vacuous product minimums. Rules such as "every actor has a goal" still accept an empty roster unless the contract also requires actors.

## Mechanics Acceptance

- When the owner authorizes a hard break, update every affected caller, fixture, migration, and invariant to the canonical contract; compatibility branches and preserved obsolete behavior are out of scope.
- Treat auxiliary tooling defects as bounded side work: repair them when they affect acceptance evidence, otherwise record the gap and continue the feature instead of blocking its delivery.
- A green test suite or one-turn smoke does not prove playability.
- Deterministic and automated long runs prove runtime integrity only. Prose quality, causal sense, reader interest, and living-world motion require adaptive manual play through the rendered UI with every action chosen from the current player-visible scene.
- Treat world-build acceptance and gameplay acceptance as separate halves of the living-world outcome. Closing at World Review requires explicit user agreement that playable turns are deferred.
- Report playtest depth in completed player actions. Opening is turn zero; build events, actor jobs, model stages, retries, and reloads do not increase the gameplay-turn count.
- A pristine 60-turn acceptance lane requires a named human to choose each action from the visible player surface; automation may enter and capture the choice.
- Add a smoke test only when it proves a named risk that focused contract tests and the real player path do not already prove.
- Every mechanics slice that changes player flow needs a manual playtest note: exact path, player action tried, observed result, and whether it is pristine acceptance or diagnostic.
- A planned playtest gate is a hard gate: execute the player path and record the evidence before moving to the next architecture item.
- Backend-only work after the accepted scope boundary is exploratory code, not accepted product work, until the owner explicitly scopes it and manual playtests prove the player path.
- World DNA is an optional but first-class player step; do not hide it inside a backend transition when the current flow needs player review or editing.
- When the user chooses the DNA path, World DNA starts as a generated draft from the campaign Premise and can be edited before world generation.
- Preserve both setup paths: concept can create a world from premise/source context, and `/campaign/new/dna` remains the optional seed-editing route before campaign creation.
- Accepted World DNA is the blueprint layer. Player-character creation opens after the created world signal, currently `campaign.generationComplete === true`, so characters can be placed inside the actual world.
- Acceptance must follow the actual player path: create campaign, save, opening, action loop, state reload, and longplay.
- Longplay evidence must separate diagnostic lanes from pristine acceptance lanes.
- Final longplay lanes require adaptive inspected actions, not preselected/generated batches.
- A lane with failed, replayed, restored, or contradicted player-facing turns is diagnostic until fixed and replayed from a clean start.
- Snapshot an accepted world before character creation, then materialize each playtest into its own `GSD_CAMPAIGNS_ROOT`. Reusing the same internal campaign ID in an isolated root is safer than rekeying SQLite or overwriting the live campaign library.
- Treat reusable-world provenance as an executable evidence contract: verify materialized file hashes before opening the run, then bind accepted content identity through session and final manifests. A clone directory alone is not proof of a clean world.

## UI And Narration

- GLM/Droid review belonged to the previous model workflow. Current Sol owns UI, prompt, and copy judgment directly; use `humanizer` and `deslop` where prose needs them and never add GLM as a delivery gate.
- Treat `docs/UI Concept.html` as the mechanics UI style canon, and create missing graphics from that visual language before implementation.
- Render accepted World DNA and similar generated world facts as structured review surfaces, with separated fields and visible hierarchy; dense raw label/value prose blocks are a UI defect.
- Campaign setup screens must follow the approved Concept -> World DNA -> World generation -> World Review -> Player sequence from `docs/UI Concept.html`. Mechanics proof shells can prove data flow, but product routes should render the approved step surface.
- Do not use mechanical proof screenshots as a substitute for product UI. Proof artifacts verify behavior after the product surface exists.
- Accepted World DNA remains editable until world generation starts. The pre-world Forge surface must offer edit, single-field reroll, all-field reroll, save, and save-before-create instead of a locked summary.
- Keep idle setup surfaces quiet. Future-step status cards, progress labels, and explanatory footer notes appear when the process is running, complete, blocked, or actionable.
- Setup rail state must name the surface currently on screen: editable DNA cards mean World DNA is active; World generation becomes active only while the world build is running.
- Avoid top-of-hero sublabels when the heading already names the state.
- Avoid repeating the active setup step across the rail, H1, and section title. Use the rail for the step name, then use the H1 and section title for the player's current work.
- Avoid adding a secondary section heading when the screen contains a single content block under a clear H1.
- Running generation surfaces need visible elapsed time next to stage progress.
- When the primary action persists dirty edits before continuing, do not expose a separate Save button for the same draft.
- Gate player-character creation behind the created world signal, currently `campaign.generationComplete === true`. World DNA can enrich that context, but missing DNA must not block premise-only world creation.
- Keep graph/kernel mechanics off player-facing setup screens. Compose and persistence steps run internally after their player-facing prerequisite is complete.
- UI owns scene labels, route chips, status, inventory, visible actor chips, and structured action handles.
- Narration owns lived moment, pressure, sensory surface, visible behavior, and action handoff.
- Route option labels are UI/action handles. Prose should summarize visible ways onward unless the player asks about one explicit route.
- Opening is gameplay, not a metadata receipt. It needs concrete start placement, immediate pressure, visible actors only when clear, and first actionable hooks.
- Macro locations are lenses, not proof of immediate actor presence.

## Runtime Ownership

- Typed receipts own movement, custody, route truth, time, durable state, and bounded observations.
- Dialogue quotes cannot perform item custody. Narrated handoff/return must match item-state receipts and post-turn inventory.
- Route checks prove availability only. Movement requires movement authority and committed location/clock mutation.
- Player sensory follow-ups that ask about danger, source, proximity, mechanism, route truth, or current property route to bounded observation.
- Exact hard micro-results with no prose latitude should be typed renderables, not model paraphrase traps.
- Budget model stages against visible answer tokens separately from provider reasoning tokens, and set timeouts from measured thinking-model latency; a healthy 55–65 second GLM response must not be classified as unavailable.
- Do not impose a wall-clock deadline on the GLM opening planner. Let the frozen call finish; cancel it only when its worker authority is actually lost or the user stops it.
- Enforce the global model-output minimum at the provider model boundary as well as in settings; per-call defaults and forgotten low budgets must not bypass the 32k floor.
- Narration must receive concrete projected receipts for the accepted player action and every same-turn NPC action the player could perceive. A post-turn scene snapshot alone cannot preserve event order or causal continuity.
- Model-authored action copy may supply only a short grammatical detail under a code-owned intent and target prefix. Persist the rendered label for Judge while freezing kind and targets independently.
- Keep player-visible narration in second person even when projected receipts name the player actor. Journal and consequence records may remain third-person factual summaries.
- Size living-world playtests from the required peripheral actions plus the longest accepted exposure path; a short fixed turn count can make a valid consequence unreachable and produce a false failure.
- A successful social roll improves the answer only within the stated request and established relationship. It cannot create trust or make an unfamiliar NPC volunteer protected assets, unrelated motives, or risky admissions.
- Bind an opening exposure seed to the exact actor plan and primary goal that will execute it. Actor-only matching can accept an unreachable consequence when one actor has multiple active goals.
- A graph-distance discoverability promise must control the single curated travel choice while its exact aftermath remains unseen; merely listing the correct route elsewhere in the scene does not make the promised player path reliable.
- For strict model objects, list the exact top-level keys in the prompt and forbid any observed near-synonym. A supplied JSON schema alone may not prevent semantic key renaming.
- Before creating a manual playtest character, inspect the accepted cast for names, roles, and defining professions. Use a distinct player concept so duplicate identities do not contaminate narrative-quality evidence.
- Schedule autonomous people by controller and entity kind, not cast prominence. Background people still act; collectives remain world context unless they have an explicit non-person simulation contract.

## Evidence Handling

- Preserve evidence that explains current mechanics or accepted behavior; remove raw duplicate logs and generated run debris.
- Write structurally complete evidence even when a declared budget is exceeded, then fail promotion through validation. A policy failure must not destroy the diagnostic artifact.
- Do not count old contaminated transcripts as pristine acceptance after a later fix.
- Read user-supplied attachments from disk when they shape current work; summaries do not replace the artifact.
- Oracle/Pro asks need actual case files: code paths, failing output, target contract, current diff, and proof artifacts.
- If an Oracle/browser wrapper fails, distinguish tool failure from model advice.
- Treat empty or zero-height browser message containers as extraction limits. Verify chat completeness through attachment/export/scroll evidence before describing missing content.
- When a delegated analysis stalls past one focused status request and one bounded synthesis request, stop that worker, continue from verified local evidence, and use a fresh reviewer at the next decision gate.
