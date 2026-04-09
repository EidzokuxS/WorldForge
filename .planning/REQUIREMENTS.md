# Requirements: WorldForge

**Defined:** 2026-04-08
**Core Value:** The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.

## v1.1 Requirements

Requirements for the gameplay-fidelity milestone. Each maps to roadmap phases.

### Runtime Integrity

- [x] **RINT-01**: Player can resume gameplay routes (`history`, `action`, `retry`, `undo`, `edit`) after reload using campaign identity, without depending on an in-memory active campaign session.
- [x] **RINT-02**: Retry and undo restore the same authoritative world boundary the player experienced as the completed turn, including post-turn simulation effects.
- [ ] **RINT-03**: Checkpoint save/load restores all campaign-authoritative runtime state, including `config.json`-backed values such as current tick and related campaign runtime metadata.
- [ ] **RINT-04**: Inventory and equipment have one authoritative persistence model that gameplay, prompts, checkpoints, and UI all read and mutate consistently.

### Simulation Fidelity

- [x] **SIMF-01**: Reflection trigger accumulation occurs in live runtime so NPC beliefs, goals, relationship drift, and progression can actually fire under normal play.
- [x] **SIMF-02**: Post-turn simulation has an honest player-visible completion boundary, so world updates do not silently continue after the turn is presented as finished.
- [ ] **SIMF-03**: World-state mutations from NPC autonomy, reflection, and faction simulation remain coherent with rollback, retry, and checkpoint restore behavior.

### Gameplay Semantics

- [ ] **GSEM-01**: Oracle evaluation includes target-aware context when the player acts against a concrete entity, rather than always judging actions with empty target tags.
- [ ] **GSEM-02**: Start conditions affect early gameplay mechanically and persistently, not only as prompt flavor text.
- [ ] **GSEM-03**: Travel/time semantics promised by current docs are either implemented as runtime mechanics or removed from the active product contract.
- [ ] **GSEM-04**: Per-location recent-happenings state promised by current docs is either implemented as runtime state or removed from the active product contract.

### Documentation Alignment

- [ ] **DOCA-01**: Every gameplay claim elevated by Phase 36 Group B and Group C is resolved as either implemented behavior or an explicit deprecation in docs.
- [ ] **DOCA-02**: Gameplay docs describe the live structured character/runtime model accurately, including the role of derived tags versus canonical character data.
- [ ] **DOCA-03**: Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as a planning baseline for later milestones.

## v1.2+ Candidate Requirements

Deferred until runtime integrity is repaired.

### Nice To Have Later

- **POL-01**: Revisit older fixed UI and budget claims that have already drifted from the live product.
- **POL-02**: Surface NPC promotion and companion semantics more explicitly if they become materially player-facing.
- **POL-03**: Add new gameplay features on top of the repaired runtime baseline rather than during integrity repair.

## Out of Scope

Explicitly excluded from this milestone to keep it reconciliation-driven.

| Feature | Reason |
|---------|--------|
| New worldgen feature verticals | Worldgen breadth already shipped; this milestone is about gameplay truthfulness |
| Large non-game shell redesigns | UI overhaul shipped in v1.0; only gameplay-critical UX fallout belongs here |
| Multiplayer / cloud / auth | Still outside the local singleplayer product boundary |
| Cosmetic prompt polish unrelated to gameplay fidelity | Prompt work in this milestone must support runtime integrity or docs alignment |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RINT-01 | Phase 37 | Complete |
| RINT-02 | Phase 39 | Complete |
| RINT-03 | Phase 41 | Pending |
| RINT-04 | Phase 38 | Pending |
| SIMF-01 | Phase 40 | Complete |
| SIMF-02 | Phase 39 | Complete |
| SIMF-03 | Phase 41 | Pending |
| GSEM-01 | Phase 42 | Pending |
| GSEM-02 | Phase 42 | Pending |
| GSEM-03 | Phase 43 | Pending |
| GSEM-04 | Phase 43 | Pending |
| DOCA-01 | Phase 44 | Pending |
| DOCA-02 | Phase 44 | Pending |
| DOCA-03 | Phase 44 | Pending |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after creating the v1.1 Gameplay Fidelity roadmap*
