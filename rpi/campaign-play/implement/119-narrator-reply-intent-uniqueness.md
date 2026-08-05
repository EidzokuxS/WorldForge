# Narrator required-reply selection uniqueness

Identity: prompt-only r54 duplicate-reply repair on `feat/revamp`, base commit `89ca8224e3c34012e2adf9a5b509ad24436724ee`.

Frozen r54 action 4 produced a schema-parsed Narrator proposal that failed only `narrator_packet_validation_mismatch` with `duplicate_selected_intent_indexes` at `[7]`. The repeated index was the required reply intent; mechanics were correct and the lane remains frozen. Main semantic review through prompt-craft, humanizer, and deslop approved the exact literal rule below as short, non-narrative, and non-repetitive in purpose.

Delta:

- `backend/src/campaign-play/narrator.ts`: the existing `REQUIRED_REPLY_INTENT_INDEX` instruction now says, `Put that exact index only in actionSelections[0] so the player can answer, accept, refuse, or continue the exchange.` It adds the exact rule, `Do not select that index again; every later actionSelection must use a different intentIndex.` The general unique-intent rule and selection-quality instructions remain unchanged.
- `backend/src/campaign-play/narrator.test.ts`: asserts both prompt rules and proves duplicate intent indexes still throw `narration_invalid` with the safe `narrator_packet_validation_mismatch` diagnostic and `duplicate_selected_intent_indexes` coordinate.

Impact: GitNexus upstream impact for private `buildPrompt` is LOW: one direct caller (`createCampaignPlayNarrator.narrate`), one Narrate process, and one Campaign-play module. The indexed graph is two commits behind HEAD; the symbol and caller were source-confirmed before editing. No schema, compiler, diagnostics, recovery, provider, or r54 state changed.

Checks: focused Narrator tests `24/24` passed; backend typecheck passed; `git diff --check` passed. GitNexus `detect-changes --scope all --repo WorldForge` reported low risk, 4 tracked changed files, 11 symbols, and 0 affected processes; it also included the pre-existing user-owned `AGENTS.md` and `CLAUDE.md` edits.

Live validation: no existing non-mutating exact-packet Narrator evaluator could consume the persisted r54 packet without creating a harness or writing campaign state. Provider recurrence is therefore deferred to the next fresh pristine lane.

Next: Main review and integration, followed by one fresh pristine lane. `acceptance_handoff`: this task made no rendered product mutation; the fresh lane must prove the required reply appears once and the proper Narrator scene completes.
