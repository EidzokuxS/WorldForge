# Phase 74 Structured Output Repair Policy

**Marker:** `STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1`

This artifact is the Phase 74 source of truth for deterministic structured-output repair. Repair is a bounded formatting bridge after a model returns malformed structured data. It is not permission for backend code or a repair prompt to create missing world truth.

## Allowed Repair

Repair may coerce object/list/string shape, field types, field names, known aliases, and invalid caps when the original output already contains the same meaning.

Allowed examples:

- Convert `citations` from a joined string into citation objects only when the string already contains citation notes or source identifiers.
- Convert `canonicalNames` into `{ locations, factions, characters }` only when names can be classified from the original output.
- Trim strings and cap arrays to schema limits.
- Map known aliases such as `payload` to `input` when the payload already contains explicit tool arguments.
- Drop optional non-executable UI output when no recoverable object exists.

## Forbidden Repair

Repair must never invent semantic lore, actions, targets, actor intent, quick action labels, source roles, canonical names, power facts, IDs, UUIDs, or new array elements with missing semantics.

Forbidden examples:

- Do not create a missing `actions[].action` from a vague label.
- Do not create new quick actions when the model omitted actionable text.
- Do not invent a tool name to satisfy an enum.
- Do not infer canon/source roles from a franchise string.
- Do not create hax, vulnerabilities, feats, tiers, or power scaling facts that are not already present in the raw payload or evidence.
- Do not generate IDs or UUIDs in repair; backend-owned ID generation stays in deterministic code.

## Fail-Closed Rule

When required semantics are missing, repair must fail closed by preserving rejection rather than manufacturing placeholder truth. Better prompts, targeted model retry with explicit issues, or a visible hard failure are valid outcomes. Silent semantic patching is not.

## Domain Notes

- Generic `safeGenerateObject` repair may reshape malformed JSON but must not add missing semantic content.
- ScenePlan and hidden adjudication repair may normalize `payload` to `input` only when the executable arguments already exist.
- Worldgen repair may trim and regroup cited facts, but must not invent source roles, canonical truth, lore, locations, factions, or cast.
- Power-stat repair may reformat evidence-backed tier fields, hax, and vulnerabilities, but must never invent power facts. If evidence is too thin, the path must fail closed.

