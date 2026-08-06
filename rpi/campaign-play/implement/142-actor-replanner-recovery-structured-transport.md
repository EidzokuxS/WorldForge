# Task 142: Actor Replanner recovery structured transport

## Outcome

The existing Actor Replanner attempt one remains on automatic native structured output. Only its one already-authorized recovery attempt now requests strict tool-mode structured output. The recovery keeps the same provider, model, schema, prompt or safe rejection feedback, reasoning mode, absolute 90-second deadline, attempt identity, persistence fences, and no-attempt-three rule.

## Evidence and scope

Fresh r82 reached 24 completed player actions with proper scenes before one due actor job failed. Both proposal calls returned from `zai-coding-plan/glm-5-turbo`, but native structured output raised `NoObjectGeneratedError: could not parse the response`; attempts one and two were durably `model_contract_invalid`, and the job became `replan_invalid`. This was a structured transport parse failure, not a compiler, grounding-review, provider-outage, or deadline failure.

The repair changes only the proposal transport mode selected inside `createCampaignPlayActorReplanner`: attempt one is `auto`; attempt two is `tool`. The strict schema, explicit post-generation parse, compiler, grounding reviewer, player mechanics, narration, UI, and visible copy are unchanged. Focused tests assert both the normal first-attempt path and schema-invalid recovery call sequence.

GitNexus was refreshed before editing. Its initial stale result was CRITICAL and visibly polluted by unrelated import edges; after refresh the exact symbol was unavailable to impact lookup, so risk remained UNKNOWN. Final unstaged change detection still over-attributed the nested `replan` method to 882 unrelated flows and reported CRITICAL. Source inspection and the exact diff bound the delta to the nested proposal call and its two call sites.

The focused Actor Replanner suite passed 14/14, backend typecheck and build passed, and `git diff --check` passed with only the checkout's existing LF/CRLF warnings. A fresh pristine lane remains required for product acceptance.

Humanizer/deslop review is not applicable: no prompt, model instruction, visible copy, or narrative prose changed.
