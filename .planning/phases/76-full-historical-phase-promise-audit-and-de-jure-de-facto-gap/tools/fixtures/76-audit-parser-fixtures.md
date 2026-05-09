# Phase 76 Audit Parser Fixtures

## Fixture: valid

| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
| 1-current:foundation-contract | active | 1 | Engine Foundation | Prompt assembly evidence must be checked with live source. | source:.planning/PROJECT.md; verification:.planning/STATE.md | verified-current | low | n/a | n/a |

## Structured Audit Rows
```jsonl
{"auditKey":"1-current:foundation-contract","phaseSource":"active","phaseNumber":"1","title":"Engine Foundation","materialPromise":"Prompt assembly evidence must be checked with live source.","evidenceChecked":"source:.planning/PROJECT.md; verification:.planning/STATE.md","classification":"verified-current","risk":"low","disposition":"n/a","codeTestsDocsChange":"n/a"}
```

## Fixture: invalid-markdown-jsonl-mismatch

| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
| 1-current:mismatch | active | 1 | Engine Foundation | Markdown row says verified. | source:.planning/PROJECT.md | verified-current | low | n/a | n/a |

## Structured Audit Rows
```jsonl
{"auditKey":"1-current:mismatch","phaseSource":"active","phaseNumber":"1","title":"Engine Foundation","materialPromise":"Markdown row says verified.","evidenceChecked":"verification:.planning/PROJECT.md","classification":"partial","risk":"low","disposition":"future docs","codeTestsDocsChange":"docs"}
```

## Fixture: invalid-duplicate-key

| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
| 1-current:duplicate | active | 1 | Engine Foundation | First row. | source:.planning/PROJECT.md | verified-current | low | n/a | n/a |
| 1-current:duplicate | active | 1 | Engine Foundation | Duplicate row. | source:.planning/STATE.md | verified-current | low | n/a | n/a |

## Structured Audit Rows
```jsonl
{"auditKey":"1-current:duplicate","phaseSource":"active","phaseNumber":"1","title":"Engine Foundation","materialPromise":"First row.","evidenceChecked":"source:.planning/PROJECT.md","classification":"verified-current","risk":"low","disposition":"n/a","codeTestsDocsChange":"n/a"}
{"auditKey":"1-current:duplicate","phaseSource":"active","phaseNumber":"1","title":"Engine Foundation","materialPromise":"Duplicate row.","evidenceChecked":"source:.planning/STATE.md","classification":"verified-current","risk":"low","disposition":"n/a","codeTestsDocsChange":"n/a"}
```

## Fixture: invalid-missing-disposition

| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
| 2-current:partial-contract | active | 2 | Turn Cycle | Partial rows need routing. | verification:.planning/STATE.md | partial | medium | n/a | future docs |

## Structured Audit Rows
```jsonl
{"auditKey":"2-current:partial-contract","phaseSource":"active","phaseNumber":"2","title":"Turn Cycle","materialPromise":"Partial rows need routing.","evidenceChecked":"verification:.planning/STATE.md","classification":"partial","risk":"medium","disposition":"n/a","codeTestsDocsChange":"future docs"}
```

## Fixture: invalid-missing-path

| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
| 3-current:missing-path | active | 3 | World State Mechanics | Path-like evidence must exist. | source:.planning/does-not-exist.md | verified-current | high | n/a | n/a |

## Structured Audit Rows
```jsonl
{"auditKey":"3-current:missing-path","phaseSource":"active","phaseNumber":"3","title":"World State Mechanics","materialPromise":"Path-like evidence must exist.","evidenceChecked":"source:.planning/does-not-exist.md","classification":"verified-current","risk":"high","disposition":"n/a","codeTestsDocsChange":"n/a"}
```
