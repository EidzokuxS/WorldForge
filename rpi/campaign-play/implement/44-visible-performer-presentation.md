# Visible performer presentation

## Outcome

A typed visible performer must survive into the prose before Campaign Play presents a required reply to that actor.

## Field evidence

Black Rain r14 action 15 froze Lucia Cordeglio as the performing actor for a committed `direct_perception` consequence. Narrator incorporated the disturbed papers but omitted Lucia, while `requiredReplyIntentIndex` forced the first suggestion to ask Lucia about those papers. The consequence card does not render `performingActorName`, so the player-visible scene contained no causal bridge from the change to the reply.

- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Turn: `turn-player-action:7330192dee1c99bbe710c75e2bcb1258dba4ed93`
- Observation: `observation_47a8cce75f902b3ba3a6e2f1`
- Narrator packet hash: `f729dbd4564bd433551c6d7f8cc4de02e707f5a86d840cc42a25b00f3dfe5aed`

## Architecture delta

Narrator instructions now require the beat carrying an observation with non-null `consequence.performingActorName` to name that actor and show the actor's visible part in the change. This uses existing typed presentation authority. It adds no mechanical mutation, prose parser, backend-authored prose, repair, retry, fallback, provider switch, or compatibility path.

## Impact and review

GitNexus reports LOW upstream impact for `buildPrompt`: one direct consumer, Narrator `narrate`, and one affected execution flow. Prompt-craft identified the existing rule as too indirect because it allowed actor attribution to disappear while reply selection still consumed it. Humanizer retained the compact operational wording. Deslop removed no wording: the repeated actor and observation terms are exact contract nouns, not ornamental repetition.

## Verification

- focused Narrator test asserts the performer-to-beat and reply-legibility instructions;
- focused Narrator suite passes `16/16`;
- backend typecheck passes;
- continued r14 action 16, turn `turn-player-action:fbb0ddb08124ce2697c01dd2410e39687000cc46`, produced a typed Lucia consequence and opened the rendered beat with `Lucia doesn't deny it` before presenting the required follow-up to Lucia;
- Judge, Game Master, and Narrator each accepted one strict GLM 5.2 result on attempt 1 with no repair, retry, fallback, provider switch, or backend-authored narration.

Product verdict: accepted for the visible-performer bridge. The separate tendency of NPCs to disclose operational context to unknown outsiders remains a qualitative playtest concern and is not folded into this presentation fix.
