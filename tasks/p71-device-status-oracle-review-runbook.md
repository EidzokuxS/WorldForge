# P71 Device Status Observation Oracle Review Runbook

Status: blocked on valid Oracle/GPT-5.5 Pro browser delivery.

This runbook is not architecture approval. It exists so the next P71 review attempt is repeatable, auditable, and cannot be confused with an inline/no-context smoke.

## Review Target

Primitive candidate: `device_status_observation`.

Goal: decide whether P71 should implement a dedicated read-only device/phone status observation capability, extend P70 `local_observation`, or defer to another primitive.

Hard boundary under review:

- Only current-frame, Player-carried/equipped or current-scene visible device items.
- Only modeled/exposed device status facets from a deterministic public surface.
- No mutation, no message/call generation, no hidden/private contents, no network simulation, no "no signal/no message/no call" unless a separate accepted authority proves it.
- No old gameplay-cycle-v2 schemas, handlers, executors, or stores as implementation target.

## Prompt Artifact

Primary question artifact:

- `output/oracle/p71-clean-device-status-observation-question.md`

If `output/` is unavailable in a fresh checkout, reconstruct the prompt from the P71 section in `tasks/todo.md` before running Oracle.

## Required File Set

Use exactly this compact context bundle unless a later reviewer intentionally changes scope:

- `docs/gm-turn-architecture-review-2026-05-03.md`
- `tasks/lessons.md`
- `output/oracle/p70-clean-local-observation-answer.md`
- `backend/src/engine/gameplay-cycle-runtime/contracts.ts`
- `backend/src/engine/gameplay-cycle-runtime/frame.ts`
- `backend/src/engine/gameplay-cycle-runtime/gm-read.ts`
- `backend/src/engine/gameplay-cycle-runtime/judge-uncertainty.ts`
- `backend/src/engine/gameplay-cycle-runtime/action-checklist.ts`
- `backend/src/engine/gameplay-cycle-runtime/stage4-execution.ts`
- `backend/src/engine/gameplay-cycle-runtime/settlement.ts`
- `backend/src/engine/gameplay-cycle-runtime/narration.ts`

Known dry-run size: about 108714 prompt tokens with one bundled text attachment.

## Valid Oracle Command

Run only after the Oracle browser profile can reach the ChatGPT composer/model selector.

```powershell
$prompt = Get-Content output\oracle\p71-clean-device-status-observation-question.md -Raw
oracle --engine browser --model gpt-5.5-pro --slug wf-clean-p71-device-status `
  --browser-bundle-files --browser-bundle-format text `
  -p $prompt `
  --file docs/gm-turn-architecture-review-2026-05-03.md `
  --file tasks/lessons.md `
  --file output/oracle/p70-clean-local-observation-answer.md `
  --file backend/src/engine/gameplay-cycle-runtime/contracts.ts `
  --file backend/src/engine/gameplay-cycle-runtime/frame.ts `
  --file backend/src/engine/gameplay-cycle-runtime/gm-read.ts `
  --file backend/src/engine/gameplay-cycle-runtime/judge-uncertainty.ts `
  --file backend/src/engine/gameplay-cycle-runtime/action-checklist.ts `
  --file backend/src/engine/gameplay-cycle-runtime/stage4-execution.ts `
  --file backend/src/engine/gameplay-cycle-runtime/settlement.ts `
  --file backend/src/engine/gameplay-cycle-runtime/narration.ts
```

Do not use `--browser-attachments never` for this review. That is inline delivery, not an attachment.

## Valid Evidence Checklist

Before relying on the answer, verify all of these in `C:\Users\robra\.oracle\sessions\wf-clean-p71-device-status\meta.json`:

- `status` is `completed`.
- `browser.runtime.promptSubmitted` is `true`.
- `browserBundleFiles` is `true`.
- `browserBundleFormat` is `"text"`.
- `options.file` lists all intended files.
- `browser.modelSelection.resolvedLabel` or equivalent confirms GPT-5.5 Pro / Pro Extended, unless model-strategy was intentionally changed and documented.
- A transcript artifact exists under the session `artifacts\` directory.
- Usage exists and `outputTokens` is not one token.
- Transcript shows a substantive answer and not only the question.

If any item is missing, mark the attempt invalid in `tasks/todo.md` and do not implement P71 from it.

## Invalid Attempts Already Recorded

- `wf-clean-p71-device-status`: failed before prompt submission with ChatGPT auth/model-selector error; no transcript/usage.
- `wf-oracle-browser-smoke-current`: used `--browser-attachments never`, so no attachment delivery; Chrome disconnected.
- `wf-oracle-browser-smoke-bundle`: requested bundled attachment but failed before prompt submission with the same auth/model-selector error.

## Post-Review Work

Only after a valid review:

1. Record verdict, accepted scope, rejected/deferred scope, and verification plan in `tasks/todo.md`.
2. Run GitNexus impact before editing each indexed symbol.
3. Implement only the approved primitive boundary.
4. Add focused contract/runtime/settlement/narration tests.
5. Run typecheck and focused suite.
6. Run one live `/api/chat/action` proof on a fresh zero-turn clone with a Player-owned device.
7. Run GitNexus `detect_changes` before commit.
