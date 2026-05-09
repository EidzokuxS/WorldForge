# Phase 78 External Review Synthesis

## Reviewers

- Claude CLI: `CONCERNS`
- Cursor Agent (`cursor-agent`): `CONCERNS`
- OpenCode Go / Mimo v2.5 Pro: `CONCERNS`
- Gemini CLI: initial explicit model lookup failed, default rerun hit capacity warnings but returned `PASS`

## Accepted Findings

1. File ownership for shared route/turn-processor tests must be sequential-only or split by concern so 78-04 and 78-05 do not trample each other.
2. `intent` and `method` must stop carrying product meaning everywhere downstream, including Oracle prompts, target/combat helpers, and `turn.begin` logs.
3. The GM decision schema must define required output fields per path, not only the path enum.
4. Direct, Continue, and clarification paths need an explicit zero-action/no-mutation artifact so they still pass through validation, execution, finalization, and narration boundaries without fake state changes.
5. Clarification needs an SSE/UI contract: render a GM clarification prompt without advancing or inventing action semantics.
6. Combat and Oracle remain valid for NPC/internal paths, so player-turn neutralization needs regression coverage that does not break NPC consumers.
7. Static gates need sharper checks for prompt leakage (`Intent:`, `Method:`), required command modes, and pre-GM `isHostileCombatAction`.
8. The final gate needs a real `/game` UAT smoke, not only unit tests, because the user is optimizing for playable turn-loop behavior.
9. `SceneFrame` may carry raw `playerAction` only for the GM seam; prompt serializers must not leak pre-GM `oracleContext`/`combatEnvelope` shape into later prompts.

## Rejected Or Deferred Findings

- No finding justifies adding a command taxonomy, backend classifier, or Marinara copy. These remain explicit anti-goals.
- Provider/model availability issues from Gemini are environment noise; no plan changes are needed beyond recording the rerun result.

## Plan Amendments Applied

- `78-01`: added minimum GM module stub contract and adversarial `intent` compatibility test.
- `78-02`: added prompt-serialization stripping and NPC consumer regression requirement.
- `78-03`: added per-path schema fields, state-delta prohibition, and no-mutation artifact contract.
- `78-04`: added intent/method/log cleanup, clarification SSE contract, no-mutation artifact construction, and expanded impact targets.
- `78-05`: added sequential ownership note, NPC regression coverage, no-mutation validator/executor tests, and pre-GM combat guard.
- `78-06`: added live `/game` UAT gate and tightened static negative gates.
- `78-VALIDATION`: updated static/final gates and acceptance scenarios to cover review findings.
