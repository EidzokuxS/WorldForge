# Wave 2 Test Output Summary

## Focused Contract Tests

Command:

```powershell
npm --prefix backend run test -- src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/narrator-redaction.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts
```

Result:

- 4 test files passed.
- 12 tests passed.

## Typecheck

Command:

```powershell
npm --prefix backend run typecheck
```

Result:

- Passed.

## Broader Narrator/Prompt Regression

Command:

```powershell
npm --prefix backend run test -- src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.observability.test.ts
```

Result:

- 4 test files passed.
- 55 tests passed.

## Diff Hygiene

Command:

```powershell
git diff --check
```

Result:

- No whitespace errors.
- PowerShell/Git emitted LF-to-CRLF warnings only.
