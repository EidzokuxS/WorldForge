# Phase 50: gameplay-text-presentation-and-rich-readability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 50-gameplay-text-presentation-and-rich-readability
**Areas discussed:** typography/readability target, rich-text contract, input behavior, UI concept alignment, mechanical/special blocks, streaming presentation, reasoning surface

---

## Typography / Readability Target

| Option | Description | Selected |
|--------|-------------|----------|
| Single flat text mode | One text style for narration and input | |
| Split text roles | Reader-oriented narration + utilitarian input/UI | ✓ |

**User's choice:** Split text roles.
**Notes:** Narration should read like a digital reader, while input/UI should be faster and easier to scan.

---

## Rich Text Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Invent a new formatting system | WorldForge-specific formatting language | |
| Bounded markdown-style system | Small custom subset, newly defined | |
| SillyTavern-style lightweight RP formatting | Familiar `"speech"`, `*action*`, `**emphasis**` conventions | ✓ |

**User's choice:** Use a SillyTavern-style lightweight RP formatting contract.
**Notes:** The user explicitly rejected inventing a new bicycle. Rich text should feel familiar and lightweight.

---

## Input Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| WYSIWYG editor | Rich editing controls inside the input itself | |
| Plain text input with lightweight markup | Player types raw text/markup and formatting appears on render | ✓ |

**User's choice:** Plain text input with lightweight markup.
**Notes:** Input should stay simple; no heavy editor UI.

---

## UI Concept Alignment

| Option | Description | Selected |
|--------|-------------|----------|
| Text-only uplift | Just improve formatting and fonts | |
| UI concept alignment for gameplay text surfaces | Bring `/game` noticeably closer to the hybrid concept without rewriting gameplay logic | ✓ |

**User's choice:** Align `/game` with the hybrid UI concept for gameplay text surfaces.
**Notes:** The user pointed out that an explicit UI concept already exists and the current UI has drifted far from it.

---

## Special / Mechanical Blocks

| Option | Description | Selected |
|--------|-------------|----------|
| Keep everything in one prose flow | Narration, player input, lookup, and mechanical info all look similar | |
| Distinct presentation modes | Narration, player input, lookup/system/progress, and significant mechanical resolution use different surfaces | ✓ |

**User's choice:** Distinct presentation modes.
**Notes:** The concept's resolution panel is desirable, but only for important Oracle/mechanical moments rather than every trivial turn.

---

## Streaming Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Raw plaintext streaming | Keep current stream feel, only restyle after completion | |
| Crafted streaming presentation | Preserve SSE truth but make streaming/final text feel like readable settled blocks | ✓ |

**User's choice:** Crafted streaming presentation.
**Notes:** The user agreed streaming should remain true but should not feel like an unstyled buffer.

---

## Reasoning Surface

| Option | Description | Selected |
|--------|-------------|----------|
| No reasoning UI | Never expose model reasoning | |
| Safe explanation summary only | Show only curated summaries, no raw reasoning | |
| Optional raw reasoning spoiler | Show provider reasoning under a spoiler when available, controlled by settings | ✓ |

**User's choice:** Optional raw reasoning spoiler.
**Notes:** The user explicitly wants raw reasoning for personal use and does not want it abstracted into a sanitized substitute. It should be globally toggleable in settings and shown only when the provider actually returns reasoning separately.

## the agent's Discretion

- Exact parser/renderer implementation strategy for the bounded RP formatting subset
- Exact visual treatment of special blocks and panel polish, as long as it remains aligned with the hybrid concept
- Exact disclosure/spoiler treatment for the reasoning block

## Deferred Ideas

- `Add reusable multi-worldbook library` todo surfaced by loose keyword match only and was not folded into scope because it is unrelated to gameplay text presentation
