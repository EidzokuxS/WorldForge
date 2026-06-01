# Lessons

- When the user asks for a clean gameplay-cycle rewrite, do not stabilize the old loop with guard piles. Treat a desire to add a guard as a signal to identify and fix the broken contract or ownership boundary.
- Do not use `docs/WorldForge_runtime_problem_fixes_latency_memory_v5.md` as architecture or implementation guidance for this rebuild. It is historical diagnosis of old-runtime problems unless a specific idea is independently justified by the new clean pipeline.
- Before major gameplay-cycle architecture decisions, consult Oracle/GPT-5.5 Pro with a dry-run prompt and record the question, recommendation, accepted decision, and reason.
- Keep the scope to player message through player-facing narration/API response. Do not expand into world creation, character loading, or broad UI rewrite.
- If the main worktree is dirty with my own changes, commit or otherwise settle those changes in the normal branch before creating a new branch. Do not create a separate worktree to dodge my own uncommitted work unless the user explicitly asks for that workflow.
- Do not leave ad-hoc backend/dev-server processes running after a smoke test. Before starting a new backend on another port, stop the previous one; after the test, stop any listener I started unless I am about to use it again immediately.
- When using `Start-Process` for backend smoke tests, pass `PORT=<port>` through the process environment explicitly and kill listeners on both the intended port and the backend default `3001` during cleanup. A local `$port` variable does not set the child process port.
- A live `/api/chat/action` reaching `narrative` and `done` is not enough evidence for grounded narration. After any settled-packet/narrator change, compare the player-facing prose against the accepted tool result or Oracle result in logs/DB; otherwise the narrator can produce a plausible but different outcome.
- For failed-turn verification, do not stop at “SSE emitted error.” Also verify route-level restore succeeds and no `settled_turn_packets`, `narrator_attempts`, or `turn_sagas` rows were created; otherwise a hidden rollback failure can poison later playtests.
