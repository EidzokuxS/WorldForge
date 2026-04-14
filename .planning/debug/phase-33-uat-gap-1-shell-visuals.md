---
status: diagnosed
trigger: "Diagnose UAT Gap 1 for Phase 33. Gap truth: Opening the app at `/` should show the redesigned non-game shell, with the launcher inside it and working navigation to `/campaign/new`, `/settings`, and `/library`. The old `/character-creation` and `/world-review` routes should no longer open the old pages. User-reported actual behavior: \"Это даже почти хорошо, но почему так всрато визуально...? Скругления разные, левый сайдбар квадратный, цвета перемешаны, всё невпопад.\" Goal: find_root_cause_only. Do not implement fixes."
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T00:18:00Z
---

## Current Focus

hypothesis: Confirmed. The non-game shell is assembled from incompatible primitive styles instead of one shell token contract, so radius and surface decisions diverge by component.
test: Compare implemented shell/sidebar/card primitives to the concept's single-panel language and global tokens.
expecting: Confirmed mismatch: square sidebar container, one-sided 32px main panel, 24px inset boxes, 16px cards/buttons, and multiple unrelated surface colors.
next_action: return diagnose-only report with concrete file-level causes

## Symptoms

expected: Opening `/` shows the redesigned non-game shell with a coherent desktop visual system and launcher navigation to `/campaign/new`, `/settings`, and `/library`; legacy `/character-creation` and `/world-review` should not surface old pages.
actual: The redesigned shell mostly appears, but the desktop UI is visually incoherent: radii differ, the left sidebar is square, colors are mixed, and the overall composition feels misaligned.
errors: "Это даже почти хорошо, но почему так всрато визуально...? Скругления разные, левый сайдбар квадратный, цвета перемешаны, всё невпопад."
reproduction: Open the app at `/` on desktop and inspect the redesigned non-game shell, sidebar, and workspace cards.
started: Observed during Phase 33 UAT verification of redesigned creation flows.

## Eliminated

## Evidence

- timestamp: 2026-04-01T00:05:00Z
  checked: .planning/debug/knowledge-base.md
  found: No prior debug knowledge base file exists for matching known visual-system issues.
  implication: This investigation needs to derive hypotheses directly from source and UAT artifacts.

- timestamp: 2026-04-01T00:07:00Z
  checked: docs/ui_concept_hybrid.html and frontend/app/globals.css
  found: The concept defines one "hybrid" dark palette and a `hybrid-panel` surface with 12px radius, glass background, and crisp borders; global CSS exposes dark palette tokens but only a generic `--radius` scale starting from 0.625rem.
  implication: The intended design language is centralized in the concept, but the implementation lacks a matching explicit shell token layer beyond generic theme variables.

- timestamp: 2026-04-01T00:09:00Z
  checked: frontend/components/non-game-shell/app-shell.tsx, frontend/components/non-game-shell/app-sidebar.tsx, and frontend/app/(non-game)/page.tsx
  found: `AppShell` uses hard-coded gradient backgrounds and `rounded-r-[32px]`; `AppSidebar` wraps content in `rounded-3xl`; launcher cards use default `Card` styling with `rounded-3xl` inner boxes and `bg-card`/`bg-muted` surfaces.
  implication: The shell frame, sidebar header card, and workspace cards already pull radius and surface styling from different sources instead of one shared token system.

- timestamp: 2026-04-01T00:13:00Z
  checked: frontend/components/ui/sidebar.tsx and frontend/components/non-game-shell/app-shell.tsx
  found: The shared `Sidebar` primitive renders the whole left rail as a plain rectangular aside with `border-r` and `bg-sidebar/85` but no rounding, while `AppShell` rounds only the right content panel with `rounded-r-[32px]`.
  implication: The square left sidebar is caused directly by layout structure, not by missing polish on child content; shell geometry is asymmetrical by design.

- timestamp: 2026-04-01T00:15:00Z
  checked: frontend/components/ui/card.tsx, frontend/components/ui/button.tsx, frontend/components/non-game-shell/sticky-action-bar.tsx, and frontend/app/(non-game)/page.tsx
  found: Non-game workspace surfaces mix `rounded-xl` cards, `rounded-md` buttons, `rounded-2xl` sidebar menu items, `rounded-3xl` launcher/sticky-action blocks, and a one-off `rounded-r-[32px]` content shell.
  implication: Radii are not token-governed at the shell level; they vary per primitive and per page, which produces the inconsistent rounding seen in UAT.

- timestamp: 2026-04-01T00:17:00Z
  checked: docs/ui_concept_hybrid.html, frontend/app/globals.css, frontend/components/ui/sidebar.tsx, and frontend/app/(non-game)/page.tsx
  found: The concept uses one hybrid dark panel language, but the implementation mixes a hard-coded shell background gradient, `bg-sidebar`, `bg-background`, `bg-card`, and `bg-muted` surfaces plus semantic accent aliases like `text-blood`/`text-bone` without a dedicated non-game shell token layer or tailwind config extension.
  implication: Color incoherence comes from combining generic shadcn theme tokens and ad hoc shell accents instead of mapping the concept to a single reusable set of shell surface/accent tokens.
## Resolution

root_cause: The redesigned non-game shell does not implement a single shared visual token system. Instead, it combines hard-coded shell layout styling in `AppShell`, default shadcn sidebar/card/button primitives, and page-level ad hoc classes. That creates asymmetric shell geometry (square sidebar + only-right-rounded content panel), mixed radius scales, and mismatched surface colors that drift away from the concept's single hybrid-panel language.
fix:
verification: Diagnosis confirmed from static source review of the required Phase 33 UAT artifact, shell components, UI primitives, and global theme tokens.
files_changed: []
