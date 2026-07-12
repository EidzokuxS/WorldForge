# Task 12: Droid GLM-5.2 review

Date: 2026-07-10  
Reviewed plan: `rpi/campaign-play/implement/12-ui-plan.md`  
Verdict: `ALIGNED` with five P2 documentation corrections applied.

## Review run

The review used Factory Droid with the configured `custom:GLM-5.2-(Z.AI-Coding)-0` model in read-only mode. A live `--list-tools` probe confirmed the model and read-only file tools before the review. The review prompt is stored at `.codex/droid-prompts/campaign-play-12-ui-review.md`.

The prompt required GLM to read the complete UI canon, Campaign Play plan, public contract, protected schema semantics, Task 2A evidence, and Task 12 UI contract. It asked for blockers covering opening, settled play, active turns, narrator work, recovery, journal, field ownership, narrow layout, motion, accessibility, visible copy, and screenshot evidence.

Droid first completed successfully and returned exactly:

> Plan is up-to-date.

After the contract verifier corrected consequence bindings and progress-state wording, the same review packet was rerun against the final plan. The low-autonomy invocation stopped at Droid's permission boundary before producing a design verdict. The read-only review then ran with medium autonomy and returned `ALIGNED`, with zero P0 and zero P1 blockers.

The final review requested five P2 documentation corrections. They are applied in the reviewed plan:

- admission confirmation now has an explicit public-response trigger and local-presentation owner;
- the UI Concept transcript Log is explicitly repurposed as the observation-sourced Journal;
- the separate stage quote overlay is explicitly removed;
- player-action interruption, character-required, and terminal failed-turn screenshots are evidence targets;
- consequence labels and errors share an accurately named copy section.

GLM confirmed that the opening tuple is always completable, every contract state is implementable, visibility remains authoritative, suggested and freeform actions share one locked admission path, and the responsive, motion, accessibility, and copy contracts are implementation-ready.

## Contract amendment before review

Task 12 found that chosen opening conditions lacked public eligible handles. The public contract now exposes bounded options for:

- starting location;
- starting role;
- arrival mode;
- immediate situation.

Chosen mode requires all four opaque handles and validates them against one location option. Delegate mode gives the complete starting decision to the opening planner. Empty option groups, null detail handles, duplicate handles, foreign handles, and capacity overflow fail validation.

Focused verification passed after the amendment:

| Command | Result |
|---|---|
| `npm --prefix shared run build` | passed |
| `npm --prefix backend test -- src/campaign-play/contracts.test.ts` | 1 file, 29 tests passed |
| `npm --prefix backend run typecheck` | passed |

Terra mechanical review and Sol architecture review returned `ALIGNED` on the amendment.

## Humanizer and deslop audit

The GLM prompt explicitly applied humanizer and deslop criteria to every player-visible string. The final review found no rewrite blocker and scored the copy for directness, rhythm, reader trust, authenticity, and density.

A local fixed-string audit found no em dash, en dash, chatbot opener, inflated significance language, promotional filler, false contrast, or formulaic conclusion in `12-ui-plan.md`. The copy uses short product statements and names the player's next action. Internal phases, versions, revisions, turn IDs, providers, models, prompts, and protected payloads stay in client control flow and out of visible text.

Scores for the final plan:

| Dimension | Score |
|---|---:|
| Directness | 8/10 |
| Rhythm | 8/10 |
| Reader trust | 9/10 |
| Authenticity | 8/10 |
| Density | 8/10 |

## Scope

Task 12 changed the design documents and the Task 2A public opening contract. It changed no production frontend component, route, style, or asset. Production implementation begins in Tasks 13, 14A, and 14B after storage and runtime dependencies exist.

Standalone UI smoke additions: 0.
