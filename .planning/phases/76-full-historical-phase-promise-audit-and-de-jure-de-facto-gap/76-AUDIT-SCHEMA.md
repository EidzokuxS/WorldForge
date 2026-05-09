# Phase 76 Audit Schema

Purpose: freeze the row contract, evidence standard, and parser rules before any Phase 76 audit slice classifies historical promises.

## Coverage Rules

- Integer coverage is phases `1` through `75`, exactly once at minimum.
- Archived extra coverage is `17-legacy` and `19.1`.
- Optional row `0-pre-gsd-baseline` may appear, but it never counts toward integer `1-75` coverage.
- Active `17-current` and archived `17-legacy` are separate audit subjects and must not be collapsed.
- Minimum granularity is one audit row per expected phase key. Multiple rows for the same phase are required when material promises need separate evidence, classification, risk, or disposition.

## Markdown Table Contract

Every slice audit and the final audit must include this table with this exact column order:

```markdown
| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
```

Rules:

- `Audit Key` is globally unique across all slices and the final audit.
- Audit keys use a coverage key plus a material-promise suffix, for example `37-current:runtime-loop`, `17-legacy:worldgen-e2e`, or `19.1-legacy:fallback-removal`.
- Literal pipe characters inside cells must be escaped as `\|`.
- Rows with the wrong Markdown column count are invalid.
- Empty cells are invalid.
- Use `n/a` only where this schema explicitly allows it:
  - `Disposition` may be `n/a` only for `verified-current` rows with no follow-up routing.
  - `Code/Tests/Docs Change` may be `n/a` only when no immediate change is required.

## Structured Audit Rows

Markdown tables are the human-readable mirror. The canonical parser input is a `## Structured Audit Rows` appendix containing one JSON object per line in a fenced `jsonl` block.

Example:

````markdown
## Structured Audit Rows

```jsonl
{"auditKey":"37-current:runtime-loop","phaseSource":"active","phaseNumber":"37","title":"Campaign-Loaded Gameplay Transport","materialPromise":"Gameplay routes bind to campaign id after reload.","evidenceChecked":"source:backend/src/routes/chat.ts; test:backend/src/routes/__tests__/chat.test.ts","classification":"verified-current","risk":"low","disposition":"n/a","codeTestsDocsChange":"n/a"}
```
````

Required JSON fields:

| JSON field | Markdown column | Required |
|---|---|---|
| `auditKey` | `Audit Key` | yes |
| `phaseSource` | `Phase Source` | yes |
| `phaseNumber` | `Phase #` | yes |
| `title` | `Title` | yes |
| `materialPromise` | `Material Promise` | yes |
| `evidenceChecked` | `Evidence Checked` | yes |
| `classification` | `Classification` | yes |
| `risk` | `Risk` | yes |
| `disposition` | `Disposition` | yes |
| `codeTestsDocsChange` | `Code/Tests/Docs Change` | yes |

The validator parses the JSONL rows as canonical, parses the Markdown table as a mirror, and fails when the two `Audit Key` sets differ.

## Classification Vocabulary

Allowed classifications:

- `verified-current`: current source/test/route/runtime/frontend evidence proves the promise is live now.
- `stale-unwired`: the promise exists in docs/planning but is not wired into current behavior.
- `partial`: some live path exists, but required behavior is incomplete or narrower than promised.
- `superseded`: a later phase or artifact explicitly replaced the promise.
- `deprecated`: the promise is explicitly retired and should not remain active product truth.
- `follow-up`: the promise remains desired but is intentionally routed to a future plan, phase, or backlog item.
- `not-applicable`: the row is historical/contextual and has no current product promise to verify.
- `needs-human-UAT`: current evidence is insufficient without human or provider/live-play verification.

Invalid or differently cased classifications fail validation.

## Risk Values

Allowed risk values:

- `none`: no current product risk.
- `low`: documentary or low-impact drift.
- `medium`: user-visible behavior may be incomplete but not release-blocking.
- `high`: material gameplay/worldgen/runtime trust risk.
- `release-blocking`: must be resolved before release readiness.
- `unknown`: cannot be ranked without UAT or deeper follow-up.

## Disposition Values

Allowed gap-routing values for non-verified rows and gap ledger entries:

- `immediate-docs-state-fix`
- `future-implementation-phase`
- `backlog`
- `deprecate`
- `needs-human-UAT`
- `not-applicable`
- `superseded-by`
- `n/a`

Rules:

- Every non-`verified-current` row must have a non-empty `Disposition`.
- Use `n/a` only for `verified-current`; non-verified rows must name a real routing value.
- `superseded` rows must include `supersession:` evidence.
- `deprecated` rows must include `deprecation:` evidence.
- `stale-unwired`, `partial`, `follow-up`, and `needs-human-UAT` rows must appear in `76-GAP-LEDGER.md`.

## Evidence Markers

Allowed evidence markers:

- `source:`
- `test:`
- `route:`
- `runtime:`
- `frontend:`
- `verification:`
- `supersession:`
- `deprecation:`
- `uat:`

`verified-current` requires at least one current live marker from:

- `source:`
- `test:`
- `route:`
- `runtime:`
- `frontend:`

Insufficient proof:

- A `SUMMARY.md` file alone.
- Roadmap checkbox/completion language alone.
- Requirement checkbox language alone.
- Schema/helper existence without evidence that current source, tests, route/runtime, frontend consumption, or explicit supersession/deprecation supports the row.

## Path-Like Evidence Rule

Marker values that look like repository paths must exist when feasible.

The validator treats a marker value as path-like when it:

- starts with `.planning/`, `backend/`, `frontend/`, `shared/`, `docs/`, or `tasks/`; or
- contains `/` or `\`.

Route names such as `route:POST /api/chat` are not filesystem paths. URLs are not repository paths. Runtime prose markers are allowed when they do not name a path.

Evidence must cite sanitized paths/markers only. Do not paste secrets, raw provider payloads, private campaign data, or raw prompt envelopes into audit rows.

## Slice Assignments

The corpus inventory assigns expected rows to these slices:

| Slice ID | Coverage |
|---|---|
| `v1-historical` | integer phases `1-36`, archived `17-legacy`, archived decimal `19.1`, optional `0-pre-gsd-baseline` |
| `v11-37-55` | active phases `37-55` |
| `v11-56-69` | active phases `56-69` |
| `recent-70-75` | active phases `70-75` plus the Phase 75 correction boundary |

The validator must fail a slice if any expected coverage key assigned to that slice has no matching audit row.

## Phase 75 Truth Boundary

Phase 75 is valid as the location-presence reality closure. It must not be described as the full historical audit. Phase 76 owns the exhaustive historical phase promise audit.
