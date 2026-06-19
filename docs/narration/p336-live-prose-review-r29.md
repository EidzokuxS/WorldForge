# P336 Live Prose Review - r29 Pristine Postfix

Date: 2026-06-19

Live root: `output/p336-pristine-postfix-r29-20260619`

Primary audit: `output/p336-pristine-postfix-r29-20260619/prose-audit-turn030.json`

Supplemental audit after route/dialogue prompt polish:
`output/p336-pristine-postfix-r29-20260619/prose-audit-turn033.json`

Current recheck audit:
`output/p336-pristine-postfix-r29-20260619/prose-audit-current.json`

Primary diagnosis source:
`C:\Users\robra\.codex\attachments\2d85ef3b-f55a-43fb-8de0-3a4391c29bd7\pasted-text.txt`

## Evidence Shape

The lane was played manually, one action at a time, after reading the current
state after each turn.

Each turn stores the accepted evidence packet, prompt input, model candidate,
final text, validation result, and source in:

- `output/p336-pristine-postfix-r29-20260619/turn-XXX/record.json`
- `output/p336-pristine-postfix-r29-20260619/turn-XXX/result.json`

All first 30 turns have:

- `structuralIssues = []`
- `narration.result.source = model`
- `narration.validation.status = accepted`
- `narration.promptInput` present
- `narration.candidate` present

## Audit Snapshot

Turn 30:

- Total narratives: 30
- Total words: 867
- Runtime/debug/receipt/enum leaks: 0
- Zetta banned-vocabulary occurrences: 0
- Style-family occurrences: 0
- Repeated start rate: 0.067
- Exact repeated sentence rate: 0
- Old route formula hits: 0
- Old arrival formula hits: 0

Turn 33 supplemental:

- Total narratives: 33
- Runtime/debug/receipt/enum leaks: 0
- Zetta banned-vocabulary occurrences: 0
- Style-family occurrences: 0
- Repeated start rate: 0.061
- Exact repeated sentence rate: 0

Current recheck on the active worktree:

- Expanded clean-runtime tests: 467 passed
- Typecheck: passed
- Audit: 33 narratives, runtime/debug/receipt/enum leaks 0,
  Zetta banned-vocabulary/style-family occurrences 0, repeated start rate 0.061,
  exact repeated sentence rate 0
- GitNexus `detect_changes(scope=all)`: HIGH, 66 changed symbols, 9 affected
  execution flows, 14 code files
- Reviewed high-risk traces: `RunCleanNarration -> AssertRouteOptionsReceiptStoryEvidence`,
  `RunCleanNarration -> AssertSceneFrameRouteStoryEvidence`,
  `RunCleanNarration -> AssertSceneObservationStoryEvidence`, and
  `Stage4Evidence -> UniqueStrings`

## Coverage

- Direct-scene/rich-state: T1, T8, T24
- Harmless item surface: T2
- Hidden/mechanical follow-up: T3, T19, T26
- Route options: T4, T22, T30
- Route status: T6, T12, T28, T31
- Movement: T7, T13, T16, T17, T23, T29
- Dialogue: T5, T9, T15, T20, T21, T27, T33
- Support actor materialization: T14
- Item transfer/custody: T10, T11
- Ordinary prop scene beat: T18, T25

## Good Runtime Proofs

Direct scene uses playable handles:

> Lowwater Bazaar spreads around you, its walkways and stalls pressing close above the slow canal current; eight ways out are within reach from here, each a minute's walk: Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, or Upper Dam Ruins.

> The Copper Tap presses close around you, its low ceiling heavy with pipe smoke and the sour tang of canal water seeping through the stonework; Old Route Hand Sessik and Tap-Keeper Brost are both in view, the Courier satchel and Brass Tube remain with you, and Lowwater Bazaar, Silt Warrens, and Slip Twelve Berth are the ways out.

Harmless Brass Tube surface accepted:

> The Brass Tube is with you at Lowwater Bazaar, its surface dulled with faint scuffs along the rim.

Soft detail follow-up stays hard-bounded:

> No visible sign of a hidden seam, latch, code, or route-opening mark shows on the Brass Tube at Lowwater Bazaar.

Item-topic dialogue does not transfer custody:

> Clerk Aldris answers at Charter Gallery: "I can log that sealed lacquer tube here, yes. I'll need to verify the seal is unbroken before I record it against the Charter register."

The item remains carried after that dialogue turn. The explicit handoff turn then
mutates custody:

> The Sealed lacquer message tube passes from Mira Voss to Clerk Aldris at Charter Gallery; Clerk Aldris carries it now.

Ordinary prop freedom stays turn-scoped:

> A stacked wooden crate takes your weight at Slip Twelve Berth, the Brass Tube staying close as damp planks groan under the load.

> A chair leg grinds across stone as you drag it closer at The Copper Tap.

Soft prop follow-up is adjudicated normally:

> No visible sign of a hidden release latch, coded route mark, or coin slot shows on the stacked wooden crate at Slip Twelve Berth.

> No visible sign of a hidden blade, latch, coin slot, or coded route mark shows on the nearby chair at The Copper Tap.

Route options stay complete:

> Damp planks groan under stacked crates at Slip Twelve Berth; three ways out are open from here, each a minute's walk: Lowwater Bazaar, Silt Warrens, or The Copper Tap.

> Silt puddles stagnate in the cracked drainage tunnels of Silt Warrens; five ways out are open from here, each a minute's walk: Lowwater Bazaar, Resonance Tower, Slip Twelve Berth, The Copper Tap, or Transmission Basement.

## Before / After Prompt Polish Spots

Before the supplemental route/dialogue polish, dialogue overused `answers at`
and route status sometimes surfaced backend-ish `connected and ready` language.

After prompt polish and backend restart:

> From Silt Warrens, Transmission Basement is the open way down.

> Old Route Hand Sessik keeps it blunt at The Copper Tap: "The Transmission Basement? Aye, I passed through there on my last run. The relay gear is half-wrecked, but if you're hunting for old courier routes, it's as good a lead as any. Just watch the footing near the flooded shafts."

## Remaining Prose Debt

- Movement pages still reuse `A minute's walk puts/brings...` more than ideal,
  though old formula hits are 0.
- Rich-state pages with many route labels can still feel dense when the graph
  has 8 exits, especially T1.
- T18 uses `takes your weight` in an ordinary prop context. This is not the old
  arrival formula, but it is close enough to keep watching.
- T15 contains an assertive NPC quote about Charter Gallery logs after the
  player already handed the tube to Clerk Aldris. It is dialogue-only and did
  not mutate state, but it is a continuity-review sample for future actor
  knowledge/records work.

## Status

r29 is a clean post-fix 30-turn live lane for the P336 slice:

- The narrator writes model-authored prose, not deterministic authority
  projection.
- Soft surface prose passes.
- Hidden/mechanical affordances stay hard.
- Ordinary props stay turn-scoped.
- Soft details can be targeted later and adjudicated.
- Route, movement, item custody, and dialogue quote facts stay with typed
  owners.
- Runtime validation remains structural/truth-focused.
- Offline audit is clean and used as a secondary report.

This satisfies the 30-turn live sample proof tier. It does not replace a larger
multi-world endurance acceptance run.
