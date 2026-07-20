# Turbo r11 strict-output classification fix

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r11` materialized the frozen zero-turn Lowwater Ledger template on commit `072f73b6`. Eligibility was frozen before character creation. The UI generated Thira Vesk, accepted `drowned-gallery / Local / Already here / Looking for work`, and submitted Begin once.

r11 is not a Task 18 pristine promotion lane. Opening Planner attempts 1-3 each ended with `NoObjectGeneratedError: could not parse the response`. `safeGenerateObject` preserved `native_output_unavailable`, but the Campaign Play stage adapters treated that code as `transport_interrupted`. SQLite therefore recorded `transport_error/provider_unavailable` and the UI exposed Resume. Attempt 3 had `finishReason=stop` and 36,078 reported tokens, which proved this was a returned structured-output failure rather than a missing provider response. Two Resumes were allowed before the mismatch was identified.

The blocking defect was fixed at the shared strict-output classification boundary. `native_output_unavailable`, invalid JSON, schema failure, and missing or invalid structured tool calls now map to `model_contract_failed` in Opening Planner, Judge, Game Master and its reviewer, and Narrator. Genuine unclassified provider failures still map to `transport_interrupted`. The change adds no retry, fallback, provider switch, prompt rule, or database repair.

After the fix, r11 was used only as a recovery diagnostic. One UI Resume continued the same Opening turn without another Opening or player-action POST. Opening Planner attempt 4 and Narrator attempt 1 were accepted, and the rendered page reached `ready` at the winch-platform. No player action was submitted.

## Evidence

- Opening turn: `turn-opening:9fe215437e8a7ac35f0a4ea05894a33c92a07062`.
- Attempts 1-3: GLM-5-Turbo, `native_output_unavailable` in application logs; old durable classification `transport_error/provider_unavailable`; durations `473,984`, `270,653`, and `421,285 ms`.
- Attempt 3: `finishReason=stop`, 16,191 input tokens, 19,887 output tokens, 36,078 total tokens in provider telemetry.
- Diagnostic attempt 4: accepted, `schema_outcome=valid`, `576,183 ms`, 16,191 input tokens, 23,942 output tokens.
- Diagnostic Narrator attempt 1: accepted, `schema_outcome=valid`, `50,564 ms`, 5,935 input tokens, 3,616 output tokens.
- Browser evidence: one Opening POST, three explicit Resume POSTs, zero player-action POSTs. `screenshots/hard-stop-opening-misclassified.png` preserves the pre-fix rendered interruption; `screenshots/diagnostic-recovered-opening.png` preserves the post-fix recovered page.
- Final diagnostic state: `ready`, `worldVersion=13`, `runtimeRevision=207`, 15 commands and 15 matching receipts.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.
- Focused validation: 174/174 tests passed across `generate-object-safe`, Opening Planner, Judge, Game Master, and Narrator; backend typecheck passed.

## Disposition

r11 is a failed acceptance avenue because the old classifier allowed two Resumes that a pristine lane should have refused. The successful diagnostic recovery proves the patched runtime still preserves the same frozen turn and reaches the real UI, but it does not restore pristine status. Lane A restarts from the unchanged zero-turn template under a new run id.

Humanizer review kept the note chronological and evidence-led. Deslop review removed repeated framing and retained the exact distinction between model-contract and transport failures.
