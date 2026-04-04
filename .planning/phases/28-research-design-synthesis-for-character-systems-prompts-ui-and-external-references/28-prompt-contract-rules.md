# Phase 28 Prompt Contract Rules

## Purpose

Translate Phase 28 research into enforceable rewrite rules for Phase 31. These rules govern prompt contracts, not model-provider settings or prose style preferences in isolation.

## One Task, One Schema, One Output Contract

- Every prompt family must have one clear task boundary and one explicit output contract.
- If a family returns structured output, the schema and the prompt must describe the same object shape.
- Do not let a single prompt both invent world facts and reinterpret character-model semantics unless that combination is the explicit contract.
- Split helper text by family when necessary: runtime narration, Oracle judgment, NPC agency, reflection, worldgen planning, worldgen detail, character drafting, and start-state resolution are separate contracts.

## Canon

- Put canonical world facts and saved authored facts before inferred deltas, transformations, or stylistic instructions.
- For known-IP flows, continue the Phase 25 pattern: canonical reference first, divergence second, target task third.
- For original-world flows, treat saved campaign facts, reviewed scaffold facts, and authored character facts as the canon baseline for that task.
- Do not bury canon-critical instructions inside generic flavor rules or at the bottom of long prohibition lists.

## User Facts

- Preserve explicit user-provided facts verbatim when the contract says they are authoritative.
- Keep the existing good behavior in player parse/import prompts around exact names and explicit ages.
- Extend that principle to the new ontology fields: if the user explicitly provides background, origin mode, start-condition facts, or persona-template choices, prompts must carry them forward as structured facts instead of paraphrasing them away.
- Prompt families must distinguish authored facts from inferred embellishment.

## Derived Runtime Tags

- Prompts should consume structured character fields first and only mention derived runtime tags as compatibility shorthand or runtime views.
- Do not let prompts treat the tag list as the canonical description of a character once Phase 29 lands.
- Runtime families that still need compact tags must say they are reading a derived view, not redefining the source model.
- Character generation prompts should stop using "tag-only system" wording as the primary worldview once the ontology migration is in place.

## Character Ontology and Start Conditions

- Character-related prompt families must align to the Plan 28-01 ontology: `identity`, `profile`, `socialContext`, `motivations`, `capabilities`, `state`, `loadout`, `startConditions`, `provenance`.
- Start-state prompts must evolve from loose location-picking to structured `startConditions` reasoning.
- Player and NPC creation prompts should become role-specific views over one shared draft contract, not unrelated schema families.
- Persona/template, import mode, and archetype research must enter prompts through the same draft pipeline vocabulary.

## Positive Instructions over Prohibition Piles

- Prefer compact positive output rules that state what to produce and how to anchor it.
- Keep hard bans only when there is an observed failure mode with high cost, such as bracket leakage in runtime narration or canon substitution in known-IP worldgen.
- Long prohibition lists should be split into reusable helper blocks when they are truly needed by multiple families.

## Examples

- Use short, high-signal examples only where they sharpen the contract.
- Oracle calibration examples are a good model because they define numeric bands and evidence style.
- Character parse/import prompts should keep compact examples for verbatim preservation and tag style until Phase 31 replaces tag-centric wording with ontology-centric wording.
- Avoid giant example payloads that become stale faster than the schema they illustrate.

## Reuse Shared Helper Layers

- Keep worldgen canon/divergence helper layering in shared helpers rather than re-copying it into every prompt.
- Introduce equivalent shared helpers for character-family contract fragments once Phase 31 begins, especially for ontology field-group wording, persona/template guidance, and start-condition semantics.
- Runtime narration should be decomposed into reusable contract segments where possible: immutable world rules, tool obligations, and character-context assumptions.

## Eliminate Contradictory Duplication

- If a requirement is critical and repeated, one copy must be authoritative and the rest must explicitly support it rather than restating it differently.
- Tool descriptions should not quietly redefine runtime narration behavior.
- Docs, summary artifacts, and live prompt text must be updated together when the contract changes.

## Family-Specific rewrite implications

### Runtime narration

- Rework `SYSTEM_RULES` so ontology-aware character context and start-condition context fit cleanly without pretending the whole game is just flat tags.
- Preserve high-value hard constraints: narrative-only output, bracket prohibition, outcome fidelity, item/tool correctness, and world-consistency rules.

### Character prompts

- Collapse player and NPC prompt families onto one shared character-draft vocabulary with role-specific visibility.
- Preserve exact user facts and import-mode/origin semantics.

### Worldgen prompts

- Keep canon/divergence helper reuse intact.
- Update NPC and any character-adjacent generation prompts to emit the new ontology rather than today’s split draft shapes.
- Update starting-state resolution to produce structured `startConditions` instead of location-plus-narrative only.

### Judge/support prompts

- Keep Oracle deterministic and calibrated.
- Keep reflection evidence-driven.
- Keep NPC/faction agents focused on goals, beliefs, relationships, and current world facts rather than vague personality prose.

## Rule checklist for Phase 31

- Does this prompt family have one explicit task?
- Does the prompt match the schema exactly?
- Are canon and authored facts placed before inference?
- Are explicit user facts preserved where required?
- Does the prompt consume structured character/start fields before derived tags?
- Are examples compact and task-specific?
- Is any duplicated rule still necessary, and if so, which copy is authoritative?
