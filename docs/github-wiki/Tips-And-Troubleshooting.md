# Tips and troubleshooting

## The app will not start

Check:

- Node.js is version 20 or newer.
- `npm install` completed.
- No other app is already using ports 3000 or 3001.
- You started the app from the repository root.

Try:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## The game says a provider or model is missing

Open Settings and check:

- Provider is saved.
- API key is present if required.
- Model names are filled in.
- Roles are assigned.

At minimum, configure Judge, Storyteller, and Generator.

You do not need a gameplay runtime env flag. `/chat/action` uses `gameplay-cycle-runtime` by default.

## World generation takes a long time

That can be normal. The app may be creating locations, factions, NPCs, lore, and source context.

If it seems stuck:

- Wait a little longer on the first generation.
- Try a shorter premise.
- Check provider settings.
- Try a more reliable/faster model for Generator.

## The story feels too vague

Give the game clearer actions.

Instead of:

> I investigate.

Try:

> I search the desk for letters, receipts, or anything with the missing courier's seal.

Also review the generated world. A vague starting location or weak faction goal can make play feel fuzzy.

## The game asked a clarifying question

This often means the game needs your target, method, or intent before it changes the world.

Answer directly:

> I mean the old warehouse by the river, and I am trying to enter quietly without being seen.

## The game did something that feels wrong

Use checkpoint or undo tools if available. Then adjust your action with clearer intent.

Examples:

- "I am bluffing, not claiming this is true."
- "I am only looking, not touching the object."
- "I am trying to scare him away, not kill him."
- "I want to know what my character can see, not hidden truth."

## The narration is in the wrong language

Try writing your action in the language you want the game to use. If the campaign itself is mixed-language, be explicit:

> Answer in Russian, but keep proper names as written.

## The world ignored my character's power

Describe how the power works in the action. Mention limits and method.

> I use my heat sense to check whether anyone recently touched the metal door handle.

This is easier for the game to judge than:

> I use my powers.

## The world gave me too much secret information

Treat it as a bug or rough edge. A good action to recover is:

> Ignore anything my character could not know. What can I actually observe from here?
