# Phase 61: Character Ingestion Frontend UI — Research

**Researched:** 2026-04-17
**Domain:** Frontend UI for character creation (player page + NPC tab), Power Stats inspector, override text UX, pipeline error surfacing
**Confidence:** HIGH (direct code read — Phase 60 backend shipped; all current frontend components inspected)

## Summary

Phase 60 shipped a unified backend pipeline (`ingestCharacterDraft`) behind all four character-creation routes (`/parse-character`, `/generate-character`, `/research-character`, `/import-v2-card`) with a uniform response envelope that carries `draft.powerStats`, `provenance.overrideText`, and a 502 error contract of `{ error, stage, attempts }`. The frontend is NOT yet using any of the new contract surface:

1. **`overrideText` is never sent** — the four API wrappers in `frontend/lib/api.ts` (`parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card`) lack the `overrideText` parameter entirely. Neither `character-form.tsx` nor `npcs-section.tsx` has a UI field for it.
2. **Power Stats is visible only inside the "Advanced" collapsible `<details>` of `CharacterRecordInspector`** — which is shown in the NPC tab per-NPC but NOT on the player `CharacterCard`. Player creation page exposes HP, appearance, traits, flaws, equipment, start conditions — no power tier, no hax, no vulnerabilities at the top level. `PowerStatsTable`, `HaxAbilitiesList`, `VulnerabilitiesList` already exist inside the inspector and are ready to reuse.
3. **NPC tab lacks the "Research Archetype" mode** — player page calls `parseCharacter` + `apiGenerateCharacter` + `importV2Card` (3 modes). NPC tab calls `parseCharacter` + `importV2Card` + `researchCharacter` (3 modes, named "describe" / "import" / "generate"). **The two surfaces don't match.** Player has no archetype research; NPC has no pure AI-generate-from-scratch.
4. **502 `{ error, stage, attempts }` payload is lost at the HTTP layer.** `apiPost` in `frontend/lib/api.ts:580` throws `new Error(await readErrorMessage(res))` which extracts only `payload.error`. The `stage` and `attempts` fields are discarded before reaching the catch block in the page. UI cannot show "Power assessment failed after 3 attempts — Retry?" with precise stage context until `apiPost` is extended.
5. **No retry path exists anywhere.** Current code shows `toast.error(...)` on any failure and leaves the user at the empty form with no "retry the last call" button. Per `feedback_no_fallbacks_v2.md` silent degradation is forbidden — but *so is showing a dead-end toast with no recovery action*.
6. **`CharacterCard` for players does NOT render `powerStats` at top level.** The field is already on `CharacterDraft.powerStats` but `character-card.tsx` does not reference it once. Phase 61 must add a Power Stats section alongside Identity / Profile / Capabilities / Status / Starting Conditions / Equipment.

**Primary recommendation:** Phase 61 unifies both creation surfaces around one shared component, `CharacterForm` (extract+rebuild), that exposes four modes (parse / generate / research / import) + a persistent `overrideText` textarea that is threaded through every mode, then lifts `PowerStatsSection` (the three existing subcomponents from `CharacterRecordInspector`) out into a visible card block on both the player `CharacterCard` and each NPC card. Extend `apiPost` to preserve `stage` + `attempts` via a typed `IngestionError` class so pages can render a targeted "Retry {stage}" button instead of a generic toast. No silent defaults anywhere; every failure terminates in a visible retry affordance. The ui_concept_hybrid.html aesthetic is already what the current `character-card.tsx` and `npcs-section.tsx` follow (Inter + Playfair Display, hybrid-950/900/800 charcoal palette, blood accent, font-mono microcopy, `clamp()`-responsive sizing) — keep it.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md was written for Phase 61 (directory contains only `.gitkeep`). Constraints therefore derive from the user-provided phase brief and global project memory:

### Locked Decisions (from phase brief and project memory)
- The player-character creation page (`/campaign/[id]/character`) and the world-review NPC tab MUST expose the same four modes: describe (parse), AI generate from scratch, import V2/V3 card, research archetype.
- Every mode MUST expose a visible `overrideText` field that survives mode switches (free-text instructions threaded through Phase 60 priority merge).
- Power Stats (tier+rank table, hax list with bypass badges, vulnerabilities with severity coloring) MUST appear on both the player `CharacterCard` and each NPC card at the top level — not hidden behind the Advanced disclosure.
- Error states MUST be explicit with a real retry button. No silent degradation. No "no power assessment" placeholder when the pipeline was expected to produce one.
- Aesthetic MUST match `docs/ui_concept_hybrid.html` — already the active design language; keep Inter/Playfair/font-mono and the hybrid charcoal + blood palette.
- No backdrop-blur on shell-level containers (`feedback_backdrop_blur_perf.md`); allowed only on isolated overlays/modals.
- No specific franchise names hardcoded in any UI string or placeholder (`feedback_no_ip_in_prompts.md`) — placeholders must be generic archetypes.
- All implementation must flow through `/gsd:*` commands (memory: `feedback_gsd_only.md`).

### Claude's Discretion
- Internal decomposition: whether `CharacterForm` becomes a shared component imported by both pages, or whether each surface keeps its own wrapper around a shared `CreationModeTabs` + `OverrideTextField` primitive. Recommended: extract a shared `components/character-creation/creation-modes.tsx` + `override-text-field.tsx` that BOTH the player page and the NPC tab consume; do not duplicate the whole form.
- Exact placement of `overrideText` in compact vs full modes.
- Visual treatment of the `Retry {stage}` button (variant / iconography) — follow the existing `lucide-react` icon vocabulary.
- Whether to split `PowerStatsSection` out of `character-record-inspector.tsx` into its own file or simply re-export. Recommended: extract to `components/character-creation/power-stats-section.tsx` and re-import from both the inspector and the two cards, so the source of truth stays single.

### Deferred Ideas (OUT OF SCOPE)
- Hand-editing PowerStats values from the UI (tier dropdown, rank slider). Phase 61 is read-only for the power section; edits come later.
- Re-assessment trigger ("re-run Stage 4 only" without re-running the whole ingestion).
- Batch NPC creation / bulk import. Out of scope.
- PowerStats visualization beyond the existing table + badge list (no radar charts, no Phase 57 explicitly rejected the radar).
- Image/portrait generation UX changes. Portrait is already handled in `/save-character`.
- `/save-character` schema migration — the two-branch Zod (`character` vs `draft`) stays as-is for Phase 61.
</user_constraints>

<phase_requirements>
## Phase Requirements

Derived from the phase brief objective. These are the requirements the planner must trace into tasks.

| ID | Description | Research Support |
|----|-------------|------------------|
| P61-R1 | Visible Power Stats section on both player `CharacterCard` and NPC cards — tier+rank table for all 4 axes, hax list with `Bypasses {tier}` badges, vulnerabilities with minor/major/critical severity color coding | The three render helpers (`PowerStatsTable`, `HaxAbilitiesList`, `VulnerabilitiesList`) already exist in `frontend/components/world-review/character-record-inspector.tsx:96-202` with correct VS Battles formatting via `formatTierRank` from `@worldforge/shared`. Need extraction to a shared file and wiring into the two cards at top level. |
| P61-R2 | Persistent `overrideText` textarea on both creation surfaces — visible on all 4 modes, text preserved across mode switches, sent with the request on every call | `overrideText` is fully wired on the backend (all 4 Zod schemas accept it, `IngestionInput` carries it, `provenance.overrideText` returns it). Frontend API wrappers in `frontend/lib/api.ts:1025-1079` have NO parameter for it; neither page passes it. Must extend all 4 wrappers + shared state in pages. |
| P61-R3 | NPC creation tab mode parity with player creation page — both surfaces expose describe / AI-generate / research-archetype / import-V2 | Today player page has parse + generate + import (`character-form.tsx`) but no archetype research. NPC tab has describe (parse) + import + research (`npcs-section.tsx`) but no pure AI-generate. Both need the 4-mode set. Extract `creation-modes.tsx` shared primitive. |
| P61-R4 | Explicit error states + real retry buttons with stage context — on pipeline failure, UI displays the failing `stage`, `attempts`, and a one-click "Retry" that re-invokes the same ingestion call with the same bundle | Backend sends HTTP 502 `{ error, stage, attempts }` via `pipelineErrorResponse` in `backend/src/routes/character.ts:146`. Frontend `apiPost` in `frontend/lib/api.ts:580` throws plain `new Error(message)` and discards the structured payload. Must add a typed `IngestionError` at the HTTP layer + a `RetryBanner` component the pages render when the last call failed. No silent toast-and-forget. |
| P61-R5 | Aesthetic parity with `docs/ui_concept_hybrid.html` — charcoal hybrid palette (`zinc-900/800/700`), blood accent for primary actions only, Inter sans + Playfair Display serif (`font-serif`) headings, font-mono small-caps microcopy with `tracking-[0.14em]`, `clamp()` responsive spacing, opaque `rgb()` surfaces per `feedback_backdrop_blur_perf.md` | Existing components already follow this language: `character-form.tsx`, `character-card.tsx`, `npcs-section.tsx`, and `character-record-inspector.tsx` all use the same token vocabulary. New additions (Power Stats section, override field, retry banner) must extend rather than replace it. No `backdrop-blur-xl` on shell; only on modal overlays if needed. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives extracted from project `CLAUDE.md` and global `~/.claude/CLAUDE.md` + `rules/` that the planner must honor:

- **Next.js App Router + Tailwind + Shadcn UI** — new components live under `frontend/components/character-creation/` or `frontend/components/world-review/` (Shadcn primitives from `components/ui/` only).
- **TypeScript strict mode, ES modules** — all new files end `.tsx`; imports use explicit paths; no `any`.
- **Zod schemas for all AI tool definitions and API payloads** — frontend does not own Zod; wrapper functions in `frontend/lib/api.ts` must simply forward the new `overrideText` param to the backend which already validates.
- **Shared types in `@worldforge/shared`** — reuse `CharacterDraft`, `PowerStats`, `HaxAbility`, `CharacterVulnerability`, `formatTierRank`. Do not redeclare.
- **Route handlers** style guide applies only to `backend/` — Phase 61 touches `frontend/` only (+1 small helper in `frontend/lib/api.ts`).
- **Code style rules** (`rules/coding-style.md`): immutability (no mutation — always `{ ...prev, overrideText: value }`), many small files over one giant one (200-400 lines typical, 800 max), error handling comprehensive, no `console.log`, no hardcoded values, functions <50 lines.
- **Language**: User communicates in Russian; Phase 61 code comments and commit messages stay English; toast strings stay English (current convention across `character-form.tsx`, `npcs-section.tsx`, all pages).
- **Image generation** is already wired in `/save-character` (fire-and-forget portrait). Phase 61 does not change this.
- **No IP examples in prompts/placeholders** (`feedback_no_ip_in_prompts.md`) — the research-mode placeholder must stay generic (current: `'a character like Gandalf, or "mysterious plague doctor"'` in `npcs-section.tsx:627` mentions Gandalf; this is a **known issue to fix** in Phase 61).
- **No backdrop-blur on shell containers** (`feedback_backdrop_blur_perf.md`) — opaque `rgb()` only; blur allowed only on modal/tooltip overlays.
- **No fallbacks** (`feedback_no_fallbacks_v2.md`) — no placeholder text when pipeline failed; failure path is explicit error + retry. "No power assessment" is allowed ONLY when `draft.powerStats` is genuinely absent (e.g., save-character loaded an older record without stats); newly ingested drafts must always have stats or the call must have visibly failed.
- **GitNexus `impact` before editing any symbol** — applies especially to `CharacterForm`, `CharacterCard`, `npcs-section.tsx`, `character-record-inspector.tsx`, `apiPost`, `parseCharacter`/`generateCharacter`/`researchCharacter`/`importV2Card` wrappers. Run impact before the Plan 1 task starts.
- **Plan before code** (`feedback_plan_before_code.md`) — Phase 61 planner must present per-task plan before implementing.

## Current UI State

### 1. Player creation page — `frontend/app/(non-game)/campaign/[id]/character/page.tsx`

Layout (top → bottom):
- `CharacterWorkspace` wrapper (flex column, fills `min-h-0`)
- **Empty state**: centered `CharacterForm` (full mode) with 3 actions:
  - Primary — large "Parse Character" button triggered by a hero textarea
  - Secondary — "AI Generate" (`onGenerate` → `apiGenerateCharacter`)
  - Secondary — "Import V2 Card" with native/outsider toggle (`onImport` → `importV2Card`)
- **Draft present**: compact `CharacterForm` strip (re-generate / re-import), then full `CharacterCard`, then footer with "Back to Review" + "Save & Begin Adventure"

Modes exposed: **parse / generate / import** — *no research-archetype*.

`CharacterForm` component (`frontend/components/character-creation/character-form.tsx`):
- Props: `onParse(description)`, `onGenerate()`, `onImport(file, importMode)`, `parsing/generating/importing` booleans, optional `compact`.
- State: `description` textarea value, `importMode` selector (native/outsider).
- Icons: `Loader2`, `Sparkles`, `Upload`, `Wand2`.
- **No override text field anywhere.**
- **No research-archetype mode.**

`CharacterCard` component (`frontend/components/character-creation/character-card.tsx`):
- Sections rendered (top → bottom): Identity → Profile → **(optional) Identity Fidelity** (shown when canonicalStatus≠original or selfImage/activeGoals present) → Capabilities (Traits + Flaws TagEditors) → Status (HP hearts + Starting Location select) → (optional) Persona Template chooser → Starting Conditions → Equipment.
- **No Power Stats section.**
- Uses local draft state with a 300 ms debounce back up to parent via `onChange`.
- `formatCanonicalStatus(status)` at :85 — reusable.
- All visual tokens: `font-mono text-[10px-12px] uppercase tracking-[0.1em-0.2em] text-zinc-500-600` for labels; `font-serif text-[clamp(24px,2vw,36px)]` for headings; `bg-zinc-800 border-zinc-700 text-zinc-200` for inputs; `bg-blood` for primary; `text-blood` for HP hearts.

### 2. NPC creation tab — `frontend/components/world-review/npcs-section.tsx`

Layout (top → bottom):
- Header: `<h2>NPCs</h2>` + New-NPC-Tier toggle (Key/Supporting) + RegenerateDialog + "Add NPC" button (empty draft)
- Grid of NPC cards (2-column on lg): name, persona, tags, short/long-term goals, `CharacterRecordInspector` (Advanced `<details>` with Power Stats INSIDE), location+faction selects
- "Create NPCs" section at bottom with 3 mode buttons:
  - **Describe** → `parseCharacter(role="key")`
  - **Import V2 Card** → `importV2Card(role="key")` with native/outsider select
  - **AI Generate** → `researchCharacter(role="key")` — this is **archetype research**, labeled "AI Generate"; misleading name

Modes exposed: **parse / import / research** — *no pure generate-from-scratch (which would be `generateCharacter` with no archetype/no concept, meaning "surprise me")*.

Each NPC card renders `CharacterRecordInspector` (`frontend/components/world-review/character-record-inspector.tsx`). Inside the Advanced collapsible:
- Overview (badges: canonicalStatus, tier/role, sourceKind, originMode)
- Identity Core (self image, social roles, motives, pressure responses, taboos, attachments, hard constraints)
- Live Dynamics
- **Power Stats** — renders `PowerStatsTable` + `HaxAbilitiesList` + `VulnerabilitiesList` if `draft.powerStats` or `characterRecord.powerStats` exists; otherwise shows `No power assessment` placeholder (this placeholder must move to "unless a call just failed" semantics per P61-R4 + `feedback_no_fallbacks_v2.md`)
- Capabilities
- Runtime & Provenance
- Raw JSON dump

### 3. Data flow

Player page (`campaign/[id]/character/page.tsx`):
1. `loadCampaign(id)` — gates on `generationComplete`
2. `getWorldData(id)` — populates `locationNames` + `personaTemplates`
3. User picks mode in `CharacterForm` → one of `parseCharacter` / `generateCharacter` / `importV2Card` is called → returns `CharacterResult`
4. Page sets `characterDraft` from `result.draft` (via `startTransition`)
5. `CharacterCard` renders with debounced `onChange` back to page-level state
6. User clicks "Save & Begin Adventure" → `saveCharacter(id, draft)` → `router.push("/game")`

NPC tab (`npcs-section.tsx`):
1. Receives `npcs`, `locationNames`, `factionNames` as props (from `review-workspace.tsx`)
2. User picks mode → one of `parseCharacter(role="key")` / `importV2Card(role="key")` / `researchCharacter(role="key")` → returns `CharacterResult` with `result.role === "key"`
3. New NPC appended to `npcs`; parent persists via its own save flow
4. Per-NPC inline editing via `updateNpc`

### 4. Aesthetic tokens verified present

From `docs/ui_concept_hybrid.html`:
- Hybrid charcoal palette `#09090b / #18181b / #27272a / #3f3f46` — **matches** `zinc-950/900/800/700` in Tailwind defaults used everywhere.
- `blood.500 #e63e00` for threats/damage — **matches** `bg-blood text-blood` custom utility in current code.
- `bone #f8f9fa` narrative text — **matches** `text-bone` utility.
- Inter sans + Playfair Display serif — both wired: `font-sans` (body) and `font-serif` (`<h2 className="font-serif text-xl font-bold text-bone">`).
- Small-caps label pattern `text-[10px] tracking-[0.25em] uppercase font-mono text-zinc-400-500` — **already used 40+ times** across NPC/CharacterCard.

**Key risk per `feedback_backdrop_blur_perf.md`:** The HTML concept uses `backdrop-filter: blur(12px)` on `.hybrid-panel`. The production code has already migrated to opaque surfaces (`bg-zinc-900`, `bg-zinc-900/40`). Phase 61 must NOT re-introduce `backdrop-blur-*` on page-level containers. Only allowed on modal/Dialog.

## Backend API Mapping

### Endpoint → Frontend wrapper → Page handler

| Backend route | Wrapper (api.ts) | Line | Current body shape (wire) |
|---|---|---|---|
| POST `/api/worldgen/parse-character` | `parseCharacter` | 1025 | `{ campaignId, concept, role, locationNames, factionNames }` — **missing `overrideText`** |
| POST `/api/worldgen/generate-character` | `generateCharacter` | 1037 | `{ campaignId, role, locationNames, factionNames }` — **missing `overrideText`** |
| POST `/api/worldgen/research-character` | `researchCharacter` | 1048 | `{ campaignId, archetype, role, locationNames, factionNames }` — **missing `overrideText`** |
| POST `/api/worldgen/import-v2-card` | `importV2Card` | 1060 | `{ campaignId, name, description, personality, scenario, tags, role, importMode, locationNames, factionNames }` — **missing `overrideText`** |

### Phase 60 response envelope (already returned; already typed)

```typescript
// frontend/lib/api-types.ts:272
type CharacterResultEnvelope = {
  draft: CharacterDraft;              // includes powerStats, provenance.overrideText
  characterRecord?: CharacterRecord | null;
};
export type CharacterResult =
  | ({ role: "player"; character: ParsedCharacter } & CharacterResultEnvelope)
  | ({ role: "key"; npc: ScaffoldNpc } & CharacterResultEnvelope);
```

**The `draft.powerStats` field is already in the response — the frontend just doesn't display it on the card.**

### How overrideText flows end-to-end (once wired)

```
 User types in <OverrideTextField> on CharacterForm / NpcCreationPanel
   │
   ▼
 React state:  const [overrideText, setOverrideText] = useState("")
   │    (kept at page level for player, at section level for NPC)
   ▼
 Mode handler:  parseCharacter(campaignId, concept, role, locs, facs, overrideText)
   │
   ▼
 frontend/lib/api.ts wrapper  → apiPost("/api/worldgen/parse-character", { ..., overrideText })
   │
   ▼
 backend/src/routes/character.ts:159  → parseCharacterSchema.parse  → IngestionInput.overrideText
   │
   ▼
 ingestCharacterDraft  →  synthesizer prompt PRIORITY 1 block  +  power-assessor override injection
   │
   ▼
 Response draft.provenance.overrideText  +  powerStats (reflects override tier changes)
```

### Error contract (already live on backend, not honored on frontend)

```typescript
// backend/src/routes/character.ts:146
function pipelineErrorResponse(c: Context, error: unknown, fallback: string) {
  if (error instanceof IngestionPipelineError) {
    return c.json(
      { error: error.message, stage: error.stage, attempts: error.attempts },
      502,
    );
  }
  return c.json({ error: getErrorMessage(error, fallback) }, getErrorStatus(error));
}
```

`IngestionStage` = `"extract" | "classify" | "research" | "synthesize" | "power_assess"` (from `backend/src/character/ingestion/types.ts:88`).

The frontend `apiPost` wrapper discards `stage` and `attempts`:

```typescript
// frontend/lib/api.ts:545
export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) return payload.error;    // ← stage, attempts dropped here
  } catch {}
  return response.statusText || "Request failed";
}
```

**This must change for P61-R4.** Recommended: introduce a typed error class in `frontend/lib/api.ts`:

```typescript
export class IngestionError extends Error {
  constructor(
    message: string,
    public stage?: "extract" | "classify" | "research" | "synthesize" | "power_assess",
    public attempts?: number,
  ) { super(message); }
}

async function readIngestionError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: string; stage?: string; attempts?: number };
    if (payload.stage) {
      return new IngestionError(payload.error ?? "Request failed", payload.stage as IngestionError["stage"], payload.attempts);
    }
    if (payload.error) return new Error(payload.error);
  } catch {}
  return new Error(response.statusText || "Request failed");
}
```

Then `apiPost` uses `readIngestionError` on any non-ok response. Pages catch `IngestionError` specifically and render a `<PipelineErrorBanner stage={e.stage} attempts={e.attempts} onRetry={...} />`.

## Power Stats Inspector Design

All three rendering helpers already exist. They just need to be LIFTED OUT of `CharacterRecordInspector`'s Advanced disclosure into a visible section on both the player `CharacterCard` and each NPC card.

### Recommended extraction — `frontend/components/character-creation/power-stats-section.tsx` (NEW)

```tsx
// Source: copy/adapt from frontend/components/world-review/character-record-inspector.tsx:96-202
import type { PowerStats } from "@worldforge/shared";
import { formatTierRank } from "@worldforge/shared";
import { Badge } from "@/components/ui/badge";

const SEVERITY_STYLES = {
  minor:    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  major:    "border-amber-500/30 bg-amber-500/10 text-amber-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
} as const;

export function PowerStatsSection({ powerStats }: { powerStats: PowerStats | undefined }) {
  if (!powerStats) return null;   // caller decides whether to render "no stats" or retry UI
  const axes = [
    { label: "Attack Potency", value: formatTierRank(powerStats.attackPotency) },
    { label: "Speed",          value: formatTierRank(powerStats.speed) },
    { label: "Durability",     value: formatTierRank(powerStats.durability) },
    { label: "Intelligence",   value: formatTierRank(powerStats.intelligence) },
  ];
  return (
    <div className="flex flex-col gap-[clamp(10px,0.8vw,16px)]">
      <span className="font-mono text-[clamp(11px,0.8vw,13px)] uppercase tracking-[0.1em] text-zinc-500">
        Power Stats
      </span>
      <div className="overflow-hidden rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Axis</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Rating</th>
            </tr>
          </thead>
          <tbody>
            {axes.map((a) => (
              <tr key={a.label} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2 text-zinc-300">{a.label}</td>
                <td className="px-4 py-2 font-medium text-zinc-100">{a.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {powerStats.hax.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Hax Abilities</span>
          {powerStats.hax.map((a, i) => (
            <div key={`${a.name}-${i}`} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{a.name}</span>
                <span className="text-xs text-zinc-400">{a.type}</span>
                {a.bypassTier && (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                    Bypasses {a.bypassTier}
                  </Badge>
                )}
              </div>
              {a.limitations.length > 0 && (
                <div className="mt-1.5 text-xs italic text-zinc-400">{a.limitations.join("; ")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {powerStats.vulnerabilities.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Vulnerabilities</span>
          {powerStats.vulnerabilities.map((v, i) => (
            <div key={`vuln-${i}`} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <Badge variant="outline" className={`shrink-0 text-[10px] uppercase ${SEVERITY_STYLES[v.severity]}`}>
                {v.severity}
              </Badge>
              <span className="text-sm text-zinc-200">{v.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Placement in `CharacterCard` (player)

Insert between Capabilities and Status (after `</div>` at line 299, before Status section). Rationale: Identity → Profile → Capabilities defines who the character is; Power Stats is the mechanical ceiling of what they can do; Status is current HP + location. This reads naturally top-down.

### Placement on NPC cards (in `npcs-section.tsx`)

Insert between Tags and Objectives blocks (between lines 383 and 387 in current file). The NPC card is denser, so the Power Stats section there should use the same rendering but fit the narrower 2-column grid cell. The existing `CharacterRecordInspector` inside the Advanced disclosure KEEPS the Power Stats section so nothing regresses if the inspector is opened — but the TOP-LEVEL Power Stats becomes the primary surface.

### Legacy records compatibility

Records saved before Phase 60 have `powerStats === undefined`. The caller decides what to render:
- **Newly ingested drafts** (in-memory, returned by Phase 60 pipeline): `powerStats` MUST be defined or the API call threw. UI shows the table.
- **Legacy players loaded from DB** (via `getWorldData`): may have `powerStats === undefined`. UI shows a small "Not assessed (legacy record)" line that is visually distinct from the Phase 60 "pipeline failed" error. Per `feedback_no_fallbacks_v2.md` this is the one legitimate "no data" case because the character record genuinely lacks the field.

## Override Text Field UX

### Recommended shared component — `frontend/components/character-creation/override-text-field.tsx` (NEW)

```tsx
"use client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface OverrideTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Optional compact variant for inline strip on existing-draft screen. */
  compact?: boolean;
}

export function OverrideTextField({ value, onChange, disabled, compact }: OverrideTextFieldProps) {
  const id = "character-override-text";
  const maxLength = 2000;   // matches backend Zod .max(2000) on characterRoleFields.overrideText
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        Override Instructions — Optional
      </Label>
      <p className="text-[clamp(11px,0.8vw,13px)] text-zinc-600">
        Free-text corrections that win over everything else. Examples: &ldquo;her eyes are red not blue&rdquo;,
        &ldquo;she is weaker than canon&rdquo;, &ldquo;speaks in archaic English&rdquo;.
      </p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={compact ? 2 : 4}
        maxLength={maxLength}
        placeholder="Describe any corrections or overrides. Leave empty to use card / research / inference as-is."
        className="resize-y bg-zinc-800 border-zinc-700 text-[clamp(13px,1vw,16px)] text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600/50"
      />
      <div className="flex justify-end font-mono text-[10px] text-zinc-600">
        {value.length}/{maxLength}
      </div>
    </div>
  );
}
```

### Placement

- **Player `CharacterForm` full mode:** Below the hero textarea + Parse button, before the "or" divider. Full-height variant. Always visible.
- **Player `CharacterForm` compact mode (existing draft present):** In a collapsible disclosure underneath the recreate strip. `rows={2}` variant. Default-collapsed to keep the strip thin.
- **NPC tab "Create NPCs" panel:** Same textarea appears inside each of the three (four-post-P61-R3) mode panels — state lifted to `npcs-section.tsx` so switching modes preserves the override.

### State model

- Player page owns `const [overrideText, setOverrideText] = useState("")`. Passed to `CharacterForm` as `value/onChange`. Cleared only on successful save (not on mode switch, not on failed call, not on empty-state transition).
- NPC section owns one `overrideText` at the section level shared by all three/four creation modes. Cleared after a successful NPC creation (`onChange([...npcs, npc]); setOverrideText("")`).

### Char limit

- Matches backend Zod: `.max(2000)` on `characterRoleFields.overrideText` (from Phase 60 schema research). Enforced client-side via `maxLength={2000}` + visible counter. No runtime truncation; user cannot exceed.

### Persistence across mode switches

Mode switch does NOT clear `overrideText`. Mode switch clears only the mode-specific payload (e.g., `descriptionText` when leaving describe; `archetypeText` when leaving research). This is explicit because per `project_v2_import_pipeline.md` the override is a cross-cutting concern, not a per-mode input.

## Unification Plan

### Shared primitive extraction

Create `frontend/components/character-creation/creation-modes.tsx` exposing:

```typescript
export type CreationMode = "parse" | "generate" | "research" | "import";

interface CreationModesProps {
  mode: CreationMode | null;
  onModeChange: (mode: CreationMode | null) => void;
  busy: boolean;
  disabledModes?: CreationMode[];       // e.g., pages may disable "generate" if they want to
  labels?: Partial<Record<CreationMode, string>>;   // per-surface label override
}
```

Buttons render via a map of `{ mode, icon, defaultLabel }`:
- `parse`    → `FileText`, "Describe"
- `generate` → `Sparkles`, "AI Generate"
- `research` → `Wand2`, "Research Archetype"
- `import`   → `Upload`, "Import V2 Card"

Both surfaces consume `CreationModes` + `OverrideTextField` + one `PowerStatsSection` per card (in `CharacterCard` for player, in each NPC grid cell for NPC).

### File layout after Phase 61

```
frontend/components/character-creation/
├── character-form.tsx              (REWRITE: 4 modes + override field; current 3-mode form replaced)
├── character-card.tsx              (MODIFY: +PowerStatsSection between Capabilities and Status)
├── character-workspace.tsx         (UNCHANGED)
├── creation-modes.tsx              (NEW: shared 4-mode button bar)
├── override-text-field.tsx         (NEW: shared override textarea)
├── power-stats-section.tsx         (NEW: extracted from character-record-inspector)
├── pipeline-error-banner.tsx       (NEW: visible stage+attempts+retry UI)
└── __tests__/
    ├── character-card.test.tsx     (EXTEND: cover PowerStats rendering)
    ├── character-form.test.tsx     (REWRITE: cover 4 modes + override field + retry)
    ├── character-workspace.test.tsx (UNCHANGED)
    ├── creation-modes.test.tsx     (NEW)
    ├── override-text-field.test.tsx (NEW)
    ├── power-stats-section.test.tsx (NEW)
    └── pipeline-error-banner.test.tsx (NEW)

frontend/components/world-review/
├── npcs-section.tsx                (MODIFY: swap in <CreationModes>, <OverrideTextField>,
│                                    <PowerStatsSection> at top of each NPC card, add research mode
│                                    WAIT — research already exists; instead ADD generate-from-scratch
│                                    mode so NPC tab matches player page's 4-mode set)
└── character-record-inspector.tsx  (MODIFY: re-import PowerStatsSection from character-creation
                                     to keep a single source of truth; keep the Advanced section
                                     showing it for the deep-dive)
```

### Do NOT duplicate

- **Do not** fork the existing `CharacterCard` for NPCs. Instead keep the NPC card layout (it's intentionally denser — fits a 2-col grid) and embed only the reusable atoms (`PowerStatsSection`, `OverrideTextField`, `PipelineErrorBanner`, `CreationModes`) where they fit.
- **Do not** duplicate `PowerStatsSection` into a second file. The inspector re-imports the extracted component and the Advanced disclosure wraps the same `<PowerStatsSection>` it had before.

### Why this layout

- **Small files** — per `rules/coding-style.md` every new file is <200 lines.
- **Atom + surface** — pages own their own shell and consume atoms. No shared "MegaCreationForm" that tries to be both player and NPC.
- **Backward compatible** — existing tests for `character-card.tsx` continue to pass; new tests extend coverage.

## Error Handling

### Contract

Every pipeline stage can fail:
- `extract` — malformed V2 card JSON / missing name / unexpected shape
- `classify` — IP context load failure
- `research` — archetype/web-search step explicitly gated; should not reach retry normally, but can throw
- `synthesize` — LLM 3-attempt retry exhausted
- `power_assess` — LLM 3-attempt retry exhausted (both canon branch and original branch)

Backend already emits `IngestionPipelineError` → HTTP 502 with `{ error, stage, attempts }`.

### Frontend pipeline error banner — `frontend/components/character-creation/pipeline-error-banner.tsx` (NEW)

```tsx
"use client";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PipelineErrorBannerProps {
  error: string;
  stage?: "extract" | "classify" | "research" | "synthesize" | "power_assess";
  attempts?: number;
  onRetry: () => void;
  retrying: boolean;
  onDismiss?: () => void;
}

const STAGE_LABELS = {
  extract:       "Source Extraction",
  classify:      "Canonical Classification",
  research:      "Canon Research",
  synthesize:    "Draft Synthesis",
  power_assess:  "Power Assessment",
} as const;

export function PipelineErrorBanner({ error, stage, attempts, onRetry, retrying, onDismiss }: PipelineErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-900/40 bg-red-950/20 p-[clamp(12px,1vw,18px)]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">
            {stage ? `${STAGE_LABELS[stage]} failed` : "Pipeline failed"}
          </span>
          {typeof attempts === "number" && attempts > 0 && (
            <span className="font-mono text-[10px] text-red-500/70">
              after {attempts} attempt{attempts === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <p className="leading-5 text-zinc-200">{error}</p>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            <RotateCw className={retrying ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} />
            {retrying ? "Retrying..." : "Retry"}
          </Button>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Retry wiring — page holds "last ingestion call" closure

Pattern for both player page and NPC section:

```tsx
const [lastIngestion, setLastIngestion] = useState<(() => Promise<void>) | null>(null);
const [ingestionError, setIngestionError] = useState<IngestionError | Error | null>(null);

async function runIngestion(callable: () => Promise<void>) {
  setLastIngestion(() => callable);
  setIngestionError(null);
  try {
    await callable();
    setLastIngestion(null);     // success — clear retry handle
  } catch (err) {
    setIngestionError(err as Error);
  }
}

// Example usage
const handleParse = (desc: string) =>
  runIngestion(async () => {
    const result = await parseCharacter(campaignId, desc, "player", locationNames, [], overrideText);
    if (result.role === "player") setCharacterDraft(result.draft);
    toast.success("Character parsed");
  });
```

Banner renders between form and card:
```tsx
{ingestionError && (
  <PipelineErrorBanner
    error={ingestionError.message}
    stage={ingestionError instanceof IngestionError ? ingestionError.stage : undefined}
    attempts={ingestionError instanceof IngestionError ? ingestionError.attempts : undefined}
    onRetry={() => lastIngestion && runIngestion(lastIngestion)}
    retrying={busy !== "idle"}
    onDismiss={() => setIngestionError(null)}
  />
)}
```

### No silent defaults

- **Do not** show a toast alone on ingestion failure and leave the form blank. Toasts disappear; users miss them.
- **Do not** substitute `powerStats: undefined` as "ok, character has no powers" when a call just failed. Failed-call state owns the screen until dismissed or retried.
- **Do not** pre-populate a partial draft when the pipeline threw; Phase 60 throws loudly.
- The only legitimate "No power assessment" placeholder is for legacy DB records loaded via `getWorldData` (see Power Stats section above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2 (verified in `frontend/package.json:43`) |
| Config file | `frontend/vitest.config.ts` (exists) and repo-root `vitest.config.ts` that sets `environmentMatchGlobs` → jsdom for `frontend/**/*.{test,spec}.{ts,tsx}` (Phase 27 added the repo-root alias) |
| Test scripts | Frontend has `lint` + `typecheck` npm scripts. Test command is `npx vitest run` from the frontend directory (repo-root config). |
| Quick run command | `npx vitest run frontend/components/character-creation/` |
| Full frontend run | `npx vitest run frontend/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P61-R1 | `PowerStatsSection` renders tier+rank table, hax with bypass badges, vulnerabilities with severity colors | unit (component) | `npx vitest run frontend/components/character-creation/__tests__/power-stats-section.test.tsx` | ❌ Wave 0 |
| P61-R1 | `CharacterCard` top-level renders Power Stats when draft.powerStats present | unit (component) | `npx vitest run frontend/components/character-creation/__tests__/character-card.test.tsx -t "power stats"` | ✅ extend existing |
| P61-R1 | NPC card top-level renders Power Stats | unit (component) | `npx vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx -t "power stats"` | ✅ extend existing |
| P61-R2 | `OverrideTextField` value threaded into API call bodies | unit | `npx vitest run frontend/components/character-creation/__tests__/override-text-field.test.tsx` + `npx vitest run frontend/lib/__tests__/api.test.ts -t "overrideText"` | ❌ Wave 0 |
| P61-R2 | API wrappers forward `overrideText` on wire | unit (fetch mock) | `npx vitest run frontend/lib/__tests__/api.test.ts -t "parseCharacter overrideText"` | ❌ Wave 0 (may reuse existing api test file if present) |
| P61-R2 | Mode switch preserves `overrideText` | unit (form integration) | `npx vitest run frontend/components/character-creation/__tests__/character-form.test.tsx -t "preserves override"` | ✅ rewrite existing |
| P61-R3 | Player page exposes 4 modes (parse/generate/research/import) | unit | `npx vitest run frontend/components/character-creation/__tests__/creation-modes.test.tsx -t "four modes"` | ❌ Wave 0 |
| P61-R3 | NPC section exposes 4 modes | unit | `npx vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx -t "four modes"` | ✅ extend existing |
| P61-R4 | `IngestionError` carries stage+attempts from 502 payload | unit (fetch mock) | `npx vitest run frontend/lib/__tests__/api.test.ts -t "IngestionError"` | ❌ Wave 0 |
| P61-R4 | `PipelineErrorBanner` renders stage label + attempts + retry button; `onRetry` fires | unit | `npx vitest run frontend/components/character-creation/__tests__/pipeline-error-banner.test.tsx` | ❌ Wave 0 |
| P61-R4 | Player page shows banner on failure, retry re-invokes same call | unit (page-level w/ mocks) | `npx vitest run frontend/components/character-creation/__tests__/character-form.test.tsx -t "retry"` | ✅ extend |
| P61-R4 | NPC section shows banner on failure, retry re-invokes same call | unit | `npx vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx -t "retry"` | ✅ extend |
| P61-R5 | Aesthetic — visual regression is manual (not automated); Vitest asserts CSS class tokens match design language (`font-mono`, `uppercase`, `tracking-[0.14em]`, `text-zinc-500`, etc.) via `toHaveClass` on key microcopy labels | unit (class-level) | `npx vitest run frontend/components/character-creation/__tests__/power-stats-section.test.tsx -t "design tokens"` | part of power-stats-section.test |
| P61-R5 | No `backdrop-blur-*` class introduced in new components (grep assertion) | lint-style | `! grep -r 'backdrop-blur' frontend/components/character-creation/*.tsx` | CI one-liner |
| P61-R5 | No hardcoded franchise names in new code (grep assertion) | lint-style | custom grep in test helper (`forbiddenWords.test.ts` extended from existing pattern) | ❌ Wave 0 |

Plus one PinchTab programmatic smoke scenario (not automated in CI; scripted for the E2E agent):

- `pinchtab/character-creation.mjs` — load `/campaign/{id}/character` after worldgen, submit Parse with override text "eyes are red not blue", assert returned draft's appearance contains "red" and PowerStats section is visible, then kill backend Stage 4 (dev-only toggle or mock) and confirm banner appears with `Power Assessment failed` + working Retry. Manual-only execution; not in Wave 0 sampling.

### Sampling Rate
- **Per task commit:** `npx vitest run frontend/components/character-creation/` + `npx vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx`
- **Per wave merge:** `npx vitest run frontend/` + `npm --prefix frontend run typecheck` + `npm --prefix frontend run lint`
- **Phase gate:** All above green + PinchTab smoke completed + backend Phase 60 suite still green (`npx vitest run backend/src/character/ingestion/` + `npx vitest run backend/src/routes/__tests__/character.test.ts`)

### Wave 0 Gaps
- [ ] `frontend/components/character-creation/__tests__/power-stats-section.test.tsx` — covers P61-R1 extraction
- [ ] `frontend/components/character-creation/__tests__/override-text-field.test.tsx` — covers P61-R2 atom
- [ ] `frontend/components/character-creation/__tests__/creation-modes.test.tsx` — covers P61-R3 atom
- [ ] `frontend/components/character-creation/__tests__/pipeline-error-banner.test.tsx` — covers P61-R4 atom
- [ ] `frontend/lib/__tests__/api.test.ts` — new file (check existing `frontend/lib/__tests__/` first); covers `IngestionError` parsing + overrideText forwarding on all 4 wrappers
- [ ] Extend `frontend/components/character-creation/__tests__/character-form.test.tsx` — 4 modes + override persistence + retry
- [ ] Extend `frontend/components/character-creation/__tests__/character-card.test.tsx` — Power Stats section renders at top level
- [ ] Extend `frontend/components/world-review/__tests__/npcs-section.test.tsx` — 4 modes + override + retry + power stats at top level

No new framework install required — Vitest is present and used by `frontend/components/character-creation/__tests__/` already.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Tier formatting | String concat (`${tier} ${rank}`) | `formatTierRank` from `@worldforge/shared` | Already used by `PowerStatsTable`, `buildPowerStatsLine`, `lookupCharacterPower`; handles all edge cases |
| Hax bypass badge | Custom color classes | `<Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">` | Copy from `character-record-inspector.tsx:150-155` — already correct |
| Severity colors | Custom per-level CSS | `SEVERITY_STYLES` record from inspector | Already correct mapping for minor/major/critical |
| V2 card parsing | Re-implement | `parseV2CardFile` from `frontend/lib/v2-card-parser.ts` | Already handles PNG tEXt chunk + V2/V3 JSON |
| API error extraction | Regex error message | Typed `IngestionError` class + 502 JSON parse | Structured stage+attempts needed for retry UX |
| Toast notifications | Custom component | `sonner` (already in use: `import { toast } from "sonner"`) | Already wired; keep using for success paths |
| Form inputs | Raw `<input>` | Shadcn `Input`, `Textarea`, `Select` from `components/ui/` | Project standard; already used everywhere |
| Icons | New SVG components | `lucide-react` (`Loader2`, `Sparkles`, `Upload`, `Wand2`, `FileText`, `AlertTriangle`, `RotateCw`) | All already imported across codebase |
| Tag + list editing | Hand-rolled | `TagEditor` + `StringListEditor` from `components/world-review/` | Used by both player CharacterCard and NPC card today |
| Character record preview | New inspector | `CharacterRecordInspector` (`frontend/components/world-review/character-record-inspector.tsx`) | Already renders full draft+record for NPC cards; re-usable on player page Advanced disclosure later if needed |

**Key insight:** Phase 61 is composition of existing atoms plus three new atoms (`PowerStatsSection`, `OverrideTextField`, `PipelineErrorBanner`) and one shared mode primitive (`CreationModes`). No net-new rendering logic beyond copying the inspector's three PowerStats subcomponents out of the `<details>` and into a visible section.

## Common Pitfalls

### Pitfall 1: Debouncing PowerStats edits through the existing `CharacterCard` commitLocal loop
**What goes wrong:** `CharacterCard` has a `commitLocal` 300 ms debounce. If Phase 61 ever adds inline PowerStats editing (out of scope but likely next phase), the debounce layer will drop tier mutations unless the patch function is extended.
**Why it happens:** `patch<K>` (line 161) only iterates top-level `CharacterDraft` keys.
**How to avoid:** Phase 61 renders PowerStats READ-ONLY. Any future edit path must extend `commitLocal`/`patch` to accept `powerStats.attackPotency.tier` etc.
**Warning signs:** Plan tasks try to add `<Select>` for tier inside `power-stats-section.tsx`. Stop immediately — out of scope.

### Pitfall 2: Shipping the override field but forgetting to pass it through `apiPost` body
**What goes wrong:** User types override, state updates, but `parseCharacter(campaignId, concept, role, locationNames, factionNames)` doesn't accept a 6th arg. Override silently ignored; backend never sees it.
**Why it happens:** Signature of the four wrappers has stayed stable since Phase 13.
**How to avoid:** ALL FOUR wrappers (`parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card`) must take an optional trailing `overrideText?: string` parameter, pass it into the `apiPost` body, and have a corresponding unit test asserting the param hits the wire.
**Warning signs:** Phase 61 merge but backend logs show `IngestionInput.overrideText === undefined` on every request. Fix: recheck wrapper signature and page call sites.

### Pitfall 3: Rendering "No power assessment" for newly ingested drafts
**What goes wrong:** Pipeline succeeds but frontend forgets to read `draft.powerStats` and falls back to the inspector's old `No power assessment` placeholder.
**Why it happens:** Copy/paste from `character-record-inspector.tsx:381-384` includes the placeholder.
**How to avoid:** The extracted `PowerStatsSection` returns `null` (not placeholder) when `powerStats` is undefined. The CALLER decides: legacy records → optional small "Not assessed (legacy)" line; newly-ingested missing → this is a bug, should have been a thrown error upstream.
**Warning signs:** Newly parsed character shows "No power assessment" even though backend logs show `draft.powerStats: {...}` returned. Inspect transport — likely a missing field on response type.

### Pitfall 4: Forgetting to pass `overrideText` into research mode on NPC tab (current code sends `archetype` only)
**What goes wrong:** NPC tab's "AI Generate" button already maps to `researchCharacter(campaignId, archetypeText, "key", ...)`. If override is added at section level but only wired into `parseCharacter` and `importV2Card`, the research call drops it.
**Why it happens:** Three-call copy-paste misses one.
**How to avoid:** One helper in `npcs-section.tsx` that every mode calls: `async function runIngestion(caller: () => Promise<CharacterResult>) { … setOverrideText(""); }` with the single override reference inside each `caller`.
**Warning signs:** Unit test asserting `overrideText` on `researchCharacter` wire fails.

### Pitfall 5: `toast.error` hides the banner
**What goes wrong:** Pages still call `toast.error(...)` on failure (old pattern), so user sees both a transient toast AND the banner. Visual duplication + the toast fades out but banner remains — looks inconsistent.
**Why it happens:** Current code uses toast.error everywhere.
**How to avoid:** On 502 / IngestionError specifically, do NOT fire toast.error. Render banner only. Keep toast.error ONLY for non-pipeline errors (e.g., load-world-data failures, save-character failures).
**Warning signs:** E2E smoke shows both a red toast AND a red banner on one ingestion failure. Remove the toast call inside the ingestion error path.

### Pitfall 6: Hardcoded franchise names in research placeholder
**What goes wrong:** Current NPC section placeholder is `'a character like Gandalf, or "mysterious plague doctor"'` (`npcs-section.tsx:627`). Gandalf is a specific IP. Per `feedback_no_ip_in_prompts.md` this is forbidden.
**Why it happens:** Legacy placeholder from early worldgen UI.
**How to avoid:** Replace with generic: `'"a battle-scarred veteran", "a mysterious plague doctor", or any archetype in quotes or free text'`. Must scan new `OverrideTextField` placeholder + all mode placeholders for similar leaks.
**Warning signs:** grep `frontend/components/character-creation/ -e "Gandalf|Naruto|Gojo|Coruscant|Konoha"` returns matches.

### Pitfall 7: `backdrop-blur` re-introduction from ui_concept_hybrid.html
**What goes wrong:** Developer reads `docs/ui_concept_hybrid.html` literally and applies `.hybrid-panel` class with `backdrop-filter: blur(12px)` to new sections. Lag on character creation page per `feedback_backdrop_blur_perf.md`.
**Why it happens:** HTML concept is a design reference, not a CSS spec. Production code already removed backdrop-blur.
**How to avoid:** Use opaque `bg-zinc-900 border border-white/[0.06]` for all new containers. Grep check in CI.
**Warning signs:** `grep -r "backdrop-blur" frontend/components/character-creation/*.tsx` returns matches.

### Pitfall 8: Retry calls the wrong closure (stale state)
**What goes wrong:** `lastIngestion` closure captures stale `description` / `overrideText`. User edits, clicks Retry, old text is sent.
**Why it happens:** `useState` setter stores the callable at call time.
**How to avoid:** `lastIngestion` captures ONLY the "re-run the same call with the same inputs at the time of failure" semantics. This is intentional — Retry means "retry the ingestion that failed", not "submit my current form state". If user changed the inputs, they should re-click the primary action button, not Retry. Label the Retry button "Retry this {stage}" to make this explicit.
**Warning signs:** Unit test where user changes textarea mid-failure and clicks Retry sees a different body on the wire than expected. That's correct behavior — document it.

## Code Examples

### Canonical pattern for a page-level ingestion call (player page, post-refactor)

```tsx
const [overrideText, setOverrideText] = useState("");
const [ingestionError, setIngestionError] = useState<Error | IngestionError | null>(null);
const [lastIngestion, setLastIngestion] = useState<(() => Promise<void>) | null>(null);

async function runIngestion(callable: () => Promise<void>) {
  setLastIngestion(() => callable);
  setIngestionError(null);
  try {
    await callable();
    setLastIngestion(null);
  } catch (err) {
    setIngestionError(err as Error);
    // intentionally NO toast.error here — banner owns the failure surface
  }
}

const handleParse = useCallback((desc: string) => {
  setBusy("parsing");
  return runIngestion(async () => {
    try {
      const result = await parseCharacter(campaignId, desc, "player", locationNames, [], overrideText);
      if (result.role === "player") setCharacterDraft(result.draft);
      toast.success("Character parsed");
    } finally {
      setBusy("idle");
    }
  });
}, [campaignId, locationNames, overrideText]);
```

### Extending API wrapper — `frontend/lib/api.ts`

```typescript
// Replace the 4 existing wrappers with versions that accept overrideText
export function parseCharacter(
  campaignId: string,
  concept: string,
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
  overrideText?: string,                          // ← NEW
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/parse-character", {
    campaignId, concept, role, locationNames, factionNames,
    ...(overrideText ? { overrideText } : {}),   // ← omit when empty
  }).then(normalizeCharacterResult);
}

// Same additive tail for generateCharacter / researchCharacter / importV2Card.
```

### Integrating `IngestionError` in `apiPost`

```typescript
export class IngestionError extends Error {
  constructor(
    message: string,
    public stage?: "extract" | "classify" | "research" | "synthesize" | "power_assess",
    public attempts?: number,
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

async function readIngestionError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as {
      error?: string; stage?: string; attempts?: number;
    };
    if (payload.stage) {
      return new IngestionError(
        payload.error ?? "Request failed",
        payload.stage as IngestionError["stage"],
        payload.attempts,
      );
    }
    if (payload.error) return new Error(payload.error);
  } catch {}
  return new Error(response.statusText || "Request failed");
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await readIngestionError(res);
  return (await res.json()) as T;
}
```

## State of the Art

| Old Approach (current code) | Current Approach (Phase 61) | When Changed | Impact |
|---|---|---|---|
| 3 modes on player page (parse/generate/import) | 4 modes (add research) | Phase 61 | Player and NPC parity; player can research archetypes (was NPC-only) |
| 3 modes on NPC tab (describe/import/generate-as-research) | 4 modes (add pure generate-from-scratch) | Phase 61 | NPC has "AI Generate surprise me" separate from "Research archetype" |
| Power Stats hidden in `<details>` Advanced disclosure | Power Stats visible at card top level | Phase 61 | Users see attack potency / speed / durability / intelligence / hax / vulnerabilities without opening Advanced |
| No override channel anywhere | `OverrideTextField` visible on every mode, threaded through all 4 API wrappers | Phase 61 | User corrections (P1 priority per Phase 60 synthesizer) reach the LLM |
| 502 payload `{ error, stage, attempts }` dropped by `readErrorMessage` | `IngestionError` carries structured fields to page layer | Phase 61 | Real retry UX possible |
| `toast.error` + silent form state on ingestion failure | `PipelineErrorBanner` with Retry button, no duplicate toast | Phase 61 | Users have an explicit recovery path; no silent degradation |

**Deprecated/outdated patterns:**
- `toast.error(...)` on ingestion failure (replaced by banner for 502 only; other errors keep toast)
- `readErrorMessage(res)` as the only error extraction path for character routes
- Any placeholder "No power assessment" text on a NEW draft (only legacy DB records legitimately show a muted not-assessed marker)

## Environment Availability

Phase 61 is code-only UI work. Dependencies verified:

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Next.js App Router | Page routes | ✓ | — (already running) | — |
| Tailwind + Shadcn UI | All components | ✓ | already configured | — |
| `lucide-react` | Icons (`AlertTriangle`, `RotateCw`, `Sparkles`, `Wand2`, `Upload`, `FileText`, `Loader2`) | ✓ | — | — |
| `sonner` | Toast success notifications | ✓ | — (imported in current pages) | — |
| `@worldforge/shared` | Types + `formatTierRank` | ✓ | workspace | — |
| Vitest + jsdom | Component tests | ✓ | Vitest 3.2 | — |
| PinchTab | Optional manual smoke | ✓ global install per MEMORY.md | — | If unavailable: skip smoke and rely on Vitest + typecheck |
| Phase 60 backend running | Manual smoke only (live end-to-end) | ✓ merged to main | — | N/A for unit tests |

No new dependencies. No environment install blockers.

## Runtime State Inventory

Phase 61 is a refactor phase — adds UI surfaces that consume already-wire-visible backend fields. Walking through each category:

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | `players.characterRecord` and `npcs.characterRecord` JSON blobs may lack `powerStats` for records written before Phase 60. These still render correctly with Phase 61 because Phase 61's `PowerStatsSection` returns `null` when `powerStats === undefined` and the card shows a small muted "Not assessed (legacy record)" label ONLY for DB-loaded data, never for newly-ingested drafts. | Code-only behavior; no migration. Hydrators already tolerate missing fields. |
| **Live service config** | None — Phase 61 only renders UI on the frontend. | None — verified by inspection. |
| **OS-registered state** | None. | None — verified. |
| **Secrets and env vars** | `NEXT_PUBLIC_API_BASE` continues to drive `frontend/lib/api.ts`. No new env. | None. |
| **Build artifacts / installed packages** | Shared package build outputs (`@worldforge/shared`) must be fresh before frontend typecheck (the existing `typecheck` script already `npm --prefix ../shared run build` first). No new packages. | Normal `npm install` / `npm --prefix frontend run typecheck` suffices. |

**After every file in the repo is updated, what runtime systems still have the old shape cached?** Nothing. UI consumes already-available response fields. No database migration. No shared-type change. No new API endpoint. Only a small additive change to `apiPost`'s error-parsing logic.

## Open Questions

1. **Should the override field be visible or collapsed by default on the existing-draft (compact) strip?**
   - What we know: Full mode always shows override (prominent). Compact mode is a thin "recreate" strip.
   - What's unclear: Users who already have a draft and want to re-generate may want a quick override entry; others may find it noisy.
   - Recommendation: Collapsed `<details>` with "Override instructions" summary; opens on click. Planner calibrates after Wave 1 with real usage.

2. **Does the NPC tab need a retry banner PER NPC or one for the whole section?**
   - What we know: Player page has at most one ingestion at a time (for the current draft).
   - What's unclear: NPC tab may be queuing multiple creations; concurrent retries would need per-card state.
   - Recommendation: One banner at the section level above the grid, scoped to the last failed creation attempt. NPCs don't support concurrent ingestion today (busy boolean is section-level) — keep the same semantics.

3. **Should `save-character` route also be wrapped with a `PipelineErrorBanner`?**
   - What we know: `save-character` does NOT run the ingestion pipeline (Phase 60 plan 60-04 explicitly confirmed it just persists).
   - What's unclear: Should its errors be styled consistently?
   - Recommendation: OUT OF SCOPE for Phase 61. `save-character` errors are DB-shaped (location not found, etc.), not pipeline-shaped. Keep `toast.error` for save. The banner is for ingestion only.

4. **PinchTab smoke — headless or headful?**
   - What we know: MEMORY.md documents PinchTab install + E2E pattern, but also flags persistent `chrome-error://chromewebdata/` when PinchTab is attached to a shared proxied profile and the page loads `localhost:3000`.
   - What's unclear: Will Phase 61 smoke succeed in current environment?
   - Recommendation: Plan the smoke script; execute it as part of manual closeout. If PinchTab cannot reach localhost, fall back to manual browser verification per Phase 33 precedent. Do NOT gate merge on PinchTab if the known-blocker is present — Vitest suite + typecheck is the automated gate.

5. **Is `formatCanonicalStatus` in `character-card.tsx:85` the right source of truth for "known_ip_canonical" etc. labels, or should it move to `@worldforge/shared`?**
   - What we know: It's a 12-line local helper used only by CharacterCard today.
   - What's unclear: NPC card doesn't show a canonical status label at top level; Phase 61 may want to.
   - Recommendation: Leave in place. If NPC card starts showing the label, extract to a new `frontend/lib/character-display.ts` helper; premature today.

## Implementation Risks

1. **Error transport refactor is a load-bearing change.** `apiPost` is called by ~30 wrappers across the app (verified with grep: 30+ matches in `frontend/lib/api.ts`). Changing its error-throw shape from `new Error(msg)` to sometimes `new IngestionError(msg, stage, attempts)` is backward-compatible (still an `Error`), BUT any existing `catch (err: Error) { toast.error(err.message) }` in other places now receives an `IngestionError` and might print a confusing "... at stage synthesize after 3 attempts" message. Recommended: keep the throw generic — only character routes emit 502 with stage, so only the character call sites need to check `instanceof IngestionError`. The current refactor is localized to `apiPost` returning the right class; other callers see an `Error` with `.name === "IngestionError"` which is fine. Run `gitnexus_impact({target: "apiPost", direction: "upstream"})` before merging.

2. **Retry button re-fires the same call with exactly the same bundle.** If user edited textarea between the failure and the retry click, the new edit is lost on retry. This is intentional (retry = "re-run the failed call"), but UX must communicate it. Label the retry button and document clearly. Alternative: disable the primary mode buttons while a retry banner is visible — probably worse UX. Keep current plan: retry uses the captured closure; primary actions remain active and re-submit at user's discretion.

3. **Running 4 modes in one component risks bloat.** `CharacterForm` would grow 2-3x if all 4 modes are inline. Plan must keep each mode panel ≤50 lines and extract any panel that exceeds it. Current `CharacterForm` is 195 lines; adding research mode + override field + cleaner tabbed layout could push over 400 if naive. Use `<CreationModes>` + per-mode panels approach above.

4. **Extraction of `PowerStatsSection` breaks `character-record-inspector.test.tsx` if the test imports the internal `PowerStatsTable` by name.** Verified: the test file is present (`frontend/components/world-review/__tests__/character-record-inspector.test.tsx` exists per Glob output). Before extraction, scan for direct imports of the inner render helpers; rewire them to the new shared component. GitNexus impact on `PowerStatsTable` (if it's exported) will enumerate this.

5. **NPC tab's `researchCharacter` currently ALSO serves as "AI Generate" (the button is labeled "AI Generate").** Phase 61 must rename and add a separate pure `generateCharacter(role="key")` call. Backend accepts `role="key"` on generate-character (verified in `backend/src/routes/character.ts:185` — uses the same `setupCharacterEndpoint` path). **Confirmed supported: no backend change required.** This is good news; Phase 61 doesn't need Phase 60 extensions.

6. **Toasts removed from ingestion-error path may surprise observers.** Some of the UAT session notes (per STATE.md Phase 57 UAT) rely on toast-error as a signal. Document the shift in the Phase 61 verification log.

7. **Empty-state vs retry-state collision.** Player page has two layouts: empty (no draft, centered launcher) and populated (draft + compact strip + card). If ingestion fails in empty state, banner must render within the centered launcher layout, not collapse it. Test this explicitly.

8. **`OverrideTextField` in empty-state full mode requires space.** Current full-mode `CharacterForm` is already a tall hero (textarea + buttons + divider + secondary actions). Adding a 4-row override textarea below the parse button and above the divider pushes the "or" divider and secondary actions further down. Risk: on short viewports the secondary actions scroll off-screen. Plan may need to re-arrange or collapse the override field by default. Phase 61 should ship with it visible (discoverability first) and reconsider after UAT.

## Sources

### Primary (HIGH confidence — direct code inspection)
- `backend/src/routes/character.ts:1-447` — Phase 60 final route shape + error envelope
- `backend/src/character/ingestion/types.ts:1-96` — `IngestionInput`, `IngestionStage`, `V2CardPayload`
- `backend/src/character/ingestion/pipeline.ts` (Phase 60 Plan 04 summary confirms 106 lines + stages)
- `shared/src/types.ts:517-564` — `PowerStats`, `HaxAbility`, `CharacterVulnerability`, tier constants
- `shared/src/types.ts:424-448` — `CharacterDraft` with `powerStats?: PowerStats`
- `shared/src/power-tiers.ts` — `formatTierRank` (via GitNexus surfaced)
- `frontend/lib/api.ts:545-610, 1025-1079` — error-parsing + 4 character wrappers
- `frontend/lib/api-types.ts:272-295` — `CharacterResultEnvelope`
- `frontend/app/(non-game)/campaign/[id]/character/page.tsx:1-350` — current player page + mode handlers
- `frontend/components/character-creation/character-form.tsx:1-195` — current 3-mode form
- `frontend/components/character-creation/character-card.tsx:1-569` — current player card (no PowerStats)
- `frontend/components/world-review/npcs-section.tsx:1-662` — current NPC tab (3 modes, research labeled "AI Generate")
- `frontend/components/world-review/character-record-inspector.tsx:96-202, 374-384` — `PowerStatsTable` + hax + vulnerabilities + `No power assessment` placeholder
- `frontend/lib/v2-card-parser.ts:1-40` — V2/V3 PNG/JSON parser

### Primary (HIGH confidence — Phase 60 closeout)
- `.planning/phases/60-character-ingestion-backend-pipeline/60-RESEARCH.md` (full file read)
- `.planning/phases/60-character-ingestion-backend-pipeline/60-04-SUMMARY.md` (full file read — authoritative contract)
- `.planning/REQUIREMENTS.md` — P60-R1..R9 rows marked complete
- `.planning/STATE.md` — Phase 60 complete; "Phase 61 unblocks Phase 57 Tests 2-3"

### Primary (HIGH confidence — user directives / project memory)
- `docs/ui_concept_hybrid.html:1-110` — aesthetic tokens (Inter/Playfair, hybrid palette, blood accent)
- `~/.claude/projects/R--Projects-WorldForge/memory/project_v2_import_pipeline.md` — override priority design
- `~/.claude/projects/R--Projects-WorldForge/memory/feedback_no_fallbacks_v2.md` — no silent degradation
- `~/.claude/projects/R--Projects-WorldForge/memory/feedback_backdrop_blur_perf.md` — no backdrop-blur on shell
- `~/.claude/projects/R--Projects-WorldForge/memory/feedback_no_ip_in_prompts.md` — generic placeholders only
- `CLAUDE.md` — project stack + architecture principles + endpoints list
- `~/.claude/CLAUDE.md` + `~/.claude/rules/*.md` — workflow, coding-style, testing standards

### Secondary (MEDIUM confidence — configuration, inferred)
- `frontend/package.json` — Vitest 3.2 + lint/typecheck scripts (confirmed grep)
- `frontend/vitest.config.ts` + repo-root `vitest.config.ts` — jsdom environment per Phase 27 decision
- `.planning/config.json` — `workflow.nyquist_validation: true` (confirmed; Validation Architecture section required)

### Tertiary (LOW confidence)
- Visual regression: no automated pixel-perfect tool configured for Phase 61 (class-token assertions are the practical gate)

## Metadata

**Confidence breakdown:**
- Current UI State: HIGH — every referenced file read fully
- Backend API Mapping: HIGH — Phase 60 Plan 04 summary is authoritative
- Power Stats Design: HIGH — existing render helpers confirmed correct; extraction is mechanical
- Override Text UX: HIGH — shape and char limit match Phase 60 Zod schema (2000)
- Unification Plan: MEDIUM — best shape chosen from multiple viable decompositions; planner may adjust internal boundaries
- Error Handling: HIGH — contract on backend is typed and tested; frontend refactor path is clean
- Validation Architecture: HIGH — Vitest infrastructure already established across frontend
- Pitfalls: HIGH — derived from actual code quirks, not speculation
- Runtime State: HIGH — verified each category explicitly
- Environment: HIGH — no new deps

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable — depends on Phase 60 contract which is frozen and Phase 57 PowerStats types)
