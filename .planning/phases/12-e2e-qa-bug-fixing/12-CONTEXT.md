# Phase 12: E2E QA & Bug Fixing - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Full browser-based verification of all WorldForge features from design docs. Uses Playwright MCP to navigate, interact, screenshot, and visually analyze every page and flow. Found bugs are fixed immediately, then re-tested. Iterates until 100% pass rate.

This is NOT a code-writing phase — it's a test→fix→retest loop. Each plan covers a test area (settings, world gen, gameplay, etc.). Execution means: open browser → test → find bugs → fix code → re-test → next area.

Test data: characters and worldbooks from `X:\Models\Chars`.
LLM provider: GLM at `https://api.z.ai/api/coding/paas/v4` (already in memory).

</domain>

<decisions>
## Implementation Decisions

### Testing Approach — MANDATORY RULES
- **MUST use Playwright MCP** (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, etc.) for ALL testing. NEVER use curl, fetch, or direct API calls.
- **MUST take at least 1 screenshot per page/state** using `browser_take_screenshot`. Save to `qa-screenshots/` directory.
- **MUST visually analyze every screenshot** using Read tool — you see it as an image, evaluate it as a human would.
- **MUST score every page** using webapp-qa rubric (layout 1-5, readability 1-5, hierarchy 1-5, interactivity 1-5, dark theme 1-5, polish 1-5). Score < 3 on ANY aspect = bug to fix.
- **MUST check 4 states per page**: empty, loading, error, happy path.
- **MUST click every interactive element**: buttons, links, tabs, dropdowns, form fields.
- Each test area is a plan; each plan iterates: test → fix → retest until clean.
- Bugs must include screenshot reference + severity + exact description.

### Test Areas (Plans)
1. **Infrastructure & Settings** — servers start, health check, settings page works, providers configurable, roles assignable
2. **Campaign Creation & World Gen** — new campaign, World DNA, scaffold generation pipeline, world review page
3. **Character Creation** — parse/generate/import V2 card, save to DB, redirect to game
4. **Gameplay Loop** — Oracle evaluation, narrative streaming, SSE events, quick actions, tool calling (add_tag, spawn_npc, etc.)
5. **Game Mechanics** — HP/damage, inventory, location navigation, entity tracking in sidebars
6. **Story Control** — retry, undo, inline edit
7. **WorldBook Import** — upload JSON, preview, classify, import into DB
8. **Checkpoints** — save/load/delete, auto-checkpoint

### Bug Fixing Protocol
- When a bug is found: screenshot it, describe it, fix the code, re-test
- Fix must not break other tests (run typecheck + existing unit tests after each fix)
- Each fix committed individually with descriptive message
- After all fixes in an area, full re-test of that area

### What Requires Running Backend
- Settings save/load (API calls)
- Campaign creation (DB + file ops)
- World generation (LLM calls via GLM)
- Gameplay (Oracle + Storyteller LLM calls)
- Everything except pure frontend rendering

### What Can Be Tested Without LLM
- Page rendering, layout, dark theme
- Navigation between pages
- Form validation
- Settings UI interactions
- Empty/loading/error states

### Claude's Discretion
- Test execution order within each area
- Which bugs to fix inline vs defer
- How many re-test iterations per area
- Whether to test responsive (mobile viewport) or desktop only

</decisions>

<code_context>
## Existing Code Insights

### Test Infrastructure
- Playwright MCP connected (browser_navigate, browser_snapshot, browser_take_screenshot, browser_click, etc.)
- webapp-qa skill with rubric (references/rubric.md)
- Backend: `npm --prefix backend run dev` on :3001
- Frontend: `npm --prefix frontend run dev` on :3000
- Unit tests: `npm --prefix backend test -- --run` (723 pass, 0 fail — fixed in 12-01)

### Known Issues Before Testing
- ~~2 test files failing~~ — fixed in Plan 12-01
- Some ROADMAP.md checkboxes stale (phases marked incomplete but code exists)

### Test Data
- Characters and worldbooks at `X:\Models\Chars`
- GLM API: `https://api.z.ai/api/coding/paas/v4` with key in memory
- OpenRouter also configured in settings

</code_context>

<specifics>
## Specific Ideas

- Start by fixing the 2 failing test files before browser testing
- Configure GLM provider through Settings UI as first browser test
- Use a known IP (e.g., "Naruto") for campaign creation to test research agent
- Test with a V2 character card from X:\Models\Chars for import verification

</specifics>

<deferred>
## Deferred Ideas

- Mobile/responsive testing (focus on desktop first)
- Performance/load testing
- Multi-campaign switching

</deferred>
