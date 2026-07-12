# Task 7: Judge, uncertainty, and Game Master planner

Date: 2026-07-11  
Status: complete; independent mechanical and semantic reviews passed.

## Outcome

Campaign Play now has one strict Judge boundary and one strict Game Master boundary.

The Judge receives a bounded player-visible frame and the original freeform or suggested input. Code preserves the original text, source, and choice handle, while the model proposes normalized intent semantics, one of four dispositions, cited visible handles, result and elapsed bounds, an optional d20 specification, a reason, and an optional clarification question. Targets and citations must belong to the frozen visible-handle set. The prompt-only projection excludes campaign and turn IDs.

Uncertainty belongs to code. `resolveCampaignPlayUncertainty` derives one deterministic d20 roll and SHA-256 seed evidence from server-owned seed material plus the canonical ruling. The Game Master requires a matching seed/modifier authority envelope for uncertain rulings, recomputes the complete resolution before its model call, and repeats that authentication during compilation. Forged deterministic results and altered roll evidence therefore carry no planning authority.

The Game Master model sees visible facts, the admitted intent, the Judge bounds, and the authenticated resolution. It proposes only the seven ordinary effect kinds. Code maps opaque handles through server-only bindings, derives deterministic batch and command IDs, assigns source, causal parents, exact read/write scopes and expected versions, then requires a successful Rulebook preflight. Bootstrap command kinds are absent from the proposal schema.

## Model boundary and budgets

Both stages use one selected provider/model and one strict structured-output attempt:

- repair disabled;
- text fallback disabled;
- provider switching absent;
- retry count fixed to one attempt;
- requested and actual strategy, model, finish reason, tokens, duration, and estimated cost retained as evidence;
- transport interruption, schema/semantic contract failure, and duration/token/cost overflow use typed failures.

Model traces remain attached when post-schema semantic validation fails, so persistence callers can record the actual failed attempt. Explicit resume belongs to the fenced turn worker in Task 10 and will invoke a fresh complete Judge attempt.

## Acceptance evidence

- Open dialogue compiles to deterministic time and world-event commands with contiguous causality and accepted Rulebook preflight.
- Deterministic, uncertain, impossible, and clarification rulings have direct fixtures.
- Impossible and clarification outcomes stop before a Game Master model call.
- Suggested choices require a visible choice handle and use the same Judge path as freeform input.
- Prompt injection remains inert player text.
- Hidden targets, hidden citations, hidden GM handles, unsupported effects, elapsed-bound violations, and out-of-bound results fail closed.
- Uncertain rulings reject deterministic substitutions and tampered rolled evidence before Game Master generation.
- Every supported ordinary effect kind reaches Rulebook preflight through code-owned metadata.
- Judge prompts exclude canonical campaign and turn IDs; Game Master prompts exclude canonical entity IDs and server bindings.

## Verification

```text
npm --prefix backend test -- src/campaign-play/judge.test.ts src/campaign-play/game-master.test.ts src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-boundary.test.ts
4 files, 67 tests passed

npm --prefix backend run typecheck
passed

git diff --check -- <Task 7 files>
passed
```

Standalone smoke additions: `0`.

Independent Terra mechanical verification returned `PASS` for 67/67 tests and typecheck. Fresh Sol semantic review first found a forged-resolution P1 and unnecessary prompt-ID P2. The implementation added deterministic resolution authentication at both GM boundaries and a prompt-only Judge projection. The same fresh verifier then returned `PASS`; its focused recheck passed 28/28 tests with no regression.

GitNexus impact was attempted for `createCampaignPlayJudge`, `resolveCampaignPlayUncertainty`, and `createCampaignPlayGameMaster`. The new Campaign Play symbols remain outside the stale index and returned `Target not found`; focused integration plus independent semantic review supply the completion proof.

## Prompt and prose review

The retained GLM packet is `.codex/droid-prompts/campaign-play-adjudication.md`. One custom GLM-5.2 attempt reported an MCP reload failure and produced no verdict within its timebox, so it was stopped under the owner's advisory-tooling rule. This failure carries no completion authority.

The local `humanizer` and `deslop` audit found both model prompts direct, bounded, specific, and free of promotional filler, rhetorical setup, or chatbot framing. Task 7 changes no player-visible copy or production UI.
