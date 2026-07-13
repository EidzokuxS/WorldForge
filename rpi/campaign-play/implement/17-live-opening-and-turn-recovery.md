# Task 17: live opening and turn recovery

Status: diagnostic live lane completed through opening plus two player actions; runtime blockers fixed and verified.

## Player-visible outcome

Campaign `cb805a6c-e78e-47be-b029-197ef8652a90` was played through the rendered `/campaign/[id]/play` surface with Wren Ashby, an ordinary maintenance worker. The operator read each current scene before choosing an action.

Completed actions:

1. Opening at `tidewater-junction` established Wren under the eastern boarding platform, a rising flood line, and a concrete maintenance problem without assembling the full cast around the player.
2. `Look around` completed as a durable discovery and advanced the clock by ten minutes.
3. `Go to bellfall-reach` committed movement to the selected destination and exposed Mira Saltwick pursuing her own bell-pattern research without addressing or centering the player.

This is a diagnostic lane, not pristine acceptance: model attempts failed before the recovered opening and turns, so it cannot promote the longplay gate.

## Root causes removed

- Opening locality now understands nested persistent sublocations instead of treating every actor in the same macro area as immediately present.
- The opening planner selects one primary goal per actor and no longer requires one initial plan to cover every active goal or repeat strategy text byte-for-byte as its first step.
- Hidden opening consequences use projectable aftermath, route, or report channels rather than impossible direct perception.
- Thinking-model stage limits allow measured GLM latency; the accepted narrator call took about 61 seconds.
- A deterministic campaign-scoped uncertainty key is derived when no environment override is supplied. An explicitly invalid override still fails closed.
- Judge output canonicalizes an omitted or empty clarification question to `null`.
- Provider reasoning tokens remain in usage and cost evidence but do not consume the visible-answer content budget.
- Suggested actions pass their frozen kind and targets into Judge. The model evaluates feasibility and outcome without reinterpreting the selected action.
- Observation-only turns must record a grounded discovery event instead of returning an empty effect plan.

No text fallback, schema repair, or compatibility branch was added.

## Manual prose verdict

The opening is concrete and readable: salt, timber, survey nails, the flood line, and a quarter-turn bolt create a usable ordinary-life entrance. The first `Look around` response is technically causal but weak: it repeats opening information, adds little new knowledge, and includes the system-sounding phrase “visible to anyone who looks down.” The movement response is materially better. Its impossible bells, shortening seven-bell cycle, waiting pilgrims, and Mira's independent ledger work create a coherent hook and a world that is not waiting for Wren.

The rendered desktop surface has a separate UX defect at 1280x720: the fixed action dock obscures the lower scene and narration area. Raw generated location and route handles such as `bellfall-reach` also remain visible. Both are follow-up acceptance work, not evidence that this diagnostic lane is pristine.

Prompt and prose review: main-agent humanizer/deslop review found the revised instructions direct and domain-specific. The runtime prompts avoid filler, promotional phrasing, and model-facing fallback language. The generated prose verdict above intentionally preserves the weak and strong examples rather than polishing the evidence.

## Verification

- Opening planner, narrator, application, Judge, Game Master, and turn-runtime focused tests passed during recovery.
- Backend typecheck passed after each contract change.
- Public state after the movement turn reported `phase=ready`, `worldVersion=13`, `runtimeRevision=251`, and current location `bellfall-reach`.
- The rendered UI exposed Mira Saltwick, the Seven-Bell Cycle pressure, four onward routes, and `Talk to Mira Saltwick` as the next current-scene action.
# Global model output floor

- All text-generation models created through `createModel` now enforce `maxOutputTokens >= 32_768` at the provider boundary, including ordinary, reasoning, and explicit GLM reasoning-bypass calls. Larger caller budgets remain unchanged.
- Shared defaults, settings normalization, API payload normalization, and the settings control use the same `32_768` minimum. This removes the former `32_000` ceiling and prevents local `512`–`4_096` role values from becoming provider requests.
- Focused proof covers provider middleware behavior, settings contracts, shared defaults, and the settings control. No standalone smoke test was added.
- Verification: full backend suite passed `3911` tests (`30` todo, one skipped file); backend and frontend typechecks passed. The repository-wide frontend lint remains blocked by the pre-existing Forge-page `react-hooks/set-state-in-effect` error outside this patch.
