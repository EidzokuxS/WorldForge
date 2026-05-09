# Phase 88 External Review Ledger

## Review Runs

| Reviewer | Artifact | Verdict | Status |
| --- | --- | --- | --- |
| Cursor Agent | `external-reviews/review-cursor-agent.md` | FLAG | Actionable concerns applied |
| Codex CLI | `external-reviews/review-codex-2.md` | FLAG | Actionable concerns applied |
| OpenCode | `external-reviews/review-opencode-2.md` | FLAG | Actionable concerns applied |
| Gemini 2.5 Flash | `external-reviews/review-gemini-focused-authfix.md` | FLAG | Follow-up resolved missing-file concern |
| Gemini 2.5 Flash follow-up | `external-reviews/review-gemini-88-07-followup.md` | PASS | Memory/knowledge plan accepted |
| Gemini 2.5 Pro | `external-reviews/review-gemini-authfix.err.log` | unavailable | Server capacity exhausted after retries |
| Claude CLI | `external-reviews/review-claude.md` | unavailable | Local quota limit during review window |
| Qwen / CodeRabbit | n/a | unavailable | CLI not installed locally |

## Applied Review Themes

- Early correctness moved forward:
  - `88-03-PLAN.md` now defines minimal serialized LLM group, context budget, proposal, and SSE stage trace contracts.
  - `88-04-PLAN.md` now defines the first write-scope reservation/conflict contract for actor jobs.
  - `88-10-PLAN.md` now extends those contracts for observability and throughput rather than inventing correctness at the end.
- Old detached writers are migrated through proposal-only compatibility adapters:
  - `simulateOffscreenNpcs`
  - `checkAndTriggerReflections`
  - `tickFactions`
- Actor combat is no longer narrator-only:
  - `88-05-PLAN.md` requires CombatEnvelope/Oracle or a compatible deterministic resolver.
  - Both paths must emit authoritative ToolResult records.
- Memory and knowledge are authority-backed:
  - `88-07-PLAN.md` adds SQLite-backed knowledge persistence.
  - Retrieval is structured + lexical/BM25 + optional vector recall.
  - Every returned item must carry source ids and actor-known route.
- Failure and surfacing semantics were tightened:
  - `88-06-PLAN.md` now requires failure events, replan triggers, and notification routes.
  - `88-09-PLAN.md` now tests that advisory forecasts cannot become committed world truth without an explicit actor/faction/thread source event.
- Testing soft quality is no longer code-heuristic theater:
  - `88-11-PLAN.md` requires calibrated LLM/human rubric samples for prose, causality, agency, hidden-truth leakage, tourist pressure, and combat readability.
  - Lexical scans are limited to obvious banned-template detection.
- Execution is fail-fast by wave:
  - `88-EXECUTION-WAVES.md` now blocks later wave execution until the previous wave evidence is green.

## Accepted Residual Risks

- External review capacity remains partly variable. Gemini Pro and Claude were unavailable, but Cursor Agent, Codex, OpenCode, Gemini Flash, and Gemini follow-up produced enough independent signal for plan convergence.
- Full proof remains implementation-time evidence. The plan is now structured to stop at each wave gate rather than rely on final closeout to discover architectural failures.

## Readiness

The external review loop no longer has unaddressed HIGH/BLOCK plan concerns. Phase 88 still requires a final GSD plan-checker pass after these applied fixes.
