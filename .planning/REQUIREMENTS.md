# Requirements: WorldForge

**Defined:** 2026-04-08
**Core Value:** The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.

## v1.1 Requirements

Requirements for the gameplay-fidelity milestone. Each maps to roadmap phases.

### Runtime Integrity

- [x] **RINT-01**: Player can resume gameplay routes (`history`, `action`, `retry`, `undo`, `edit`) after reload using campaign identity, without depending on an in-memory active campaign session.
- [x] **RINT-02**: Retry and undo restore the same authoritative world boundary the player experienced as the completed turn, including post-turn simulation effects.
- [x] **RINT-03**: Checkpoint save/load restores all campaign-authoritative runtime state, including `config.json`-backed values such as current tick and related campaign runtime metadata.
- [x] **RINT-04**: Inventory and equipment have one authoritative persistence model that gameplay, prompts, checkpoints, and UI all read and mutate consistently.

### Simulation Fidelity

- [x] **SIMF-01**: Reflection trigger accumulation occurs in live runtime so NPC beliefs, goals, relationship drift, and progression can actually fire under normal play.
- [x] **SIMF-02**: Post-turn simulation has an honest player-visible completion boundary, so world updates do not silently continue after the turn is presented as finished.
- [x] **SIMF-03**: World-state mutations from NPC autonomy, reflection, and faction simulation remain coherent with rollback, retry, and checkpoint restore behavior.

### Gameplay Semantics

- [x] **GSEM-01**: Oracle evaluation includes target-aware context when the player acts against a concrete entity, rather than always judging actions with empty target tags.
- [x] **GSEM-02**: Start conditions affect early gameplay mechanically and persistently, not only as prompt flavor text.
- [x] **GSEM-03**: Travel/time semantics promised by current docs are either implemented as runtime mechanics or removed from the active product contract.
- [x] **GSEM-04**: Per-location recent-happenings state promised by current docs is either implemented as runtime state or removed from the active product contract.

### Documentation Alignment

- [x] **DOCA-01**: Every gameplay claim elevated by Phase 36 Group B and Group C is resolved as either implemented behavior or an explicit deprecation in docs.
- [x] **DOCA-02**: Gameplay docs describe the live structured character/runtime model accurately, including the role of derived tags versus canonical character data.
- [x] **DOCA-03**: Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as a planning baseline for later milestones.

### Live Gameplay Quality

- [x] **SCEN-01**: Player-visible turn text is a single-pass scene assembled from authoritative runtime state, without repeated output blocks or raw-premise opening dumps.
- [x] **SCEN-02**: Scene participation and knowledge follow encounter/perception scope, so large locations do not behave like one small room and NPCs do not over-know unseen actors.
- [x] **WRIT-01**: Storyteller output quality is tuned for playable RP, with research-backed prompting/model settings that materially reduce purple prose and obvious AI smell.
- [x] **CHARF-01**: Character runtime modeling preserves distinctive personality, motives, and identity details for both native and imported/canonical characters.
- [x] **RES-01**: Search and research flows use explicit retrieval intent in both worldgen and live gameplay, producing focused, useful grounded context instead of vague blended queries.
- [ ] **UX-01**: Gameplay text surfaces present player input and generated narration with materially better readability, formatting, and rich-text affordances.

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
| Purely decorative polish unrelated to gameplay feel | Prompt and presentation work is only in scope when it improves actual play readability, scene fidelity, or writing quality |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RINT-01 | Phase 37 | Complete |
| RINT-02 | Phase 39 | Complete |
| RINT-03 | Phase 41 | Complete |
| RINT-04 | Phase 38 | Complete |
| SIMF-01 | Phase 40 | Complete |
| SIMF-02 | Phase 39 | Complete |
| SIMF-03 | Phase 41 | Complete |
| GSEM-01 | Phase 42 | Complete |
| GSEM-02 | Phase 42 | Complete |
| GSEM-03 | Phase 43 | Complete |
| GSEM-04 | Phase 43 | Complete |
| DOCA-01 | Phase 44 | Complete |
| DOCA-02 | Phase 44 | Complete |
| DOCA-03 | Phase 44 | Complete |
| SCEN-01 | Phase 45 | Complete |
| SCEN-02 | Phase 46 | Complete |
| WRIT-01 | Phase 47 | Complete |
| CHARF-01 | Phase 48 | Complete |
| RES-01 | Phase 49 | Complete |
| UX-01 | Phase 50 | Pending |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-12 after extending v1.1 with follow-on gameplay-quality requirements*
