# Phase 36 Gameplay Baseline Handoff

This file is the authoritative gameplay baseline handoff for the next milestone.

It is derived from:
- [`36-CLAIMS.md`](R:\Projects\WorldForge\.planning\phases\36-gameplay-docs-to-runtime-reconciliation-audit\36-CLAIMS.md)
- [`36-RUNTIME-MATRIX.md`](R:\Projects\WorldForge\.planning\phases\36-gameplay-docs-to-runtime-reconciliation-audit\36-RUNTIME-MATRIX.md)

It does not introduce new feature scope. Every item below traces back to classified claims or elevated integrity seams already documented in the matrix.

## Authoritative Baseline

### Safe To Treat As Live

These areas are implemented enough to serve as baseline assumptions for the next milestone:

- Core player turn loop exists and is wired through `/api/chat/action`, Oracle resolution, storyteller prompt assembly, tool execution, and SSE delivery.
- Strong Hit / Weak Hit / Miss outcome logic is real and backend-owned.
- World state basics are real: location graph, item ownership table, NPC tiers, factions, chronicle entries, and campaign-local storage.
- Prompt assembly already consumes world premise, scene, player state, NPC state, lore, conversation, and episodic-memory context.
- Character handoff into gameplay exists, including structured starting conditions and canonical loadout derivation.

### Not Safe To Treat As Solved

These areas exist in code but are not trustworthy enough to treat as “done”:

- Reflection/progression loop
- Rollback and checkpoint fidelity
- Inventory/equipment state authority
- Gameplay transport/session coupling
- Player-visible turn atomicity vs deferred post-turn simulation
- Several doc-promised mechanics around travel cost, per-location recent happenings, wiki ingest, and target-aware Oracle context

## Priority Groups

Priority groups are execution guidance for the next milestone. They are not hard phase promises.

### Group A: Must Fix First

These items block trustworthy gameplay iteration. The next milestone should not treat downstream tuning or new mechanics as stable before this group is addressed.

| ID | Handoff Item | Source claim IDs | Matrix source | Rationale | Dependency constraints |
| --- | --- | --- | --- | --- | --- |
| A1 | Make reflection trigger accumulation real and observable. | `REFL-02`, `REFL-04`, `REFL-06`, `REFL-08`, `REFL-09` | Integrity seam: `Reflection trigger viability`; missing/partial reflection rows | Reflection code exists but the trigger budget does not accumulate in live runtime, so beliefs, goals, relationship drift, and progression are structurally present but operationally dead. | Do before any balancing or prompt tuning for reflection/progression. |
| A2 | Unify gameplay transport on campaign-loaded routes instead of active in-memory session state. | `TURN-03`, `TURN-04`, `SAVE-04`, `CHAR-18` | Integrity seam: `Session-scoped gameplay transport`; chat route evidence in matrix | `/history`, `/action`, `/retry`, `/undo`, and `/edit` still depend on `getActiveCampaign()`, which undermines reliability after reloads and makes gameplay less robust than newer worldgen/character flows. | Do before gameplay E2E closeout or any route-level UX fixes that assume stable reload behavior. |
| A3 | Make rollback/retry restore the same world boundary the player sees as “the turn.” | `TURN-16`, `SAVE-05`, `SAVE-06` | Integrity seams: `Rollback / retry fidelity`, `Player-visible vs deferred post-turn simulation` | The player sees `done` before NPC ticks, off-screen sim, reflection, and faction ticks complete, so undo/retry can restore the player shell while leaving world mutations behind. | Solve together with A4 or immediately after it; both touch turn authority. |
| A4 | Make checkpoint restore include all campaign-authoritative runtime state, including `config.json`. | `SAVE-05`, `SAVE-06`, `MEM-01` | Integrity seam: `Checkpoint fidelity` | Checkpoints copy DB, vectors, and chat history but omit config-backed runtime state such as `currentTick` and other campaign-level data, so “what if” branching is not fully trustworthy. | Required before declaring persistence trustworthy. |
| A5 | Choose one authoritative inventory/equipment model and eliminate projection drift. | `STATE-13`, `STATE-14`, `MEM-01`, `CHAR-17`, `CHAR-21` | Integrity seam: `Inventory / equipment state authority`; partial inventory/prompt rows | Inventory truth is split across `items`, `characterRecord`, `equippedItems`, and loadout-derived fallbacks. That weakens persistence, rollback, and prompt fidelity. | Do before adding more item mechanics or narrative enforcement around equipment. |

### Group B: Documented Gaps That Should Become Real Mechanics

These are still-intended documented behaviors with no adequate runtime path.

| ID | Handoff Item | Source claim IDs | Matrix source | Rationale | Dependency constraints |
| --- | --- | --- | --- | --- | --- |
| B1 | Implement target-aware Oracle input resolution. | `TURN-19` | `TURN-19 = documented_but_missing` | The Oracle contract advertises `targetTags`, but gameplay currently always passes `[]`, which weakens action judgment against concrete targets. | Depends on A2 only insofar as route reliability improves testability; otherwise independent. |
| B2 | Add backend-enforced protection against narrated use of nonexistent inventory items, or narrow the docs if that guarantee is intentionally prompt-only. | `STATE-14` | `STATE-14 = documented_but_missing` | Current protection is prompt guidance, not a hard backend rejection path, which is weaker than the documented engine-trust promise. | Prefer after A5 so the authoritative item source is clear first. |
| B3 | Decide whether the game should actually support per-location recent-happenings state, or explicitly deprecate that claim. | `STATE-18` | `STATE-18 = documented_but_missing` | The docs promise location-local event history, but the runtime has no location event-log surface. | Depends on A3/A4 only if this becomes part of rollback/checkpoint state. |
| B4 | Decide whether travel time by edge distance remains intended; implement it or deprecate it. | `STATE-19` | `STATE-19 = documented_but_missing` | Movement works, but the documented “abstract turns by distance” contract does not exist. | Independent. |
| B5 | Decide whether wiki/Fandom URL ingest remains product scope; implement it or formally remove it from docs. | `MEM-17`, `CHAR-04` | `MEM-17 = documented_but_missing`, `CHAR-04 = documented_but_missing` | Docs still advertise wiki URL as both lore-ingest and world-source input, but there is no user-facing runtime path. | Independent of core gameplay integrity, so after Group A. |
| B6 | Decide whether event importance should really be LLM-scored at log time; implement it or rewrite docs around caller-supplied importance. | `MEM-09` | `MEM-09 = documented_but_missing` | Current runtime writes caller-provided importance values. That may be acceptable, but it is not what the docs claim. | Independent; low dependency. |

### Group C: Carry Forward Partial Contracts

These are live enough to preserve, but they need integrity or clarity work before they match documented intent.

| ID | Handoff Item | Source claim IDs | Matrix source | Rationale | Dependency constraints |
| --- | --- | --- | --- | --- | --- |
| C1 | Decide whether turn mechanics should become more front-loaded and deterministic before narration, or whether docs should be narrowed to the current tool-execution model. | `TURN-02` | `TURN-02 = implemented_but_partial` | The code resolves probability first, but many concrete state effects still happen through post-story tool execution. The docs imply a stronger backend-owned mechanical boundary than what currently exists. | Depends on A3 because turn-boundary clarity comes first. |
| C2 | Tighten world-information-flow semantics so NPC/world knowledge is more explainable than “the prompt probably had enough context.” | `WORLD-12`, `WORLD-13` | `WORLD-12`, `WORLD-13 = implemented_but_partial` | The current prompt context allows approximate inference, but the docs imply a more legible realism model around proximity, faction, and elapsed time. | Depends on A1 if reflection remains part of the knowledge loop. |
| C3 | Decide whether the tag system should remain derived runtime shorthand or return to being a universal primary ontology. | `STATE-01` through `STATE-07` | Tag-system rows mostly `implemented_but_partial` | Runtime now uses a richer structured character model while docs still describe tags as the universal language. That mismatch needs an explicit decision. | Depends on A5 for inventory authority and on prompt/system contracts from later gameplay work. |
| C4 | Align episodic and lore retrieval behavior with the documented retrieval contract, or narrow the docs to the vector-first reality. | `TURN-07`, `TURN-08`, `MEM-11`, `MEM-14`, `MEM-23`, `MEM-26` | Partial retrieval/prompt rows | Retrieval exists, but some doc promises remain stronger than current implementation, especially keyword+vector lore retrieval and exact action-result shaping. | Independent. |
| C5 | Clarify how much of the world-source combination model is core gameplay setup versus optional UX expansion. | `CHAR-05`, `CHAR-08`, `CHAR-09` | Partial world-source and DNA rows | Backend composition is broader than the routed UI, while docs position DNA as optional and sources as combinable. The next milestone should not accidentally calcify a misleading setup contract. | Independent of Group A; can be planned later if gameplay milestone includes setup/handoff work. |

### Group D: Nice To Have Later

These are valid polish or expansion items, but they should not outrank integrity repair.

| ID | Handoff Item | Source claim IDs | Matrix source | Rationale | Dependency constraints |
| --- | --- | --- | --- | --- | --- |
| D1 | Restore or rewrite the original `/game` “strict three-column” layout promise. | `TURN-23` | `TURN-23 = outdated_or_contradicted` | This is docs drift, not a gameplay integrity blocker. | Only after gameplay state contracts are stabilized. |
| D2 | Revisit fixed counts and retrieval budgets that have already drifted from older docs. | `TURN-10`, `REFL-01`, `CHAR-11`, `CHAR-12`, `CHAR-13`, `CHAR-14`, `MEM-24` | Mixed partial/outdated rows | These are important for honest docs, but they do not block trustworthy runtime the way Group A does. | Independent. |
| D3 | Surface NPC promotion and companion semantics more explicitly in UI/runtime if they become meaningful for player-facing gameplay. | `NPC-03`, `CHAR-23` | Partial rows | Both behaviors exist in limited form, but neither is central enough to outrank integrity work. | After Groups A-C. |

## Deprecation Tracker

These claims should not be silently carried into the next milestone as live promises. They should either be rewritten to match the current product or explicitly marked deprecated in docs.

| Doc area | Claim IDs | Current matrix status | Rewrite direction |
| --- | --- | --- | --- |
| `docs/concept.md :: UI: "Solid Slate" Layout` | `TURN-23` | `outdated_or_contradicted` | Rewrite to match the actual `/game` surface or move it to “historical concept art.” |
| `docs/mechanics.md :: Reflection threshold` | `REFL-01` | `outdated_or_contradicted` | Rewrite threshold language to match the actual chosen trigger once A1 is solved. |
| `docs/memory.md :: Prompt Assembly` | `MEM-24` | `outdated_or_contradicted` | Rename the prompt block reference from `[RETRIEVED MEMORIES]` to the live `[EPISODIC MEMORY]` contract if kept. |
| `docs/concept.md :: Scaffold Generation counts` | `CHAR-11`, `CHAR-13`, `CHAR-14` | `outdated_or_contradicted` | Replace exact legacy counts with the live worldgen ranges if those ranges remain intended. |
| `docs/concept.md` / `docs/memory.md` world-source wiki ingest claims | `CHAR-04`, `MEM-17` | `documented_but_missing` | Either implement later or explicitly remove the promise; do not leave it ambiguous. |

## Next Milestone Entry Criteria

The next gameplay milestone should start only after these baseline decisions are accepted:

1. Group A defines the non-negotiable integrity repair surface.
2. Group B items are explicitly split into:
   - still intended and must be implemented
   - no longer intended and must be deprecated
3. Group C items are treated as contract-clarification work, not silent assumptions.
4. The next milestone phases must reference claim IDs from this handoff rather than re-auditing the docs.

## Planning Guidance For The Next Milestone

- Start from Group A, not from feature wishlists.
- Do not promise hard phase order beyond the dependency constraints above.
- Keep claim IDs attached to milestone phases so later verification can prove the reconciliation stayed honest.
- Any future doc rewrite should reference this handoff’s deprecation tracker rather than ad-hoc cleanup.
