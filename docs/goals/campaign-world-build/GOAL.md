# Goal: Campaign World Build

Use Krypton Execution to execute `docs/goals/campaign-world-build/PLAN.md`.

Core rules:

- Treat `PLAN.md` as the source plan.
- Preserve the Campaign World outcome, SQLite ownership, strict contracts, cutover, evidence lanes, and kill criteria.
- Hold a dedicated campaign-scoped SQLite handle for every background build; active-campaign switching must not affect it.
- Commit domain rows, build completion, lock release, and the terminal event in one transaction.
- Serialize DNA save and build acquisition with the Campaign World source mutex, then build from the frozen SQLite source snapshot.
- Remove the mounted Campaign Kernel DNA apply/suggest routes during cutover so Campaign World is the only post-creation DNA owner.
- Use the domain naming convention from `AGENTS.md` in every current file, route, symbol, test title, and visible string.
- Keep collective organizations inside the actor model.
- Use `safeGenerateObject` with strict schema, repair disabled, text fallback disabled, and one attempt for each Campaign World model stage.
- Run GitNexus impact before each symbol edit and `detect_changes` before commit.
- Complete the Droid GLM UI gate before production UI work.
- Capture both live player-path acceptance bundles.
- Export sanitized model-contract evidence for every live stage; one attempt and primary structured output are hard gates.
- Add no standalone smoke suite. Use the focused regressions and live acceptance defined in the plan.
- Say `implemented but unproven` when target-perspective evidence is incomplete.
