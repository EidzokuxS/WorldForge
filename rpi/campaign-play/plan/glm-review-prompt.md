# Task

Review the Campaign Play planning package before implementation. Work read-only and make no file changes.

# Files

- `AGENTS.md`
- `rpi/campaign-play/REQUEST.md`
- `rpi/campaign-play/research/current-runtime.md`
- `rpi/campaign-play/research/game-design.md`
- `rpi/campaign-play/research/references-and-playtests.md`
- `rpi/campaign-play/research/selected-architecture.md`
- `docs/goals/campaign-play/PLAN.md`
- `docs/goals/campaign-play/GOAL.md`
- the play-stage section of `docs/UI Concept.html`

# Architecture Direction

Campaign Play is a fresh mechanics-owned runtime over accepted Campaign World entities. SQLite owns truth. Models propose structured judgment, plans, and prose. Rulebook code validates and commits typed commands. Actor scheduling uses persisted typed plans. Visibility creates earned observations. Narration receives only a frozen public packet. `/campaign/[id]/play` and `/api/campaigns/:id/play/*` replace the mounted `/game` and `/api/chat/*` path.

# Review Questions

1. Does the plan preserve the player promise of a world that acts independently while the player may remain peripheral?
2. Are truth ownership, accepted snapshot versus live state, transactions, recovery, visibility, and narrator authority internally consistent?
3. Is the planned UI faithful to `docs/UI Concept.html` and fully backed by public DTOs?
4. Are the task boundaries small, ordered, and implementation-ready?
5. Are the 20, 30, two 60, and 300-turn playtests real enough to prove playability, continuity, secrecy, and autonomy?
6. Identify awkward, synthetic, vague, or player-hostile wording in the plan or visible-copy guidance.
7. Identify any hidden fallback, duplicate truth path, old runtime dependency, generic smoke test, or naming-convention violation.

# Output

Return:

- Verdict: aligned, partially aligned, or off-track.
- Findings ordered by blocker, major, minor.
- Exact file and line citations.
- Smallest correction for each finding.
- A separate UI/copy verdict.
- Recommended next gate.

Do not implement anything and do not edit files.
