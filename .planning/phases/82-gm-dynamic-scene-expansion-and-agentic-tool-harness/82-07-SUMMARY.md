# Phase 82-07 Summary

## Outcome

The GM tool loop now treats creation tools as agentic, observed capabilities instead of broad one-shot mutations:

- `spawn_item` is available by default again.
- `spawn_item` is constrained by prompt discipline, player-turn grounding, and a per-loop semantic duplicate budget.
- `reveal_location` and `move_to` observations update the live execution context, so later tool calls can legally target newly discovered local sublocations.
- `spawn_npc` and `spawn_item` observations add the created actor/item refs for later calls in the same loop.
- Location-owned `spawn_item` now accepts observed location names or ids, so a legal ref from `reveal_location` does not pass grounding and then fail DB resolution.

## Why This Matters

The previous live gap was not that `spawn_npc` or `spawn_item` should be removed. The gap was that the GM could imply local place/item truth without first making that truth authoritative through backend tools. This follow-up keeps GM freedom but makes the backend observation loop the source of legal next refs.

## Verified

- Backend typecheck passed.
- Focused engine/tool tests passed: 67 tests.
- Wider Phase 82 engine suite passed: 162 tests.
