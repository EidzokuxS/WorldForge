# Campaign World Build architecture map

## Current path

```text
Campaign Concept
  -> config.json and campaign row
  -> Campaign Forge loads CampaignMeta and kernel.json
  -> POST /api/worldgen/generate
  -> scaffold generator creates locations, factions, NPCs, and lore cards
  -> SQLite transaction writes scaffold
  -> config.json separately sets generationComplete
  -> lore storage writes separately
  -> World Review reads old projection
  -> POST /api/worldgen/save-edits rewrites the scaffold and entity IDs
```

Campaign Kernel reaches accepted World DNA but does not receive the generated world in production. Its graph adapter has test callers only. `world_ready` therefore describes DNA readiness while `generationComplete` describes scaffold persistence.

## Current truth stores

| Store | Current content | Problem for the target flow |
|---|---|---|
| `config.json` | premise, seeds/DNA, research, `generationComplete` | readiness commits separately from SQLite |
| `state.db` | locations, NPCs, factions, generic relations | entity model and review writer belong to the scaffold path |
| `kernel.json` | DNA, partial graph, cast/setup prototypes | duplicate source and readiness state |
| LanceDB | lore cards | a failed write still reports world completion |
| browser session storage | pre-campaign concept and DNA draft | valid temporary intake state |

## Selected seam

`state.db` owns Campaign World after build. `config.json` supplies source context through one adapter. `CampaignConfigFile.seeds` stores the World DNA draft, and every post-creation DNA write delegates to `saveWorldSeeds`. Campaign World stores the exact normalized source snapshot and digest used for its version.

The selected storage approach reuses `locations` and `location_edges`, then adds typed actors and build ownership. A parallel location table would force every later Rulebook read through a projection and keep two graphs alive.

The active Forge/Review path leaves `kernel.json`. Campaign Kernel remains donor material for later setup analysis and receives no projection from Campaign World in this goal.

## New read and write path

```text
config.json
  -> CampaignWorldSource
  -> strict frame, cast, connections stages
  -> deterministic whole-draft validation
  -> one SQLite transaction
  -> CampaignWorldReview projection
  -> version/hash acceptance receipt
```

Build progress uses a durable ledger. The build starts before an SSE subscriber connects, events receive sequence numbers in SQLite, and a reconnect resumes through `Last-Event-ID` or `afterSequence`. A browser reload discovers the build through `/world/state` and replays the persisted ledger. The terminal event points the client back to persisted state.

Each background build opens its own campaign-scoped SQLite handle and keeps it through the terminal transaction. Switching the app-wide active campaign may close the global database connection, but it cannot close or redirect this handle. Success commits domain rows, world metadata, completed build status, lock release, and `build_completed` together. Failure commits failed status, lock release, and `build_failed` together.

DNA save and build acquisition share a keyed per-campaign mutex. Acquisition freezes the normalized source snapshot and digest in `campaign_world_builds`; model stages consume that row and do not reread config. The cutover removes the mounted Campaign Kernel DNA apply and suggestion endpoints, leaving Campaign World as the only post-creation DNA writer.

Each model call writes sanitized contract evidence: requested, primary, and actual strategies; attempt count; repair/retry/text-fallback flags; response model; and finish/error metadata. Prompts, outputs, and reasoning stay out of the ledger. Live acceptance exports this evidence and requires one primary structured-output attempt per stage.

The product build envelope prevents a schema-valid empty world. It requires 3 to 10 locations, 4 to 16 actors with key/support/collective coverage, goals for every key/support/collective actor, distributed person placements, and 2 to 6 anchored pressures. Zod stage bounds and the deterministic validator share these limits.

The state machine allows unbuilt -> building -> review -> accepted and failed -> building. DNA changes are allowed in unbuilt and failed states. A review or accepted world rejects another build. Campaigns with scaffold or gameplay rows return `campaign_recreation_required`; this goal provides no importer.

## Reference findings used

- TarotEngine: explicit stage owners, critical agent gates, temporary campaign isolation, live evidence bundles.
- NarrativeEngine-P: bounded actor goals, goal collision, timeskip budgets, and surface levels for later visibility work.
- AndreiNicu/World-Forge: collision, near-miss, lull, and off-script behavioral probes plus a run ledger.
- Yozakura: shared human/AI character shape, directed relations, location graph, schedules, and perspective windows.
- Universal Immersion Engine: staged action review and reversible interface patterns.
- Yuralume: schedule aftermath and proactive-delivery gating as a later scheduler reference.

## Risks and controls

| Risk | Control |
|---|---|
| Model emits broken cross-references | strict Zod stage contracts plus whole-draft reference validation |
| A provider silently falls back to text | provider capability gate and `allowTextFallback: false` |
| Repair hides a broken stage | `allowRepair: false`, `strictSchema: true`, `retries: 1` |
| Client disconnect or reload loses build completion | persisted sequenced events, state discovery, and resumable SSE |
| Active campaign switches during a model call | campaign-scoped database handle held by the build |
| Process crashes after world persistence | domain commit and terminal event share one SQLite transaction |
| DNA changes between digest check and build start | source mutex plus frozen build-row source snapshot |
| Provider uses a hidden strategy | persisted stage evidence with one-attempt and strategy gates |
| A failed build leaves a partial world | generation in memory plus one domain transaction |
| Two build requests race | SQLite build lock and `409` conflict |
| Review accepts stale data | expected version and content hash |
| Organizations regain a special subsystem | `WorldActor(kind: "collective")` contract and schema checks |
| Actor cast collapses into one location | deterministic distribution invariant and live Review inspection |
| Review displays streamed output instead of truth | terminal event triggers a fresh repository read |

## Evidence decision

Focused tests cover contracts, transactions, routes, and UI states. Two live provider runs cover the actual player path and restart readback. The second run includes edited DNA and saved research. A separate smoke script would repeat those checks without proving a new risk, so this goal does not add one.
