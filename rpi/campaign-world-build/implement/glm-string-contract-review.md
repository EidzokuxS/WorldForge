# GLM prompt review: canonical string output

## Failure observed

A live `world_cast` stage failed its one-attempt model contract because `actors.3.traits.1` ended with whitespace. The strict Zod schema rejected the packet. The build then stored one failure terminal and left the world tables unchanged.

## Candidate prompt clause

> Return every string in final canonical form. Its first and last characters are visible, non-whitespace characters. References, names, tags, and traits use one line. Multi-line prose may contain line breaks only between visible characters.

## Review request

Review the clause for GLM-5.2 structured JSON generation. The clause will appear in all three Campaign World stage prompts. Preserve these constraints:

- strict schema validation stays enabled;
- model repair stays disabled;
- text fallback stays disabled;
- each stage gets one attempt;
- application code does not trim or normalize model output;
- the wording must be direct, compact, and easy for the model to follow.

Return a verdict of `APPROVE` or `REVISE`. If revision is needed, provide one replacement clause and explain the concrete ambiguity it removes.

## Verdict

Verdict: `REVISE`
Reviewer: GLM-5.2 (Z.AI Coding), Droid
Date: 2026-07-10
Constraint check: strict schema stays enabled; repair disabled; text fallback disabled; one attempt per stage; application code does not trim or normalize. The replacement clause puts all normalization on the model and touches none of these guarantees.

### Schema basis (contracts.ts)

- `boundedStringSchema` enforces `value === value.trim()` (no leading or trailing whitespace) for every string, plus single-line (`no \n or \r`) when `singleLine` is true.
- Single-line fields across all three stages: every `*Ref` (`locationReferenceSchema` / `actorReferenceSchema`), `name`, `tags`, `traits`.
- Multi-line fields (`textSchema`): `worldSummary`, `description`, `summary`, `objective`, `motivation`, `trajectory`.
- The candidate clause's single-line set ("references, names, tags, and traits") and its complement ("multi-line prose") map exactly onto this partition. No field is miscategorized.

### Why revise

The clause addresses the observed failure (a trait ending in whitespace would violate "last character is non-whitespace"), but it carries one concrete ambiguity and two lesser ones that work against a one-attempt, no-repair contract where the prompt is the only guard.

1. "final canonical form" is undefined. "Canonical" is overloaded: a model may read it as license to lowercase, collapse internal whitespace, or Unicode-normalize strings. The schema neither requires nor forbids any of these, so the word adds interpretive variance across the three stages without helping validation. Stating the rule operationally removes that surface and matches the schema's own vocabulary ("surrounding whitespace").
2. "visible" is redundant with "non-whitespace" and can be misread as "alphanumeric," which could push the model away from legitimate trailing punctuation. "Non-whitespace character" is the precise, schema-aligned term.
3. "traits use one line" can read as "the traits array is formatted on one line of JSON" rather than "each trait string has no line break." Making the per-element scope explicit removes that reading.

### Replacement clause

> Output every string with no leading or trailing whitespace; the first and last character of each value must be a non-whitespace character. Each reference, name, tag, and trait stays on one line with no line breaks. Other text fields may use line breaks, but only inside the text, never at the start or end.

### Mapping to the schema

- "no leading or trailing whitespace" plus "first and last character ... non-whitespace" equals `value === value.trim()` for every string, including multi-line prose. A trailing newline on `worldSummary` or a trailing space on a trait both fail this sentence, so both observed and analogous failures are covered.
- "Each reference, name, tag, and trait stays on one line with no line breaks" equals the `singleLine` refine for the exact single-line field set.
- "Other text fields may use line breaks, but only inside the text, never at the start or end" grants the internal line breaks that `textSchema` permits and forbids only the leading or trailing newlines that `value === value.trim()` already rejects. It does not over-constrain interior spacing, so it cannot cause a validation failure.

The replacement is direct, compact, jargon-free, and preserves every stated constraint.

## Applied clause

The implementation uses this tightened version after `humanizer` and `deslop` review:

> Output every string without leading or trailing whitespace. The first and last characters of each value must be non-whitespace characters. Keep each reference, name, tag, and trait on one line without line breaks. Other text fields may use line breaks only inside the text, between non-whitespace characters.

The edit removes the undefined word "canonical," gives each array element an explicit one-line rule, and preserves the schema's permitted interior whitespace.
