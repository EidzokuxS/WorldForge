# Arrival suggestion authority

## Outcome

Let a player leave an optional thread by taking an ordinary route without making them explain which prior offer they are rejecting.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Action 40: `Go to Saint Orra Beacon Terrace`
- Turn: `turn-player-action:be0e5cbd475c66c9dbf81c8c593cc1e38211597f`

Sera left the undercity immediately after Vela disclosed Nico Bardini and requested a report. The arrival narration correctly showed only the terrace, telescopes, and Poldo Gavotti, but its first suggested action was `Talk to Poldo Gavotti: ask whether Bardini came this way`. The ordinary move contained no pursuit purpose. Narrator inferred one from origin-scene dialogue and carried the unwanted quest into a new scene.

## Architecture delta

For suggested-action selection, an ordinary move to a different location with no player-stated purpose leaves optional offers, tasks, search targets, and contact requests at the origin. Names, leads, destination purposes, and follow-up questions from origin dialogue do not enter arrival suggestions. A later player action can deliberately re-enter the thread, and a new accepted observation at the destination can materially renew it.

This changes only the model-owned selection rule. It adds no keyword parser, backend-generated suggestion, blocked-name list, retry, fallback, provider change, or compatibility path.

## Prompt review

- `prompt-craft`: made the ambiguous `left` rule executable for ordinary route actions without adding a procedure or duplicate history policy.
- `humanizer`: kept the instruction in concrete player-action language and avoided treating every location change as a dramatic refusal.
- `deslop`: removed explanatory repetition while preserving the distinction between an unstated move purpose and a later explicit re-entry.

## Validation

- The focused Narrator prompt contract test checks the ordinary-move boundary, origin-scene scope, forbidden carryover, and explicit re-entry condition.
- Backend typecheck covers the touched prompt builder and test types.
- Action 42 inspected the local telescope mountings. Its accepted narration and choices remained on bounded physical evidence and did not revive Bardini.
- Action 43 used freeform `I go to Vesper Quay Tollhouse.` with no stated investigation purpose. The typed route moved Sera to a scene containing Tomasso Gravelle and two older local contract traces.
- Narrator attempt 1 returned `narration_invalid`. One explicit Resume accepted attempt 2 without replaying Judge, Game Master, the six-minute advance, movement, commands, receipts, events, or projected aftermath.
- The accepted arrival suggestions contain only Tomasso, the Vesper contract pages, and Vesper routes. Poldo, the telescopes, Bardini, the undercity drop, bearings, and expedition purposes are absent.
