---
phase: quick-260404-csj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/components/non-game-shell/shell-primitives.tsx
  - frontend/app/globals.css
  - frontend/components/character-creation/character-form.tsx
  - frontend/components/character-creation/character-card.tsx
autonomous: true
requirements: [PERF-CSS, PERF-TEXTAREA, BUG-MINH]

must_haves:
  truths:
    - "Character creation page typing is responsive (no visible lag on keystroke)"
    - "Shell frame renders without backdrop-blur compositing layer"
    - "Shell surfaces use opaque backgrounds (no alpha compositing chain)"
    - "CompactTextarea respects minH prop for appearance/backstory fields"
  artifacts:
    - path: "frontend/components/non-game-shell/shell-primitives.tsx"
      provides: "Performance-optimized shell primitives without backdrop-blur"
      contains: "ShellFrame"
    - path: "frontend/app/globals.css"
      provides: "Opaque shell CSS custom properties"
      contains: "--shell-frame-surface: rgb("
    - path: "frontend/components/character-creation/character-form.tsx"
      provides: "Native textarea in full mode (no field-sizing-content)"
    - path: "frontend/components/character-creation/character-card.tsx"
      provides: "CompactTextarea with minH support"
  key_links:
    - from: "frontend/components/non-game-shell/shell-primitives.tsx"
      to: "frontend/app/globals.css"
      via: "CSS custom properties (--shell-*)"
      pattern: "var\\(--shell-"
---

<objective>
Fix critical CSS compositing and React performance bottlenecks on the character creation page (and all non-game shell pages).

Purpose: Eliminate visible typing lag and paint jank caused by `backdrop-blur-xl` forcing GPU recomposition on every paint, alpha-channel surfaces creating cascading compositing chains, and shadcn Textarea's `field-sizing-content` triggering layout recalculation on every keystroke.

Output: Responsive character creation page with no compositing overhead; visually identical dark shell appearance using opaque equivalents.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/components/non-game-shell/shell-primitives.tsx
@frontend/app/globals.css
@frontend/components/character-creation/character-form.tsx
@frontend/components/character-creation/character-card.tsx

<interfaces>
<!-- Shell primitives: all components are simple div wrappers with className -->

From frontend/components/non-game-shell/shell-primitives.tsx:
```typescript
type DivProps = React.ComponentProps<"div">;
export function ShellFrame({ className, ...props }: DivProps) // line 10 — wraps entire app content
export function ShellNavigationRail({ className, ...props }: DivProps) // line 23
export function ShellMainPanel({ className, ...props }: DivProps) // line 36
export function ShellPanel({ className, ...props }: DivProps) // deprecated, line 50
export function ShellRail({ className, ...props }: DivProps) // deprecated, line 61
export function ShellActionTray({ title, description, children, className, ...props }: ShellActionTrayProps) // deprecated, line 77
```

From frontend/components/character-creation/character-card.tsx:
```typescript
function CompactTextarea({ value, onChange, placeholder, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder: string; maxLength?: number;
}) // line 56 — plain <textarea>, does NOT accept minH
```

From frontend/components/character-creation/character-form.tsx:
```typescript
// Line 105: uses shadcn <Textarea> (has field-sizing-content) for hero description box
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Kill CSS compositing bottlenecks in shell primitives and globals</name>
  <files>frontend/components/non-game-shell/shell-primitives.tsx, frontend/app/globals.css</files>
  <action>
**shell-primitives.tsx:**

1. **ShellFrame (line 15):** Remove `backdrop-blur-xl` from the className string. Reduce the massive shadow from `shadow-[0_32px_120px_rgba(0,0,0,0.35)]` to `shadow-[0_8px_30px_rgba(0,0,0,0.35)]` (120px blur radius -> 30px). Keep everything else (rounded, border, background var, overflow-hidden).

2. **shellSurfaceBase (line 7-8):** Remove `backdrop-blur-xl` from the shared base string. These are deprecated components but still used. Keep the rest (rounded, border, shadow).

3. **ShellMainPanel (line 41):** Replace the gradient+alpha background `[background:linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0)_100%),var(--shell-panel-surface)]` with just `[background:var(--shell-panel-surface)]`. The 2% white gradient overlay is imperceptible and adds a compositing layer.

**globals.css (lines 63-66):**

Replace alpha-channel shell surface CSS custom properties with pre-computed opaque equivalents (alpha-blended against #111114 base). Keep --shell-border as rgba (thin borders are fine):

```css
--shell-frame-surface: rgb(11, 11, 13);       /* was rgba(10,10,12,0.82) */
--shell-rail-surface: rgb(23, 23, 26);         /* was rgba(24,24,27,0.9) */
--shell-panel-surface: rgb(17, 17, 22);        /* was rgba(18,18,22,0.84) */
--shell-panel-muted: rgb(31, 31, 34);          /* was rgba(39,39,42,0.62) */
--shell-border: rgba(255, 255, 255, 0.08);     /* KEEP — thin borders are fine */
```

Do NOT touch --shell-highlight, --shell-highlight-strong, or --shell-backdrop (radial gradients are static, cached by browser).
  </action>
  <verify>
    <automated>npm --prefix frontend run lint</automated>
  </verify>
  <done>ShellFrame has no backdrop-blur-xl, shadow reduced to 30px, ShellMainPanel has no gradient overlay, all shell surface vars are opaque rgb(). Visual appearance is indistinguishable on dark background.</done>
</task>

<task type="auto">
  <name>Task 2: Fix character form textarea and CompactTextarea minH prop</name>
  <files>frontend/components/character-creation/character-form.tsx, frontend/components/character-creation/character-card.tsx</files>
  <action>
**character-form.tsx (line 105-111):**

Replace the shadcn `<Textarea>` import and usage with a plain `<textarea>` element. The shadcn Textarea adds `field-sizing-content` CSS which triggers layout recalculation on every keystroke.

Change:
```tsx
<Textarea
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={12}
  className="min-h-[clamp(200px,20vh,360px)] resize-none bg-zinc-800/50 border-zinc-700/50 font-mono text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600"
  placeholder="..."
  disabled={busy}
/>
```

To a plain `<textarea>` with equivalent styling (copy the exact same className, keep all props). Do NOT import or use the shadcn Textarea component. Remove the unused `Textarea` import if it becomes dead code.

**character-card.tsx:**

1. Add `minH` prop to `CompactTextarea` component (line 56-80). Add `minH?: string` to the props type. Apply it as `style={{ minHeight: minH }}` on the `<textarea>` element, which will override the default `min-h-[72px]` Tailwind class when provided.

2. Lines 196 and 205 already pass `minH="120px"` — these will now work correctly instead of being silently dropped as unknown HTML attributes.
  </action>
  <verify>
    <automated>npm --prefix frontend run lint</automated>
  </verify>
  <done>CharacterForm uses plain textarea (no field-sizing-content). CompactTextarea accepts and applies minH prop. Lines 196/205 minH="120px" correctly set minimum height on appearance/backstory textareas.</done>
</task>

</tasks>

<verification>
1. `npm --prefix frontend run lint` exits 0
2. `npm --prefix frontend run typecheck` exits 0 (if available) or build check passes
3. Visual inspection: character creation page loads, shell looks identical (dark surfaces, no visible change), typing in description textarea is responsive
</verification>

<success_criteria>
- No `backdrop-blur-xl` anywhere in shell-primitives.tsx
- No `rgba()` in --shell-frame-surface, --shell-rail-surface, --shell-panel-surface, --shell-panel-muted
- No shadcn Textarea import in character-form.tsx
- CompactTextarea type signature includes minH?: string
- Frontend lint passes clean
</success_criteria>

<output>
After completion, create `.planning/quick/260404-csj-fix-critical-page-performance-on-charact/260404-csj-SUMMARY.md`
</output>
