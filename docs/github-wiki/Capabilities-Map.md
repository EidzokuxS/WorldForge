# Capabilities map

WorldForge is made of several systems that work together: a world builder, a referee, a narrator, a campaign notebook, and actors that can matter when the player is not looking.

## Campaign creation

WorldForge can turn a short idea into a playable campaign:

- Refine the premise.
- Extract the few rules that make the setting unique.
- Create locations and how they connect.
- Create factions with goals and pressure.
- Create important NPCs and supporting characters.
- Create lore cards and world facts.
- Choose or suggest a starting situation.
- Let you review and edit the world before play.

This gives you a first draft, then expects you to keep what works and adjust what does not.

## Character creation

WorldForge supports:

- Original player characters.
- Imported character cards.
- Power level and loadout interpretation.
- Starting location/scene setup.
- NPC records with personality, goals, beliefs, and source material.

The character has more than a chat name. The game tracks what the character can do, what they know, what they carry, and where they are.

## Live play

During play, you can:

- Talk, investigate, travel, wait, fight, flee, bargain, sneak, bluff, use powers, or ask questions.
- Receive clarification when your intent is unclear.
- Get visible narration after the world has settled the result.
- Use quick actions and scene panels as hints.
- Continue a campaign over many turns.

The game reads actions as intent first and literal wording second. `/chat/action` runs `gameplay-cycle-runtime` by default, with no env flag needed for normal play.

## Living world

The world can track:

- Current location and scene.
- NPC presence.
- Recent events.
- Faction pressure.
- Rumors and reports.
- Actor knowledge and memories.
- Hidden information.
- Consequences that may surface later.

The target feeling is simple: things can happen because of you, near you, or elsewhere, and later those things can matter.

## Memory and lore

WorldForge uses memory for two different jobs:

- Lore: stable information about the world.
- Episodic memory: things that happened during play.

It also tries to keep sources straight. Something can be a fact, a rumor, a player claim, an NPC belief, or hidden truth. Those are different.

## Runtime and narration

The current active gameplay runtime is the clean runtime. The old V1/V2 runtime code is archived or removed from the active tree.

The runtime separates durable facts from presentation:

- Hard facts come from accepted evidence and receipts.
- The narrator can add low-stakes visible texture inside a soft prose budget.
- Soft texture becomes saved world state only when later adjudication accepts it.

## Review and recovery

The app includes tools for:

- Reviewing the generated world.
- Editing or regenerating weak sections.
- Checking campaign state through panels.
- Using checkpoints and undo-style recovery after risky moments.

The game is designed for long messy play, so recovery matters.

## Optional extras

Depending on setup, WorldForge can also use:

- WorldBooks for imported lore.
- Research/source context for known settings.
- Image generation for extra atmosphere.
- Multiple model roles for different jobs.

None of these change the core idea: the world should remember, react, and avoid turning every sentence into instant truth.
