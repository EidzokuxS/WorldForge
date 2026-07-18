# Player consideration authority

## Outcome

Accepting an exchange cannot perform, disclose, or invent the player's unstated consideration.

## Field evidence

Black Rain r14 action 18 clicked `Talk to Lucia Cordeglio: accept the corridor-news trade`. The label supplied no corridor fact or disclosure choice. Judge expanded it into sharing western corridor knowledge, Game Master authored watched passages, quiet stretches, and safe footing on Sera's behalf, and Narrator presented the exchange as completed.

- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Turn: `turn-player-action:920ca7d5b7a7cafd5a8235914e06a27b5504f552`
- Judge artifact hash: `78a861dc10fa39a9f730fdf23c2700e0d542c3df22661b30181af2ca184367eb`
- Game Master batch hash: `bb0fc6b912f84bdf792fded09eb279ff23a4b3f65802f73a0bbfe817de54e22b`

## Architecture delta

Narrator does not publish an exchange whose consideration is player information unless the selected action states the exact disclosure. Judge treats `PLAYER_INPUT` as the complete authority for the present action: acceptance authorizes only acceptance and returns missing player-owned consideration for clarification before Game Master runs. The models retain semantic judgment; no keyword parser, backend-authored prose, repair, retry, fallback, provider switch, or compatibility path is added.

## Impact and semantic review

GitNexus reports LOW upstream impact for Judge `prompt` and Narrator `buildPrompt`: each has one direct consumer and one bounded Campaign Play flow. Prompt-craft narrowed the repair to the missing consideration boundary rather than repeating the general player-choice rule. Humanizer retained direct operational wording. Deslop found no removable framing or synonym chain; repeated terms are exact contract nouns.

## Verification

- focused Judge and Narrator prompt-contract suites pass `46/46`;
- backend typecheck passes;
- continued r14 action 19, turn `turn-player-action:aeff2e1d064773c27aed7351842d187dba7baec2`, explicitly withheld the offered information;
- Judge preserved `without committing to a specific trade`, Game Master recorded no disclosure or transfer, and Narrator rendered Lucia rejecting the vague offer;
- Judge, Game Master, and Narrator each accepted one strict GLM 5.2 result on attempt 1 with no repair, retry, fallback, provider switch, or backend-authored narration.

Product verdict: accepted for the explicitly withheld consideration path. A later naturally occurring exchange must still prove that Narrator omits an incomplete acceptance before it reaches Judge. The invalid action-18 history remains immutable defect evidence and is not rewritten.
