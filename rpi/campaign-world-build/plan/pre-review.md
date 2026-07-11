# Campaign World Build PRE review

Date: 2026-07-09
Mode: PRE
Final verdict: ALIGNED

## Review channels

- Droid model alias: `custom:GLM-5.2-(Z.AI-Coding)-0`
- Alias/tool verification: exit 0; GLM-5.2 tool list returned before review.
- Release review log: `.codex/agent-logs/droid-campaign-world-build-pre-release-20260709-234013.out.log`
- Droid release verdict: aligned, with no blocker or major findings.
- Independent Krypton peer verdict after all corrections: aligned, with no blocker or major findings.

Droid reported an MCP reload warning and continued with its allowed read tools. The review read the repository and verified migration numbering, shared types, source writers, displaced routes, SQLite tables, structured-output behavior, shell readiness ownership, and proposed names.

## Corrections applied during convergence

- A background build owns a campaign-scoped SQLite handle and survives active-campaign switching.
- Domain rows, build completion or failure, lock release, and the terminal event commit in one transaction.
- DNA save and build acquisition share a per-campaign mutex. The build row freezes the exact normalized source snapshot and digest.
- Mounted Campaign Kernel DNA apply and suggestion endpoints leave the active API during cutover.
- Reload discovers a running build through persisted state and resumes sequenced SSE with client deduplication.
- Review and accepted states read source data from the persisted world snapshot.
- Every model call records sanitized strategy and attempt evidence. Live acceptance rejects repair, retry, coercion, and text fallback.
- The product build envelope requires a nonempty distributed world and applies the same min/max limits in Zod and deterministic validation.
- Shared shapes, numeric ranges, hash inputs, state transitions, build eligibility, and clean-campaign rejection are explicit.
- New tests live beside their features. Touched Forge test IDs use domain names.
- The UI gate is a hard predecessor of Forge and Review implementation.
- The plan creates no standalone smoke suite. Focused regression and two live player-path runs own acceptance.

## Release-review minor findings

- Review component names now match their files: `ActorsSection` and `ConnectionsSection`.
- SQLite checks are explicit for new tables. Route cost stays enforced by Zod and the deterministic validator because `location_edges` is reused without table recreation.

## Next gate

Execution begins at Task 0 in `docs/goals/campaign-world-build/PLAN.md`: verify `feat/revamp`, record the dirty tree, refresh GitNexus while preserving embeddings, and run impact analysis before any production symbol edit.
