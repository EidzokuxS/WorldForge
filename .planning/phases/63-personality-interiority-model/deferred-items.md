# Deferred Items

- 2026-04-18 — `npm --prefix frontend test -- run` fails outside Plan `63-04` scope in [frontend/lib/__tests__/v2-card-parser.test.ts](/R:/Projects/WorldForge/frontend/lib/__tests__/v2-card-parser.test.ts):
  - Two expectations still assert the old parser shape and do not include the newer `mesExample` field.
  - Failures observed:
    - `extracts V2 card fields (name, description, personality, scenario, tags)`
    - `defaults missing fields to empty string/array`
  - This plan did not modify `frontend/lib/v2-card-parser.ts` or its tests, so the failures were logged and left untouched per scope boundary.

- 2026-04-18 — `npm --prefix frontend run typecheck` fails outside Plan `63-04` scope in [frontend/lib/character-drafts.ts](/R:/Projects/WorldForge/frontend/lib/character-drafts.ts) and [frontend/lib/v2-card-parser.ts](/R:/Projects/WorldForge/frontend/lib/v2-card-parser.ts):
  - `lib/character-drafts.ts:163` and `:164` pass `string[] | undefined` where `string[]` is required.
  - `lib/character-drafts.ts:186` spreads `string[] | undefined`.
  - `lib/v2-card-parser.ts:44` reads `mes_example` off an untyped object.
  - These files are unrelated to the UI work in this plan and were already dirty/out of band in the broader branch state.
