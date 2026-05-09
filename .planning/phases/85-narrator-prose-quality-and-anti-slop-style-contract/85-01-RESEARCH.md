# Phase 85 Research: Narrator Prose Quality and Anti-Slop Style Contract

## User Need

Final Narrator has a bounded packet and no full context bloat, but without style guidance it can still produce generic LLM prose. The fix must teach good writing, not just say "do not write badly."

## External Findings

- Reuters Institute notes that AI-generated prose can overuse distinctive words and patterns, and those patterns can leak back into human language. Implication: do not rely on detector vibes; define the target craft behavior.
- Steepworks anti-slop taxonomy frames many AI tells as words without added meaning: announcement openers, binary contrast, generic guru language, and repetitive shape. Implication: cut runway and require each sentence to advance scene truth.
- General fiction-cliche guidance treats cliche as tired shorthand replacing specific, vivid language. Implication: replace cliches with local detail, not synonym lists.
- SillyTavern prompt docs show prompt construction as layered roles/world/context/messages/final instructions. Implication: prose style belongs in the final Narrator layer, not in GM Read or tool execution.

Sources:
- https://reutersinstitute.politics.ox.ac.uk/news/how-ai-generated-prose-diverges-human-writing-and-why-it-matters
- https://www.steepworks.io/insights/articles/anti-slop-15-patterns
- https://hearth.sh/tools/cliche-detector
- https://docs.sillytavern.app/usage/prompts/

## Local Prompt Corpus Findings

Active RP presets in `X:\Models\templates` converge on a useful small set:

- Freaky Frankenstein: objective sensory realism; literal actions, physical states, raw sensory data.
- Lucid Loom: subtle purposeful prose; tension felt in silence instead of named; sensory rotation; focus lock.
- BunnDere trait packs: tiny tells over monologues; write choices and costs; be specific or cut.
- Poppet/Celia/Nemo family: character voice, dialogue cadence, and local continuity matter more than ornate style.

Rejected cargo cult:

- Huge banned-phrase walls.
- Mandatory COT/style rituals.
- Visible trackers or prose ledgers.
- Model-specific superstition inside core Narrator prompt.

## Design Decision

Implement a short `STORYTELLER_PROSE_TECHNIQUE_RULES` block, included only for `final-visible`.

The contract teaches:

- plain scene truth first;
- actor/camera-observable detail;
- action before interpretation;
- background only when it changes the scene;
- generic tension replaced by local behavior/object;
- mundane/tourist turns stay mundane but specific;
- readable rhythm;
- dialogue through voice, omission, interruption, and motive.

Do not add another mandatory rewrite layer yet. Existing quality retry only receives better positive replacement guidance for slop clusters.
