# GLM prompt review: exact local references

## Failure observed

A live `world_connections` stage completed one `native_json` call with relation references that did not match the accepted cast. Strict validation rejected five relation endpoints and then reported that one collective had no valid relation. The build wrote one failure terminal and left every world table unchanged.

## Candidate prompt contract

The Cast prompt will receive this generated block:

```text
ALLOWED_LOCATION_REFS
["location:..."]
END_ALLOWED_LOCATION_REFS

Copy each placement locationRef character-for-character from ALLOWED_LOCATION_REFS.
```

The Connections prompt will receive these generated blocks:

```text
ALLOWED_ACTOR_REFS
["actor:..."]
END_ALLOWED_ACTOR_REFS

ALLOWED_LOCATION_REFS
["location:..."]
END_ALLOWED_LOCATION_REFS

For every relation and pressure, copy each actorRef and locationRef character-for-character from the corresponding allowed list. Use each key person and collective in at least one relation under its exact actorRef.
```

## Review request

Review this contract for GLM-5.2 structured JSON generation. Preserve strict schema validation, one attempt, disabled repair, disabled text fallback, and exact reference matching. Application code must not rewrite model references. The lists come from already validated packets and contain only local references.

Return `APPROVE` or `REVISE`. If revision is needed, provide one compact replacement for each affected prompt and name the concrete ambiguity it removes. Do not edit production code.

## Verdict

Verdict: `REVISE`

GLM-5.2 approved the explicit-list direction and required four clarifications:

- keep `WORLD_FRAME` and `WORLD_CAST` as context alongside the lists;
- name each schema field covered by each list;
- declare each list as the only valid source for its reference fields;
- make required relation participants explicit instead of asking the model to infer them from role and kind.

## Applied contract

Cast receives `ALLOWED_LOCATION_REFS`. The prompt makes it the only source for `placements[].locationRef`, requires character-for-character copying, and requires goals and placements to reuse the `actorRef` declared by the matching actor.

Connections receives `ALLOWED_ACTOR_REFS`, `ALLOWED_LOCATION_REFS`, and `REQUIRED_RELATION_ACTOR_REFS`. The prompt names every reference field, requires character-for-character copying, reserves names for prose fields, and requires every listed participant to appear as a relation source or target.

`humanizer` and `deslop` review removed broad phrases such as "corresponding list" and kept the final copy rules literal and field-specific.
