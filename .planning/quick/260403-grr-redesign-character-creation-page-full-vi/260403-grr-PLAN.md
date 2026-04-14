---
phase: quick
plan: 260403-grr
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/components/character-creation/character-form.tsx
  - frontend/components/character-creation/character-card.tsx
  - frontend/app/(non-game)/campaign/[id]/character/page.tsx
autonomous: true
requirements: [visual-redesign]

must_haves:
  truths:
    - "Character form has dossier-style section labels and cohesive textarea + action button layout"
    - "Character card is grouped into named sections (IDENTITY, PROFILE, CAPABILITIES, MOTIVATIONS, SOCIAL, STARTING CONDITIONS, EQUIPMENT)"
    - "All section labels use font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500"
    - "Character card container has corner accent gradient and border-border/30 bg-zinc-900/40 styling"
    - "HP hearts use brand red (text-blood) not generic red-500"
    - "Long text fields (persona, background, appearance) have line-clamp-3 with expand toggle"
    - "All existing functionality (every field, callback, prop) remains intact"
  artifacts:
    - path: "frontend/components/character-creation/character-form.tsx"
      provides: "Dossier-styled character input form"
    - path: "frontend/components/character-creation/character-card.tsx"
      provides: "Sectioned dossier-style editable character sheet"
    - path: "frontend/app/(non-game)/campaign/[id]/character/page.tsx"
      provides: "Page layout with pinned footer"
  key_links:
    - from: "character-form.tsx"
      to: "page.tsx"
      via: "onParse, onGenerate, onImport callbacks"
      pattern: "onParse|onGenerate|onImport"
    - from: "character-card.tsx"
      to: "page.tsx"
      via: "onChange, onResolveStartingLocation, onPreviewLoadout, onApplyPersonaTemplate callbacks"
      pattern: "onChange|onResolveStartingLocation|onPreviewLoadout|onApplyPersonaTemplate"
---

<objective>
Redesign the character creation page to match the premium dossier-style flat-layout design language established in the NPC card redesign. Apply consistent section headers, corner accents, clamp-based spacing, font-mono labels, and line-clamp expand toggles across CharacterForm, CharacterCard, and the page shell.

Purpose: Visual consistency with the rest of the redesigned non-game UI.
Output: Three updated component files with dossier design language applied.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/components/character-creation/character-form.tsx
@frontend/components/character-creation/character-card.tsx
@frontend/app/(non-game)/campaign/[id]/character/page.tsx
@frontend/components/character-creation/character-workspace.tsx
@frontend/components/world-review/npcs-section.tsx (reference design language)

<interfaces>
<!-- Design language tokens (from NPC card in npcs-section.tsx) -->
Section label: font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500
Container: border border-border/30 rounded-lg bg-zinc-900/40
Corner accent: before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-24 before:w-24 before:rounded-br-full before:bg-[radial-gradient(ellipse_at_top_left,rgba(230,62,0,0.12)_0%,transparent_70%)]
Name input: !border-0 !bg-transparent !shadow-none px-2 font-mono text-[clamp(13px,0.9vw,16px)] uppercase tracking-widest text-zinc-100
Clamp spacing: p-[clamp(16px,1.4vw,28px)], gap-[clamp(12px,1vw,20px)]
Goals prefix: "►" with font-mono text-[11px] text-zinc-500
Tag editor: rounded-sm border border-zinc-700 bg-zinc-800 font-mono text-[11px] text-zinc-300
Footer: mt-auto with shrink-0

<!-- CharacterCard props (must all be preserved) -->
From character-card.tsx:
```typescript
interface CharacterCardProps {
  draft: CharacterDraft;
  locationNames: string[];
  personaTemplates?: PersonaTemplateSummary[];
  previewLoadout?: LoadoutPreviewResult | null;
  previewingLoadout?: boolean;
  applyingTemplateId?: string | null;
  resolvingStartingLocation?: boolean;
  onChange: (draft: CharacterDraft) => void;
  onResolveStartingLocation: () => void;
  onPreviewLoadout?: () => void;
  onApplyPersonaTemplate?: (templateId: string) => void;
}
```

From character-form.tsx:
```typescript
interface CharacterFormProps {
  onParse: (description: string) => void;
  onGenerate: () => void;
  onImport: (file: File, importMode: CharacterImportMode) => void;
  parsing: boolean;
  generating: boolean;
  importing: boolean;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign CharacterForm with dossier design language</name>
  <files>frontend/components/character-creation/character-form.tsx</files>
  <action>
Rewrite the CharacterForm visual layout while preserving ALL existing props, state, and callbacks:

1. **Outer container**: Replace `space-y-4` with dossier-styled container:
   - `border border-border/30 rounded-lg bg-zinc-900/40 p-[clamp(16px,1.4vw,28px)]`
   - Add `relative overflow-hidden` for potential accent

2. **Section label** for the description area:
   - Replace the current `Label` + `p` with a single section label: `<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">CHARACTER CONCEPT</span>`
   - Keep the helper text below it but style as `text-[11px] text-zinc-600 mt-1`

3. **Textarea**: Style the description textarea:
   - `resize-none bg-zinc-800/50 border-zinc-700/50 font-mono text-[13px] text-zinc-200 placeholder:text-zinc-600`
   - Keep rows={6}, disabled={busy}

4. **Action buttons row**: Group into a cohesive action bar:
   - Wrap in `flex flex-wrap items-end gap-[clamp(8px,0.6vw,12px)] mt-[clamp(12px,1vw,20px)]`
   - Parse button: primary style (keep current default variant)
   - AI Generate button: keep outline variant
   - Import V2 Card button: keep outline variant
   - **Import mode dropdown**: Move INLINE next to the Import button as a compact select:
     - Wrap Import button + dropdown in a `flex items-center gap-2` group
     - Remove the standalone Label "Import integration" — use a compact select with no label, just the value shown
     - `SelectTrigger` with `h-9 w-[140px] text-[11px] font-mono`
   - Remove the separate `min-w-[240px] space-y-1` div wrapping the dropdown

5. **Preserve**: All state (description, importMode), all refs (fileInputRef), all callbacks, all busy states, hidden file input.

Do NOT change the component interface (CharacterFormProps). Do NOT change any callback logic.
  </action>
  <verify>
    <automated>npm --prefix frontend run typecheck</automated>
  </verify>
  <done>CharacterForm renders with dossier container, mono section labels, styled textarea, and cohesive inline action bar with integrated import mode dropdown. All 3 creation methods still functional.</done>
</task>

<task type="auto">
  <name>Task 2: Redesign CharacterCard with sectioned dossier layout</name>
  <files>frontend/components/character-creation/character-card.tsx</files>
  <action>
Rewrite CharacterCard visual layout while preserving ALL existing props, state, callbacks, and field bindings. The component must group fields into logical dossier sections.

**Add ExpandableText helper** (inline in the same file, above the main component):
```tsx
function ExpandableText({ value, onChange, placeholder, minH, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder: string; minH: string; maxLength?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "bg-zinc-800/50 border-zinc-700/50 text-[13px] text-zinc-200 placeholder:text-zinc-600",
          !expanded && "line-clamp-3 max-h-[4.5em] overflow-hidden"
        )}
        style={{ minHeight: expanded ? minH : undefined }}
        maxLength={maxLength}
      />
      {value.length > 120 && (
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="mt-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300">
          {expanded ? "collapse" : "expand..."}
        </button>
      )}
    </div>
  );
}
```
Add `import { cn } from "@/lib/utils"` if not already imported.

**Section label helper** (inline):
```tsx
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">{children}</span>;
}
```

**Field label helper** (replaces all `<Label className="text-xs text-muted-foreground">`):
```tsx
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">{children}</span>;
}
```

**Outer container**: Replace `<div className="space-y-4">` with:
```
<div className="relative flex flex-col gap-[clamp(16px,1.4vw,28px)] overflow-hidden border border-border/30 rounded-lg bg-zinc-900/40 p-[clamp(16px,1.4vw,28px)] before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-24 before:w-24 before:rounded-br-full before:bg-[radial-gradient(ellipse_at_top_left,rgba(230,62,0,0.12)_0%,transparent_70%)]">
```

**Group fields into sections** (each section = `<div>` with a `<SectionLabel>` and content):

1. **IDENTITY** section:
   - Name input: `!border-0 !bg-transparent !shadow-none px-2 font-mono text-[clamp(13px,0.9vw,16px)] uppercase tracking-widest text-zinc-100`
   - Race / Gender / Age in a 3-col grid (keep current layout, update label to FieldLabel)

2. **PROFILE** section:
   - Appearance: Use ExpandableText (maxLength={1000})
   - Background + Persona side by side in `grid gap-[clamp(12px,1vw,20px)] md:grid-cols-2`: both use ExpandableText

3. **CAPABILITIES** section:
   - Traits + Flaws in 2-col grid with FieldLabel

4. **MOTIVATIONS** section:
   - Drives + Frictions in 2-col grid with FieldLabel
   - Short-term Goals + Long-term Goals in 2-col grid with FieldLabel
   - Goal items should render with `►` prefix: in StringListEditor display, add prefix styling via a wrapper or note to apply `font-mono text-[11px] text-zinc-500` for the bullet prefix

5. **SOCIAL** section:
   - Social Status with FieldLabel (keep TagEditor)

6. **STATUS** section:
   - HP + Starting Location in 2-col grid
   - HP hearts: change `text-red-500` to `text-blood` (brand red)
   - HP hearts: change `text-muted-foreground/30` to `text-zinc-700`
   - HP counter: `font-mono text-[11px] text-zinc-500`
   - Persona Template sub-section (only if personaTemplates.length > 0): keep existing logic, restyle border to `border-zinc-700/50 bg-zinc-800/30 rounded-lg p-[clamp(12px,1vw,16px)]`

7. **STARTING CONDITIONS** section:
   - Starting Situation block: keep all sub-fields (sourcePrompt textarea, arrivalMode, visibility, immediateSituation, entryPressure, companions, resolvedNarrative)
   - "Apply Start" button stays in section header row
   - All inputs get `bg-zinc-800/50 border-zinc-700/50 text-[13px] text-zinc-200`

8. **EQUIPMENT** section:
   - Equipped Items with StringListEditor
   - "Preview Loadout" button in section header row
   - Canonical preview box: `border-zinc-700/50 bg-zinc-800/30 rounded-lg p-3 text-[13px]`
   - Signature items line: `font-mono text-[11px] text-zinc-500`

**All Input/Textarea fields**: Apply consistent styling:
- `bg-zinc-800/50 border-zinc-700/50 text-[13px] text-zinc-200 placeholder:text-zinc-600`

**Preserve**: ALL existing state (selectedTemplateId), ALL patch/update functions, ALL event handlers, ALL conditional rendering (persona templates, previewLoadout, signatureItems, resolvedNarrative). CharacterCardProps interface unchanged.

Do NOT remove any fields. Do NOT change any onChange logic. Do NOT change the component interface.
  </action>
  <verify>
    <automated>npm --prefix frontend run typecheck</automated>
  </verify>
  <done>CharacterCard renders as a dossier with corner accent, 8 named sections (IDENTITY through EQUIPMENT), mono labels, expandable long text fields, brand-red HP hearts. All fields editable, all callbacks functional, all conditional sections present.</done>
</task>

<task type="auto">
  <name>Task 3: Polish page layout and workspace container</name>
  <files>frontend/app/(non-game)/campaign/[id]/character/page.tsx, frontend/components/character-creation/character-workspace.tsx</files>
  <action>
Minor layout polish on the page orchestrator and workspace:

1. **CharacterWorkspace** (character-workspace.tsx):
   - Keep the simple flex container but add `gap-[clamp(16px,1.4vw,28px)]` to the className

2. **page.tsx** — adjust the page layout around CharacterCard:
   - The `grid grid-cols-[1fr_clamp(260px,20vw,340px)]` wrapping CharacterCard: REMOVE this grid. CharacterCard is a single full-width dossier now, not a 2-column layout. Replace with a simple `<div className="mt-[clamp(16px,1.4vw,28px)]">`.
   - The empty-state placeholder ("Use the entry methods above..."): style as `font-mono text-[11px] text-zinc-600 mt-[clamp(16px,1.4vw,28px)]`
   - Footer: ensure `shrink-0` on the footer div and `mt-auto` for pinning
   - "Save & Begin Adventure" button: keep existing `bg-blood text-white hover:bg-blood/90`
   - "Back to Review" button: keep ghost variant

3. **Do NOT change**: Any state, callbacks, useEffect, imports (except adding/removing as needed for layout), or conditional rendering logic. The page is pure orchestration and must remain so.
  </action>
  <verify>
    <automated>npm --prefix frontend run typecheck</automated>
  </verify>
  <done>Page renders CharacterCard full-width (no 2-column grid), workspace has clamp-based gap, footer is pinned with shrink-0 + mt-auto. All page functionality preserved.</done>
</task>

</tasks>

<verification>
- `npm --prefix frontend run typecheck` exits 0
- `npm --prefix frontend run lint` exits 0
- All existing test suites pass: `npx --prefix frontend vitest run --reporter=verbose components/character-creation/`
</verification>

<success_criteria>
- CharacterForm: dossier container, mono section label, styled textarea, inline action bar with integrated import dropdown
- CharacterCard: corner accent, 8 named sections with mono uppercase labels, expandable long text, brand-red HP hearts, all fields and callbacks intact
- Page: full-width card layout (no 2-col grid), pinned footer, clamp-based spacing
- Zero TypeScript errors, zero lint errors, existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260403-grr-redesign-character-creation-page-full-vi/260403-grr-SUMMARY.md`
</output>
