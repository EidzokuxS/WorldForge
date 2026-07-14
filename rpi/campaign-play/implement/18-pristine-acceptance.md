# Task 18: human playtest contract

Status: ready to pilot after clean-world eligibility and accessibility preflight.

## Decision

Decide whether Campaign Play already works as a game people can inhabit for sixty actions, rather than only as a correct narrative transaction system.

The claim under test is narrow: from a player-visible scene, a player can form their own intention, act, understand the result, notice that other people and places continue without them, revise their plan, and still want another turn. The test does not establish population-wide appeal or final accessibility.

## What counts as play

The repeated loop is:

1. Read the immediate situation and notice one or more possible tensions, opportunities, people, places, or unanswered questions.
2. Form an intention for the character. The intention may follow, reinterpret, or reject an offered hook.
3. Choose a suggested action or write a freeform action because it serves that intention.
4. Read the resolution and identify what changed, what remained uncertain, and why the result appears to have happened.
5. Update the player's mental model of the world and choose whether to persist, adapt, withdraw, investigate elsewhere, or do nothing.

A turn is not successful merely because it terminates. It must protect the player's stated action, provide readable feedback, leave a durable consequence when appropriate, and create or preserve a meaningful next decision. Background simulation matters only when its effects can eventually become legible and change how the player thinks or acts.

## Evidence contract

Hypothesis: a non-central player can develop a self-chosen goal within ten actions and pursue it through understandable consequences while independent actors create discoverable changes that alter later decisions.

Retain the loop when the player can explain their goal, expectation, result, causal model, and next intention from the public UI; prose remains readable; mechanical state matches the explanation; and the player rates desire to continue at least 4/5 at the action-30 and action-60 checkpoints.

Revise when intention repeatedly fails to survive adjudication, prose obscures the consequence, background activity is mechanically real but experientially inert, choices do not support self-directed play, or the player continues only to satisfy the protocol. Reject the current lane after a hard contradiction, hidden-fact leak, lost or duplicate input, partial commit, reload divergence, or another severe failure that contaminates later interpretation.

## Participant and limits

The initial participant is the main Codex operator acting as a real player through the rendered UI. This is a formative expert playtest: one participant can expose mechanisms and severe failures but cannot estimate prevalence or represent a market audience. No external participant, personal identifier, audio, video, or behavioral telemetry is collected.

The operator reads every rendered beat, records an intention before input, and chooses from current player knowledge only. The operator does not inspect protected truth until the declared audit checkpoint and does not choose actions for coverage. When a mechanic is not naturally attractive, that absence is evidence.

Before opening, sign a compact character contract from player-visible world material: who the character is, why they are present, one ordinary capability, one limitation, and two values or appetites that can genuinely conflict. Do not revise the contract to justify a convenient action. The character may change through play when the rendered events support that change.

## Three-lane structure

- Lane A uses the current-contract clean-world template `Lowwater Ledger`. The player begins as an outsider with an ordinary reason to be in Craghold and no institutional authority.
- Lane B builds and accepts one distinct current-contract world from edited DNA plus saved research, snapshots it before character bootstrap, and then plays the materialized template. The player begins with a concrete personal need but remains outside the world's ruling structures.
- Lane C uses the product clone operation on an accepted zero-turn world. The player may refuse the opening hook and pursue ordinary life, opportunism, travel, or another self-chosen direction.

Actions 1-20 cover discovery and goal formation. Actions 21-40 cover pursuit, return, and adaptation. Actions 41-60 cover payoff, escalation, or a new commitment. These phases describe what we observe and do not prescribe actions.

Before turn zero, verify the template manifest and database hash, apply current migrations without modifying accepted world content, prove that character and turn history are empty with setup phase `character_required`, and freeze lane eligibility. Lane C must use the product clone operation rather than a filesystem copy after its eligible source exists.

Each lane is played in sittings of at most ten completed actions. End a sitting sooner if the operator starts skimming prose, forgetting what was actually visible, feeling pressure to make progress, or selecting actions for protocol coverage. At the next sitting, record the remembered situation and intended next action before rereading the UI, then record what the interface made easy or hard to recover. Fatigue is not evidence about the game's prose or agency, but the product's support for returning after a break is evidence.

## Per-action notes

Record behavior before evaluation:

- what the player is trying to do;
- what result they expect and why;
- options they considered;
- exact submitted action and control type;
- visible result and new uncertainty;
- whether the action was preserved, clarified, denied, or seized;
- whether another actor or place changed independently;
- what the player wants to do next;
- prose or causality finding, if any.

At actions 10, 30, and 60, ask: What are you trying to achieve? What do you expect next? Why do you think the last important result happened? Which world changes were not caused by you? What would you do next if the test ended now?

Rate comprehension, prose readability, agency, world aliveness, and desire to continue from 1 to 5. The rating follows the behavioral account; it does not replace it.

Use shared anchors: `1` means the experience is blocked or actively drives the player away; `3` means usable but dependent on effort, patience, or charitable interpretation; `5` means clear and compelling without protocol pressure. A continuation score of `4` or `5` means the player would voluntarily take another turn if the formal test stopped now. A `4` is not earned merely by wanting to diagnose a defect.

## Facilitator boundaries and severe failures

Do not hint at hidden goals, optimal routes, scheduled actors, exposure seeds, or test quotas. Do not rescue a dull scene by selecting a more diagnostic action. A player who cannot find a reason to act has discovered a game-design problem.

Stop the pristine lane on a hard state or authority failure, a hard narrative contradiction, a protected fact presented without a valid exposure path, or an accidental unsigned or duplicate submission. Three consecutive turns that leave the player unable to identify new information, changed stakes, progress, or a meaningful choice trigger a pause and design review; intentional quiet play is exempt only when the player can explain its value.

Promotion observations such as a player-caused chain, a player-independent chain, return visit, or refusal count only when they arise from the signed intention and visible scene. Do not consult a missing threshold and then manufacture the required behavior inside the pristine lane.

## Accessibility disposition

Disposition: `CLEAR_WITH_CONDITIONS` for this expert formative pass. Before action 1, verify that essential state remains available in text, keyboard focus can reach the scene and action controls in a sensible order, critical effects do not carry unique information through animation alone, and consequences remain available for rereading after beat transitions. This pass records readability, cognitive load, focus loss, and recovery problems. Claims about broad accessibility require later participation by affected players and assistive-technology checks.

## Diagnostic separation

The pristine lanes report the natural action mix. They do not force fixed counts of freeform, impossible, adversarial, or secrecy-probe actions. Missing boundary evidence is collected afterward on a disposable clone with a separate diagnostic label, so stress behavior cannot masquerade as ordinary play or contaminate the sixty-action history.

Humanizer and deslop review: the contract uses direct player language, separates observation from inference, and avoids treating completion counts as evidence of engagement.
