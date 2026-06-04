# Settings In Plain English

WorldForge needs AI models to generate worlds, judge player actions, and write narration. Settings let you choose which provider and model does each job.

## Providers

A provider is where the model comes from. It might be an OpenAI-compatible endpoint, an Anthropic-compatible endpoint, or another configured service supported by the app.

You usually need:

- A provider URL or service.
- An API key if the provider requires one.
- One or more model names.

## Model Roles

WorldForge splits work into roles so one model does not have to be good at everything.

| Role | What It Does |
| --- | --- |
| Judge | Understands the player action and decides what should happen. |
| Storyteller | Writes the final prose you read after the world is settled. |
| Generator | Builds campaign worlds, locations, factions, lore, and characters. |
| Embedder | Helps search memories and lore by meaning. |

## Which Role Needs The Best Model?

For gameplay, the Judge is usually the most important. It needs to understand intent, risk, hidden information, power level, and consequences.

The Storyteller affects prose quality. A better storyteller makes scenes read better, but it should still be describing what the game decided.

The Generator matters most when creating new campaigns.

The Embedder matters for memory/lore search.

## Token Budgets

If a model has too little output budget, it may give thin, broken, or incomplete answers.

For long campaigns, avoid tiny limits on the Judge and Storyteller. WorldForge is trying to run structured turns, not one-sentence chat replies.

## Images

Image generation is optional. If it is not configured, gameplay should still work. Images are extra flavor, not the core game.

## Research

Research settings affect how the app gathers or uses extra context for world generation. You can leave this simple at first. Add more only when you are trying to build a setting that needs stronger source grounding.

## Good First Setup

For a first run:

1. Configure one reliable provider.
2. Assign a capable model to Judge.
3. Assign the same or a more prose-friendly model to Storyteller.
4. Assign a capable model to Generator.
5. Add Embedder if you have one available.
6. Leave image generation off until the basics work.
