# Tips And Troubleshooting

## The App Will Not Start

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

## The Game Says A Provider Or Model Is Missing

Open **Settings** and check:

- Provider is saved.
- API key is present if required.
- Model names are filled in.
- Roles are assigned.

At minimum, configure Judge, Storyteller, and Generator.

## World Generation Takes A Long Time

That can be normal. The app may be creating locations, factions, NPCs, lore, and source context.

If it seems stuck:

- Wait a little longer on the first generation.
- Try a shorter premise.
- Check provider settings.
- Try a more reliable/faster model for Generator.

## The Story Feels Too Vague

Give the game clearer actions.

Instead of:

> I investigate.

Try:

> I search the desk for letters, receipts, or anything with the missing courier's seal.

Also review the generated world. A vague starting location or weak faction goal can make play feel fuzzy.

## The Game Asked A Clarifying Question

This is not always a failure. It often means the game does not want to guess your target, method, or intent.

Answer directly:

> I mean the old warehouse by the river, and I am trying to enter quietly without being seen.

## The Game Did Something That Feels Wrong

Use retry or checkpoint tools if available. Then adjust your action with clearer intent.

Examples:

- "I am bluffing, not claiming this is true."
- "I am only looking, not touching the object."
- "I am trying to scare him away, not kill him."
- "I want to know what my character can see, not hidden truth."

## The Narration Is In The Wrong Language

Try writing your action in the language you want the game to use. If the campaign itself is mixed-language, be explicit:

> Answer in Russian, but keep proper names as written.

## The World Ignored My Character's Power

Describe how the power works in the action. Mention limits and method.

> I use my heat sense to check whether anyone recently touched the metal door handle.

This is easier for the game to judge than:

> I use my powers.

## The World Gave Me Too Much Secret Information

Treat it as a bug or rough edge. A good action to recover is:

> Ignore anything my character could not know. What can I actually observe from here?
