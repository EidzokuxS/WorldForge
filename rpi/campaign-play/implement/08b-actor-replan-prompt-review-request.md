# Task

Review the production actor-replanning schema and prompt in:

- `backend/src/campaign-play/actor-replan-prompts.ts`
- `backend/src/campaign-play/actor-replan-prompts.test.ts`

Return a concise review. Do not edit files.

# Product contract

The model plans a short course of action for one agent-controlled person or collective after its persisted plan is exhausted, inactive, or invalidated. The world is the central simulation. The player may have no role in this actor's plan.

The prompt receives actor-scoped information through opaque handles. Canonical database identifiers, hidden global state, command scopes, preconditions, plan and step identifiers, scheduling, visibility, and settlement remain code-owned.

# Review questions

1. Does the wording give the model enough direction to produce grounded, playable, self-directed behavior?
2. Can world-content strings override instructions or induce disclosure of hidden state?
3. Does any sentence encourage player-centric convergence, cast clustering, or omniscient behavior?
4. Are schema fields and ownership boundaries clear enough for one strict-object attempt with repair, retries, provider switching, and text fallback disabled?
5. Identify exact wording changes that materially improve the contract. Avoid stylistic churn.

# Constraints

- Preserve opaque handles.
- Preserve world-centered NPC agency.
- Preserve strict schema output.
- No fallback behavior or compatibility layer.
- No factions as a special gameplay entity.
- No UI or narration changes.

# Expected output

State `ACCEPT`, `ACCEPT WITH CHANGES`, or `REJECT`. Then list concrete findings by severity and provide replacement wording only where needed.
