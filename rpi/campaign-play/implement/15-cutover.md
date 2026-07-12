# Task 15 — Product handoff and hard cutover

Status: complete.

## Outcome

An accepted campaign enters campaign-owned character setup and then `/campaign/:id/play`. Campaign phase determines every load and sidebar destination. The mounted backend exposes Campaign World plus Campaign Play; the displaced chat and worldgen-character routers are absent.

## Ownership decisions

- Review owns acceptance and the handoff to Character.
- Character owns player intake and `PUT /api/campaigns/:id/play/player`.
- Play owns opening selection, `POST /api/campaigns/:id/play/opening`, actions, recovery, and Journal.
- Campaign World remains mounted at `/api/worldgen` for forge/review operations.
- Donor source may remain unmounted when no production import or route reaches it.

## Planned proof

- Focused navigation and Character component/client regressions.
- Production route-registration integration proving canonical reachability and displaced `404` responses.
- Fixed-string inventories for `/game`, `/api/chat`, old character save, Campaign Kernel, old gameplay runtime, and `generationComplete`.
- A normal rendered browser journey from accepted Review through Character into Play, with recorded requests restricted to Campaign World and Campaign Play APIs.
- Direct `/game` navigation returning the Next `404` surface.
- Full affected tests, both typechecks, production build, diff check, GitNexus change detection, and fresh Sol review.

Standalone smoke-suite additions: 0.

## Evidence

### Product flow

- Persisted campaign `4f52a9b9-3f7e-4f17-8c5e-6934b72bd731` opened at accepted Review, exposed `Continue to character`, passed through the Character route, and reached `/campaign/4f52a9b9-3f7e-4f17-8c5e-6934b72bd731/play`.
- The rendered Play state showed Mara Venn at Bell Island with Sel Bell present, one open route, one pressure, one public consequence, four suggested actions, Journal, freeform input, and Act.
- The browser network ledger for the handoff contained Campaign World, Campaign Play, campaign metadata, and Next route requests. It contained no `/api/chat` or worldgen-character request.
- The adjacent Review test clicks `Accept world`, verifies persisted acceptance, and asserts the Character navigation. The Character test verifies canonical save and Play navigation.
- Direct browser navigation to `/game` rendered the Next `404` page.

### Displaced endpoints

The mounted application and live server return `404` for:

- `GET /api/chat/history`
- `POST /api/worldgen/parse-character`
- `POST /api/worldgen/save-character`
- `POST /api/worldgen/resolve-starting-location`

Campaign World and Campaign Play mounted-route probes reach their handlers and return their typed `campaign_not_found` response for a missing campaign.

### Visual capture

- `rpi/campaign-play/implement/evidence/task15/campaign-play-ready-desktop.png`
- `rpi/campaign-play/implement/evidence/task15/campaign-play-ready-narrow.png`

The 390x844 capture shows one opaque dock backdrop behind all four choices, Journal, freeform input, and Act. Scene text does not show through the control gaps.

### Fixed-string inventory

- `/game`: zero route literals and product callers in `frontend/app`, `frontend/components`, `frontend/lib`, and `frontend/scripts`. Unmounted donor component paths may still use `components/game` as their directory name.
- `/api/chat`: zero matches in active frontend code and backend route registration.
- `/api/worldgen/save-character`: matches remain only in the unmounted donor router tests.
- `gameplay-cycle-runtime`, `generationComplete`, and `campaign-kernel`: zero matches in Campaign Play backend, route, page, and component production paths.
- The active Launcher and Character/Play paths contain zero `getWorldData` calls.

### Verification

- Focused cutover frontend: 13 files, 100 tests passed.
- Complete frontend: 76 files, 491 tests passed.
- Complete backend serial suite exited successfully; the prior 3,886-test baseline plus the new route-registration contract is covered.
- Frontend and backend typechecks passed.
- Shared, frontend, and backend production build passed. The Next route manifest contains Character, Forge, Play, and Review and omits `/game`.
- Changed-file lint passed without warnings after removal of the displaced stream helper. Full frontend lint retains the pre-existing Forge `setState`-in-effect error and dependency warning at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx`.
- `node --check frontend/scripts/capture-campaign-play-visuals.mjs` passed.
- `git diff --check` passed.
- GitNexus impact and API-impact calls were attempted for every changed or removed symbol. The index returned `UNKNOWN` because its Ladybug WAL asserted `UNREACHABLE_CODE`; exact caller and fixed-string inventories bound the change instead.
- Character save conflicts now reload Campaign Play authority. A newer character phase refreshes the version tokens while preserving the edited draft for an explicit retry; an already-established character routes directly to Play. Adjacent regressions cover both branches.
- Fresh Sol semantic verification returned `PASS` with zero P0/P1 findings. Both P2 advisories were resolved: fixed-string evidence now distinguishes route literals from donor directory names, and Character refreshes authoritative state after concurrent save conflicts.

### Copy and design review

Humanizer/deslop review found the new Character, navigation, error, and capture copy direct and specific. The generated-character prompt asks for a grounded resident with a life beyond the opening scene. Frontend design review retained the existing editorial dark-world direction and limited the visual change to the narrow dock backdrop.

Standalone smoke-suite additions: 0.
