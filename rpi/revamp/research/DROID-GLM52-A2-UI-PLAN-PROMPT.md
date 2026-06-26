# Task

Review the WorldForge revamp A2 UI/UX plan. Return a concise implementation verdict and any required UI corrections.

# Architecture Direction

The revamp path starts with a clean Campaign Kernel shell:

```text
Create Campaign
-> campaign shell
-> draft Campaign Kernel visible
-> old full worldgen stays outside this route
```

The old system is reference code. The active UX should prove the boundary and avoid launching the old worldgen/review flow.

# Files To Inspect

- `rpi/revamp/REVAMP_ARCHITECTURE.md`
- `tasks/todo.md`
- `frontend/components/title/use-new-campaign-wizard.ts`
- `frontend/components/campaign-new/dna-workspace.tsx`
- `frontend/app/(non-game)/campaign/[id]/revamp/page.tsx`
- `shared/src/types.ts`

# Current Intended UX

- The DNA screen action says `Create Campaign`.
- The wizard calls `POST /api/campaigns`, loads the created campaign, clears the draft session, and routes to `/campaign/:id/revamp`.
- The revamp page shows campaign name, premise, kernel phase, turn index, empty graph counts, and the boundary text that full worldgen is parked outside the route.

# Non-goals

- No old worldgen execution from this path.
- No visual editor yet.
- No StateWriter yet.
- No broad redesign of the non-game shell.

# Required Output

Return:

1. Verdict: ship / adjust.
2. Required UI changes for A2, if any.
3. Proof criteria for the focused frontend test.
4. Any wording that risks confusing the player about what is actually playable now.

Do not edit files. Do not run implementation commands. This is a GLM-5.2 Coding Plan review only.
