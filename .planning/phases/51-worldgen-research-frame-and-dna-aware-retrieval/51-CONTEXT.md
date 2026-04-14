# Phase 51 Context

## Goal

Persist one worldgen research frame per campaign/worldgen run and use it to steer DNA-aware follow-up canon lookup instead of rebuilding search intent from raw `knownIP` prose on every step.

## Trigger

Milestone-closeout gameplay found that worldgen research:

- could treat raw `knownIP` prose as the franchise key;
- did not materially use chosen World DNA during targeted sufficiency research;
- rebuilt research intent too flatly during `locations` / `factions` / `npcs` follow-up lookup.

## Scope

- canonicalize `knownIP` through the model instead of trusting the raw field verbatim;
- persist a `worldgenResearchFrame` beside `ipContext` / `premiseDivergence`;
- thread that frame through worldgen generate/regenerate;
- make sufficiency prompts and typed retrieval jobs explicitly DNA-aware without reintroducing giant blended search strings.
