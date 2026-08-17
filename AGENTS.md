# WorldForge Project Rules

- Work on the isolated `feat/revamp` branch; keep legacy systems as reference material and put mechanics player routes, APIs, and UI behind mechanics-owned paths.
- New mechanics code uses explicit adapter boundaries for legacy data shapes; direct imports from old worldgen, chat, or player flows require a task note naming the reason and proof.
- Build UX/UI from `docs/UI Concept.html` as the style canon and verify each slice against that rendered reference before landing it.
- For missing required graphics, create or generate assets that match `docs/UI Concept.html`; store them with the feature surface and record the source/proof in task notes.
- Route prompts, model instructions, visible copy, and substantial prose through main-agent semantic review with the `humanizer` and `deslop` skills before landing them; record the verdict or rewrite note in task notes.
- Keep prompt, copy, and visual review notes with the active task so verification survives context compaction.

## Campaign Play 1.0 Release Authority

- `rpi/campaign-play/REQUEST.md` owns the Campaign Play product promise, recovery contract, validation ladder, and 1.0 release gate. `tasks/todo.md` owns the current ordered release work. Historical RPI notes and preserved playtest evidence are evidence only; they cannot add gates or redirect current work.
- The target is a finished WorldForge 1.0. Do not replace it with a demo, planning package, endless reliability program, or a weaker local outcome contract.
- A task-local plan may strengthen implementation evidence for its own change, but it may not change the release gate, retry semantics, supported-provider policy, or player promise without explicit user approval.
- Do not start a 60-action acceptance campaign until the current release board records passing provider qualification, focused owner checks, adjacent-stage integration, retry/state-preservation checks, and short rendered journeys with no known blocker.
- After a coherent repair passes its proportional focused checks and affected product journey, commit that repair atomically before starting the next repair. Endurance acceptance is not a prerequisite for committing an already validated repair.
- Automatic retries are recovery, not fallback, when they preserve the exact admitted input, frozen context, provider/model selection, idempotency identity, accepted prior-stage artifacts, and durable state. Synthetic prose, continuity scenes, hidden model/provider substitution, duplicate submission, or invented mechanical truth are fallback and are forbidden.

## Naming Convention

- Name public surfaces with product/domain words: `campaign`, `forge`, `play`, `world`, `character`, `kernel`, `debug`, `state`, `graph`, `cast`.
- Keep workstream labels out of player-facing URLs, UI copy, visible errors, screenshots, test titles that read like user behavior, and design artifacts.
- Use lowercase kebab-case for route folders and URL segments: `/campaign/[id]/forge`, `campaign-kernel.md`, `ui-concept.html`.
- Use PascalCase for React components and classes: `CampaignForgePage`, `PlayerCastPanel`.
- Use camelCase for functions, variables, hooks, and test ids; hooks start with `use`, API helpers start with a verb: `loadCampaignKernel`, `savePlayerCast`.
- Use `*.test.ts` or `*.test.tsx` beside the feature under test. Test names describe user or contract behavior with domain words.
- Use internal workstream names only inside historical notes, branch names, RPI folders, and untouched seams. When a touched file or symbol carries a workstream label into current code, rename it to the domain name in the same patch.
- New files, symbols, routes, and copy fail review when they contain `revamp`, `v2`, `new`, `legacy`, `tmp`, `old`, `experimental`, or similar status labels instead of domain language.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **WorldForge** (15582 symbols, 44226 relationships, 877 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/WorldForge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/WorldForge/clusters` | All functional areas |
| `gitnexus://repo/WorldForge/processes` | All execution flows |
| `gitnexus://repo/WorldForge/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
