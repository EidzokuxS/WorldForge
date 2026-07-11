# Task 8 — Persisted World Review and campaign shell

## Outcome

World Review now reads one `CampaignWorldState` projection and presents five product sections:

- Overview — location, route, person, collective, and pressure totals plus source/version provenance;
- Locations — persisted location rows, hierarchy, starting marker, and directed route costs;
- Actors — people and collectives through one actor contract, grouped by role with goals, placements, and relations;
- Connections — directed actor relations and anchored world pressures;
- Source — the exact persisted premise, optional World DNA, research summary, and source references.

The page performs an explicit reference-integrity check before rendering. Location, route, actor, goal, relation, placement, and pressure IDs must be unique and every persisted endpoint must resolve.

## Acceptance

- The action submits the displayed world version and content hash.
- A matching receipt is followed by an authoritative state reload.
- The accepted projection survives reload and remains fully inspectable.
- A `world_version_conflict` displays the safe conflict message, reloads current state, and leaves acceptance available against the refreshed version.
- Same-route acceptance invokes `refreshCampaignWorldState()` so shell status changes without navigation.

## Campaign shell

- Route campaign IDs use literal path segments; `/campaign/new` and `/campaign/new/dna` remain intake routes.
- Campaign metadata supplies only ID/name.
- `/api/campaigns/:id/world/state` supplies all lifecycle state.
- Labels are `World awaits creation`, `World is taking shape`, `World ready for review`, `World build needs attention`, and `World accepted`.
- Campaign navigation contains Campaign Forge and World Review. Review enables only for `review` or `accepted`.
- Play, Player Character, and Begin session links are absent from the Campaign World shell.

## Caller-proof deletion

Fixed-string caller inventory found only the replaced Review page, mutually displaced components, and their own tests for:

- `FactionsSection`
- `NpcsSection`
- `LoreSection`
- `PremiseSection`
- `RegenerateDialog`
- `CharacterRecordInspector`
- `WorldBookImportDialog`
- `TagEditor`

Those production files and tests were removed after the page cutover. `ReviewWorkspace`, `PersonalitySection`, and `StringListEditor` remain because current product surfaces still consume them. `world-data-helpers.ts` moves to Task 9 with its displaced writer DTOs.

## Verification

- Task 8 focused suite: 7 files, 18 tests passed.
- Tests prove five tabs, collective actor behavior, stable route/actor/placement/pressure navigation, stale conflict, matching acceptance, accepted reload, exact source snapshot, all five shell labels, Review gating, and absence of session/player navigation.
- `npm --prefix frontend run typecheck` passed.
- `git diff --check` passed.
- Active Forge/Review/shell paths contain no old world generation, Campaign Kernel, scaffold writer, generation flag, Character route, or route-ID regex references.
- Deleted component import checks returned zero matches.
- Live localhost shell showed `World awaits creation`, Campaign Forge enabled, World Review disabled, and no Play or Player Character link.
- Browser console had no application error; the only warning was the expected development Fast Refresh full reload caused by editing an imported module while the server was running.
- Final Overview, Actors, Connections, narrow Review, and accepted screenshots will come from Task 10's final persisted live runs rather than a fabricated projection.
