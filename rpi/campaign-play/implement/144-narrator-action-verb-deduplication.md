# Task 144: Narrator action-verb deduplication

## Outcome

Campaign Play rejects a Narrator action detail that repeats the code-owned action verb. The rejected proposal uses the existing `narration_invalid` recovery path instead of publishing labels such as `Examine examine the shuttered window`.

## Contract

- `observe` details cannot begin with `examine`.
- `contact` details cannot begin with `talk`.
- `attempt` details cannot begin with `try`.
- Move and wait labels, prompt text, provider/model selection, mechanics, persistence, recovery limits, deadlines, and UI layout remain unchanged.
- The diagnostic retains only the action-selection index, intent index/kind, and fixed repeated verb. It does not retain proposal prose.

## Evidence

- r84 reached 19 completed player-action turns with accepted proper scenes before the first visible defect.
- The action-19 proper scene published `Examine examine the shuttered window` at Warden Toll Gate.
- Source inspection confirmed that the prompt already forbids repeating the action verb, while the semantic guard checked only detail nullability before the label builder prefixed `Examine `.
- Focused validation is recorded after implementation.

## Semantic review

The change adds no player-facing prose. The internal diagnostic is terse and factual, and the compiler now enforces the existing prompt rule without rewriting model output.
