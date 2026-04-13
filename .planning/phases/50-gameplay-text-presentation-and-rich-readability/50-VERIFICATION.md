---
phase: 50-gameplay-text-presentation-and-rich-readability
verified: 2026-04-13T05:41:02Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "Long-form narration readability in /game"
    expected: "Multi-turn narration reads materially better than the old dense plain-text log, with clear paragraph rhythm and stronger scanability."
    why_human: "This is a qualitative UX judgment about readability and pacing, not just a code-path question."
  - test: "Special block scanability during live play"
    expected: "Lookup, compare, system, progress, and mechanical blocks remain easy to scan without overpowering narration."
    why_human: "Balance between support blocks and story prose is visual/experiential."
  - test: "Raw reasoning disclosure usefulness"
    expected: "With the Gameplay toggle enabled, reasoning is clearly optional/debug-only and stays visually subordinate to canonical narration."
    why_human: "The disclosure's usefulness and intrusiveness require real visual inspection in the running UI."
---

# Phase 50: Gameplay Text Presentation & Rich Readability Verification Report

**Phase Goal:** Make gameplay text surfaces materially easier to read and scan through better formatting, typography, and rich-text affordances.
**Verified:** 2026-04-13T05:41:02Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Generated narration and player input render with improved readability rather than dense hard-to-scan plain blocks. | ✓ VERIFIED | `frontend/lib/gameplay-text.ts` exports the bounded message helpers (`3`, `28`, `59`, `63`, `71`, `80`); `frontend/components/game/rich-text-message.tsx` uses `react-markdown`/`remark-gfm` with a bounded allowlist (`3-4`, `47-49`); `frontend/components/game/narrative-log.tsx` renders assistant narration through `RichTextMessage` and player input in a separate block (`118`, `153`); `frontend/components/game/action-bar.tsx` upgrades the input surface and RP hint (`50`, `66`, `95`); tests cover the RP subset and `/game` rendering (`frontend/components/game/__tests__/rich-text-message.test.tsx:56,75,109`, `frontend/components/game/__tests__/narrative-log.test.tsx:36`, `frontend/app/game/__tests__/page.test.tsx:402-416`). |
| 2 | Rich-text affordances improve emphasis and structure without obscuring stream behavior or gameplay state. | ✓ VERIFIED | `rich-text-message.tsx` explicitly limits formatting to `em`, `strong`, and `br` while skipping HTML and unwrapping disallowed markdown (`47-49`); `narrative-log.tsx` keeps streaming/opening/finalizing copy in separate `SpecialMessageBlock` progress blocks (`91-97`, `270`); backend reasoning stays on its own SSE lane in `backend/src/engine/turn-processor.ts` (`1209-1210`, `1345-1346`) and `backend/src/routes/chat.ts` (`293-295`), with frontend parsing in `frontend/lib/api.ts` (`726`, `755`); tests lock these behaviors (`backend/src/engine/__tests__/turn-processor.test.ts:549`, `frontend/lib/__tests__/api.test.ts:395`, `frontend/app/game/__tests__/page.test.tsx:911,946`). |
| 3 | Presentation changes stay consistent across `/game` and preserve correctness of gameplay updates. | ✓ VERIFIED | `frontend/app/game/page.tsx` wires `LocationPanel`, `NarrativeLog`, `CharacterPanel`, `QuickActions`, and `ActionBar` into one reader shell (`7-14`, `967-1024`); `showRawReasoning` is loaded from persisted settings and passed to `NarrativeLog` (`227`, `297-298`, `992`); location/travel/quick-action behavior remains data-driven from world state and SSE handlers (`671-697`, `769-794`); targeted frontend/backend verification passed with 159 tests green. |

**Score:** 3/3 truths verified

### Required Artifacts

Note: `gsd-tools verify artifacts` produced several false negatives because the `contains:` values in the PLAN files use pipe-delimited token strings that appear to be matched literally. Manual line-by-line inspection below supersedes those false negatives.

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `frontend/lib/gameplay-text.ts` | Bounded render-time classification and paragraph/dialogue helpers | ✓ VERIFIED | Exports `GameMessageKind`, `deriveGameMessageKind`, `stripLookupPrefix`, `splitGameplayParagraphs`, `isDialogueParagraph`, and `preserveSoftBreaks` (`3`, `28`, `59`, `63`, `71`, `80`). |
| `frontend/components/game/rich-text-message.tsx` | Safe bounded RP renderer | ✓ VERIFIED | Uses `react-markdown` and `remark-gfm`; limits output via `skipHtml`, `unwrapDisallowed`, and `allowedElements={["em","strong","br"]}` (`3-4`, `47-49`). |
| `frontend/components/game/special-message-block.tsx` | Compact support-block renderer | ✓ VERIFIED | Implements `compare`, `lookup`, `system`, `mechanical`, and `progress` variants with dedicated compare labeling (`8`, `18-22`, `34-42`). |
| `frontend/components/game/narrative-log.tsx` | Role-first message rendering plus optional reasoning disclosure | ✓ VERIFIED | Imports and uses `RichTextMessage`/`SpecialMessageBlock`, keeps progress copy outside prose, and renders `Raw reasoning` under assistant narration only when gated (`12-13`, `91-97`, `118`, `153`, `224`, `270`). |
| `frontend/app/game/page.tsx` | Reader-centered `/game` shell and orchestration | ✓ VERIFIED | Wires the reader shell, sticky dock, settings-gated reasoning, world refresh, and SSE handlers (`227`, `269-298`, `671-697`, `905`, `967-1024`). |
| `frontend/components/game/action-bar.tsx` | Sticky plain-text action input with RP guidance | ✓ VERIFIED | Keeps a plain textarea, updates placeholder text, RP hint, and finalizing warning (`50`, `66`, `95`, `98`). |
| `frontend/components/game/location-panel.tsx` | Scan-friendly location rail | ✓ VERIFIED | Keeps Broad Location vs Immediate Scene separation and explicit sections for `Recent Happenings`, `Nearby Signs`, `People Here`, and `Paths` (`87`, `92-93`, `118`, `139`, `156`, `191`). |
| `frontend/components/game/character-panel.tsx` | Scan-friendly character rail | ✓ VERIFIED | Preserves character profile while improving section hierarchy for `Equipment` and `Inventory` (`47`, `66`, `84`, `99`, `120`, `147`, `169`). |
| `frontend/components/game/quick-actions.tsx` | Higher-contrast quick-action rail | ✓ VERIFIED | Keeps `actions` / `onAction` / `disabled` contract and authoritative unlock copy (`10-16`, `23-35`). |
| `shared/src/types.ts` | Shared UI settings contract | ✓ VERIFIED | Adds `UiConfig` and `Settings.ui.showRawReasoning` (`43-44`, `87`). |
| `shared/src/settings.ts` | Default settings for reasoning visibility | ✓ VERIFIED | Defaults `ui.showRawReasoning` to `false` (`98`). |
| `backend/src/settings/manager.ts` | Normalized persisted settings contract | ✓ VERIFIED | Normalizes `showRawReasoning` and rebinds persisted settings through backend authority (`180-183`). |
| `backend/src/routes/schemas.ts` | Settings payload validation | ✓ VERIFIED | Accepts `ui.showRawReasoning` in the settings payload schema (`96`). |
| `frontend/components/settings/gameplay-tab.tsx` | Dedicated Gameplay toggle UI | ✓ VERIFIED | Adds `Show raw reasoning` with debug-only/canonical narration copy (`22`, `30`, `33`, `35`). |
| `frontend/app/(non-game)/settings/page.tsx` | Gameplay tab mounted in existing save flow | ✓ VERIFIED | Mounts the `Gameplay` tab and `GameplayTab` component in the settings page (`12`, `68`, `82-83`). |
| `backend/src/engine/turn-processor.ts` | Separate reasoning turn event | ✓ VERIFIED | Reads `reasoningText` from `generateText(...)` results and yields `type: "reasoning"` without appending it to canonical chat history (`570-571`, `636`, `652`, `1209-1210`, `1345-1346`). |
| `backend/src/routes/chat.ts` | SSE transport for reasoning | ✓ VERIFIED | Streams the reasoning lane as a dedicated SSE event in `writeTurnEventSSE()` (`293-295`). |
| `frontend/lib/api.ts` | Frontend SSE parser support for reasoning | ✓ VERIFIED | Adds optional `onReasoning` handler and `case "reasoning"` parser support (`726`, `755`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `frontend/lib/gameplay-text.ts` | `frontend/components/game/rich-text-message.tsx` | Render-time helpers classify narration/dialogue without changing stored text | ✓ WIRED | `RichTextMessage` imports helper functions from `@/lib/gameplay-text` (`frontend/components/game/rich-text-message.tsx:6-10`). |
| `frontend/components/game/rich-text-message.tsx` | `frontend/components/game/narrative-log.tsx` | Shared bounded renderer for assistant + player surfaces | ✓ WIRED | `NarrativeLog` imports and uses `RichTextMessage` for narration and player messages (`frontend/components/game/narrative-log.tsx:12,118,153`). |
| `frontend/components/game/special-message-block.tsx` | `frontend/components/game/narrative-log.tsx` | Lookup/compare/system/progress stay out of prose | ✓ WIRED | `NarrativeLog` uses `SpecialMessageBlock` for support kinds and progress states (`frontend/components/game/narrative-log.tsx:13,113,165,270`). |
| `frontend/app/game/page.tsx` | `frontend/components/game/action-bar.tsx` | Sticky input mounted below reader surface while preserving busy-state control | ✓ WIRED | `ActionBar` receives `input`, `onSubmit`, `disabled`, and `turnPhase` from `GamePage` (`frontend/app/game/page.tsx:1011-1017`). |
| `frontend/app/game/page.tsx` | `frontend/components/game/location-panel.tsx` | Current-scene + travel contract preserved through new presentation layer | ✓ WIRED | `GamePage` passes `scene`, `connectedPaths`, `npcsHere`, `itemsHere`, `onMove`, and `disabled` (`frontend/app/game/page.tsx:967-974`). |
| `frontend/app/game/page.tsx` | `frontend/components/game/quick-actions.tsx` | Quick actions remain buffered until authoritative completion | ✓ WIRED | `bufferQuickActions()` hides actions until `onDone` calls `revealBufferedQuickActions()`; rendered through `QuickActions` (`frontend/app/game/page.tsx:287-293`, `685-697`, `1006-1010`). |
| `shared/src/types.ts` | `backend/src/settings/manager.ts` | Shared `ui.showRawReasoning` contract normalized and persisted by backend | ✓ WIRED | `manager.ts` imports `UiConfig`/`Settings` and normalizes the new field (`backend/src/settings/manager.ts:5-11`, `180-183`). |
| `backend/src/routes/schemas.ts` | `backend/src/routes/__tests__/settings.test.ts` | Settings route validation round-trips `ui.showRawReasoning` | ✓ WIRED | Backend tests cover defaults and legacy normalization (`backend/src/routes/__tests__/settings.test.ts:177,185`). |
| `frontend/components/settings/gameplay-tab.tsx` | `frontend/app/(non-game)/settings/page.tsx` | Gameplay tab uses existing settings load/save flow | ✓ WIRED | `SettingsPage` mounts `GameplayTab`; page test verifies save + reload persistence (`frontend/app/(non-game)/settings/page.tsx:68,82-83`, `frontend/app/(non-game)/settings/__tests__/page.test.tsx:81-114`). |
| `backend/src/engine/turn-processor.ts` | `backend/src/routes/chat.ts` | Reasoning stays a distinct SSE event instead of appended narration | ✓ WIRED | `turn-processor.ts` yields `type: "reasoning"` and `chat.ts` maps that to `event: "reasoning"` (`backend/src/engine/turn-processor.ts:1209-1210`, `backend/src/routes/chat.ts:293-295`). |
| `backend/src/routes/chat.ts` | `frontend/lib/api.ts` | Frontend parser consumes reasoning without disturbing other SSE events | ✓ WIRED | `chat.ts` emits `event: "reasoning"`; `parseTurnSSE()` consumes `case "reasoning"` via `onReasoning` (`backend/src/routes/chat.ts:293-295`, `frontend/lib/api.ts:726,755`). |
| `frontend/app/game/page.tsx` | `frontend/components/game/narrative-log.tsx` | Page-level assistant metadata gates disclosure with persisted settings | ✓ WIRED | `GamePage` loads `settings.ui.showRawReasoning`, attaches `debugReasoning`, and passes `showRawReasoning` + enriched messages into `NarrativeLog` (`frontend/app/game/page.tsx:269-298`, `992`). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `frontend/components/game/narrative-log.tsx` | `messages`, `showRawReasoning` | `frontend/app/game/page.tsx` state populated by `chatHistory()`, `getWorldData()`, and `parseTurnSSE()` callbacks | Yes — history loads from `/api/chat/history`, live turns come from SSE, reasoning attaches on `onReasoning` | ✓ FLOWING |
| `frontend/app/game/page.tsx` | `showRawReasoning` | `useSettings()` -> `fetchSettings()` -> `/api/settings` -> backend settings authority | Yes — persisted via shared settings contract and backend normalization | ✓ FLOWING |
| `frontend/components/settings/gameplay-tab.tsx` | `settings.ui.showRawReasoning` | `SettingsPage` state -> `save(settings)` -> `/api/settings` | Yes — UI writes through the normal autosave path and reloads persisted state | ✓ FLOWING |
| `frontend/lib/api.ts` | `onReasoning` event payload | `backend/src/routes/chat.ts` SSE stream | Yes — parser handles `reasoning` alongside `lookup_result`, `narrative`, and `done` | ✓ FLOWING |
| `backend/src/routes/chat.ts` | `event: "reasoning"` | `backend/src/engine/turn-processor.ts` `reasoningText` from `generateText(...)` | Yes — reasoning emitted only when present and never appended to canonical narration/history | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Frontend rich-text dependencies installed | `npm ls --workspace frontend react-markdown remark-gfm @tailwindcss/typography` | Resolved `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `@tailwindcss/typography@0.5.19` | ✓ PASS |
| Rich-text + `/game` presentation smoke | `npx vitest run frontend/components/game/__tests__/rich-text-message.test.tsx frontend/app/game/__tests__/page.test.tsx` | `2` files passed, `31` tests passed | ✓ PASS |
| Phase-targeted validation suite | `npx vitest run frontend/components/game/__tests__/rich-text-message.test.tsx frontend/components/game/__tests__/narrative-log.test.tsx frontend/components/game/__tests__/action-bar.test.tsx frontend/components/game/__tests__/location-panel.test.tsx frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts frontend/app/(non-game)/settings/__tests__/page.test.tsx backend/src/routes/__tests__/settings.test.ts backend/src/routes/__tests__/chat.test.ts backend/src/engine/__tests__/turn-processor.test.ts` | `10` files passed, `159` tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `UX-01` | `50-01`, `50-02`, `50-03`, `50-04` | Gameplay text surfaces present player input and generated narration with materially better readability, formatting, and rich-text affordances. | ? NEEDS HUMAN | Code and tests verify bounded rich-text rendering, role-specific message surfaces, improved `/game` shell/input/panels, persisted reasoning gate, and separate reasoning transport (`ROADMAP.md:223-225`, `REQUIREMENTS.md:43`, tests cited above). Final confirmation of “materially better readability” still requires live human inspection. |

No orphaned Phase 50 requirements were found. `UX-01` is the only requirement mapped to Phase 50 in `.planning/REQUIREMENTS.md`, and all four Phase 50 plans declare it in frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | No blocker anti-patterns found in inspected Phase 50 files. No `TODO`/`FIXME`/placeholder markers or `console.log`-only implementations were present in the phase-owned paths. | ℹ️ Info | No code-level evidence of a stub or incomplete implementation. |

### Human Verification Required

### 1. Long-Form Narration Readability

**Test:** Play a multi-turn scene in `/game`, including at least one ordinary action and one longer narration response.
**Expected:** Narration reads like an intentional reader surface with clearer paragraph rhythm and easier scanning than the old plain pre-wrapped log.
**Why human:** Readability quality is a visual and experiential judgment.

### 2. Special Block Balance

**Test:** Trigger a lookup/compare result and a normal action turn in the same session.
**Expected:** `Lookup`, `Power Profile`, and `Status` blocks are easier to scan than before but do not dominate the story surface.
**Why human:** The balance between support blocks and narration is qualitative.

### 3. Raw Reasoning Disclosure

**Test:** Enable `Settings -> Gameplay -> Show raw reasoning`, run a provider response that includes separate reasoning, then disable the toggle and repeat.
**Expected:** The `Raw reasoning` disclosure appears only when enabled and reasoning exists, stays visually subordinate to narration, and disappears entirely when the toggle is off.
**Why human:** This needs real UI judgment for usefulness and intrusiveness.

### Gaps Summary

No code or wiring gaps were found. Phase 50 is structurally implemented and well-covered by tests, but the goal statement includes subjective readability/scanability claims that still need human confirmation in the live `/game` UI.

---

_Verified: 2026-04-13T05:41:02Z_
_Verifier: Claude (gsd-verifier)_
