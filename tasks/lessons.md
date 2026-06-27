# Lessons

## Operating Rules

- Keep active task files short. Long forensic history belongs in git history or current docs that still serve the mechanics rebuild.
- Treat fallback and backward-compatibility paths as defects unless the user explicitly authorizes a migration window.
- Fix root causes. Do not add guard piles, compatibility shims, or regex prose gates to hide broken ownership.
- Before editing code symbols, run GitNexus impact. Before committing, run GitNexus `detect_changes`.
- Separate cleanup commits from gameplay/mechanics commits.
- If cleanup hits locked files, stop, identify the owning process, stop only that process, then retry the narrow cleanup.
- When cleaning visible root noise, inspect inside visible workflow folders too; `tasks/` should stay as `todo.md` plus `lessons.md` unless a current task requires more.
- For repo presentation cleanup, sweep every top-level directory in one pass; do not hide obsolete tracked evidence inside another visible folder when the goal is a clean workspace.
- Use short, human-readable project filenames. Prefer `a5b-character.md` over long all-caps generated labels.
- When the user says to stop stopping, treat every known next architecture item as active work. Commit and push verified blocks instead of ending with a dirty tree and a progress report.
- After `npx gitnexus analyze`, inspect `AGENTS.md` before committing. The generator can refresh the GitNexus block and drop project-specific rules that must stay.
- For manual UI playtests, use the in-app browser when it is available; reserve external browser automation for headless regression artifacts or explicit requests.
- For Droid GLM reviews, verify the active custom model alias from Factory settings and a real `droid exec --model ... --list-tools` call before recording any blocker.
- In `feat/revamp`, legacy code is quarantine reference: mechanics player paths, APIs, and UI land on mechanics-owned routes with explicit adapter boundaries for legacy data shapes.
- Workstream labels are internal bookkeeping. Player-facing routes, UI text, current files, symbols, test titles, and helpers use domain names from the AGENTS naming convention.

## Mechanics Acceptance

- A green test suite or one-turn smoke does not prove playability.
- Every mechanics slice that changes player flow needs a manual playtest note: exact path, player action tried, observed result, and whether it is pristine acceptance or diagnostic.
- A planned playtest gate is a hard gate: execute the player path and record the evidence before moving to the next architecture item.
- Acceptance must follow the actual player path: create campaign, save, opening, action loop, state reload, and longplay.
- Longplay evidence must separate diagnostic lanes from pristine acceptance lanes.
- Final longplay lanes require adaptive inspected actions, not preselected/generated batches.
- A lane with failed, replayed, restored, or contradicted player-facing turns is diagnostic until fixed and replayed from a clean start.

## UI And Narration

- Send every UX/UI task or visible interface change to GLM-5.2 Coding Plan in Droid before implementation, then carry its verdict into the active task notes.
- Send prompts, model instructions, visible copy, and substantial prose through GLM review with `humanizer` and `deslop`, then carry the verdict or rewrite note into the active task notes.
- Treat `docs/UI Concept.html` as the mechanics UI style canon. GLM UI plans must reference it, and missing required graphics should be created or generated from that visual language before implementation.
- UI owns scene labels, route chips, status, inventory, visible actor chips, and structured action handles.
- Narration owns lived moment, pressure, sensory surface, visible behavior, and action handoff.
- Route option labels are UI/action handles. Prose should summarize visible ways onward unless the player asks about one explicit route.
- Opening is gameplay, not a metadata receipt. It needs concrete start placement, immediate pressure, visible actors only when clear, and first actionable hooks.
- Macro locations are lenses, not proof of immediate actor presence.

## Runtime Ownership

- Typed receipts own movement, custody, route truth, time, durable state, and bounded observations.
- Dialogue quotes cannot perform item custody. Narrated handoff/return must match item-state receipts and post-turn inventory.
- Route checks prove availability only. Movement requires movement authority and committed location/clock mutation.
- Player sensory follow-ups that ask about danger, source, proximity, mechanism, route truth, or current property route to bounded observation.
- Exact hard micro-results with no prose latitude should be typed renderables, not model paraphrase traps.

## Evidence Handling

- Preserve evidence that explains current mechanics or accepted behavior; remove raw duplicate logs and generated run debris.
- Do not count old contaminated transcripts as pristine acceptance after a later fix.
- Read user-supplied attachments from disk when they shape current work; summaries do not replace the artifact.
- Oracle/Pro asks need actual case files: code paths, failing output, target contract, current diff, and proof artifacts.
- If an Oracle/browser wrapper fails, distinguish tool failure from model advice.
- Treat empty or zero-height browser message containers as extraction limits. Verify chat completeness through attachment/export/scroll evidence before describing missing content.
