# Phase 77 Playtest Evidence

## P77-R8

**Mode:** deterministic mocked page test, no live provider claims.
**Fixture:** `frontend/app/game/__tests__/page.test.tsx` test `covers the deterministic 10-turn playable UX slice without default raw debug`.
**Campaign id:** `test-campaign`.
**Result:** PASS.

## 10-Turn Script

| Turn | Action | Evidence |
|---|---|---|
| 1 | Continue | Visible `Continue` sends `Continue scene.` through `chatAction`. |
| 2 | freeform | `Scout ahead for the safest route` sends through `chatAction` and receives `Clean success`. |
| 3 | actor | Visible Nobara actor chip opens Character scoped to Nobara, then `Ask Nobara...` sends through `chatAction`. |
| 4 | freeform setup | `Signal the group...` sends through `chatAction` and reveals a settled choice. |
| 5 | mechanic / choice | `Ask for details` quick choice sends through `chatAction` after authoritative `done`. |
| 6 | movement | World drawer `Travel to Dark Forest` sends `go to Dark Forest` through the existing backend path. |
| 7 | Continue | Visible `Continue` remains available after drawer/movement flow. |
| 8 | freeform | `Check the inventory straps...` sends through `chatAction`. |
| 9 | Continue | Another visible `Continue` sends through `chatAction`. |
| 10 | freeform | `Mark the route back with a chalk sign` sends through `chatAction`. |

## Required Verb Gate

| Verb | Status | Evidence |
|---|---|---|
| Continue | PASS | Turns 1, 7, and 9 use visible `Continue`. |
| freeform | PASS | Turns 2, 3, 4, 8, and 10 send raw narrative text. |
| actor | PASS | Nobara visible actor chip opens Character scoped to that actor before turn 3. |
| movement | PASS | World drawer travel button sends `go to Dark Forest`. |
| drawer | PASS | Inventory drawer opens/closes while preserving draft text. |
| mechanic | PASS | Turn 2 shows fiction-facing `Clean success`; default surface hides `Chance`, `Roll`, `Raw reasoning`, and `JSON`. |

## Local vs Backend Controls

- `Next`, `Auto`, and `Log` were clicked after 10 backend turns; `chatAction` call count did not increase.
- `Send`, `Continue`, quick choice, and movement all used `chatAction`.
- The test does not claim live provider prose quality, only deterministic play-surface usability and route semantics.

## Residual Risks

- Live subjective pacing and provider writing quality remain outside this deterministic gate.
- Browser visual hierarchy is covered separately in `77-VISUAL-QA.md`.
