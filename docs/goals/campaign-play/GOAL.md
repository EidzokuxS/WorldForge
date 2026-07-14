# Goal: Campaign Play

Use Krypton Execution to execute `docs/goals/campaign-play/PLAN.md`.

Core rules:

- Treat `PLAN.md` as the source plan.
- Preserve the living-world outcome, SQLite truth ownership, typed contracts, hard cutover, evidence ladder, and kill criteria.
- Freeze accepted Campaign World provenance before any live play mutation.
- Represent the human player as one `kind=person`, `controller=human`, `role=player` actor.
- Keep immutable accepted provenance, mechanical `worldVersion/worldHash`, and operational `runtimeRevision/runtimeHash` as distinct contracts.
- Append a campaign runtime event for every runtime revision; turn-owned runtime changes also append sanitized turn events.
- Route every player and agent mutation through Rulebook preflight, atomic execution, receipts, and causal events.
- Execute opening as idempotent turn zero through the same admission, worker epoch, Rulebook/bootstrap, visibility, narration, and recovery boundaries as player actions.
- Validate user-correctable opening input before admission; keep external opening failures interrupted, and supersede only a zero-mechanical-mutation failed opening.
- Fence every stage and model artifact by a durable worker lease epoch; explicit resume creates a new attempt and rejects late older-epoch results.
- Keep actor scheduling deterministic from persisted typed plans; use model replanning only at explicit plan boundaries.
- Give narrator and frontend only the immutable player-visible packet.
- Use strict structured model calls with repair, text fallback, provider switching, and hidden retries disabled.
- Run GitNexus impact before every symbol edit and `detect_changes` before commit.
- Complete direct Sol semantic review against `docs/UI Concept.html` before production UI work and review prompts/copy through Sol, `humanizer`, and `deslop`.
- Unmount `/game` and `/api/chat/*`; keep old gameplay and Campaign Kernel source outside the active import graph.
- Add no standalone smoke suite. Use the focused regressions, seeded replay, real UI campaigns, and soak defined in the plan.
- Count opening as turn zero and count only completed player actions as gameplay turns.
- Capture the complete evidence bundle for the first playable slice, 20-turn proof, 30-turn diagnosis, two accepted-template and one clone/provenance pristine 60-turn campaigns, and 300-turn soak.
- Reserve sustained-longplay wording for a separate passing 600-turn run.
- Say `implemented but unproven` when target-perspective evidence is incomplete.
