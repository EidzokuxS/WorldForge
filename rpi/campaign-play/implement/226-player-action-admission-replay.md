# Task 226: player-action admission replay

Date: 2026-08-14
Status: Needs attention

## Purpose

Retry one ambiguous Campaign Play player-action admission through the existing frontend page seam, reusing the complete request and idempotency key after one bounded authority refresh. An explicit domain error remains non-retryable, and a second ambiguous failure retains the existing service-unavailable surface.

## Stable identity

- Repository: `R:\Projects\WorldForge`
- Branch: `feat/revamp`
- Starting commit: `51377867aa1ba987451dadcf8449ed522e53d715`
- Implementation commit: `96b2e2049e623d3038c8e54831358fb16f7eba7a`
- Implementation push: local and `origin/feat/revamp` both equal `96b2e2049e623d3038c8e54831358fb16f7eba7a`
- Live run: `pristine-60-glm52-lowwater-ledger-93a09e46-r188`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Provider and model: `zai-coding-plan` / `glm-5.2`

## Delta

`CampaignPlayPage.submitAction` now creates one complete admission request per player click, including one UUID and the expected versions. It makes the original admission call once; only a non-`CampaignPlayApiError` or `service_unavailable` first failure receives one bounded `refreshAuthority` read and, if page ownership is still current, one exact same-request replay. Success follows the existing turn path; a second failure or any explicit domain error uses the existing reconciliation surface. No API, backend, prompt, provider, model-policy, schema, migration, UI copy, or persistence semantics changed.

## Static evidence

- Exact-current isolated GitNexus impact before editing: `submitAction` 3 impacted nodes, LOW; `admitCampaignPlayTurn` 5 impacted nodes, LOW; one Campaign Play process/module for each.
- Focused page suite: `47/47` passed.
- Same-key backend admission replay suite: `35/35` passed.
- Full frontend suite: `76` files, `531` tests passed.
- Frontend typecheck passed.
- Production frontend build passed with API base `http://127.0.0.1:4720`.
- Touched-file ESLint passed; `git diff --check` passed.
- Staged GitNexus detect: 2 files, 3 symbols, 1 affected process; mapped `CampaignPlayPage`, `submitAction`, and line-mapped `submitOpening`; medium risk. Scope stayed in the owned page/test seam.
- Note-only staged GitNexus detect: no changes detected (documentation-only diff).

## Live evidence

- The invalid r185 and r186 artifacts remain preserved and were not resumed, repaired, or reused.
- Before r188 materialization, `settings.json` was captured at SHA-256 `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`. Generator, Judge, and Storyteller were directly verified as `zai-coding-plan` / `glm-5.2` (aligned SHA-256 `7456C1C9DDD449BB8B13EDC8951BF21542BCA833841619A6B41B731D1597B5E7`).
- Canonical state/config/Brina hashes were `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` / `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065` / `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- Exactly one r188 materialization and one successful `--live-phase prepare` were performed. The isolated campaign root was `output/playtests/campaign-world-runs/pristine-60-glm52-lowwater-ledger-93a09e46-r188/campaigns`; the external run-config was task-owned. Ports 4720/4721 were used after a free-port check and 4722 remained free.
- Rendered setup completed exactly once: one canonical Brina import/file assignment, rendered `Brina Hael`, one Continue, `lower-wards`, `Local`, `Already here`, `Looking for work`, one Begin, and a ready Opening proper scene. No second file-input action occurred.
- Actions 1-41 each used one signed visible choice and one rendered click, reached a rendered ready scene with enabled controls within 120 seconds, and produced one durable completed player turn and one unique proper-scene binding. Final authority after action 41 was worldVersion `55`, runtimeRevision `678`; counts were 41 unique completed player turns, 42 unique narrations, 41 unique proper scenes, and 104 unique commands/receipts/world events. All 41 narration operations were `source_kind=model_accepted`, attempt 1; no deterministic continuity or automatic recovery was observed.
- Actions 2 and 3 had an executor polling race where an early bind call preceded durable completion. Read-only reconciliation showed the clicked turn completed; each action then received one successful bind without a second click, admission, or replay. No duplicate identity was created.
- Read-only checkpoint backups were captured with `query_only=1`, `integrity_check=ok`, and empty foreign-key checks:
  - action 10: `10/10/10`, commands/receipts/events `37/37/37`, worldVersion `23`, runtimeRevision `172`, backup SHA-256 `A7DBA0076850F646727D2ED5D8144A41706759AD83202B55E07548D54131E5A7`;
  - action 20: `20/20/20`, commands/receipts/events `58/58/58`, worldVersion `33`, runtimeRevision `330`, backup SHA-256 `B9DA5878D428632F05F2CE1E7658FD187F9BC72F0903A42543E813B24A68971E`;
  - action 30: `30/30/30`, commands/receipts/events `80/80/80`, worldVersion `43`, runtimeRevision `495`, backup SHA-256 `4A0A787E2B0E04FCA8CBA46B2C5C7DE9F266814D47C73DFD5020C549B781D68A`;
  - action 40: `40/40/40`, commands/receipts/events `102/102/102`, worldVersion `54`, runtimeRevision `665`, backup SHA-256 `A30300009B82384EF29E7A410568ACB9EE6E530CBA6CAA9F9E4E3981DD2BEC52`.
- Action 42 was signed once at local `2026-08-14 05:35:24.924 +03:00` as `Talk to Kellin Marsh: ask about the cold-season precedent`, choice handle `choice_537eec205d88cdfe34def176`, visible-state hash `5c6a1327245e0adba9b77dabb448f486f50ff737824892643bdaa62d5f695773`. The browser click returned success once. The page then rendered `The game service is temporarily unavailable.` and `Try again`; no action-42 bind, Resume, retry, replay, or later click was performed.
- One-time read-only reconciliation after the boundary found the public state still `ready` at worldVersion `55`, runtimeRevision `678`, with the action-41 projection and four visible choices. SQLite had 41 player-action rows, all 41 completed; no action-42 row existed. Counts remained 42 narrations, 41 proper scenes, and 104 commands/receipts/world events; `integrity_check=ok`, foreign-key check empty, and `query_only=1`. The backend GET state was reachable and the task-owned backend/frontend PIDs were still listening at that observation. The session network trace is empty and `network-errors.json` is `[]`, so the exact first admission transport/response failure and whether the frontend replay was attempted are not established.
- The lane was frozen at this first genuine rendered boundary. Actions 43-60, checkpoints 50/60, and the final same-page reload were not run.

## acceptance_handoff

Needs attention. The frontend-only implementation and static checks are pushed, and r188 proved 41 consecutive rendered actions with unique durable/bound identities. The unchanged pushed build then hit a genuine service-unavailable rendered boundary on action 42; the required 60-action journey and final same-page reload are therefore not claimed and this lane must not be resumed or repaired.

## Cleanup

- Generated r188 session/world evidence and bounded logs remain preserved and uncommitted.
- Task-owned services, browser/CDP, helper, profiles, run-config, and read-only SQLite checkpoint copies were cleaned after evidence capture; only generated r188 evidence and bounded logs remain.
- `settings.json` was restored byte-for-byte and verified at SHA-256 `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`.
- Pre-existing `AGENTS.md` and `CLAUDE.md` were not inspected, edited, staged, or committed.

## Next

Authorize a new bounded diagnosis or lane only after the action-42 service-unavailable boundary is understood; do not resume, repair, or reuse r188.

## Unknowns

- The retained evidence does not distinguish an absent/lost/invalid first admission response from a replay that also failed. No action-42 backend row, network event, or durable result exists.
- The required actions 43-60, checkpoints 50/60, and same-page reload persistence remain untested.

## Changed artifacts

- `frontend/components/campaign-play/CampaignPlayPage.tsx`
- `frontend/components/campaign-play/CampaignPlayPage.test.tsx`
- `rpi/campaign-play/implement/226-player-action-admission-replay.md`
