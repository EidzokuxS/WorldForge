# Phase 44 Claim Resolution Map

This artifact is the Phase 44 execution-time proof for `DOCA-01`. It maps every elevated Phase 36 **Group B** and **Group C** item to its final documentation outcome.

Resolution types:

- `implemented behavior`
- `explicit deprecation/replacement`
- `explicit bounded pending note`

## Group B

| Item | Source claim IDs | Final resolution | Final doc locations | Resolution note |
| --- | --- | --- | --- | --- |
| B1 | `TURN-19` | `implemented behavior` | `docs/mechanics.md :: The Probability Oracle`; `docs/mechanics.md :: Target-Aware Boundaries` | Oracle docs now state live target-aware support for supported `character`, `item`, and `location/object` targets, with honest fallback when no supported concrete target resolves. |
| B2 | `STATE-14` | `explicit bounded pending note` | `docs/memory.md :: Inventory and Equipment`; `docs/mechanics.md :: Bounded Pending Seam: Inventory Authority` | The old blanket "backend rejects nonexistent inventory references" reading is narrowed. Final docs preserve the narrower true contract: tool-mediated entity/item/location validation returns error results, while Phase 38 remains the pending inventory-authority seam. |
| B3 | `STATE-18` | `implemented behavior` | `docs/concept.md :: World Structure`; `docs/mechanics.md :: World and Location Model`; `docs/mechanics.md :: Local History` | Per-location recent happenings are now carried as live location-local history rather than a removed promise. |
| B4 | `STATE-19` | `implemented behavior` | `docs/concept.md :: World Structure`; `docs/mechanics.md :: Travel and Connectivity` | Travel time remains part of the live contract through graph travel cost and path-aware movement instead of being deprecated. |
| B5 | `MEM-17`, `CHAR-04` | `explicit deprecation/replacement` | `docs/concept.md :: World Sources`; `docs/tech_stack.md :: Setup And Import Tooling`; `docs/memory.md :: Lore Retrieval` | Wiki/Fandom URL ingest is no longer documented as a live player-facing contract. Phase 44 replaces that promise with the bounded current sources and retrieval paths. |
| B6 | `MEM-09` | `explicit deprecation/replacement` | `docs/memory.md :: Episodic Memory > Importance and Writes`; `docs/mechanics.md :: AI Agent Tool System` | Event importance is documented as caller-supplied at write time. The old LLM-scored-importance wording is explicitly replaced, and reflection-threshold wording is aligned to the live threshold `10`. |

## Group C

| Item | Source claim IDs | Final resolution | Final doc locations | Resolution note |
| --- | --- | --- | --- | --- |
| C1 | `TURN-02` | `explicit deprecation/replacement` | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: AI Agent Tool System`; `docs/memory.md :: Turn Finalization Boundary`; `docs/tech_stack.md :: Gameplay Transport` | Phase 44 does not claim a more front-loaded pre-narration mechanics layer than runtime actually provides. The final docs narrow the contract to backend-owned ruling plus tool execution and restore-safe REST + SSE finalization. |
| C2 | `WORLD-12`, `WORLD-13` | `explicit deprecation/replacement` | `docs/mechanics.md :: World-information-flow`; `docs/concept.md :: The "What If" Sandbox`; `docs/concept.md :: World Structure` | World-information-flow is narrowed to bounded proximity, faction, local-history, and elapsed-time context. The docs no longer imply a fully legible per-actor knowledge simulation. |
| C3 | `STATE-01` through `STATE-07` | `explicit deprecation/replacement` | `docs/mechanics.md :: Authority Model`; `docs/mechanics.md :: Canonical Character State`; `docs/mechanics.md :: Derived Tags and Compatibility Views`; `docs/concept.md :: Character Import And Authoring`; `docs/memory.md :: Authoritative Structured State` | The old "tags are the whole ontology" reading is replaced. Final docs now anchor gameplay truth in canonical records first, with derived tags documented as shorthand or compatibility output. |
| C4 | `TURN-07`, `TURN-08`, `MEM-11`, `MEM-14`, `MEM-23`, `MEM-24`, `MEM-26` | `explicit deprecation/replacement` | `docs/memory.md :: Episodic Memory > Retrieval`; `docs/memory.md :: Lore Retrieval`; `docs/memory.md :: Prompt Assembly Contract`; `docs/mechanics.md :: Reflection Contract` | Retrieval semantics are narrowed to the live contract: top-5 episodic, top-3 vector-only lore, `[EPISODIC MEMORY]` instead of `[RETRIEVED MEMORIES]`, and prompt-template naming that matches the live assembler such as `[NPC STATES]`. |
| C5 | `CHAR-05`, `CHAR-08`, `CHAR-09` | `explicit deprecation/replacement` | `docs/concept.md :: World Sources`; `docs/concept.md :: Research And Constraints`; `docs/concept.md :: Scaffold Generation`; `docs/concept.md :: Player Character Handoff`; `docs/tech_stack.md :: Setup And Import Tooling` | The final docs keep bounded source combination and setup reuse, but replace the older looser reading with the actual scaffold-centered routed flow. This also captures the setup-facing drift around world-source scope without pretending every optional UX path is equally first-class. |

## Group D Exclusion

Group D is intentionally excluded from this artifact because `36-HANDOFF.md` marked it as later/deferred work outside the elevated `DOCA-01` Group B/C reconciliation scope.

That means Phase 44 can still resolve related drift elsewhere in the docs without making those rows part of this proof table. In particular:

- `TURN-23` (the old **Solid Slate** layout wording) is a Group D historical/UI drift item, not a Group B/C gameplay-baseline proof row.
- `CHAR-11`, `CHAR-13`, and `CHAR-14` (old scaffold counts) are Group D stale-count drift items, not elevated Group B/C claim rows.

This checklist therefore stays focused on the elevated gameplay-baseline claims that Phase 44 was required to resolve line by line.
