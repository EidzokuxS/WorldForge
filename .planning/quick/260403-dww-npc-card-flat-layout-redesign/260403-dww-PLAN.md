---
phase: quick
plan: 260403-dww
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/components/world-review/npcs-section.tsx
  - frontend/components/world-review/__tests__/npcs-section.test.tsx
autonomous: true
requirements: [QUICK-NPC-FLAT]
must_haves:
  truths:
    - "NPC cards render as flat div containers with border border-border/40 and clamp-based spacing instead of Card/CardHeader/CardContent wrappers"
    - "All 3 NPC creation modes (describe, import V2, AI generate) work identically to before"
    - "Tag editors, string list editors, delete buttons, duplicate name warnings all preserved"
    - "Persona template section preserved for NPCs when personaTemplates prop is non-empty"
    - "Existing tests pass without Card-dependent assertions"
  artifacts:
    - path: "frontend/components/world-review/npcs-section.tsx"
      provides: "Flat-layout NPC cards without Card/CardHeader/CardContent imports"
      min_lines: 600
    - path: "frontend/components/world-review/__tests__/npcs-section.test.tsx"
      provides: "Passing tests for flat layout NPC rendering"
  key_links:
    - from: "npcs-section.tsx"
      to: "tag-editor, string-list-editor, regenerate-dialog"
      via: "import and render"
      pattern: "TagEditor|StringListEditor|RegenerateDialog"
---

<objective>
Replace Card/CardHeader/CardContent Shadcn wrappers in npcs-section.tsx with plain div + border border-border/40 rounded-lg + clamp-based responsive spacing, matching the pattern already applied to providers-tab.tsx and other settings tabs in Phase 32.

Purpose: Visual consistency with the desktop-first flat layout redesign across all non-game shell pages.
Output: Updated npcs-section.tsx with flat layout, passing tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/components/world-review/npcs-section.tsx
@frontend/components/world-review/__tests__/npcs-section.test.tsx
@frontend/components/settings/providers-tab.tsx (reference pattern — lines 225-240 show flat card style)

<interfaces>
<!-- Flat layout pattern from providers-tab.tsx (the target style): -->

Container spacing:
```
className="space-y-[clamp(12px,1vw,20px)]"
```

Individual card:
```
className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]"
```

Header area inside card:
```
className="mb-[clamp(12px,1vw,20px)] flex items-start justify-between gap-3"
```

Title text:
```
className="text-[clamp(14px,1vw,18px)] font-semibold text-bone"
```

Inner content spacing:
```
className="space-y-[clamp(8px,0.7vw,14px)]"
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace Card wrappers with flat div layout in npcs-section.tsx</name>
  <files>frontend/components/world-review/npcs-section.tsx</files>
  <action>
1. Remove Card, CardContent, CardHeader imports from "@/components/ui/card".

2. Replace each NPC's `<Card>` wrapper (line ~266) with a plain div using the flat layout pattern:
   ```
   <div key={npc._uid ?? `npc-fallback-${index}`} className="relative rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
   ```

3. Replace `<CardHeader className="pb-2 pr-10">` (line ~274) with a plain div that serves as the header area:
   ```
   <div className="mb-[clamp(8px,0.6vw,14px)] pr-10">
   ```
   Keep the name Input and duplicate-name warning inside it exactly as-is.

4. Replace `<CardContent className="space-y-3">` (line ~296) with:
   ```
   <div className="space-y-[clamp(8px,0.7vw,14px)]">
   ```
   Keep ALL children inside it unchanged: persona template section, background/persona textareas, traits/flaws/drives/frictions tag editors, social status tags, short/long-term goal string list editors, location/faction selects, and start conditions info block.

5. Close the corresponding divs properly (replace `</CardHeader>`, `</CardContent>`, `</Card>` with `</div>`).

6. Update the NPC name Input to use the flat layout title style:
   ```
   className="font-serif text-[clamp(14px,1vw,18px)] font-bold"
   ```

7. Update the grid container wrapping all NPC cards (line ~260) to use clamp spacing:
   ```
   className="grid grid-cols-1 gap-[clamp(12px,1vw,20px)] lg:grid-cols-2"
   ```

8. Verify no remaining imports or references to Card, CardContent, or CardHeader exist in the file.

All functionality must remain identical: 3 NPC creation modes, tag editors, string list editors, delete button, duplicate name warnings, persona template section.
  </action>
  <verify>
    <automated>npm --prefix frontend run lint && npx --prefix frontend vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx</automated>
  </verify>
  <done>NPC cards render with plain div + border border-border/40 + clamp spacing. No Card/CardHeader/CardContent imports remain. All existing tests pass. Lint clean.</done>
</task>

<task type="auto">
  <name>Task 2: Verify test assertions still valid for flat layout</name>
  <files>frontend/components/world-review/__tests__/npcs-section.test.tsx</files>
  <action>
1. Review the existing test file for any assertions that depend on Card component structure (e.g., role="article" or Card-specific ARIA). Current tests use `getByDisplayValue`, `getByText`, and `getAllByText` which are content-based and should survive the layout change.

2. If any test fails due to the Card removal, update the test to use content-based selectors that work with the flat div layout. The existing tests should pass as-is since they query by text content and display values, not by Card component structure.

3. Run the full test suite to confirm no regressions.
  </action>
  <verify>
    <automated>npx --prefix frontend vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx</automated>
  </verify>
  <done>All 5 existing NpcsSection tests pass with the flat layout. No Card-dependent assertions remain.</done>
</task>

</tasks>

<verification>
- `npm --prefix frontend run lint` exits 0
- `npx --prefix frontend vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx` — all tests pass
- No `Card`, `CardHeader`, `CardContent` imports remain in npcs-section.tsx
- Visual: NPC cards use border-border/40, rounded-lg, clamp-based padding matching providers-tab.tsx pattern
</verification>

<success_criteria>
- npcs-section.tsx uses flat div layout with clamp-based responsive spacing
- Zero Card/CardHeader/CardContent imports
- All 3 NPC creation modes functional (describe, import V2, AI generate)
- All tag editors, string list editors, delete, duplicate warnings preserved
- All existing tests pass
- Lint clean
</success_criteria>

<output>
After completion, create `.planning/quick/260403-dww-npc-card-flat-layout-redesign/260403-dww-SUMMARY.md`
</output>
