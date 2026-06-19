# P336 Narrative Reference Notes

Purpose: keep prose and simulation references separate from implementation work.
These notes are inputs for Stage 6 prose polish and later world-simulation work;
they are not runtime requirements by themselves.

## Zetta Onyx v1.37

Source: `R:\Projects\SillytavernUpgrade\Template\Zetta Onyx v1.37.json`.
Verified through the Template preset inspector on 2026-06-19.

Useful for WorldForge:

- Primary prose donor for compact adult RPG/VN narration.
- Use Cinematic Realism, Forward Motion, Door Rotation, Hybrid POV, BOLT v2
  writing-room discipline, NPC voice/agency, and banned-expression guidance as
  craft guidance.
- Imitate the donor's mechanism and register: tagged mandate blocks, concrete
  sensory/body/world pressure, private writing-room audit, door rotation, and
  forward-motion tests.
- Door Rotation maps to `pageVariation.openingDoor` and
  `recentSurfaceAvoid`: speech first, motion already underway, sensory strike,
  setting into speech/action, time landing, or actor/object decision.
- BOLT v2 maps to a private Stage 6 composition audit: SCOUT state, DIRECTOR
  momentum, PROSE page language, VOICE accepted dialogue, EDITOR refs and
  hard/soft boundaries.
- Balanced-Freaky / NSFW material is in scope as adult register guidance:
  diction, body language, violence/intimacy intensity, profanity, and consent or
  discomfort texture when accepted evidence supports that charge.

Boundary:

- Do not import monolithic SillyTavern jailbreak/persona scaffolding into the
  runtime.
- Do not convert Zetta banned words into runtime rejection. Keep them as offline
  audit/benchmark material.
- Do not let adult register create hard facts: consent state, relationship,
  injury, custody, resources, secrets, routes, and important affordances still
  require accepted evidence.

## Balanced-Freaky NSFW Donor Block

Source: active `Freaky-Balanced NSFW Mode` block in Zetta Onyx v1.37.

Useful for WorldForge:

- Treat adult fiction as the default register, not a separate panic mode.
- Keep body language, violence, profanity, fear, desire, injury texture, and
  intimate charge plain and physical when the accepted scene supports them.
- Prefer blunt concrete language over coy fade-outs, clinical evasions, or
  sanitized pain.
- Let adult pressure affect diction, rhythm, and how directly the narrator
  names visible bodies or harm.

Boundary:

- NSFW register is style, not authority.
- Explicit sex, violence, injury, relationship state, consent, custody, route
  truth, secrets, resources, and important affordances still require accepted
  evidence.
- If a turn has no adult charge, the block still supports unsanitized physical
  prose, but it does not invent erotic, violent, or relationship facts.

## TarotEngine / Marinara Game Mode

Sources:

- `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine\docs\GAME_MODE.md`
- `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine\packages\server\src\services\game\gm-prompts.ts`
- `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine\packages\shared\src\constants\agent-prompts.ts`
- `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine\packages\server\src\services\agents\tarot\hermit-prose.ts`

Useful for WorldForge:

- Tower is a good analogy for Stage 6: a narrative renderer over an accepted
  scene/result brief, not an adjudicator.
- Hermit-style prose editing is useful as a future optional polish pass:
  preserve facts, order, quotes, speaker labels, and engine tags while improving
  rhythm.
- Marinara's playable feel comes from scene pressure, character turns, concrete
  surfaces, and clear next handles rather than from receipt-like state dumps.

Boundary:

- Do not port Justice into Stage 6. WorldForge already has GM Read, Stage4,
  Settlement, receipts, and validators for adjudication.
- Do not add a prose repair loop to chase style. Fix page-task shape and prompt
  examples first.

## AndreiNicu/World-Forge

Source: <https://github.com/AndreiNicu/World-Forge>.
Local clone inspected at `%TEMP%\andreinicu-world-forge-ref`, commit `65ca368`.

What it is:

- A SillyTavern world/card/preset pipeline, not a live runtime engine.
- It packages style contracts, lorebooks, character cards, preset blocks, and
  audit reports for ST.

Useful for WorldForge:

- Keep engine-level prose conventions separate from lore/world facts.
- Opening Variation directly matches the P336 failure: narration-first is one
  entry door among dialogue-first, mid-action, sensory-hit,
  atmosphere-into-dialogue, and time-skip.
- Perception Boundary is useful language for separating reader-facing narration
  from what characters in-scene perceive.
- Sensory Embodiment is a strong donor for non-visual prose: smell, touch,
  temperature, ambient sound.
- NPC Ensemble & Enrichment supports a living-world feel by allowing minor
  organic traits and NPC-to-NPC beats inside guardrails.

Boundary:

- Its "once established in chat, treat detail as canon" rule is too strong for
  WorldForge soft prose. In WorldForge, low-stakes surface prose stays
  presentation until a later player action asks the world/judge to adjudicate it.
- Do not copy preset blocks literally. Adapt the ownership idea to typed
  runtime roles.

## Yozakura

Sources:

- <https://mistval.github.io/yozakura/docs/intro/>
- <https://mistval.github.io/yozakura/docs/memory-system/>
- <https://mistval.github.io/yozakura/docs/template-system/>
- <https://github.com/mistval/yozakura>
- Local clone inspected at `%TEMP%\yozakura-ref`, commit `069d5c5`.

What it is:

- An LLM-powered social simulation where user and NPC characters move around a
  map, talk through the user's LLM, form memories/intentions, and produce an
  evolving narrative with many characters.
- NPC turns happen after the user turn. The user character is not inherently
  privileged, and auto mode can let the world continue without direct play.

Useful for WorldForge:

- World autonomy should be owned by simulation loops, memory, intentions, time,
  NPC agency, and adjudication, not by Stage 6 prose.
- Yozakura's memory flow is a useful model for durable continuity:
  conversation summaries, pairwise memory, next conversation goals,
  relationship descriptors, global memory, familiarity, and offscreen learned
  information.
- Prompt Template System has a useful operations pattern: editable prompt
  templates, generated AI-assistant context docs, parser hooks, Template Render
  Log, and Prompt Log. This supports debugging prompt changes with real render
  artifacts instead of guessing.

Boundary:

- Yozakura is a social-sim architecture reference, not a Stage 6 prose fix.
- Do not move world autonomy into the narrator. Stage 6 should render accepted
  evidence into readable text; autonomous world motion belongs to upstream
  gameplay systems.
- Do not add arbitrary-template JavaScript execution to WorldForge prompts as
  part of P336.

## P336 Takeaways

- The current prose failure is composition-shaped: the live writer is
  over-constrained around proof and under-specified around page composition.
- Replace bad positive examples and list-shaped task guidance before adding
  validation.
- Page task should ask for playable room beats, support/dialogue/event beats,
  and choice handoffs.
- Runtime validation stays focused on schema, refs, citation closure, hard claim
  support, private/backend leaks, linkage, language, and nonempty text.
- Offline prose audit can measure repeated starts, repeated exact sentences,
  list-like openings, Zetta banned-expression families, and adult-register
  patterns. It cannot prove the prose is good by itself.
