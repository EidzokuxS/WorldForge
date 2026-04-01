# Phase 32: Desktop-First Non-Game UI Overhaul - Research

**Researched:** 2026-04-01
**Domain:** Next.js App Router desktop workspace redesign for non-game authoring flows
**Confidence:** HIGH

<user_constraints>
## User Constraints

Derived from the user prompt, `ROADMAP.md`, `docs/ui_concept_hybrid.html`, and the Phase 28 workspace spec because no `32-CONTEXT.md` exists yet.

### Locked Decisions
- Build on the current post-29/30/31 worktree baseline, not the last clean pre-29 UI.
- Redesign the non-game product surfaces for FHD and 1440p desktop use.
- Use Tailwind, shadcn, and compatible libraries only.
- Do not introduce new custom CSS files.
- Keep `docs/ui_concept_hybrid.html` as the visual-language anchor.
- Character creation and world review must expose the new ontology, start-condition, loadout, and persona-template systems cleanly.
- Preserve the in-game surface as-is unless a small compatibility adjustment is required by the non-game shell work.
- Final research output must make direct Phase 32 planning possible.

### Claude's Discretion
- Exact shared-shell component structure is open as long as non-game routes share one desktop interaction grammar.
- Exact route-group and layout strategy is open as long as canonical URLs stay stable and legacy route drift is removed.
- Exact use of resizable panes is open as long as FHD/1440p workflows become denser and clearer, not merely wider.
- Exact library-management route shape is open as long as reusable worldbook management stops living only inside the title dialog.

### Deferred Ideas (OUT OF SCOPE)
- Do not drift into Phase 33 browser E2E polish itself.
- Do not redesign gameplay UI.
- Do not introduce mobile-first acceptance criteria.
- Do not bundle framework upgrades or unrelated data-model changes into this UI phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

Derived from `ROADMAP.md`, the user scope, and the Phase 28 handoff because `REQUIREMENTS.md` does not currently enumerate `P32-01` through `P32-06`.

| ID | Description | Research Support |
|----|-------------|------------------|
| P32-01 | Introduce one shared desktop-first non-game shell for launcher, creation, review, character, settings, and library flows. | Route-group layout recommendation, shell component structure, shadcn sidebar guidance, fixed-vs-resizable rules. |
| P32-02 | Replace modal campaign creation with route-owned `/campaign/new` and `/campaign/new/dna` workspaces. | Nested-layout state pattern, library/source continuity guidance, current wizard seam inventory, route migration order. |
| P32-03 | Redesign world review into a dense desktop editor with list/detail behavior, inspector context, and sticky actions. | Review-page baseline audit, resizable-panel recommendation, validation-summary pattern, lore/NPC editor integration guidance. |
| P32-04 | Redesign character creation into a desktop authoring workspace centered on draft ontology, persona templates, structured starts, and loadout preview. | Character page baseline audit, split-workspace pattern, inspector/live-summary guidance, start/loadout/template visibility rules. |
| P32-05 | Bring settings and reusable library management into the same shell language without losing current provider/research/library behavior. | Settings baseline audit, global library route recommendation, reuse of existing worldbook-library APIs, status/health inspector pattern. |
| P32-06 | Remove route drift and preserve compatibility without touching gameplay or Phase 33 verification scope. | Legacy-route redirect strategy, runtime state inventory, anti-pattern list, validation map, game-surface isolation guidance. |
</phase_requirements>

## Summary

Phase 32 is a shell-and-workflow refactor, not a data-model phase. The current worktree already contains the high-value domain seams introduced in Phases 29 and 30: `CharacterDraft` / `CharacterRecord` in `shared/src/types.ts`, persona-template data in `world.personaTemplates`, structured `startConditions`, canonical loadout previews, known-IP `ipContext` / `premiseDivergence`, and reusable worldbook-library selection in `useNewCampaignWizard`. The problem is presentation and route ownership, not missing product state.

The current non-game UI still matches the exact problems called out in the Phase 28 handoff. `/` launches campaign creation through `NewCampaignDialog`; `/campaign/[id]/review` and `/campaign/[id]/character` are canonical but still render stacked cards and tabs; legacy `/world-review` and `/character-creation` pages still exist as full implementations; `/settings` is isolated from the rest of the product shell; and the reusable worldbook library is only visible inside the creation dialog. That makes the planning direction straightforward: introduce a shared non-game shell first, migrate creation into routed pages second, and then refactor review/character/settings/library to adopt the same editing grammar.

The biggest technical risk is route-state continuity, not styling. The current wizard stores `worldbookSelection`, `ipContext`, `premiseDivergence`, and DNA edits in local component state. If `/campaign/new` and `/campaign/new/dna` are split into independent pages without a shared nested layout, Phase 32 will immediately regress creation flow continuity. Next.js layouts already solve that problem because they preserve state across child-route navigation. Use that, not query-string state or a new global store.

**Primary recommendation:** Plan Phase 32 in four waves: shared non-game shell and route group, routed campaign creation with nested-layout state preservation, desktop review/character workspaces on top of existing draft contracts, and shell adoption for settings/library plus legacy-route redirects.

## Project Constraints (from CLAUDE.md)

- Use the existing stack: Hono backend, Next.js frontend, TypeScript strict mode, Drizzle ORM, better-sqlite3, Zod, and the Vercel AI SDK.
- The LLM remains narrator/generator only; engine state changes stay deterministic and validated in backend code.
- Use Drizzle query builder, not raw SQL.
- Use Zod schemas for all API payloads and AI tool definitions.
- Prefer `ai` SDK helpers over ad hoc provider fetch logic.
- Route handlers should keep the repo pattern: outer `try/catch`, `parseBody()` validation, `getErrorStatus(error)` for HTTP status.
- Shared contracts must live in `@worldforge/shared`, not duplicated backend/frontend types.
- SQLite remains the source of truth; LanceDB is additive and out of scope for this phase.
- User-facing responses should stay in Russian.

## Standard Stack

Phase 32 should stay on the current workspace stack and add only missing shadcn-compatible primitives. The registry has newer releases for several packages, but bundling a framework upgrade into this UI overhaul would add risk without helping the shell refactor itself.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | workspace `16.1.6`; registry latest `16.2.2` (2026-04-01) | App Router pages, layouts, route groups | The redesign depends on shared layouts and nested routes, both already central to the repo. |
| `react` / `react-dom` | workspace `19.2.3`; registry latest `19.2.4` (2026-01-26) | Client-side workspace state and editors | Current route pages already use React 19 APIs such as `use(props.params)`. |
| `tailwindcss` | workspace `^4`; registry latest `4.2.2` (2026-03-18) | Utility styling, breakpoints, theme tokens | Existing `frontend/app/globals.css` already uses Tailwind 4 `@theme inline` tokens. |
| `shadcn` | workspace CLI `3.8.5`; registry latest `4.1.2` (2026-03-31) | Generate/update shell primitives inside repo conventions | The project already has `frontend/components.json` and modern shadcn wrappers. |
| `radix-ui` wrappers in `frontend/components/ui` | workspace `1.4.3` aggregate plus generated wrappers | Accessible tabs, dialogs, scroll areas, buttons, inputs | Current UI is already built around these wrappers, so Phase 32 should extend them rather than replace them. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-resizable-panels` | registry latest `4.8.0` (2026-03-28); not currently installed | User-resizable desktop panes | Use for world review and character creation once the fixed shell is stable; do not force it onto every page. |
| `cmdk` via shadcn `Command` | registry latest `1.1.1` (2025-03-14); not currently installed | Searchable command/list picking for library flows | Use only if `/library` or campaign-source selection needs fast search/filter inside dense desktop layouts. |
| `sonner` | workspace `2.0.7`; registry latest `2.0.7` (2025-08-02) | Non-blocking toasts | Keep existing save/test/generate feedback behavior in the new shell. |
| `lucide-react` | workspace `0.576.0`; registry latest `1.7.0` (2026-03-25) | Navigation, status, and action icons | Reuse existing iconography; no icon-system rewrite is needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js route groups + layouts for shared shell/state | A new global UI store or query-string wizard state | Unnecessary complexity. App Router layouts already preserve state between child routes. |
| `react-resizable-panels` through shadcn `Resizable` | Hand-rolled drag handles and CSS width persistence | Higher implementation and test complexity for a solved problem. |
| Global `/library` management route plus lightweight in-flow picker reuse | Keep worldbook management embedded only in creation dialog | Preserves the current UX bottleneck and prevents a stable desktop library surface. |
| Tailwind theme-token extension in `frontend/app/globals.css` | New CSS files for shell visuals | Violates the phase constraint and duplicates an existing styling seam. |

**Installation:**
```bash
cd frontend
npx shadcn add sidebar resizable separator
# Optional only if /library search demands it:
npx shadcn add command
```

**Version verification:** Workspace versions were read from `package.json`. Registry latest versions and publish dates were verified with `npm view` on 2026-04-01.

## Architecture Patterns

### Recommended Project Structure
```text
frontend/
├── app/
│   ├── (non-game)/
│   │   ├── layout.tsx                    # shared desktop shell for non-game routes
│   │   ├── page.tsx                      # launcher workspace replacing centered title menu
│   │   ├── settings/page.tsx
│   │   ├── library/page.tsx
│   │   └── campaign/
│   │       ├── new/
│   │       │   ├── layout.tsx           # preserves concept/DNA state across child routes
│   │       │   ├── page.tsx             # concept/source selection workspace
│   │       │   └── dna/page.tsx         # DNA editing workspace
│   │       └── [id]/
│   │           ├── review/page.tsx
│   │           └── character/page.tsx
│   ├── character-creation/page.tsx      # redirect-only legacy stub
│   ├── world-review/page.tsx            # redirect-only legacy stub
│   └── game/page.tsx                    # unchanged
├── components/
│   ├── non-game-shell/
│   │   ├── app-shell.tsx
│   │   ├── app-sidebar.tsx
│   │   ├── page-header.tsx
│   │   ├── inspector-rail.tsx
│   │   ├── sticky-action-bar.tsx
│   │   └── section-nav.tsx
│   ├── campaign-new/
│   │   ├── flow-provider.tsx
│   │   ├── concept-workspace.tsx
│   │   └── dna-workspace.tsx
│   └── library/
│       ├── library-workspace.tsx
│       └── source-picker.tsx
```

### Pattern 1: Shared Non-Game Shell Via Route Group Layout
**What:** Put launcher, creation, review, character, settings, and library routes under one App Router route group with a shared layout.
**When to use:** All non-game surfaces that should share navigation, header context, inspector behavior, and action-bar positioning.
**Why:** Next.js layouts preserve state and interaction while navigating between child routes; this is exactly what the current non-game flows lack.

**Example:**
```tsx
// Source: Next.js layouts and route groups docs
export default function Layout({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>
}
```

### Pattern 2: Nested Layout State For `/campaign/new` -> `/campaign/new/dna`
**What:** Keep creation-flow state in a client provider mounted from `app/(non-game)/campaign/new/layout.tsx`.
**When to use:** Campaign concept, source selection, IP/divergence context, and DNA edits that must survive route transitions before the campaign is created.
**Recommendation:** Move the current `useNewCampaignWizard` state machine behind a route-level flow provider instead of serializing large state into query params.

**Example:**
```tsx
// Source: repo need + Next.js layout state preservation
export default function CampaignNewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CampaignNewFlowProvider>{children}</CampaignNewFlowProvider>
}
```

### Pattern 3: Fixed Grid First, Resizable Only Where It Adds Real Value
**What:** Use fixed Tailwind grid widths for launcher, settings, and concept pages; use shadcn `Resizable` only for heavy desktop editors.
**When to use:** Apply `ResizablePanelGroup` to world review and character creation after the shared shell exists.
**Recommendation:** On FHD, target approximate widths from the Phase 28 spec: left rail `240-280px`, main canvas `880-1040px`, right rail `280-360px`. On wider desktop widths, let review/character editors become resizable.

**Example:**
```tsx
// Source: shadcn Resizable docs
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel defaultSize="22%">...</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize="78%">...</ResizablePanel>
</ResizablePanelGroup>
```

### Pattern 4: Inspector Rail Is Derived Context, Not A Second Form
**What:** Keep the right rail focused on summaries, warnings, relationships, counts, and route-level actions.
**When to use:** Review, character, settings, and creation flows.
**Recommendation:** Derive inspector data from existing `EditableScaffold`, `CharacterDraft`, settings provider bindings, and library selection state. Do not duplicate full editors in the inspector.

### Pattern 5: Canonical Route Ownership Plus Redirect Stubs
**What:** Keep `/campaign/[id]/review`, `/campaign/[id]/character`, `/campaign/new`, `/campaign/new/dna`, `/settings`, `/library`, and `/` as the only authored surfaces.
**When to use:** Legacy `/world-review` and `/character-creation` pages.
**Recommendation:** Convert legacy routes into redirect-only compatibility stubs in Phase 32, then remove them after Phase 33 if no regressions remain.

### Anti-Patterns to Avoid
- **Modal-as-page architecture:** `NewCampaignDialog` should not remain the primary creation workspace.
- **Page-local duplicated shells:** do not let review, character, and settings each reinvent header, navigation, and footer logic.
- **Query-string wizard state:** `worldbookSelection`, `ipContext`, and DNA state are too large and too important for ad hoc URL serialization.
- **Tabs-only desktop editing:** world review and character creation need visible hierarchy, not only tab-strip swapping.
- **Inspector-as-form-copy:** duplicating the main editor into the right rail will recreate the current clutter in a wider shape.
- **Game-shell bleed:** `/game` stays structurally separate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shared desktop shell navigation/collapse | Custom sidebar state and offcanvas logic | shadcn `Sidebar` + `SidebarProvider` | Official component already handles collapse patterns and keyboard toggling. |
| Pane resizing | Mousemove listeners and persisted width math by hand | shadcn `Resizable` built on `react-resizable-panels` | This is a solved accessibility and interaction problem. |
| Searchable library/source picker | One-off search overlay or hand-built command palette | shadcn `Command` over existing worldbook-library APIs | Reuses proven input/list primitives and keeps keyboard search cheap to add. |
| Route-shared creation state | New global store library for one flow | Nested `layout.tsx` provider in App Router | Layout state preservation already matches the need. |
| Visual theming | New shell CSS file | Existing `frontend/app/globals.css` Tailwind 4 `@theme inline` tokens | The repo already has the correct styling seam and the phase forbids new CSS files. |

**Key insight:** The dangerous part of Phase 32 is not drawing prettier cards. It is reorganizing existing creation/review/character/settings/library behavior into a route-owned desktop shell without losing state continuity or reintroducing parallel legacy surfaces.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `campaigns/` contains 28 campaign directories with 28 `state.db` files and 27 `config.json` files. Config audit found `ipContext` in 23 campaigns, `premiseDivergence` in 10, `worldbookSelection` in 3, and `personaTemplates` in 0 today. Reusable global library state exists in `campaigns/_worldbook-library/index.json`. | **Code edit only.** No data migration is required for the UI overhaul itself, but the new creation/library shell must continue reading and writing the same config-backed artifacts and worldbook-library records. |
| Live service config | None found. Non-game UI flows are backed by repo-local APIs and campaign files, not external admin UIs. | None. |
| OS-registered state | None found. | None. |
| Secrets/env vars | Existing provider/research keys live in settings, but their names do not depend on the non-game shell structure. | **Code edit only.** Preserve current settings forms and save behavior; no secret renames or migrations are needed. |
| Build artifacts | `frontend/components.json` already configures shadcn generation. `react-resizable-panels` is not installed locally yet. Generated shadcn component files will become new tracked source files once added. | **Code edit only.** Add missing shadcn primitives through the existing CLI path; no runtime migration is needed. |

## Common Pitfalls

### Pitfall 1: Losing Concept/DNA State Across Routed Creation Steps
**What goes wrong:** The user fills `/campaign/new`, navigates to `/campaign/new/dna`, and loses selected worldbooks, `ipContext`, or edited DNA.
**Why it happens:** The current wizard stores everything in page-local dialog state.
**How to avoid:** Mount a client flow provider in `campaign/new/layout.tsx` so child-route navigation preserves state.
**Warning signs:** DNA page reloads as empty unless data is re-entered or re-fetched.

### Pitfall 2: Rebuilding Review/Character Around Legacy Flat Fields
**What goes wrong:** The new layouts look better but still hide or flatten `CharacterDraft`, persona-template, start-condition, and loadout semantics.
**Why it happens:** Visual refactors often preserve old field grouping by accident.
**How to avoid:** Make the workspace navigation and inspector derive from grouped draft/scaffold concepts, not from old ad hoc cards.
**Warning signs:** Persona templates or start/loadout details only appear in small subpanels or disappear from the main workflow.

### Pitfall 3: Route Drift Survives The Overhaul
**What goes wrong:** `/campaign/[id]/review` and `/world-review?campaignId=` both continue to exist as authored flows, causing duplicated bugs and tests.
**Why it happens:** Keeping the old pages “for now” is easy during a UI rewrite.
**How to avoid:** Make redirect-only stubs part of the plan, not a later cleanup idea.
**Warning signs:** the same component logic is edited in both canonical and legacy pages.

### Pitfall 4: Resizable Panels Added Too Early
**What goes wrong:** Phase 32 spends time tuning drag handles while the shell, routing, and page hierarchy are still unstable.
**Why it happens:** Resizable panes are tempting because they visually signal “desktop.”
**How to avoid:** Land fixed widths first. Add `ResizablePanelGroup` only to review/character after the shell contract is stable.
**Warning signs:** early plans mention pane persistence before route ownership and shell composition are implemented.

### Pitfall 5: Settings And Library Stay “Special Cases”
**What goes wrong:** Review and character improve, but settings and reusable sources still feel like separate mini-apps.
**Why it happens:** They already work functionally, so they get left behind.
**How to avoid:** Treat settings and library as shell adopters in the same phase, even if their internal controls remain mostly intact.
**Warning signs:** `/settings` still has a standalone header/footer pattern and `/library` still does not exist.

### Pitfall 6: Phase 33 Scope Creeps Backward Into Phase 32
**What goes wrong:** Planning starts adding screenshot capture, cross-browser acceptance, or polish passes that belong to Phase 33.
**Why it happens:** Desktop redesign naturally invites manual browser verification ideas.
**How to avoid:** Phase 32 should create the shell and route structure plus targeted unit/page tests. Real browser verification stays in Phase 33.
**Warning signs:** plan steps are dominated by browser checks instead of implementation tasks.

## Code Examples

Verified patterns from official sources:

### Next.js Shared Layout
```tsx
// Source: https://nextjs.org/docs/app/getting-started/layouts-and-pages
export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
```

### Next.js Route Group
```text
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
app/
└── (non-game)/
    ├── layout.tsx
    └── settings/page.tsx
```

### shadcn Sidebar Shell
```tsx
// Source: https://ui.shadcn.com/docs/components/radix/sidebar
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>
```

### shadcn Resizable Desktop Editor
```tsx
// Source: https://ui.shadcn.com/docs/components/radix/resizable
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel defaultSize="24%">...</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize="76%">...</ResizablePanel>
</ResizablePanelGroup>
```

### Tailwind 4 Theme Tokens In CSS
```css
/* Source: https://tailwindcss.com/docs/theme */
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);
}
```

### Local Draft-Bound Character Surface
```tsx
// Source: current repo pattern in frontend/app/campaign/[id]/character/page.tsx
<CharacterCard
  draft={characterDraft}
  personaTemplates={personaTemplates}
  previewLoadout={loadoutPreview}
  onChange={setCharacterDraft}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal wizard or standalone pages as primary workflow containers | Route-owned App Router pages with shared layouts and route groups | Next.js docs updated 2026-03-31 | Phase 32 should restructure routes and layouts instead of building larger dialogs. |
| Theme setup through config-only or bespoke CSS files | Tailwind 4 theme variables in CSS via `@theme` / `@theme inline` | Tailwind 4 docs current as of 2026-04-01 | The repo can extend tokens in `frontend/app/globals.css` without adding new CSS files. |
| Hand-built split-pane behavior | shadcn `Resizable` over `react-resizable-panels` v4 | shadcn changelog notes v4 wrapper alignment on 2025-02-02 | Use the wrapper API if panes become user-resizable; do not implement drag math by hand. |
| Library/source selection hidden inside creation UI | Dedicated desktop workspace plus optional in-flow picker reuse | Common current product pattern; supported by existing worldbook-library APIs | Phase 32 should separate library management from campaign concept entry. |

**Deprecated/outdated:**
- Legacy `/character-creation` and `/world-review` pages as full-featured authored surfaces.
- `NewCampaignDialog` as the primary campaign-creation experience.
- Giant stacked cards and tab-only editing for review/character on desktop.

## Open Questions

1. **Should Phase 32 execution wait for formal Phase 29/30 closeout noted in `.planning/STATE.md`?**
   - What we know: the current worktree already contains the canonical draft/start/persona/loadout seams that this research relies on.
   - What's unclear: whether the planner should schedule a small verification gate before shell refactoring begins.
   - Recommendation: add a Wave 0 verification task that confirms the existing post-29/30 worktree still passes targeted frontend tests before route moves begin.

2. **Should `/library` ship as a full management surface in Phase 32 or only as a picker reused from creation?**
   - What we know: reusable sources are global, backed by `campaigns/_worldbook-library/index.json`, and already exposed through backend/frontend APIs.
   - What's unclear: whether the first implementation should include advanced search/management affordances.
   - Recommendation: make `/library` the canonical management route in Phase 32, but keep the first pass focused on browse/select/import using the existing API surface. Advanced search can remain optional unless the new UI clearly needs shadcn `Command`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js/Tailwind/Vitest/shadcn work | ✓ | `v23.11.0` | — |
| npm | package install, `npm view`, repo scripts | ✓ | `11.12.1` | `npx` |
| shadcn CLI | adding missing shell primitives | ✓ | workspace CLI `3.8.5` available via `npx shadcn --help` | manual component files only if CLI breaks |
| `react-resizable-panels` | resizable review/character panes | ✗ not installed locally | registry latest `4.8.0` | keep fixed-width Tailwind grids until installed |

**Missing dependencies with no fallback:**
- None for planning or initial shell implementation.

**Missing dependencies with fallback:**
- `react-resizable-panels` is absent now; fixed-width grids are a valid fallback for the first shell wave.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` with jsdom |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix frontend exec vitest run "app/**/__tests__/**/*.test.tsx" "components/**/__tests__/**/*.test.tsx"` |
| Full suite command | `npm --prefix frontend exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P32-01 | shared non-game shell renders route context, nav, inspector slot, and sticky actions consistently | component/page integration | `npm --prefix frontend exec vitest run "components/non-game-shell/__tests__/**/*.test.tsx"` | ❌ Wave 0 |
| P32-02 | routed `/campaign/new` and `/campaign/new/dna` preserve concept/source/DNA state across navigation | page integration | `npm --prefix frontend exec vitest run "app/campaign/new/__tests__/page.test.tsx" "app/campaign/new/dna/__tests__/page.test.tsx"` | ❌ Wave 0 |
| P32-03 | world review uses canonical campaign route and desktop workspace editing grammar | page/component integration | `npm --prefix frontend exec vitest run "app/campaign/[id]/review/__tests__/page.test.tsx" "components/world-review/__tests__/npcs-section.test.tsx" "components/world-review/__tests__/lore-section.test.tsx"` | page ❌ / components ✅ |
| P32-04 | character creation exposes persona/start/loadout workflow cleanly in the new workspace | page/component integration | `npm --prefix frontend exec vitest run "app/campaign/[id]/character/__tests__/page.test.tsx" "components/character-creation/__tests__/character-card.test.tsx"` | ✅ |
| P32-05 | settings and library adopt the shell without losing provider/research/library behavior | page/component integration | `npm --prefix frontend exec vitest run "app/settings/__tests__/page.test.tsx" "app/library/__tests__/page.test.tsx"` | settings ✅ / library ❌ |
| P32-06 | legacy routes redirect correctly and `/game` remains untouched structurally | redirect/smoke | `npm --prefix frontend exec vitest run "app/character-creation/__tests__/page.test.tsx" "app/world-review/__tests__/page.test.tsx" "app/game/__tests__/page.test.tsx"` | legacy/game ✅ but need updates |

### Sampling Rate
- **Per task commit:** run the impacted page/component tests plus any new shell tests.
- **Per wave merge:** `npm --prefix frontend exec vitest run`
- **Phase gate:** Full frontend Vitest suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/components/non-game-shell/__tests__/app-shell.test.tsx` — protects shared shell contract for P32-01
- [ ] `frontend/app/campaign/new/__tests__/page.test.tsx` — routed concept workspace for P32-02
- [ ] `frontend/app/campaign/new/dna/__tests__/page.test.tsx` — routed DNA workspace for P32-02
- [ ] `frontend/app/campaign/[id]/review/__tests__/page.test.tsx` — canonical review route coverage for P32-03
- [ ] `frontend/app/library/__tests__/page.test.tsx` — library shell adoption for P32-05
- [ ] Rewrite legacy route tests to assert redirect behavior instead of full standalone UI for P32-06

## Sources

### Primary (HIGH confidence)
- Local repo: `docs/ui_concept_hybrid.html`
- Local repo: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-desktop-ui-workspace-spec.md`
- Local repo: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-32-33-handoff.md`
- Local repo: `frontend/app/page.tsx`
- Local repo: `frontend/components/title/new-campaign-dialog.tsx`
- Local repo: `frontend/components/title/use-new-campaign-wizard.ts`
- Local repo: `frontend/app/campaign/[id]/review/page.tsx`
- Local repo: `frontend/app/campaign/[id]/character/page.tsx`
- Local repo: `frontend/app/settings/page.tsx`
- Local repo: `frontend/components/character-creation/character-card.tsx`
- Local repo: `frontend/components/world-review/npcs-section.tsx`
- Local repo: `frontend/app/globals.css`
- Local repo: `frontend/components.json`
- Local repo: `shared/src/types.ts`
- Local repo: `campaigns/_worldbook-library/index.json`
- Local repo: `.planning/ROADMAP.md`
- Local repo: `.planning/STATE.md`
- Official docs: https://nextjs.org/docs/app/getting-started/layouts-and-pages
- Official docs: https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Official docs: https://tailwindcss.com/docs/theme
- Official docs: https://tailwindcss.com/docs/responsive-design
- Official docs: https://ui.shadcn.com/docs/cli
- Official docs: https://ui.shadcn.com/docs/components/radix/sidebar
- Official docs: https://ui.shadcn.com/docs/components/radix/resizable
- Official docs: https://ui.shadcn.com/docs/components/radix/tabs
- Official docs: https://ui.shadcn.com/docs/components/radix/command
- npm registry via `npm view`: `next`, `react`, `react-dom`, `tailwindcss`, `shadcn`, `react-resizable-panels`, `cmdk`, `sonner`, `lucide-react`

### Secondary (MEDIUM confidence)
- None needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against local workspace versions, npm registry latest versions, and official docs.
- Architecture: HIGH - grounded in the current post-31 worktree plus official Next.js, Tailwind, and shadcn patterns.
- Pitfalls: HIGH - directly observed in current route/component structure and Phase 28 handoff artifacts.

**Research date:** 2026-04-01
**Valid until:** 2026-04-15
