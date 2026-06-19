# How a player turn works

When you type an action, WorldForge runs a settlement pipeline before it writes the next paragraph. The active route is `/chat/action`, and it uses `gameplay-cycle-runtime` by default.

The old V1/V2 gameplay runtime paths are archived or removed from the active tree. Normal play uses the clean runtime without env flags.

## The simple version

```text
You send an action
  -> the game reads your intent
  -> it checks the visible situation
  -> it decides whether the world needs receipts
  -> it runs runtime actions when needed
  -> it records accepted consequences
  -> it builds a settled turn packet
  -> it prepares a narrator view
  -> the narrator writes the final prose
  -> the player-facing turn record is saved
```

## Step 1: the game reads intent

The first job is understanding what you are trying to do.

For example:

> I smile and tell the guard the headmaster sent me.

This might mean:

- You are lying.
- You are testing the guard.
- You are using social pressure.
- You are trying to enter a restricted place.

WorldForge should record the headmaster line as a claim inside the action.

## Step 2: it looks at the scene

The game checks what is currently relevant:

- Where you are.
- Who is nearby.
- What recently happened.
- What your character can see or know.
- What factions, threats, or clues may matter.
- What actions are possible from here.

This gives the runtime a bounded scene frame before any result is accepted.

## Step 3: it chooses a kind of response

The turn can go several ways:

- Direct answer: nothing durable needs to change.
- Clarification: the game needs your target, method, or intent.
- Risk check: uncertainty or danger must be resolved.
- World change: something concrete needs a receipt.
- Runtime action sequence: several concrete things happen in order.

Risky or state-changing actions route through settlement before the game answers.

## Step 4: it settles concrete results

When the world changes, the game records concrete results before final narration.

Examples:

- Move the player.
- Add an event.
- Reveal a clue.
- Update an NPC relationship.
- Spawn or promote a support NPC.
- Mark an item, injury, tag, or threat.
- Start a rumor.
- Wake an NPC or faction process.

This is the referee part of WorldForge. It decides what became true in the campaign and which receipt owns that fact.

## Step 5: it lets relevant world work catch up

Some things may need to happen before you see the final text:

- A present NPC reacts.
- A delayed event reaches the scene.
- A faction report becomes visible.
- A hidden thread creates a visible clue.
- A local consequence resolves.

The goal is to settle the parts that should affect this moment.

## Step 6: it builds a settled packet and narrator view

Before the final prose, the game builds a settled turn packet, then derives a limited narrator view from it:

- What the player can perceive.
- What changed this turn.
- Which runtime actions produced accepted receipts.
- Which NPCs are visible.
- What should not be leaked.
- What tone/language the response should use.

The narrator view also carries two boundaries:

- Hard facts need accepted evidence. Movement, route status, inventory, injuries, quotes, secrets, relationships, and world changes stay receipt-owned.
- Soft prose can add harmless visible or sensory detail. It can make a scene read better. Later adjudication decides whether that detail becomes durable world state.

## Step 7: the narrator writes

Only now does the storyteller write the final response.

The narrator's job is:

- Make the result readable.
- Preserve atmosphere and character voice.
- Show what your character can observe.
- Avoid turning guesses, failed actions, or secrets into confirmed truth.

The narrator chooses cadence and surface detail. Prior receipts decide success, failure, movement, object ownership, route truth, hidden facts, and mutations.

## Step 8: the turn is saved

After the turn is complete, the game saves the chat, evidence refs, settled packet, narrator view, narration proof, and done boundary in a player-facing turn record. Some heavier background work may be queued safely for later while the returned turn stays intact.

That boundary is important for undo, recovery, and long-running campaigns.
