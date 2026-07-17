# Task 24: narration live region

Status: implemented and verified in the rendered Campaign Play surface.

`NarrationDock` rendered every visible beat once and then rendered the current beat a second time in a separate `sr-only` live region. The second paragraph was visually hidden but remained a duplicate DOM/accessibility-tree narration, so assistive reading and DOM-based product review encountered the same prose twice.

The visible beat container now owns `aria-live="polite"`, `aria-relevant="additions"`, and non-atomic announcements. The duplicate hidden paragraph is gone. Sequential reveal, reduced-motion behavior, and presentation callbacks are unchanged.

Verification:

- focused `NarrationDock` suite: 3 tests passed;
- frontend/shared typecheck passed;
- rendered reload of campaign `d76ce637-7536-47ff-9a7c-8b4ff09f8747` shows one `The moment` paragraph and one occurrence of the current payment narration in the DOM snapshot;
- the focused regression asserts one text node plus the live-region attributes;
- GitNexus query and impact calls were attempted with bounded waits but did not return, so the direct component caller and product surface were verified instead.

No player-facing copy, narration content, backend contract, or compatibility path changed.
