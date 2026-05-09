---
phase: 63-personality-interiority-model
plan: 04
slug: ui
type: execute
wave: 2
status: draft
depends_on: [63-01]
files_modified:
  - frontend/components/world-review/personality-section.tsx
  - frontend/components/world-review/npcs-section.tsx
  - frontend/components/character-creation/character-card.tsx
  - frontend/components/character-creation/character-form.tsx
  - frontend/components/world-review/character-record-inspector.tsx
  - frontend/components/world-review/__tests__/personality-section.test.tsx
  - frontend/components/world-review/__tests__/character-record-inspector.test.tsx
  - frontend/components/world-review/__tests__/npcs-section.test.tsx
  - frontend/components/character-creation/__tests__/character-card.identity.test.tsx
autonomous: true
requirements: [P63-R4, P63-R5]
must_haves:
  truths:
    - "PersonalitySection atom renders summary + voice always; sampleLines/decisionStyle/worldview/internalContradictions/personalMythology behind a Collapsible"
    - "NPC card in npcs-section.tsx renders the PERSONALITY section between Tags and Power Stats"
    - "Player CharacterCard renders PersonalitySection alongside existing identity fields"
    - "Advanced inspector (character-record-inspector.tsx) drops every binding to motives/pressureResponses/taboos/traits/flaws/legacyTags + entire Provenance section (10 → 9 sections)"
    - "Character form (character-form.tsx) drops the trait/flaw TagTokens editors"
    - "All associated Vitest suites updated; no IP franchise names in fixtures"
  artifacts:
    - path: frontend/components/world-review/personality-section.tsx
      provides: "Shared PersonalitySection atom (matches PowerStatsSection pattern from Phase 61)"
      min_lines: 40
      contains: "PersonalitySection"
    - path: frontend/components/world-review/npcs-section.tsx
      provides: "PERSONALITY section integrated into NPC card render between Tags and PowerStatsSection"
      contains: "PersonalitySection"
    - path: frontend/components/character-creation/character-card.tsx
      provides: "PersonalitySection rendered on player character card"
      contains: "PersonalitySection"
    - path: frontend/components/world-review/character-record-inspector.tsx
      provides: "Inspector with 9 sections (Provenance dropped); no motives/traits/flaws/legacyTags bindings"
    - path: frontend/components/character-creation/character-form.tsx
      provides: "Trait/flaw TagTokens removed from creation form"
    - path: frontend/components/world-review/__tests__/personality-section.test.tsx
      provides: "Vitest coverage for P63-R4 (RTL)"
    - path: frontend/components/world-review/__tests__/character-record-inspector.test.tsx
      provides: "Updated test asserts 9-section order (was 10) and absence of dropped fields (P63-R5)"
  key_links:
    - from: frontend/components/world-review/npcs-section.tsx
      to: frontend/components/world-review/personality-section.tsx
      via: "import + render between Tags and PowerStatsSection"
      pattern: "PersonalitySection"
    - from: frontend/components/character-creation/character-card.tsx
      to: frontend/components/world-review/personality-section.tsx
      via: "import + render alongside identity fields"
      pattern: "PersonalitySection"
---

<objective>
Surface the new personality block in the basic NPC card + player CharacterCard, and drop every duplicated/deprecated field from the advanced inspector + character form.

Purpose: After 63-02 + 63-03 the data and prompts are personality-aware end-to-end. The user-visible UI still shows the old motives/taboos/pressureResponses fields in the inspector and has no PERSONALITY section on the basic NPC card. This plan closes the visible gap. Per CONTEXT.md the basic card gets a new always-visible PERSONALITY section between Tags and Power Stats with collapsible details; the advanced inspector drops the deprecated fields and the entire Provenance section (10 → 9 sections); the character form drops the trait/flaw editors (they duplicate Basic Tags).

Crucially this plan also updates the Phase 62 P62-R2-pinning test (`character-record-inspector.test.tsx`) which currently locks the inspector at exactly 10 sections including Provenance. After this plan it asserts 9 sections.

Output:
- New `PersonalitySection` shared atom (matches Phase 61 `PowerStatsSection` convention)
- NPC card + player CharacterCard render the section
- Advanced inspector cleaned up; Provenance section dropped
- Character form trait/flaw editors removed
- Test fixtures use original-world names only (no IP franchise names per P62-R5 lock)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@.planning/phases/63-personality-interiority-model/63-RESEARCH.md
@.planning/phases/63-personality-interiority-model/63-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-01-foundation-PLAN.md
@CLAUDE.md
@frontend/components/world-review/npcs-section.tsx
@frontend/components/world-review/character-record-inspector.tsx
@frontend/components/character-creation/character-card.tsx
@frontend/components/character-creation/character-form.tsx
@frontend/components/character-creation/power-stats-section.tsx

<interfaces>
<!-- New PersonalitySection contract (RESEARCH §6.1): -->
```tsx
interface PersonalitySectionProps {
  personality: CharacterPersonality | undefined;
}

// Render rules:
// - When personality is undefined OR all 7 fields empty: render NOTHING (return null).
// - When summary or voice present: render section header + always-visible summary + voice line.
// - Collapsible reveal: sampleLines, decisionStyle, worldview, internalContradictions, personalMythology.
// - data-shell-region="personality" for shell-test hooks (Phase 33 convention).
// - Use opaque rgb() surfaces (no backdrop-blur per `feedback_backdrop_blur_perf.md`).
// - Use shadcn Collapsible primitive OR a simple useState toggle with ChevronDown lucide icon.
// - Sample lines render as italic blockquotes with quote marks.
// - Internal contradictions render as a bulleted list.
```

<!-- Inspector cleanup contract (RESEARCH §6.2 + CONTEXT.md):
   Sections drop: 10 → 9. Provenance section removed entirely. Inside Identity Core: motives/pressureResponses/taboos/attachments removed. Inside Capabilities: traits/flaws removed. legacyTags removed everywhere.
-->
```ts
// Updated section order (9 sections):
// 1. Overview, 2. Identity Core (no motives/taboos/pressure/attachments), 3. Profile, 4. Live Dynamics,
// 5. Capabilities (no traits/flaws), 6. Runtime & State, 7. Loadout, 8. Starting Conditions, 9. Raw JSON.
// Provenance dropped entirely; sourceKind stays as Overview badge per Phase 62 decision.
```
</interfaces>

<project_conventions>
- Frontend uses Next.js + Tailwind + Shadcn UI (CLAUDE.md).
- Phase 61 established the shared-atom pattern: `frontend/components/character-creation/power-stats-section.tsx` is the reference convention. PersonalitySection lives under `world-review/` (not `character-creation/`) because the basic NPC card is the primary surface (CONTEXT.md "Basic NPC card" first, "player CharacterCard" reuse).
- Phase 33 established `data-shell-region` + `data-shell-surface` semantic hooks for shell-region tests; honor them on the new section.
- Aesthetic per P61-R5: zinc-950/900/800/700 charcoal palette, blood accent only for primary actions, Inter sans + Playfair Display serif headings, font-mono small-caps microcopy, opaque `rgb()` surfaces (NO backdrop-blur on shell).
- P62-R5 fixture lock: NO IP franchise names (Naruto, Sasuke, Uchiha, Sharingan, Konoha, Gojo, Jujutsu, Saiyan, Luffy, Airbender, Geralt, Jedi, Sith, Hogwarts) in any test fixture. Use original-world names: "Commander Kael", "Dunespire Hold", "Wind Cutting", etc.
- Vitest exposed via `npm --prefix frontend test` per Phase 62 alias fix.
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-task gitnexus impact analysis</name>
  <files>(no edits — analysis only)</files>
  <action>
Per CLAUDE.md, before any edits:
- `gitnexus_impact({target: "CharacterRecordInspector", direction: "upstream"})` (component is exported from inspector tsx)
- `gitnexus_context({name: "CharacterRecordInspector"})`
- `gitnexus_context({name: "PowerStatsSection"})` — to mirror the shared-atom convention
- `gitnexus_impact({target: "NpcCard", direction: "upstream"})` if such a component exists; otherwise grep `npcs-section.tsx` for the NPC card render block

Capture readers. The inspector + form are leaf components; risk should be MEDIUM (not HIGH) because no other component imports their internals.

If gitnexus reports stale → `npx gitnexus analyze` first.
  </action>
  <verify>
    <automated>node -e "console.log('gitnexus impact captured for: CharacterRecordInspector, PowerStatsSection, NpcCard')"</automated>
  </verify>
  <done>Reader sets captured.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PersonalitySection shared atom + Vitest RTL suite (P63-R4)</name>
  <files>
frontend/components/world-review/personality-section.tsx
frontend/components/world-review/__tests__/personality-section.test.tsx
  </files>
  <behavior>
Test cases (RESEARCH §9.1 + CONTEXT.md UI section):
- Renders nothing (returns null) when `personality` prop is undefined.
- Renders nothing when all 7 fields are empty/falsy.
- Always-visible: when `summary` is non-empty, renders the section header "Personality" + the summary text.
- Always-visible: when `voice` is non-empty, renders a one-line `Voice:` blurb in font-mono small-caps.
- Collapsible closed by default (no fixture text from sampleLines/decisionStyle/worldview/internalContradictions/personalMythology visible in DOM initially).
- Click on the toggle button reveals the collapsible content; sampleLines render as italic blockquotes; contradictions render as bulleted list; decisionStyle/worldview/personalMythology render as `Label: value` lines.
- ARIA: toggle button has `aria-expanded` reflecting state; section has `data-shell-region="personality"`.
- Edge case: only `sampleLines` set (no summary/voice) — header still renders so user can expand and see the lines.
- Original-world fixtures only (no franchise names per P62-R5 lock).
  </behavior>
  <action>
1. Create `frontend/components/world-review/personality-section.tsx`. Reference `frontend/components/character-creation/power-stats-section.tsx` for the shared-atom shape.

   Skeleton (refine per project's existing UI primitives):
   ```tsx
   "use client";
   import { useState } from "react";
   import { ChevronDown } from "lucide-react";
   import type { CharacterPersonality } from "@worldforge/shared";
   import { cn } from "@/lib/utils";

   interface PersonalitySectionProps {
     personality: CharacterPersonality | undefined;
   }

   export function PersonalitySection({ personality }: PersonalitySectionProps) {
     const [open, setOpen] = useState(false);
     if (!personality) return null;
     const hasContent = Boolean(
       personality.summary || personality.voice || personality.sampleLines?.length ||
       personality.decisionStyle || personality.worldview ||
       personality.internalContradictions?.length || personality.personalMythology
     );
     if (!hasContent) return null;
     return (
       <section data-shell-region="personality" className="border-t border-zinc-800 pt-3">
         <div className="flex items-center justify-between">
           <h4 className="font-serif text-sm uppercase tracking-wide text-zinc-300">Personality</h4>
           <button
             onClick={() => setOpen((v) => !v)}
             aria-expanded={open}
             aria-controls="personality-details"
             className="text-zinc-400 hover:text-zinc-200"
           >
             <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
           </button>
         </div>
         {personality.summary && (
           <p className="mt-1 text-sm text-zinc-200">{personality.summary}</p>
         )}
         {personality.voice && (
           <p className="mt-1 text-xs font-mono uppercase tracking-wider text-zinc-400">
             Voice: {personality.voice}
           </p>
         )}
         {open && (
           <div id="personality-details" className="mt-2 space-y-2 text-sm">
             {personality.sampleLines?.length ? (
               <div>
                 <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Sample lines</span>
                 <ul className="mt-1 space-y-1">
                   {personality.sampleLines.map((line, i) => (
                     <li key={i} className="italic text-zinc-300 border-l-2 border-zinc-700 pl-2">
                       &ldquo;{line}&rdquo;
                     </li>
                   ))}
                 </ul>
               </div>
             ) : null}
             {personality.decisionStyle && (
               <p><span className="text-zinc-500">Decision style:</span> <span className="text-zinc-200">{personality.decisionStyle}</span></p>
             )}
             {personality.worldview && (
               <p><span className="text-zinc-500">Worldview:</span> <span className="text-zinc-200">{personality.worldview}</span></p>
             )}
             {personality.internalContradictions?.length ? (
               <div>
                 <span className="text-zinc-500">Contradictions</span>
                 <ul className="mt-1 list-disc list-inside text-zinc-300">
                   {personality.internalContradictions.map((c, i) => <li key={i}>{c}</li>)}
                 </ul>
               </div>
             ) : null}
             {personality.personalMythology && (
               <p><span className="text-zinc-500">Mythology:</span> <span className="text-zinc-200">{personality.personalMythology}</span></p>
             )}
           </div>
         )}
       </section>
     );
   }
   ```

2. Create `frontend/components/world-review/__tests__/personality-section.test.tsx`. Use `@testing-library/react` (mirror existing tests in this dir). Build a `makePersonality(overrides)` factory; assert each behavior bullet.

   Original-world fixture sample (P62-R5 compliance):
   ```ts
   const sample: CharacterPersonality = {
     summary: "A weather-beaten scout from Dunespire Hold, sworn to the dawn watch.",
     voice: "Curt, military jargon, rare metaphors from hunting; avoids personal pronouns.",
     decisionStyle: "Acts first, justifies later; trusts terrain reads.",
     worldview: "Pragmatist; the desert keeps no promises.",
     internalContradictions: ["Believes loyalty is bedrock, but lies to her captain about troop counts."],
     personalMythology: "I am the eyes of the regiment.",
     sampleLines: ["Move out, on me.", "State your business."],
   };
   ```
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run "personality-section"</automated>
  </verify>
  <done>PersonalitySection atom + Vitest RTL suite both exist; all behavior cases pass; P63-R4 covered.</done>
</task>

<task type="auto">
  <name>Task 3: NPC card integration (npcs-section.tsx) + Vitest update</name>
  <files>
frontend/components/world-review/npcs-section.tsx
frontend/components/world-review/__tests__/npcs-section.test.tsx
  </files>
  <action>
Pre-task: locate the NPC card render block. RESEARCH §6.1 references "line ~877" in npcs-section.tsx. Search for the existing tag rendering and `PowerStatsSection` import — the new section sits BETWEEN them (CONTEXT.md "Tags and Power Stats" placement).

1. Edit `frontend/components/world-review/npcs-section.tsx`:
   - Add `import { PersonalitySection } from "./personality-section";` at the top.
   - In the NPC card render, locate the position immediately after the Tags block and immediately before the `<PowerStatsSection ... />` render. Insert `<PersonalitySection personality={npc.identity?.personality} />`.
   - The exact prop accessor depends on how the NPC object is shaped at this point — confirm via grep that the NPC variable is the `CharacterDraft`/`ScaffoldNpc`-derived shape with `identity.personality`. If the NPC at this render site is a derived view-model (`NpcCardData` etc.), update the view-model assembly upstream to include `personality`.

2. Update `frontend/components/world-review/__tests__/npcs-section.test.tsx` per RESEARCH §9.2 last row: add an assertion that the PERSONALITY section renders between Tags and Power Stats. Use the original-world fixture from Task 2.

   Suggested assertion pattern:
   ```ts
   const card = screen.getByTestId("npc-card-<id>"); // or similar existing selector
   const sections = within(card).getAllByRole("region"); // or use data-shell-region matcher
   const tagsIdx = sections.findIndex(s => s.dataset.shellRegion === "tags");
   const personalityIdx = sections.findIndex(s => s.dataset.shellRegion === "personality");
   const powerStatsIdx = sections.findIndex(s => s.dataset.shellRegion === "power-stats");
   expect(personalityIdx).toBeGreaterThan(tagsIdx);
   expect(personalityIdx).toBeLessThan(powerStatsIdx);
   ```
   Adjust selectors to match the existing test file's conventions.
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run "npcs-section"</automated>
  </verify>
  <done>NPC card renders PERSONALITY section between Tags and Power Stats; updated test passes.</done>
</task>

<task type="auto">
  <name>Task 4: Player CharacterCard integration + identity test update</name>
  <files>
frontend/components/character-creation/character-card.tsx
frontend/components/character-creation/__tests__/character-card.identity.test.tsx
  </files>
  <action>
Per RESEARCH §6.1 last paragraph + §9.2:

1. Edit `frontend/components/character-creation/character-card.tsx`:
   - Add `import { PersonalitySection } from "@/components/world-review/personality-section";` (path style matches the project's existing absolute imports; check existing imports in this file).
   - Locate where `behavioralCore.selfImage` is currently rendered (RESEARCH cites line 110). Insert `<PersonalitySection personality={draft.identity?.personality} />` near that area (specifically: after self-image / persona summary, before any other identity-detail block, mirroring the NPC card placement).

2. Update `frontend/components/character-creation/__tests__/character-card.identity.test.tsx`:
   - Add an assertion: `expect(screen.queryByText(/Personality/i)).toBeInTheDocument()` when fixture has populated personality, OR `not.toBeInTheDocument()` when personality is undefined.
   - Per RESEARCH §9.2: drop any old `behavioralCore` field assertions if they exist (the basic card no longer renders motives/pressure/taboos either).
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run "character-card"</automated>
  </verify>
  <done>Player CharacterCard renders PersonalitySection; identity test asserts presence.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Advanced inspector cleanup — drop deprecated fields + Provenance section (P63-R5)</name>
  <files>
frontend/components/world-review/character-record-inspector.tsx
frontend/components/world-review/__tests__/character-record-inspector.test.tsx
  </files>
  <behavior>
Test cases for the updated `character-record-inspector.test.tsx` (RESEARCH §9.2):
- Section count assertion: inspector renders exactly 9 sections (was 10): Overview, Identity Core, Profile, Live Dynamics, Capabilities, Runtime & State, Loadout, Starting Conditions, Raw JSON. Provenance section is GONE.
- No element with text matching `/Motives|Pressure responses|Taboos|Attachments|Traits|Flaws|Legacy tags/i` renders, regardless of fixture content.
- Provenance section header (`/Provenance/i`) does NOT render in the section body. (It may still appear as Overview badge per Phase 62 decision — that's fine.)
- Identity Core section still renders when fixture has biography or self-image; it just no longer contains motives/taboos/pressure/attachments rows.
- Empty-state fallback ("No additional data") still renders when every complement section is empty (P62-R3 unchanged).
- Original-world fixtures only (P62-R5 lock).
- New: when fixture has `identity.personality`, an assertion confirms the inspector does NOT also re-render personality fields (basic card owns personality, inspector stays complementary per P62-R1 principle).
  </behavior>
  <action>
**REVIEWS fix #14 (Claude LOW):** At the top of the inspector render (near the section list / section-order constant), add a source-comment trace for future maintainers documenting the P62-R2 supersession:
```tsx
// Phase 63: section count reduced 10 → 9 (Provenance moved to Raw JSON tab).
// See .planning/phases/63-personality-interiority-model/63-REVIEWS.md and 63-04 R6.
// Supersedes P62-R2 (original 10-section lock); new contract is P63-R5.
```
Place this comment above the section list so any future refactor understands the intentional reduction.

1. Edit `frontend/components/world-review/character-record-inspector.tsx` per RESEARCH §6.2 + the table of line removals:

   | Approximate line | Action |
   |------------------|--------|
   | 41, 43-46 | Remove `hasItems(motives/pressureResponses/taboos)` + `attachments` from `hasIdentityCore` check; keep biography + selfImage + hardConstraints checks |
   | 62, 65 | Remove `hasItems(d.capabilities?.traits)` + `hasItems(d.capabilities?.flaws)` from `hasCapabilities` |
   | 85 | Remove `hasItems(d.provenance?.legacyTags)` from any check it appears in |
   | 228-231 | Remove motives/pressureResponses/taboos/attachments render conditions in Identity Core |
   | 261, 264 | Remove traits + flaws render conditions in Capabilities |
   | 317 | Remove Provenance section render gate (whole section drops) |
   | 373-386 | Delete the 4 `ListBlock` blocks for Motives/Pressure responses/Taboos/Attachments |
   | 451, 457 | Delete `ListBlock` for Traits + Flaws |
   | 546 | Delete `ListBlock` for Legacy tags |
   | (Provenance section block) | Delete entire Provenance section render branch |
   | 219, 261 (et al) | `behavioralCore?.selfImage` render — keep, but as a solo line at top of Identity Core (Phase 62 decision) |

   Note: line numbers are approximate (file is 565 lines). Use grep to confirm before each edit. The CONTEXT.md instruction is unambiguous: drop motives/pressureResponses/taboos/attachments from Identity Core, drop traits/flaws from Capabilities, drop Provenance entirely.

2. Update the section list/order constant if one exists (Phase 62 likely encoded the 10-section order in a const or array — search for "Provenance" or "section order" in the file). Drop the Provenance entry.

3. Edit `frontend/components/world-review/__tests__/character-record-inspector.test.tsx`:
   - Update the section-order assertion from 10 sections to 9 (drop Provenance).
   - Drop assertions on `Motives`, `Traits`, `Flaws`, `Legacy tags`, `Pressure responses`, `Taboos`, `Attachments`, the Provenance section header.
   - Add new assertion: inspector does NOT render personality fields (basic NPC card owns them per P62-R1 complementary principle).
   - All fixtures stay original-world only (P62-R5 lock — verify by grep that no franchise names sneak in).

4. NOTE on Phase 62 P62-R2: this plan changes the contract that P62-R2 locked (10 sections). REQUIREMENTS.md update for P62-R2 is handled in 63-06 verification (it gets re-marked as superseded by Phase 63 in the traceability table). For now, the test update is the load-bearing change.
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run "character-record-inspector"</automated>
  </verify>
  <done>Inspector renders 9 sections; no deprecated fields visible; Provenance section dropped; updated Vitest passes; P63-R5 covered.</done>
</task>

<task type="auto">
  <name>Task 6: Character form trait/flaw editor removal</name>
  <files>
frontend/components/character-creation/character-form.tsx
  </files>
  <action>
Per RESEARCH §6.3 + CONTEXT.md ("Удалить из `capabilities`: `traits`, `flaws` (дубль basic Tags)"):

1. Edit `frontend/components/character-creation/character-form.tsx`:
   - Locate lines 296-306 (RESEARCH cites this region) — the two `<TagTokens>` blocks for `capabilities.traits` and `capabilities.flaws`.
   - Delete both blocks entirely. No replacement editor is added for personality (per RESEARCH §6.3): personality is auto-generated by the ingestion pipeline; the user influences it via `overrideText` (which already exists from Phase 61).
   - If those `TagTokens` blocks have associated state hooks (`useState` for traits/flaws values), delete those hooks too. Confirm by grep that no other code in this file references the removed state.
   - If form submission logic explicitly sends `capabilities.traits` / `capabilities.flaws` to the API, drop those keys from the submission payload. Backend Zod accepts them as `.optional()` (per 63-01) so omitting is safe.

2. Run `npm --prefix frontend run lint` to catch any unused-import warnings from the deletion.

3. NO new test for character-form is required (the existing form tests exercise the wider creation flow; removing fields shouldn't break them — investigate if any test breaks). If a form test fails because it asserted on the trait/flaw inputs, update it: drop those assertions.
  </action>
  <verify>
    <automated>npm --prefix frontend run lint && npm --prefix frontend test -- run "character-form"</automated>
  </verify>
  <done>Trait/flaw editors removed; lint green; no character-form test red.</done>
</task>

<task type="auto">
  <name>Task 7: Post-task verification + full frontend suite</name>
  <files>(no edits — verification only)</files>
  <action>
1. `gitnexus_detect_changes({scope: "all"})` — confirm changed files match `files_modified` exactly.

2. Full frontend Vitest suite:
   ```
   npm --prefix frontend test -- run
   ```
   Investigate any red. Likely candidates: existing world-review or character-creation tests that incidentally string-match on motives/traits/flaws/Provenance.

3. Frontend lint:
   ```
   npm --prefix frontend run lint
   ```
   Should exit 0. Fix any unused-import warnings from the inspector cleanup.

4. Frontend typecheck (if separate from lint):
   ```
   npm --prefix frontend run typecheck 2>/dev/null || npm --prefix frontend run lint
   ```
   (Some Next.js projects don't have a standalone typecheck script; lint covers TS errors via eslint-typescript.)
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run && npm --prefix frontend run lint</automated>
  </verify>
  <done>Full frontend suite + lint green; gitnexus_detect_changes scope matches.</done>
</task>

</tasks>

<verification>
- `npm --prefix frontend test -- run` exits 0.
- `npm --prefix frontend run lint` exits 0.
- `frontend/components/world-review/personality-section.tsx` exists with `PersonalitySection` export.
- `frontend/components/world-review/npcs-section.tsx` imports + renders `PersonalitySection` between Tags and PowerStatsSection.
- `frontend/components/character-creation/character-card.tsx` imports + renders `PersonalitySection`.
- `frontend/components/world-review/character-record-inspector.tsx` no longer contains `Motives` / `Traits` / `Flaws` / `Legacy tags` / `Provenance` section renders.
- `frontend/components/character-creation/character-form.tsx` no longer contains the trait/flaw `TagTokens` blocks.
- All test fixtures use original-world names only (no franchise names per P62-R5).
- gitnexus_detect_changes captured.
</verification>

<success_criteria>
- New PersonalitySection atom exists; renders summary+voice always-visible and 5 collapsible fields.
- Basic NPC card renders the section between Tags and Power Stats.
- Player CharacterCard renders the section.
- Advanced inspector cleaned up (9 sections, Provenance dropped, no deprecated field bindings).
- Character form trait/flaw editors removed.
- Updated Vitest suites all pass.
- Original-world fixture lock (P62-R5) maintained.
- P63-R4 + P63-R5 fully covered.
</success_criteria>

<requirement_coverage>
- **P63-R4** — `personality-section.test.tsx` proves basic card renders summary+voice always + collapsible reveals; `npcs-section.test.tsx` proves placement between Tags and Power Stats.
- **P63-R5** — `character-record-inspector.test.tsx` updated to assert 9 sections + absence of deprecated fields + absence of Provenance section.
- Side-effect: P62-R2 (Phase 62 lock at 10 sections) is now superseded — handled in 63-06 traceability update.
</requirement_coverage>

<estimates>
- **Effort:** ~55 min Claude execution time (7 tasks; inspector cleanup + form edit are mechanical; PersonalitySection atom is the new code).
- **LLM token cost:** ~0.
- **Test runtime:** ~30s for full frontend Vitest suite.
</estimates>

<risks>
- **R1 — Inspector line numbers drift.** Phase 62 already touched character-record-inspector.tsx; the line numbers in RESEARCH §6.2 are approximate. **Mitigation:** Task 5 explicitly says "use grep to confirm before each edit" rather than blindly editing by line number.
- **R2 — Section-order constant.** If Phase 62 encoded the 10-section order in a TypeScript const/array (likely), Task 5 must update both the JSX and the const for the test to read 9. **Mitigation:** Task 5 explicitly searches for the constant.
- **R3 — Player card prop accessor mismatch.** `character-card.tsx` may consume a derived view model rather than the raw `CharacterDraft`. **Mitigation:** Task 4 confirms via grep before adding the accessor.
- **R4 — character-form.tsx state coupling.** Removing the trait/flaw inputs may leave dangling `useState` hooks. **Mitigation:** Task 6 explicitly checks for orphaned state.
- **R5 — Test fixture leakage.** Risk of accidentally introducing IP names while writing fresh fixtures. **Mitigation:** Task 2 + Task 5 explicitly call out P62-R5 lock; original-world sample provided in Task 2 for reuse.
- **R6 — P62-R2 contract change.** This plan changes a previously-locked contract. **Mitigation:** explicitly handled in 63-06 traceability update; Phase 62's REQUIREMENTS row will be marked superseded.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-04-SUMMARY.md` with:
- Tasks completed
- Files modified
- gitnexus impact + detect_changes digests
- Test commands + pass/fail evidence
- Note: P62-R2 contract supersession (handled in 63-06)
- Deviations + rationale
</output>
