# Task 136: deduplicate the rendered wait action

## Outcome

Campaign Play now exposes a choice handle at most once across the narrated suggestions and utility actions in the public projection. When Narrator already places the canonical wait intent among the scene suggestions, that narrated placement is preserved and the utility copy with the same handle is omitted. When Narrator does not select it, the utility wait remains available.

The comparison uses only the exact canonical `choiceHandle`. Labels are not compared or normalized, so distinct actions with similar copy remain distinct. Choice authority, packet identity, mechanics, admission, persistence, Narrator, provider/model selection, deadlines, recovery, layout, and visible copy are unchanged.

## Evidence and risk

Fresh r75 completed and bound actions 1-16 within the 120-second experience contract. After action 16, the proper scene exposed `Wait 10 minutes` in its suggested actions while the utility dock exposed the same label again. Read-only persistence inspection confirmed both rendered buttons represented the exact same handle, `choice_5535e6d8c19ff58b9c9cddb4`. The lane was frozen before another click and its task-owned runtime was stopped.

GitNexus reported CRITICAL upstream impact for the public projection symbols, but the index was five commits stale and mixed unrelated common-name symbols. Source inspection bounded the change to the pure public projection and its focused test. The implementation filters utility actions only after collecting exact narrated handles; it does not alter either source authority.

Focused validation:

- `campaign-play-projection.test.ts`: the narrated action remains, the exact-handle utility duplicate is removed, and a distinct utility handle remains.
- Backend typecheck and the public-state repository/contracts suites are required before landing.
- `git diff --check` and GitNexus change detection are required before landing.

No prompt, model instruction, narrative prose, or player-visible copy changed. Humanizer and deslop review are therefore not applicable.

## Product acceptance

A fresh r76 lane must reach a rendered scene where Narrator includes the canonical wait intent and prove that exactly one corresponding button is visible and usable. If no such natural scene occurs before another genuine defect, the lane freezes at that earlier boundary and the focused projection contract remains the direct Task 136 evidence.
