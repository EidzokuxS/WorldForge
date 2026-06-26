# Phase 94-04 GitNexus Scope Check

Command:

```powershell
gitnexus detect_changes scope=staged
```

Result:

```json
{
  "summary": {
    "changed_count": 0,
    "affected_count": 0,
    "changed_files": 8,
    "risk_level": "low"
  },
  "changed_symbols": [],
  "affected_processes": []
}
```

Interpretation:

- GitNexus found no indexed runtime symbol changes.
- Expected changed files are Phase 94 harness/report TypeScript and Phase 94 evidence/summary artifacts.
- Runtime acceptance remains blocked by live route evidence, not by code graph blast radius.
