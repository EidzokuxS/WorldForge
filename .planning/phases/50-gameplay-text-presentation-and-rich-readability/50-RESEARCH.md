# Phase 50: Gameplay Text Presentation & Rich Readability - Research

**Researched:** 2026-04-13
**Domain:** `/game` text rendering, typography, bounded rich-text rendering, and settings-backed debug disclosure
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Text Roles
- **D-01:** Narration and input/UI must not share one flat text mode. Narration is a reader-oriented presentation layer; input/UI is more utilitarian and faster to scan.
- **D-02:** Story text should read like a digital reader surface, not like heavy “bookish italic on dark background” plaintext.

### Rich Text Contract
- **D-03:** Do not invent a new formatting language. Use a lightweight `SillyTavern`-style RP formatting contract.
- **D-04:** The baseline formatting contract is:
  - `"quoted speech"` for direct speech
  - `*action*` for actions / scene emphasis
  - `**strong emphasis**` for stronger emphasis
- **D-05:** Rich text is bounded and exists to improve readability, not to become a full markdown editor or a free-form formatting system.
- **D-06:** Normal paragraph separation, quote presentation, and distinct treatment for system/lookup blocks are part of the contract.

### Input Experience
- **D-07:** Player input remains a normal text input surface, not a WYSIWYG editor.
- **D-08:** The player can type the same lightweight RP markup directly in the input.
- **D-09:** Formatting is primarily realized at render time after submission, not through a heavy live editor UI.

### Message Surface Hierarchy
- **D-10:** Message types must render differently instead of sharing one plain text treatment.
- **D-11:** Ordinary narration is the primary literary/reader block.
- **D-12:** Player input renders as its own visually distinct bubble/block.
- **D-13:** System, progress, lookup, and compare messages render as compact special blocks rather than ordinary narration paragraphs.
- **D-14:** Mechanical resolution blocks are allowed and desired for significant Oracle/mechanical moments, but should not appear after every trivial action.

### UI Concept Alignment
- **D-15:** `docs/ui_concept_hybrid.html` is the canonical visual direction for this phase.
- **D-16:** Scope is broader than “support bold/italic.” Phase 50 should pull `/game` toward the concept’s overall gameplay text shell:
  - typography
  - central reading surface
  - player action presentation
  - special result blocks
  - panel readability
  - sticky input presentation
- **D-17:** This is a presentation-layer alignment phase, not a navigation redesign and not a gameplay-logic phase.

### Streaming Presentation
- **D-18:** SSE truth stays intact, but streaming presentation should feel more crafted than raw plaintext accumulation.
- **D-19:** During streaming, text should settle into readable blocks rather than looking like an unstyled buffer.
- **D-20:** When a turn finishes, the final presented block should look like a finished crafted fragment, not a temporary stream artifact.

### Reasoning Surface
- **D-21:** Add an optional raw reasoning block under a spoiler/disclosure UI for providers that expose reasoning separately.
- **D-22:** This reasoning block is a user-facing debug affordance for the project owner, not part of the canonical narrative layer.
- **D-23:** If a provider does not return reasoning, no reasoning block is shown.
- **D-24:** Reasoning visibility is controlled by a global toggle in settings.

### Claude's Discretion
- Exact typography scale, spacing, and panel polish
- Exact parser/renderer implementation strategy for bounded RP markup
- Exact visual treatment for special blocks, so long as it remains aligned with the hybrid concept
- Exact spoiler/disclosure treatment for reasoning, so long as it stays optional and settings-controlled

### Deferred Ideas (OUT OF SCOPE)

### Reviewed Todos (not folded)
- `2026-03-29-add-reusable-multi-worldbook-library.md` — todo-match surfaced only weakly via the word `campaign`; it is unrelated to gameplay text presentation and remains out of scope for Phase 50.

None beyond that — discussion stayed within Phase 50 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Gameplay text surfaces present player input and generated narration with materially better readability, formatting, and rich-text affordances. | Role-based message rendering, bounded markdown parsing at render time, typography plugin styling, stream-safe status separation, special block hierarchy, and settings-backed reasoning disclosure. |
</phase_requirements>

## Summary

Phase 50 should stay presentation-first and message-role-first. The current `/game` runtime already keeps transport truth and streaming state separate: `GamePage` owns `turnPhase` and `sceneProgress`, `parseTurnSSE()` keeps SSE events typed, and `NarrativeLog` is the single rendering seam for user, assistant, and system content. That means the phase does not need a gameplay rewrite. It needs a safer renderer, better typography, and clearer message hierarchy.

The current bottleneck is not missing data. It is that `NarrativeLog` still renders raw `whitespace-pre-wrap` text and string prefixes, `ActionBar` is only a lightly styled textarea, lookup answers are flattened into `[Lookup: kind] ...` prose, and there is no settings contract for the optional reasoning disclosure. The standard implementation path is: keep stored content raw, derive a richer view model at render time, use a bounded markdown renderer for narration/player text, keep streaming/finalization copy outside message bodies, and style special blocks separately from reader prose.

**Primary recommendation:** Build Phase 50 around a new bounded rich-text renderer inside the existing `NarrativeLog` seam, using `react-markdown` + `remark-gfm` + Tailwind Typography, while keeping `ActionBar`, lookup/system blocks, and reasoning disclosure as separate role-specific surfaces.

## Project Constraints (from CLAUDE.md)

- Use the existing stack: Next.js App Router, Tailwind CSS, shadcn UI, Hono, Vercel AI SDK, Drizzle, SQLite, LanceDB, Zod.
- Preserve the architecture rule that the LLM is narrator only and the engine remains deterministic.
- Keep all AI/tool payloads and settings contracts schema-validated with Zod.
- Use TypeScript strict mode and ES modules.
- Keep shared contracts in `@worldforge/shared`; do not duplicate frontend/backend types for settings or message shape.
- Route handlers must keep the established `try/catch` + `parseBody()` + `getErrorStatus()` pattern if Phase 50 touches settings routes.
- Prefer minimal-impact changes focused on the existing `/game` seams, not a broad app-shell rewrite.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | `16.1.6` installed (`16.2.3` latest verified, published 2026-04-08) | Existing frontend host, layout, and `next/font` usage | Already the repo standard; Phase 50 should build on it, not change it. |
| Tailwind CSS | `4.x` installed (`4.2.2` latest verified, published 2026-03-18) | Tokens, layout, dark theme, and typography plugin host | Already powers `/game`; typography work should stay in the same utility system. |
| `react-markdown` | `10.1.0` verified, published 2025-03-07 | Safe markdown-to-React rendering for bounded RP markup | Official README: safe by default, component overrides, plugin ecosystem. |
| `@tailwindcss/typography` | `0.5.19` verified, published 2025-09-24 | Reader-surface prose styling for narration blocks | Official Tailwind plugin for prose defaults, dark mode, and element modifiers. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `remark-gfm` | `4.0.1` verified, published 2025-02-10 | GitHub-flavored markdown extensions | Use with `react-markdown` so emphasis, lists, links, and future tables/tasklists behave predictably. |
| `remark-breaks` | `4.0.0` verified, published 2023-09-22 | Preserve author line endings as visible breaks | Use only if single line endings should render closer to how players/models authored them. |
| Existing `radix-ui` / shadcn primitives | `1.4.3` installed | Settings tabs, switches, disclosure/button patterns | Reuse existing primitives for the optional reasoning disclosure and settings UI. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-markdown` | Custom regex/parser pipeline | Lower dependency count, but much worse escaping, nesting, streaming, and maintenance behavior. |
| `@tailwindcss/typography` | Hand-authored paragraph/emphasis classes everywhere | Works for one block, but quickly drifts across narration, lookup blocks, and panel text. |
| Top-level `ui.showRawReasoning` | `storyteller` or `research` nested toggle | Hides a presentation concern inside model/search config; harder to reason about and reuse later. |

**Installation:**
```bash
npm --prefix frontend install react-markdown@10.1.0 remark-gfm@4.0.1 @tailwindcss/typography@0.5.19
```

**Optional:**
```bash
npm --prefix frontend install remark-breaks@4.0.0
```

**Version verification:**
- `react-markdown@10.1.0` — npm publish date `2025-03-07`
- `remark-gfm@4.0.1` — npm publish date `2025-02-10`
- `remark-breaks@4.0.0` — npm publish date `2023-09-22`
- `@tailwindcss/typography@0.5.19` — npm publish date `2025-09-24`
- Current repo stack is slightly behind latest `next`, `react`, `react-dom`, `tailwindcss`, and `vitest`; no Phase 50 requirement justifies upgrading them.

## Architecture Patterns

### Recommended Project Structure
```text
frontend/
├── app/
│   ├── game/page.tsx                  # Keeps transport truth, turn phases, and message state orchestration
│   └── globals.css                    # Typography plugin registration and gameplay text tokens
├── components/game/
│   ├── narrative-log.tsx              # Role-aware message list and stream/finalization statuses
│   ├── rich-text-message.tsx          # New bounded markdown renderer for narration/player content
│   ├── special-message-block.tsx      # New compact lookup/system/mechanical block renderer
│   └── action-bar.tsx                 # Sticky input shell and lightweight markup affordance copy
├── components/settings/
│   └── gameplay-tab.tsx or ui card    # New global reasoning toggle surface
└── lib/
    └── gameplay-text.ts               # New render-time classification/parsing helpers

shared/src/
├── types.ts                           # Additive `Settings` UI/gameplay toggle contract
└── settings.ts                        # Default settings for the toggle

backend/src/
├── routes/schemas.ts                  # Settings payload schema update
└── settings/manager.ts                # Settings normalization/persistence update
```

### Pattern 1: Role-First Message Rendering
**What:** Derive a render kind from each message before typography. Narration, player input, system notices, lookup/compare blocks, and mechanical blocks should not share the same wrapper or typography classes.
**When to use:** Everywhere content enters `NarrativeLog`.
**Example:**
```ts
type RenderKind = "narration" | "player" | "system" | "lookup" | "mechanical";

function deriveRenderKind(message: ChatMessage): RenderKind {
  if (message.role === "user") return "player";
  if (message.role === "system") return "system";
  if (message.content.startsWith("[Lookup:")) return "lookup";
  return "narration";
}
```
Source: repo seams in `frontend/components/game/narrative-log.tsx` and `frontend/app/game/page.tsx`

### Pattern 2: Render Rich Text at Display Time, Not Storage Time
**What:** Keep `ChatMessage.content` raw and render it with a safe markdown component. Do not persist HTML, React nodes, or editor markup in history.
**When to use:** Narration and submitted player messages.
**Example:**
```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function RichTextMessage({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-5">{children}</p>,
        em: ({ children }) => <em className="not-italic text-white/92">{children}</em>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      }}
    >
      {content}
    </Markdown>
  );
}
```
Source: `https://github.com/remarkjs/react-markdown`, `https://github.com/remarkjs/remark-gfm`

### Pattern 3: Stream-Safe Formatting
**What:** Keep SSE statuses (`scene-settling`, `finalizing_turn`, `done`) outside the rendered message body and re-render the current assistant buffer through the same rich-text component as it grows.
**When to use:** Streaming assistant narration, opening scenes, retry flow, and lookup flow.
**Example:**
```tsx
<NarrativeLog
  messages={messages}
  turnPhase={turnPhase}
  sceneProgress={sceneProgress}
  isStreaming={turnPhase === "streaming"}
/>
```
Source: repo seams in `frontend/app/game/page.tsx` and `frontend/lib/api.ts`

### Pattern 4: Settings-Backed Optional Reasoning Disclosure
**What:** Add a top-level UI/gameplay toggle such as `settings.ui.showRawReasoning` with default `false`. Render a disclosure block only when the toggle is enabled and separate reasoning content exists.
**When to use:** Provider-specific debug reasoning, never canonical narration.
**Example:**
```ts
export interface UiConfig {
  showRawReasoning: boolean;
}

export interface Settings {
  // existing fields...
  ui: UiConfig;
}
```
Source: repo settings patterns in `shared/src/types.ts`, `shared/src/settings.ts`, `backend/src/settings/manager.ts`

### Anti-Patterns to Avoid
- **Raw HTML in message content:** Do not switch to `dangerouslySetInnerHTML` or enable arbitrary HTML parsing for narration.
- **One prose wrapper for everything:** Do not wrap lookup blocks, progress copy, quick actions, and Oracle output in the same `prose` surface as narration.
- **Editor creep:** Do not turn `ActionBar` into a live formatter or WYSIWYG editor.
- **Status text inside narration:** Keep streaming/finalizing/opening state separate from story text, as Phase 39/45 already established.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bounded markdown parsing | Regex-based inline emphasis parser | `react-markdown` + `remark-gfm` | Handles escaping, nesting, and React-safe rendering without custom parser debt. |
| Reader typography | One-off paragraph/emphasis CSS on each component | `@tailwindcss/typography` plus element modifiers | Gives a consistent reader surface and dark-mode support across narration blocks. |
| Reasoning disclosure | Ad hoc HTML string toggles or inline hidden text | Existing button/state pattern or a simple native disclosure on a dedicated component | Keeps debug content separate from narrative content and easier to gate behind settings. |
| Settings persistence | Frontend-only local toggle | Shared `Settings` contract + backend normalization | The phase explicitly requires a global settings-controlled toggle. |

**Key insight:** The repo already has the right truth boundaries. Phase 50 should improve readability by upgrading render-time presentation, not by changing gameplay mechanics, SSE semantics, or canonical stored message text.

## Common Pitfalls

### Pitfall 1: Streaming Partial Markdown Looks Broken
**What goes wrong:** Mid-stream chunks contain half-finished `*` or `**` markers, causing flicker or awkward formatting shifts.
**Why it happens:** The renderer is parsing an unfinished buffer as if it were final text.
**How to avoid:** Treat the raw string as the source of truth, render it incrementally, and accept that incomplete emphasis remains plain text until closed. Keep loading/finalization copy separate.
**Warning signs:** Users see formatting snap on and off or status text embedded inside the prose block.

### Pitfall 2: Special Blocks Lose Scanability
**What goes wrong:** Lookup answers, system notices, and mechanical resolutions render as dense reader prose.
**Why it happens:** Message kind is derived only from `role`, not from the actual surface contract.
**How to avoid:** Add a render-kind layer before typography. Keep narration, player input, lookup/system, and Oracle/mechanical output on distinct components.
**Warning signs:** Lookup entries look like ordinary narration paragraphs and Oracle output visually competes with the story text.

### Pitfall 3: Reasoning Leaks into Canonical Narrative
**What goes wrong:** Raw reasoning is stored in `ChatMessage.content` or displayed unconditionally.
**Why it happens:** Debug data is treated like story text instead of additive metadata.
**How to avoid:** Keep reasoning out of the canonical narrative string and gate it behind a global settings toggle plus a dedicated disclosure block.
**Warning signs:** Reloaded history shows debug internals as normal narration or player-facing text.

### Pitfall 4: Typography Plugin Bleeds into Non-Narrative UI
**What goes wrong:** Buttons, chips, panel labels, or compact status blocks inherit prose spacing and element styles.
**Why it happens:** `prose` is applied too high in the tree.
**How to avoid:** Scope typography to the narration/player rich-text subtree only.
**Warning signs:** Quick actions, Oracle panel, or side-panel labels suddenly get large margins and paragraph spacing.

### Pitfall 5: Settings Contract Is Added Only on the Frontend
**What goes wrong:** The reasoning toggle appears to work until refresh, then resets or is silently dropped.
**Why it happens:** `shared/src/types.ts`, `shared/src/settings.ts`, backend schema, and normalization were not all updated.
**How to avoid:** Treat the toggle like any other persisted settings field and update shared, backend, and frontend in one pass.
**Warning signs:** `POST /api/settings` succeeds but the saved payload omits the new field.

## Code Examples

Verified patterns from official sources and current repo seams:

### Tailwind Typography in Tailwind v4
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```
Source: `https://github.com/tailwindlabs/tailwindcss-typography`

### Narration Surface Styling
```tsx
<article className="prose prose-zinc prose-invert max-w-none prose-p:leading-8 prose-p:text-bone/95 prose-strong:text-white prose-em:not-italic">
  <RichTextMessage content={message.content} />
</article>
```
Source: `https://github.com/tailwindlabs/tailwindcss-typography`, `https://github.com/remarkjs/react-markdown`

### Next Font Reuse
```tsx
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin", "cyrillic"] });
```
Source: repo pattern in `frontend/app/layout.tsx`, Next.js font docs `https://nextjs.org/docs/app/api-reference/components/font`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `whitespace-pre-wrap` text blocks | AST-based markdown rendering with component overrides (`react-markdown` 10.x line) | Current release line verified 2025-03-07 | Safer rendering, better emphasis handling, easier role-specific styling. |
| Hand-authored typography on each paragraph | `prose` classes + element modifiers from Tailwind Typography | Current plugin line verified 2025-09-24 | More consistent reader surface and dark-mode styling with less bespoke CSS. |
| Inline debug text mixed into visible content | Optional disclosure backed by a persisted UI toggle | Current repo pattern supports this via shared settings expansion | Keeps debug reasoning separate from canonical narration and normal play. |

**Deprecated/outdated:**
- Flat string-prefix presentation as the only special-block contract: workable for lookup detection today, but not sufficient as the long-term sole rendering strategy once reasoning and mechanical blocks are added.
- WYSIWYG/live formatting input: explicitly out of scope and contrary to the phase contract.

## Open Questions

1. **Should lookup/mechanical blocks stay prefix-derived or gain additive UI metadata?**
   - What we know: current lookup history is persisted as assistant text with a stable `[Lookup: kind]` prefix.
   - What's unclear: whether Phase 50 special blocks will stop at lookup/system styling or also attach richer per-message metadata.
   - Recommendation: plan Phase 50 around prefix-derived rendering first; only introduce additive UI metadata if mechanical blocks need more than content-based classification.

2. **Should raw reasoning persist across reloads?**
   - What we know: the current shared `ChatMessage` history contract has no reasoning field, and the user wants reasoning as a debug affordance, not canonical story text.
   - What's unclear: whether the project owner expects old reasonings to survive page refresh/history reload.
   - Recommendation: default to non-canonical additive metadata and only persist it if planning finds a concrete debug workflow that requires reload survival.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` installed (`4.1.4` latest verified) |
| Config file | `vitest.config.ts` at repo root; `frontend/vitest.config.ts` also exists for frontend-local runs |
| Quick run command | `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx frontend/components/game/__tests__/action-bar.test.tsx frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` |
| Full suite command | `npm run typecheck && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Narration and player messages render with distinct readable surfaces and bounded rich-text emphasis | unit | `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx frontend/components/game/__tests__/action-bar.test.tsx` | ✅ |
| UX-01 | Streaming, lookup, retry/finalization, and `/game` correctness stay intact under the richer renderer | integration | `npx vitest run frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` | ✅ |
| UX-01 | Global reasoning toggle persists and only reveals raw reasoning when enabled and present | integration | `npx vitest run frontend/app/(non-game)/settings/__tests__/page.test.tsx backend/src/routes/__tests__/settings.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx frontend/components/game/__tests__/action-bar.test.tsx frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts`
- **Per wave merge:** `npm run typecheck && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- None — existing Vitest + jsdom coverage already spans `/game`, settings, and SSE parsing. Extend existing tests unless a dedicated `RichTextMessage` component is introduced, in which case add one focused component test file.

## Sources

### Primary (HIGH confidence)
- Repo context and constraints:
  - `.planning/phases/50-gameplay-text-presentation-and-rich-readability/50-CONTEXT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/STATE.md`
  - `.planning/ROADMAP.md`
  - `.planning/PROJECT.md`
  - `CLAUDE.md`
- Repo implementation seams:
  - `frontend/app/game/page.tsx`
  - `frontend/components/game/narrative-log.tsx`
  - `frontend/components/game/action-bar.tsx`
  - `frontend/components/game/location-panel.tsx`
  - `frontend/components/game/character-panel.tsx`
  - `frontend/components/game/quick-actions.tsx`
  - `frontend/components/game/oracle-panel.tsx`
  - `frontend/app/globals.css`
  - `frontend/app/layout.tsx`
  - `shared/src/types.ts`
  - `shared/src/settings.ts`
  - `backend/src/settings/manager.ts`
  - `backend/src/routes/schemas.ts`
  - `frontend/components/game/__tests__/narrative-log.test.tsx`
  - `frontend/components/game/__tests__/action-bar.test.tsx`
  - `frontend/app/game/__tests__/page.test.tsx`
  - `frontend/lib/__tests__/api.test.ts`
- Official docs / primary package docs:
  - `https://github.com/remarkjs/react-markdown`
  - `https://github.com/remarkjs/remark-gfm`
  - `https://github.com/remarkjs/remark-breaks`
  - `https://github.com/tailwindlabs/tailwindcss-typography`
  - `https://nextjs.org/docs/app/api-reference/components/font`

### Secondary (MEDIUM confidence)
- `https://nextjs.org/learn/seo/fonts` — reinforces current `next/font` optimization guidance

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - official package docs plus npm registry version verification
- Architecture: HIGH - derived from current `/game`, settings, and SSE seams in the repo
- Pitfalls: MEDIUM-HIGH - based on current code, official renderer/plugin behavior, and one unresolved persistence question for reasoning metadata

**Research date:** 2026-04-13
**Valid until:** 2026-05-13
