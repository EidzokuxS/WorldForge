# How A Player Turn Works

When you type an action, WorldForge does more than ask a model to write the next paragraph. It tries to settle what actually happened first, then writes narration from that result.

## The Simple Version

```text
You send an action
  -> the game reads your intent
  -> it checks the visible situation
  -> it decides whether the world must change
  -> it uses game actions/tools when needed
  -> it records real consequences
  -> it prepares what your character can see
  -> the narrator writes the final prose
  -> the turn is saved
```

## Step 1: The Game Reads Intent

The first job is understanding what you are trying to do.

For example:

> I smile and tell the guard the headmaster sent me.

This might mean:

- You are lying.
- You are testing the guard.
- You are using social pressure.
- You are trying to enter a restricted place.

WorldForge should not simply decide "the headmaster sent you." It should understand the claim as part of the action.

## Step 2: It Looks At The Scene

The game checks what is currently relevant:

- Where you are.
- Who is nearby.
- What recently happened.
- What your character can see or know.
- What factions, threats, or clues may matter.
- What actions are possible from here.

This prevents the narrator from freely inventing a result that ignores the world.

## Step 3: It Chooses A Kind Of Response

The turn can go several ways:

- Direct answer: nothing durable needs to change.
- Clarification: the game needs your target, method, or intent.
- Risk check: uncertainty or danger must be resolved.
- World change: something concrete must be recorded.
- Tool/action sequence: several concrete things happen in order.

If the player action is risky or state-changing, WorldForge should not answer as if it were harmless flavor.

## Step 4: It Settles Concrete Results

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

This is the "referee" part of WorldForge. It decides what became true in the campaign.

## Step 5: It Lets Relevant World Work Catch Up

Some things may need to happen before you see the final text:

- A present NPC reacts.
- A delayed event reaches the scene.
- A faction report becomes visible.
- A hidden thread creates a visible clue.
- A local consequence resolves.

The goal is not to run the whole world every turn. The goal is to settle the parts that should affect this moment.

## Step 6: It Builds A Safe Narration Packet

Before the final prose, the game prepares a limited packet for the narrator:

- What the player can perceive.
- What changed this turn.
- Which tool results succeeded.
- Which NPCs are visible.
- What should not be leaked.
- What tone/language the response should use.

This is why the narrator should describe the result, not invent new hidden facts.

## Step 7: The Narrator Writes

Only now does the storyteller write the final response.

The narrator's job is:

- Make the result readable.
- Preserve atmosphere and character voice.
- Show what your character can observe.
- Avoid turning guesses or secrets into confirmed truth.

The narrator is important, but it is not supposed to be the only authority.

## Step 8: The Turn Is Saved

After the turn is complete, the game saves the chat and world changes. Some heavier background work may be queued safely for later, but it should not secretly rewrite a turn after the player already received it.

That boundary is important for undo, retry, and long-running campaigns.
