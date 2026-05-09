# Phase 59: Game Shell and Layout Fix - Research

**Researched:** 2026-04-16
**Domain:** Frontend shell layout (Tailwind flex/grid), viewport-constrained panel scroll, small TS debt cleanup
**Confidence:** HIGH

## Summary

This is a small, well-scoped layout fix plus two-hop TS cleanup. The live `/game` shell in `frontend/app/game/page.tsx` uses `min-h-screen` on the outer container and a 3-column grid with `xl:items-start`, which allows columns to grow with content past the viewport; as a result the middle column (narrative reader + sticky action dock) is pushed below the fold and panel asides don't scroll internally. The concept in `docs/ui_concept_hybrid.html` demonstrates the fix: `h-screen` + `flex-row` root with each aside as `flex flex-col overflow-hidden` wrapping an inner `flex-1 overflow-y-auto` scroll region.

Research confirms: (1) the grid→flex-row conversion is the cleanest mapping of the reference concept and eliminates `items-start` vs sticky interaction; (2) existing panels (`LocationPanel`, `CharacterPanel`) already have the correct `flex flex-col overflow-hidden` wrapper with `<ScrollArea className="flex-1">` inside, so the fix is almost entirely in the shell, not the panels — `LorePanel` is the one exception and needs the `flex w-full flex-col` wrapper the others already have; (3) the sticky action dock collapses to a plain `flex-none` footer in the flex-column middle, eliminating the `-mt-10 pb-1 pt-10` overlap hack; (4) typecheck red at `prompt-assembler.ts:786` is a trivial null-narrowing inside a `.filter()` closure — unrelated to the larger Phase 57/58 cascade of 40 pre-existing errors, which are explicitly out of scope.

**Primary recommendation:** Rewrite the `/game` shell as a viewport-locked `flex flex-col h-screen overflow-hidden` container → toolbar (`flex-none`) → `flex-1 flex-row min-h-0 overflow-hidden` tri-column → aside (`w-80 flex-none flex flex-col overflow-hidden`) + main (`flex-1 flex flex-col min-w-0 overflow-hidden`) + right-column stack (50/50 `flex-1` split for CharacterPanel + LorePanel). Fix the single `prompt-assembler.ts:786` null-narrowing in a separate commit. Do NOT touch the other 39 typecheck errors — they belong to other phases and scope-creep risks regression.

<user_constraints>
## User Constraints (from CONTEXT.md)

*No CONTEXT.md exists for this phase — no `/gsd:discuss-phase` was run. The phase description in ROADMAP.md + the additional_context block from the orchestrator constitute the full brief.*

### Locked Decisions (from phase description + ROADMAP)
- **Target layout:** Match `docs/ui_concept_hybrid.html`.
- **Shell class:** Replace `min-h-screen` with `h-screen` on game-shell.
- **Grid strategy:** Convert `xl:grid xl:grid-cols-[...]` + `xl:items-start` to horizontal `flex-row` of fixed-width asides (preferred over keeping grid + adding `min-h-0`).
- **Panel pattern:** Each aside = `flex flex-col overflow-hidden` outer + `flex-1 overflow-y-auto` inner scroll region.
- **Middle column:** Reader column + sticky action dock stay within viewport at all times.
- **Typecheck cleanup scope:** `prompt-assembler.ts:630` (actual line is 786 — same error class) and any other Phase 57-introduced static-analysis debt. NOT the 40-error cascade from other phases.
- **Testing:** DOM test (shell height), DOM test (panel overflow classes), PinchTab action-bar-visible test, cross-browser smoke.
- **Regression check:** Visual smoke on `/campaign/new`, `/campaign/[id]/character`, `/settings` — these use `(non-game)` shell, separate layout, should NOT regress but must be verified.

### Claude's Discretion
- Exact flex column widths (320px is from concept; current grid uses 280-320px range — pick 320px for parity with concept).
- How to split CharacterPanel/LorePanel in right column (concept has single right panel; WorldForge has two — recommend 50/50 `flex-1`, or Character auto-height `flex-none` + Lore `flex-1`; see Pattern 4 below).
- Keep `ScrollArea` shadcn component (radix-ui-based) vs switch to native `overflow-y-auto` — recommend KEEP, panels already use it and its viewport pattern interacts correctly with flex.
- Where to land the single TS fix (null check `if (!encounter.playerId) return false;` inside filter closure, OR destructure `playerId` outside the arrow).
- Whether to emit data attributes for test hooks (`data-shell-region="aside-left"` etc.) — recommend YES, Phase 33 established this pattern for the non-game shell.

### Deferred Ideas (OUT OF SCOPE)
- The 39 other pre-existing typecheck errors in `record-adapters.ts`, `routes/character.ts`, `routes/schemas.ts`, `routes/worldgen.ts`, `routes/persona-templates.ts`, `routes/campaigns.ts`, `engine/location-events.ts`, `engine/target-context.ts`, `engine/__tests__/*`, `ai/__tests__/provider-registry.test.ts`, `character/__tests__/known-ip-worldgen-research.test.ts`, `routes/__tests__/schemas.test.ts`, `routes/__tests__/chat.observability-stream-safety.test.ts` — these belong to Phase 60/61 (character ingestion) and should NOT be touched in Phase 59.
- Visual redesign of individual panels (colors, spacing, radius) — pure structural scroll fix only.
- Responsive breakpoints below `xl` — the current mobile/tablet flex-column fallback continues to work; we only fix the `xl:`-and-up layout.
- Animations, transitions, backdrop-blur tuning — existing classes stay.
- `/campaign/[id]/character` / `/settings` / `/campaign/new` shell refactor — these use `(non-game)/layout.tsx` which already renders `AppShell` correctly; not in scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 59 has no explicit requirement IDs in `v1.1-REQUIREMENTS.md` — it's a tactical unblocker for previously completed phases. The phase exists to remove a viewport-fold defect that blocks manual UAT on already-merged work.

| ID | Description | Research Support |
|----|-------------|------------------|
| UNBLOCK-57-T7 | `/lookup power_profile` UAT test blocked because action bar is below viewport fold | Fix action bar visibility by locking shell height; test via PinchTab "element visible without scroll" assertion after opening `/game` |
| UNBLOCK-37-UAT | Campaign-load reload flow UAT blocked (same fold issue) | Shell height fix surfaces action bar on initial load |
| UNBLOCK-40-UAT | Reflection trigger UAT requires multiple sequential turns — action bar must stay visible across turns | Sticky action dock inside middle flex column stays pinned regardless of reader content length |
| UNBLOCK-48-UAT | Character identity UAT requires long gameplay sessions; narrative log grows but shell should not | `h-screen` + panel-internal scroll = narrative log scrolls inside NarrativeLog, shell stays fixed |
| UNBLOCK-49-UAT | Research lookup UAT uses `/lookup` and `/compare` — same action bar blocker as 57-T7 | Same fix as UNBLOCK-57-T7 |
| UNBLOCK-50-UAT | Rich-text gameplay presentation UAT — was rendered invisible by the viewport issue | Same fix |
| DEBT-PA-786 | `prompt-assembler.ts:786` TS2345: null narrowing lost in `.filter()` closure | Add `if (!encounter.playerId) return false;` inside filter or extract to local `const playerId = encounter.playerId` above the closure |
</phase_requirements>

## Standard Stack

### Verified Versions (2026-04-16)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | ^4 (via `@tailwindcss/postcss`) | Utility CSS | Already project standard; v4 uses PostCSS plugin (no `tailwind.config.ts` file — pure CSS + theme vars in `globals.css`) |
| Next.js | ^16.1.6 | App Router | Already standard |
| React | 19.2.3 | Rendering | Already standard |
| `radix-ui` ScrollArea | via `@/components/ui/scroll-area` | Accessible scroll region | Already used in all 3 panels |
| Vitest | ^3.2.4 + jsdom | Unit + DOM tests | Already configured at `frontend/vitest.config.ts` |
| `@testing-library/react` | (via setup.ts) | DOM assertions | Existing `__tests__/setup.ts` + `ResizeObserver` polyfill already in place |

**Installation:** None needed. All dependencies present.

**Version verification:** No new dependencies. Tailwind v4 is confirmed present (`"tailwindcss": "^4"` in `frontend/package.json`), configured via `frontend/postcss.config.mjs` using `@tailwindcss/postcss`. There is NO `tailwind.config.ts` file — v4 uses CSS-first config.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| flex-row tri-column | Keep grid, add `min-h-0` + `max-h-screen` | Works, but fights `items-start`; concept uses flex-row; flex-row is cleaner |
| Native `overflow-y-auto` | Drop `ScrollArea`, use raw div | Loses custom scrollbar styling and accessibility; panels already use `ScrollArea` consistently — keep |
| 50/50 right-column split | Character auto-height, Lore flex-1 | 50/50 is simpler and closer to concept; but Character content is much smaller than Lore — auto-height is arguably better UX. See Pattern 4. |

## Architecture Patterns

### Recommended Project Structure (unchanged)
```
frontend/
├── app/
│   └── game/
│       └── page.tsx              ← SHELL FIX TARGET
├── components/
│   └── game/
│       ├── location-panel.tsx    ← already correct; no change
│       ├── character-panel.tsx   ← already correct; no change
│       ├── lore-panel.tsx        ← add outer wrapper to match siblings
│       ├── narrative-log.tsx     ← already uses flex-1 overflow-hidden
│       ├── action-bar.tsx        ← no change
│       └── quick-actions.tsx     ← no change
└── __tests__/
    └── game-shell.test.tsx       ← NEW: DOM assertions for shell structure
```

### Pattern 1: Viewport-Locked Shell (concept-matching)

**What:** Root shell is `h-screen` + `flex flex-col overflow-hidden`. Toolbar is `flex-none`. Tri-column row is `flex-1 flex-row min-h-0 overflow-hidden`. The `min-h-0` on the tri-column row is the load-bearing magic that allows inner `overflow-hidden` to actually clip (without it, flex children default to `min-height: auto` and overflow the parent).

**When to use:** Any desktop shell that must stay viewport-locked while containing scrollable panels.

**Current (broken) structure — `frontend/app/game/page.tsx:919-1051`:**
```tsx
<div
  data-testid="game-shell"
  className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
>
  {/* toolbar */}
  <div className="... px-4 py-2">{/* toolbar content */}</div>
  {/* travel banner */}
  <div className="relative z-10 flex flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 ...">
    <div className="mx-auto flex h-full w-full max-w-[1720px] flex-col gap-4 xl:grid xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(280px,320px)] xl:items-start">
      {/* LocationPanel wrapper: xl:h-full xl:w-full */}
      {/* reader column: xl:h-full */}
      {/* right column: xl:h-full */}
    </div>
  </div>
</div>
```

**Target structure:**
```tsx
<div
  data-testid="game-shell"
  data-shell-region="game-root"
  className="relative flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
>
  {/* Toolbar — flex-none so it doesn't grow */}
  <div className="relative z-10 flex flex-none items-center justify-between border-b border-white/8 bg-zinc-950/80 px-4 py-2 backdrop-blur-xl">
    {/* toolbar buttons (unchanged) */}
  </div>
  {travelFeedback ? (
    <div className="relative z-10 flex-none border-b border-white/8 bg-amber-500/10 px-4 py-2 text-sm text-amber-100/90">
      {travelFeedback}
    </div>
  ) : null}
  {/* Tri-column row — flex-1 fills remaining viewport, min-h-0 allows children to clip */}
  <div
    data-shell-region="game-columns"
    className="relative z-10 flex min-h-0 flex-1 gap-4 overflow-hidden px-3 pb-3 pt-3 sm:px-4 lg:px-5"
  >
    <div className="mx-auto flex h-full w-full max-w-[1720px] flex-col gap-4 xl:flex-row xl:items-stretch">
      {/* Left aside — fixed width, flex-column, internal scroll */}
      <aside
        data-shell-region="aside-left"
        className="order-2 flex min-h-0 flex-1 flex-col xl:order-1 xl:w-80 xl:flex-none"
      >
        <LocationPanel ... />
      </aside>
      {/* Middle — flex-column with reader (flex-1) + action dock (flex-none) */}
      <section
        data-testid="game-reader-column"
        data-shell-region="reader"
        className="order-1 flex min-h-0 flex-1 flex-col gap-4 xl:order-2"
      >
        {/* Reader panel — flex-1 with internal overflow */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(39,39,42,0.78),rgba(18,18,21,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(9,9,11,0.92))]" />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <OraclePanel result={lastOracleResult} />
            <NarrativeLog ... />
          </div>
        </div>
        {/* Action dock — flex-none so it NEVER grows past its content */}
        <div
          data-testid="game-action-dock"
          data-shell-region="action-dock"
          className="flex-none"
        >
          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950/88 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <QuickActions ... />
            <ActionBar ... />
          </div>
        </div>
      </section>
      {/* Right aside — fixed width, flex-column, CharacterPanel + LorePanel stack */}
      <aside
        data-shell-region="aside-right"
        className="order-3 flex min-h-0 flex-1 flex-col gap-4 xl:w-80 xl:flex-none"
      >
        <CharacterPanel ... />
        <LorePanel ... />
      </aside>
    </div>
  </div>
  {activeCampaign && <CheckpointPanel ... />}
</div>
```

**Key changes vs current:**
1. `min-h-screen` → `h-screen` on outer (line 922)
2. `flex-col overflow-hidden` on outer (already present)
3. Toolbar + travel banner get explicit `flex-none`
4. Inner wrapper drops `mx-auto flex h-full w-full max-w-[1720px] flex-col gap-4` nesting AND the `xl:grid xl:grid-cols-[...] xl:items-start` — replaced with a single `xl:flex-row` container
5. Grid tracks (`minmax(280px,320px)_1fr_minmax(280px,320px)`) replaced with `xl:w-80 xl:flex-none` on asides + `flex-1` on middle
6. Remove `xl:h-full` hacks on panel wrappers (no longer needed — flex children stretch by default with `items-stretch`)
7. Remove `sticky bottom-0 z-20 -mt-10 pb-1 pt-10` action dock hack — action dock is now a plain `flex-none` flex item at the bottom of the middle column; sticky is implicit via flex ordering

### Pattern 2: Panel = Outer wrapper + Internal ScrollArea

**What:** Each panel component is an `<aside>` with `flex flex-col overflow-hidden` on the outer element. Inside, a header is `flex-none` (or just `border-b` with no flex prop, since flex items default to auto-height based on content), and the content area is `<ScrollArea className="flex-1">` which renders a Radix `Viewport` with `size-full` internally that provides the scroll.

**When to use:** Every panel that can grow beyond viewport height.

**Current state verification:**
- `LocationPanel` (lines 49, 77): has `flex w-full flex-col overflow-hidden rounded-[24px] ... xl:h-full` — CORRECT pattern, `xl:h-full` becomes redundant under flex-row parent but harmless.
- `CharacterPanel` (lines 44, 63): same pattern as Location — CORRECT.
- `LorePanel` (lines 103, 117): uses `flex w-full flex-col border-l border-border bg-card lg:w-[250px]` — MISSING `overflow-hidden` and the rounded hybrid-panel styling of siblings. **Needs alignment.**
- `NarrativeLog` (line 124): `<section className="flex-1 overflow-hidden">` with inner `ScrollArea className="h-full">` — CORRECT.

**LorePanel fix:**
```tsx
// Before (lore-panel.tsx:117):
<aside className="flex w-full flex-col border-l border-border bg-card lg:w-[250px]">

// After:
<aside className="flex w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl xl:h-full">
```

Same change on the `!campaignId` empty-state branch at line 103. This aligns LorePanel styling with Location/Character siblings.

### Pattern 3: Why `min-h-0` matters on flex ancestors

**What:** By default, flex items have `min-height: auto`, which means they won't shrink below their content's intrinsic size. This breaks `overflow-hidden` on the parent because the content overflows the flex item rather than being clipped.

**Rule:** Every flex-column ancestor between `h-screen` root and the innermost scrollable `overflow-y-auto` MUST have `min-h-0` (or `overflow-hidden`, which implies `min-h-0` behavior via the implicit scroll container). Same for `flex-row` → `min-w-0`.

**Evidence in concept:** `docs/ui_concept_hybrid.html` uses `<body class="h-screen w-full flex overflow-hidden">` plus each aside has `overflow-hidden` and each inner scroll area has `overflow-y-auto`. No explicit `min-h-0` — `overflow-hidden` provides the same clipping effect.

### Pattern 4: Right-column split strategy

Two viable options for CharacterPanel + LorePanel in the right aside:

**Option A: 50/50 split (simpler)**
```tsx
<aside className="... xl:w-80 xl:flex-none flex flex-col gap-4 min-h-0">
  <div className="flex-1 min-h-0"><CharacterPanel ... /></div>
  <div className="flex-1 min-h-0"><LorePanel ... /></div>
</aside>
```
Both panels get equal vertical space; each scrolls internally.

**Option B: Character auto-height + Lore fills remainder (recommended)**
```tsx
<aside className="... xl:w-80 xl:flex-none flex flex-col gap-4 min-h-0">
  <div className="flex-none max-h-[50vh] overflow-hidden flex flex-col"><CharacterPanel ... /></div>
  <div className="flex-1 min-h-0"><LorePanel ... /></div>
</aside>
```
Character sizes to content up to 50vh cap; Lore takes remaining space. Matches real UX: character info is fixed-size (avatar + HP + tags + equipment), lore is the unbounded list.

**Recommendation:** Option A (50/50) for simplicity and symmetry with concept's single-panel-per-column model. This also avoids the `max-h-[50vh]` magic number. Both panels already handle internal scroll correctly.

### Anti-Patterns to Avoid

- **`min-h-screen` on a shell that contains scrollable content:** Shell grows with content; action bar gets pushed below fold. Always use `h-screen` for viewport-locked shells.
- **`items-start` on a grid/flex-row that needs stretchy children:** Children size to content, ignoring parent height. Use default `items-stretch` (implicit).
- **`sticky bottom-0` with negative margin overlap:** Works around symptoms of broken flex sizing. Replace with plain `flex-none` flex child in a `flex-col` parent.
- **`xl:h-full` on flex items inside a flex-col parent:** Redundant (children stretch automatically under `items-stretch`), and inside a grid with `items-start` it's a no-op band-aid. Remove.
- **Forgetting `min-h-0` on nested flex-col:** Content overflows instead of clipping. Cascades all the way down: root → column-wrapper → column → panel → scroll-viewport — every flex-col ancestor needs `min-h-0` or `overflow-hidden`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll container with styled scrollbar | Custom `overflow-y-auto` + custom scrollbar CSS | Existing `@/components/ui/scroll-area` (Radix) | Already in panels; consistent styling; accessibility baked in |
| DOM assertion helpers for layout tests | Custom class-string regex matching | `@testing-library/react` `getByTestId` + DOM `.classList`/`getComputedStyle` | Existing `__tests__/setup.ts` already wires jsdom + polyfills |
| Viewport height detection in JS | Window resize listener + state | CSS `h-screen` + flex layout | Browser-native, no JS, reflow-safe |

**Key insight:** The current layout is ALMOST correct — `LocationPanel` and `CharacterPanel` panels are already structured correctly; `NarrativeLog` already uses `flex-1 overflow-hidden`. The bug is concentrated in the SHELL (lines 919-1051 of `page.tsx`) and one mismatched `LorePanel` outer wrapper. Don't rewrite panels — align their outer wrappers and fix the shell.

## Runtime State Inventory

> Phase 59 is a layout + single TS fix. No renames, no migrations, no string-rewrites. Runtime state inventory is not applicable; stated explicitly per protocol:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB schema change, no field rename | None |
| Live service config | None — no external service config touched | None |
| OS-registered state | None — no daemons / tasks / systemd units touched | None |
| Secrets/env vars | None — no env var names touched | None |
| Build artifacts | None — Next.js `.next/` rebuilds cleanly on dev server restart; no `npm pack`/egg-info equivalent | None |

**Nothing found in any category:** Verified — this phase only edits `frontend/app/game/page.tsx`, `frontend/components/game/lore-panel.tsx`, `backend/src/engine/prompt-assembler.ts` (single line), and adds test files. No state migration concern.

## Common Pitfalls

### Pitfall 1: Sticky + h-full parent silent failure
**What goes wrong:** If the middle column uses `sticky bottom-0` on the action dock AND the parent has `xl:h-full` but an ancestor has `items-start`, `position: sticky` silently degrades to `position: static` because there's no scroll container above it (content is longer than the flex item).
**Why it happens:** Sticky needs a scrollable ancestor. With `items-start`, columns don't fill row height, so the body/window becomes the scroll container — but the action dock was positioned against the shorter flex item.
**How to avoid:** Replace sticky with plain `flex-none` flex child in `flex-col`. The flex-col layout itself pins the dock to the bottom when reader is `flex-1`.
**Warning signs:** Action bar scrolls with narrative log (sticky broke); action bar sits above viewport bottom (column shorter than viewport, dock attached to column edge).

### Pitfall 2: Tailwind v4 doesn't use `tailwind.config.ts`
**What goes wrong:** Dev tries to edit `frontend/tailwind.config.ts` to add tokens — the file doesn't exist. Tailwind v4 uses CSS-first config in `globals.css` via `@theme` directive.
**Why it happens:** v3 → v4 migration removed JS config as the canonical source.
**How to avoid:** If we need a new color/spacing token (we don't for this phase), add it to `frontend/app/globals.css` via `@theme` block. For Phase 59, no tokens needed — all classes are standard Tailwind utilities.
**Warning signs:** "Where is `tailwind.config.ts`?" — it's not there, and that's correct.

### Pitfall 3: jsdom doesn't compute flex layout
**What goes wrong:** DOM test tries `getComputedStyle(shell).height === '1080px'` — jsdom returns empty string because it doesn't implement layout.
**Why it happens:** jsdom is a DOM implementation, not a rendering engine.
**How to avoid:** Assert on CLASS NAMES, not computed styles. `expect(shell).toHaveClass('h-screen')` and `expect(shell).not.toHaveClass('min-h-screen')`. Use PinchTab (real Chrome) for actual layout verification.
**Warning signs:** `getComputedStyle(...).height === ""` — the trap.

### Pitfall 4: PinchTab ref-click on lucide-icon buttons
**What goes wrong:** PinchTab click by accessibility ref targets the button but the click lands on the inner SVG, ignored by React handler.
**Why it happens:** Click hit-testing lands on the topmost element; SVG is above the button surface for the ref's pointer coords.
**How to avoid:** Use `/evaluate` with programmatic `.click()`. Project memory already documents this workaround.
**Warning signs:** PinchTab reports success but no state change; use `var` not `const`/`let` in `/evaluate` (persistence); avoid `!` in evaluate expressions.

### Pitfall 5: Narrowing lost in `.filter()` closure (the TS fix itself)
**What goes wrong:** `encounter.snapshot && encounter.playerId` narrows on outer ternary, but inside `.filter((npc) => ... encounter.playerId ...)`, TS re-widens `encounter.playerId` to `string | null` because callbacks are independent analysis contexts.
**Why it happens:** TypeScript's control flow analysis does not cross function boundaries for property accesses off mutable objects.
**How to avoid:** Destructure the narrowed value into a `const` BEFORE the closure: `const { snapshot, playerId } = encounter; if (!snapshot || !playerId) return null; ... npcRows.filter((npc) => getObserverAwareness(snapshot, playerId, npc.id))`.
**Warning signs:** `TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'` inside a callback body where the outer check looked sufficient.

## Code Examples

### Example 1: Shell root (replace page.tsx:919-924)
```tsx
// Source: docs/ui_concept_hybrid.html body + WorldForge toolbar pattern
return (
  <div
    data-testid="game-shell"
    data-shell-region="game-root"
    className="relative flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
  >
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,244,245,0.08),_transparent_40%),linear-gradient(180deg,_rgba(24,24,27,0.98),_rgba(9,9,11,1))]" />
    {/* ... ambient glows unchanged ... */}
    {/* Toolbar — flex-none */}
```

### Example 2: Tri-column row (replace page.tsx:980-981)
```tsx
<div
  data-shell-region="game-columns"
  className="relative z-10 flex min-h-0 flex-1 gap-4 overflow-hidden px-3 pb-3 pt-3 sm:px-4 lg:px-5"
>
  <div className="mx-auto flex h-full w-full max-w-[1720px] flex-col gap-4 xl:flex-row xl:items-stretch">
```

### Example 3: Aside wrapper (replace page.tsx:982-992)
```tsx
<aside
  data-shell-region="aside-left"
  className="order-2 flex min-h-0 flex-1 flex-col xl:order-1 xl:w-80 xl:flex-none xl:h-full"
>
  <LocationPanel ... />
</aside>
```

### Example 4: Action dock replacement (replace page.tsx:1016-1036)
```tsx
<div
  data-testid="game-action-dock"
  data-shell-region="action-dock"
  className="flex-none"
>
  <div className="overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950/88 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
    <QuickActions actions={quickActions} onAction={handleQuickAction} disabled={isTurnBusy} />
    <ActionBar ... />
  </div>
</div>
```

Note the removal of `sticky bottom-0 z-20 -mt-10 pb-1 pt-10` — no longer needed.

### Example 5: The single TS fix (backend/src/engine/prompt-assembler.ts:777-794)
```ts
// Source: TS control-flow analysis rules; narrowing doesn't cross callback boundary
function buildNpcStatesSection(
  campaignId: string,
  encounter: EncounterPromptContext,
  storytellerPass: StorytellerPass,
): PromptSection | null {
  const snapshot = encounter.snapshot;
  const playerId = encounter.playerId;
  const npcRows =
    snapshot && playerId
      ? encounter.npcRows.filter((npc) => {
          if (!snapshot.presentActorIds.includes(npc.id)) {
            return false;
          }
          const awareness = getObserverAwareness(snapshot, playerId, npc.id);
          return storytellerPass === "hidden-tool-driving"
            ? awareness !== "none"
            : awareness === "clear";
        })
      : [];
  // ... rest unchanged
}
```

**Note:** `target-context.ts:198` is a SIMILAR but separately-scoped `string | null` error. It is in the same module family (engine-owned) but NOT mentioned in the Phase 59 brief. Recommend INCLUDING it since the fix is 1 line and of the same class (Phase 57 refactor debt); otherwise it stays red and undermines the "typecheck clean" closure criterion. **Decision point for planner:** include `target-context.ts:198` or scope it to Phase 60. Recommend: INCLUDE.

### Example 6: DOM test for shell structure (NEW — `frontend/app/game/__tests__/page.test.tsx`)
```tsx
// Source: Phase 33 data-shell-region pattern + existing non-game shell tests
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  getActiveCampaign: vi.fn().mockResolvedValue(null),
  getRememberedCampaignId: vi.fn().mockReturnValue(null),
  /* ...minimal mocks to let page render in initializing state... */
}));
vi.mock("@/lib/use-settings", () => ({
  useSettings: () => ({ settings: { ui: { showRawReasoning: false } } }),
}));

import GamePage from "@/app/game/page";

describe("GamePage shell structure", () => {
  it("locks shell to viewport height via h-screen (not min-h-screen)", async () => {
    render(<GamePage />);
    // Loading state renders first; skip to assert the eventual shell
    // ... wait for initializing to settle or test the shell directly
    const shell = await screen.findByTestId("game-shell");
    expect(shell).toHaveClass("h-screen");
    expect(shell).not.toHaveClass("min-h-screen");
    expect(shell).toHaveClass("flex", "flex-col", "overflow-hidden");
  });

  it("marks action dock as flex-none (not sticky) so it stays in flow", async () => {
    render(<GamePage />);
    const dock = await screen.findByTestId("game-action-dock");
    expect(dock).toHaveClass("flex-none");
    expect(dock).not.toHaveClass("sticky");
  });

  it("emits semantic shell-region hooks for regression tests", async () => {
    render(<GamePage />);
    const root = await screen.findByTestId("game-shell");
    expect(root).toHaveAttribute("data-shell-region", "game-root");
    expect(screen.getByTestId("game-reader-column")).toHaveAttribute(
      "data-shell-region",
      "reader",
    );
  });
});
```

**Note on the test approach:** The page has a complex `useEffect`-driven init. The test must either (a) mock `getActiveCampaign` to return null (triggers redirect but shell still renders briefly — may be flaky), or (b) mock to return a valid campaign meta and stub the world fetch. Plan-phase should decide. Simpler alternative: extract the shell structure into a pure subcomponent and test it directly (tactical refactor justified by testability). Defer to planner.

### Example 7: PinchTab live-browser test (describe in VALIDATION.md, run manually)
```javascript
// Via PinchTab /evaluate endpoint, post-/game load
var rect = document.querySelector('[data-testid="game-action-dock"]').getBoundingClientRect();
var visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
({ visible: visible, rectTop: rect.top, rectBottom: rect.bottom, vh: window.innerHeight });
// Expect: visible === true, rectBottom < window.innerHeight
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `min-h-screen` shells | `h-screen` + `overflow-hidden` for app-like layouts | Been standard since CSS flex matured (~2018) | Required for viewport-locked dashboards/IDEs |
| `position: sticky` action bars | `flex-none` flex child in `flex-col` column | Modern flexbox pattern | Cleaner; no overlap hacks; works across browsers |
| CSS grid for tri-column app shells | `flex-row` with fixed-width asides | Preference, not hard rule | Flex-row is simpler when items need different heights/behaviors; grid is better for aligned rows |
| Tailwind v3 JS config | Tailwind v4 CSS-first `@theme` config | Tailwind v4 GA (2025) | `tailwind.config.ts` no longer canonical |

**Deprecated/outdated:**
- `tailwind.config.ts` as source-of-truth (v3-era); project uses v4 via `postcss.config.mjs` + CSS `@theme`.
- `backdrop-blur` on shell containers — `memory/feedback_backdrop_blur_perf.md` bans this on shells due to GPU cost. Current game shell uses `backdrop-blur-xl` on toolbar only; phase 59 should NOT introduce new backdrop-blur on root/column wrappers. LorePanel outer should use `bg-white/[0.04]` (matches siblings) — which has alpha, but siblings already do this, so consistency wins over the feedback rule in this micro-context. Flag for planner.

## Open Questions

1. **Include `target-context.ts:198` fix or scope to Phase 60?**
   - What we know: Same error class as `prompt-assembler.ts:786` — 1-line `string | null` narrowing fix in the same engine module family.
   - What's unclear: Phase 59 brief says "any other static-analysis debt introduced by Phase 57 refactor" — this qualifies.
   - Recommendation: **INCLUDE.** Same fix pattern, adjacent module, would otherwise leave a lone red error that looks identical to the one we just fixed. Ensures `npm --prefix backend run typecheck` exit-code doesn't regress further when Phase 60 lands.

2. **Right-column split: 50/50 (Option A) or Character auto-height (Option B)?**
   - What we know: Concept has one right panel, not two; no direct guidance.
   - What's unclear: UX preference.
   - Recommendation: **Option A (50/50)** for this phase. Simpler, symmetric, no magic numbers. Can revisit in a future UX phase if users complain.

3. **Add `data-shell-region` attributes?**
   - What we know: Phase 33 established this pattern for `(non-game)` shell; existing tests use it.
   - What's unclear: Whether the `game-shell` pattern should follow suit.
   - Recommendation: **YES.** Minor cost, major benefit for regression stability — tests won't break on cosmetic class-string churn.

4. **DOM test strategy: full-page render vs extracted shell component?**
   - What we know: `GamePage` has heavy init effects (fetch active campaign, load history, load world, start opening scene). jsdom will hit mocked fetches and suspend in `isInitializing`.
   - What's unclear: Whether to extract the shell JSX into a subcomponent (`<GameShell>`) for direct testing, or mock deeply.
   - Recommendation: **Mock deeply for now.** Extraction is a refactor risk for a Phase 57 just-verified entry path. Full-page render with thorough mocks gives equivalent coverage.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev / test / typecheck | ✓ | (local) | — |
| `npm` | package scripts | ✓ | (local) | — |
| Next.js dev server (port 3000) | frontend dev | ✓ | ^16.1.6 | — |
| Vitest + jsdom | DOM unit tests | ✓ | ^3.2.4 | — |
| PinchTab | live-browser layout test | ✓ (installed global) | — | Manual browser test (user has Chrome) |
| GLM / LLM providers | Game turns during cross-browser smoke | ✓ (user has key) | glm-4.6 | Open `/game` without turns — shell assertions don't need LLM |
| Tailwind v4 PostCSS pipeline | Build-time styling | ✓ | ^4 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 + jsdom 27+ (implied by vitest, already configured) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix frontend test -- __tests__/game-shell.test.tsx` (or app-path equivalent) |
| Full suite command | `npm --prefix frontend test -- --run` |
| Typecheck (backend) | `npm --prefix backend run typecheck` |
| Typecheck (frontend) | `npm --prefix frontend run build` (Next build includes typecheck) or `tsc --noEmit` if a script exists |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNBLOCK-* (shell height) | `game-shell` has `h-screen`, not `min-h-screen` | unit-DOM | `npm --prefix frontend test -- game-shell.test.tsx -t "h-screen"` | ❌ Wave 0 |
| UNBLOCK-* (panel overflow) | Each aside has `overflow-hidden` outer + `overflow-y-auto` inner viewport | unit-DOM | `npm --prefix frontend test -- game-shell.test.tsx -t "panel overflow"` | ❌ Wave 0 |
| UNBLOCK-* (action dock flow) | `game-action-dock` has `flex-none`, NOT `sticky` | unit-DOM | `npm --prefix frontend test -- game-shell.test.tsx -t "action dock"` | ❌ Wave 0 |
| UNBLOCK-* (semantic hooks) | `data-shell-region` on root, aside-left, aside-right, reader, action-dock | unit-DOM | Same test file | ❌ Wave 0 |
| UNBLOCK-57-T7 (live viewport) | Action dock visible without scroll on 1080p viewport | manual-PinchTab | See example 7 above | N/A — runtime |
| DEBT-PA-786 (typecheck clean) | `prompt-assembler.ts:786` error goes away; `target-context.ts:198` also | typecheck | `npm --prefix backend run typecheck` — expect 38 errors (down from 40) | ✓ existing script |
| REGRESSION — non-game routes | `/campaign/new`, `/campaign/[id]/character`, `/settings` still render their shells correctly | manual visual smoke | PinchTab: load each URL, confirm shell renders | ✓ existing pages |
| REGRESSION — lint | `npm --prefix frontend run lint` exit 0 | static | `npm --prefix frontend run lint` | ✓ existing script |

### Sampling Rate
- **Per task commit:** `npm --prefix frontend test -- game-shell.test.tsx --run` + `npm --prefix backend run typecheck` (grep only for touched files).
- **Per wave merge:** Full `npm --prefix frontend test -- --run` + full `npm --prefix backend run typecheck` + `npm --prefix frontend run lint`.
- **Phase gate:** Full suite green (frontend tests, frontend lint, backend typecheck delta — expect 38 errors remaining from unrelated phases) + PinchTab manual live-browser confirmation that action dock is visible on `/game` at 1920×1080 and 1366×768.

### Wave 0 Gaps
- [ ] `frontend/app/game/__tests__/page.test.tsx` — NEW test file, DOM assertions on shell structure (see Example 6 above)
- [ ] OR `frontend/__tests__/game-shell.test.tsx` if project convention prefers flat `__tests__/` root
- [ ] No framework install needed — Vitest + jsdom + testing-library already configured
- [ ] No shared fixtures needed — mock `next/navigation`, `@/lib/api`, `@/lib/use-settings` inline per test file (existing pattern in `app/(non-game)/__tests__/layout.test.tsx`)
- [ ] Document PinchTab manual test steps in VALIDATION.md (since jsdom can't verify layout)

*(If planner picks Option B for right-column split, add a `right-column split 50/50` test too.)*

## Project Constraints (from CLAUDE.md)

The project's CLAUDE.md is extensive; for Phase 59 the load-bearing directives are:

- **Typescript strict mode** — all new code + the TS fix must respect strict null checks (this is exactly why the `:786` error exists; the fix restores strict compliance).
- **TypeScript strict mode, ES modules** — new test file uses ES import syntax.
- **Memory file `feedback_backdrop_blur_perf.md`** — do NOT add backdrop-blur to the shell root / column wrappers. Existing backdrop-blur on toolbar and ActionDock inner card is pre-existing; don't introduce new ones.
- **Memory file `feedback_plan_before_code.md`** — plan before code; the GSD pipeline already enforces this.
- **Memory file `feedback_gsd_only.md`** — all changes through GSD pipeline.
- **Memory file `feedback_no_fallbacks.md` / `feedback_no_fallbacks_v2.md`** — not directly applicable to a layout fix, but the test strategy must FAIL LOUDLY on shell regressions, not silently pass.
- **Russian language for user communication** — respond to user in Russian; research doc itself is technical, kept in English for TS/CSS precision.
- **GitNexus:** MUST run `gitnexus_impact({target: "GamePage"})` before editing `page.tsx`; MUST run `gitnexus_impact({target: "buildNpcStatesSection"})` before editing `prompt-assembler.ts:786`; MUST run `gitnexus_detect_changes()` before committing.
- **Never edit a function without impact analysis.** The plan must instruct agents to run `gitnexus_impact` on `GamePage`, `LorePanel`, and `buildNpcStatesSection`.
- **Imperative commit style:** `fix(59): lock /game shell to viewport; clean TS debt`.

## Sources

### Primary (HIGH confidence)
- `docs/ui_concept_hybrid.html` — project-owned reference implementation; `<body class="h-screen w-full flex overflow-hidden">` + aside pattern on lines 90, 98, 113, 190, 313, 349.
- `frontend/app/game/page.tsx` lines 919-1051 — current shell (direct read).
- `frontend/components/game/location-panel.tsx`, `character-panel.tsx`, `lore-panel.tsx`, `narrative-log.tsx` — panel structure (direct read).
- `frontend/components/ui/scroll-area.tsx` — Radix ScrollArea wrapper (direct read).
- `frontend/vitest.config.ts` + `frontend/__tests__/setup.ts` — test infra (direct read).
- `frontend/app/(non-game)/__tests__/layout.test.tsx` — established DOM-test pattern (direct read).
- `npm --prefix backend run typecheck` output — 40 pre-existing errors; Phase 59 touches 1-2.
- `frontend/package.json` — Tailwind v4, Next 16.1.6, React 19.2.3, Vitest 3.2.4 (direct read).

### Secondary (MEDIUM confidence)
- CSS flex + `min-height: auto` trap — well-known pattern in CSS community; confirmed by the behavior described in the concept file (explicit `overflow-hidden` on every ancestor).
- Tailwind v4 CSS-first config — verified via `frontend/postcss.config.mjs` using `@tailwindcss/postcss` plugin and absence of `tailwind.config.ts`.

### Tertiary (LOW confidence)
- None. This phase is fully grounded in project-internal code and an authoritative in-repo reference HTML.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in `package.json`, panel components read directly.
- Architecture / layout pattern: HIGH — concept HTML is in-repo reference; flex patterns are well-established CSS.
- Pitfalls: HIGH — (1) and (2) confirmed in code; (3) confirmed by jsdom docs and project's existing test strategy choices (PinchTab for visual); (4) already documented in project memory; (5) confirmed by reading error output + code.
- TS fix scope: HIGH — actual error is at `prompt-assembler.ts:786` (not :630 as brief said). Same error class appears at `target-context.ts:198`. 40 total backend errors, only 1-2 are in-scope for Phase 59.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable layout/test patterns; frontend deps are mature)
