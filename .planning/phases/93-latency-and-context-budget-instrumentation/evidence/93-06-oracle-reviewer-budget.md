# 93-06 Oracle Reviewer Budget Evidence

Date: 2026-05-10

## Implemented

- `OracleFrame` bounds oracle prompt input to action, method, actor tags, target tags, environment tags, scene context, optional combat envelope, and source refs.
- OracleFrame excludes hidden proposal candidates, irrelevant lore, full memory dumps, and unbounded chat history from prompt text while counting them in `ContextBudgetTrace`.
- Existing oracle prompt formatting remains compatible with the previous prompt shape, including the durability clamp line.
- `ReviewerPacket` requires source refs for every visible reviewer evidence record.
- ReviewerPacket excludes hidden evidence and summarizes over-budget visible evidence into source-linked summary records.
- ReviewerPacket prompt formatting includes trace counts and keeps `didClipModelOutput: false`.

## Verification

```powershell
npm --prefix backend run test -- src/engine/__tests__/oracle-frame.test.ts src/engine/__tests__/reviewer-packet.test.ts src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/oracle.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- `oracle-frame.test.ts`: bounded oracle frame includes action/mechanics/source refs and excludes hidden proposals, irrelevant lore, full memories, and chat history.
- `reviewer-packet.test.ts`: reviewer overflow becomes source-linked summaries and source-free evidence fails.
- `context-budget-trace.test.ts`: source-free summaries, generic budget slicing, and model-output clipping remain rejected.
- `oracle.test.ts`: existing oracle call contract and prompt compatibility still pass.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Guard Scan

A diff guard scan found no new matches for:

- `truncateToFit`
- `sanitizeNarrative`
- `didClipModelOutput: true`
- `substring(...)`
- `AbortSignal.timeout`
- turn timeout patterns

Interpretation: 93-06 did not add arbitrary model-duration timeouts, model-output clipping, fake success, or prompt-substring shortcuts.

## GitNexus Preflight

- `callOracle`: LOW risk; direct affected caller is `createNpcAgentTools`, then `tickNpcAgentInternal`.
- `buildOraclePrompt`: LOW risk; direct affected caller is `callOracle`.

No HIGH/CRITICAL warnings were returned for the edited indexed oracle symbols.
