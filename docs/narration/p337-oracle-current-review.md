# P337 Oracle Current Review

Date: 2026-06-26

Oracle session:
- `worldforge-p337-current-review`
- Browser model evidence: requested `Pro`, resolved `Pro Extended`, verified `yes`
- Bundle: 12 attached files, full P337 case brief plus runtime/source/tests/reference notes

## Verdict

Oracle confirmed the current `device_surface_unavailable` direction:

- keep the narrow typed hard-result render;
- treat it as a receipt-owned hard micro-result, not fallback and not narrator replacement;
- avoid bounded paraphrase for this exact device result because paraphrase tends to create screen, signal, battery, calls, messages, notifications, or no-change claims;
- avoid a structured model sentence object for this exact hard result because JSON shape does not guarantee semantic non-expansion.

## Immediate Follow-Up

The requested code-level tightening was branch purity:

- compute typed/deterministic branch eligibility before model prompt construction;
- do not let model-oriented sentence-plan prompt building become a precondition for exact typed hard-result render;
- preserve `candidate=null` and `source=typed_hard_result` for the proof.

Implemented follow-up:

- `typed_hard_result` proof now carries `promptInput=null`;
- model and deterministic narration proofs still require `promptInput`;
- normal model-turn validation errors still throw and do not get rescued by deterministic or typed projection.

## Next Highest Risk

Oracle flagged the next real product risk as opening/direct-scene page shape, especially Tiamat/Shibuya staging:

- prose must not dump route labels, macro-location membership, or backend receipt rows;
- UI may own location/route controls;
- prose should respect player-character knowledge;
- key NPCs need concrete start scenes or offscreen starts before the opening page;
- first-screen proof must include player-facing readability, not just no-crash status.

## Sustained Proof Bar

The next proof lane should use a fresh zero-turn clone and track:

- runtime source per turn;
- settlement kind and receipt authority;
- DB/world-clock deltas;
- UI/map discovery deltas;
- narrative text excerpts;
- whether the page gives a playable next handle.

The proof is valid when it exercises opening plus sustained manual play, not only the device micro-result.
