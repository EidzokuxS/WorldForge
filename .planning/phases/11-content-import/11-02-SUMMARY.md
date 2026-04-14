---
phase: 11-content-import
plan: 02
subsystem: worldgen
tags: [mcp, search, zai, duckduckgo, settings-ui]

requires:
  - phase: 11-content-import
    provides: MCP client infrastructure, IP researcher, research settings UI
provides:
  - Multi-provider MCP client factory (withSearchMcp)
  - SearchProvider type for configurable search backends
  - Settings UI search provider selector
affects: [worldgen, settings]

tech-stack:
  added: [zai-search-mcp]
  patterns: [configurable MCP provider selection via SEARCH_MCP_CONFIGS map]

key-files:
  created: []
  modified:
    - backend/src/lib/mcp-client.ts
    - backend/src/worldgen/ip-researcher.ts
    - shared/src/types.ts
    - shared/src/settings.ts
    - shared/src/index.ts
    - backend/src/settings/manager.ts
    - frontend/components/settings/research-tab.tsx

key-decisions:
  - "withMcpClient kept as deprecated wrapper for backward compatibility; withSearchMcp is preferred"
  - "SEARCH_MCP_CONFIGS record maps SearchProvider to MCP server command/args"

patterns-established:
  - "Multi-provider MCP: SEARCH_MCP_CONFIGS record pattern for adding new search backends"

requirements-completed: [IMPT-04]

duration: 5min
completed: 2026-03-19
---

# Phase 11 Plan 02: Z.AI Search MCP Provider Summary

**Multi-provider MCP client with Z.AI search alternative and settings UI provider selector**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T04:19:09Z
- **Completed:** 2026-03-19T04:24:27Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added SearchProvider type ("duckduckgo" | "zai") to shared types with full backward compatibility
- Created withSearchMcp function supporting configurable search MCP backends via SEARCH_MCP_CONFIGS map
- Updated IP researcher to use searchProvider from research config
- Added search provider Select dropdown in settings UI Research Agent card

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-provider MCP client + ip-researcher update** - `7bca68c` (feat)
2. **Task 2: Settings UI search provider selector** - `d4a5d8c` (feat)

## Files Created/Modified
- `shared/src/types.ts` - Added SearchProvider type, extended ResearchConfig
- `shared/src/index.ts` - Exported SearchProvider type
- `shared/src/settings.ts` - Added searchProvider default to createDefaultSettings
- `shared/src/__tests__/settings.test.ts` - Added searchProvider default test
- `backend/src/lib/mcp-client.ts` - Added withSearchMcp, SEARCH_MCP_CONFIGS, deprecated withMcpClient
- `backend/src/lib/index.ts` - Exported withSearchMcp
- `backend/src/worldgen/ip-researcher.ts` - Uses withSearchMcp with configurable provider
- `backend/src/settings/manager.ts` - Normalizes searchProvider with validation
- `backend/src/character/__tests__/archetype-researcher.test.ts` - Updated tests for new searchProvider field
- `frontend/components/settings/research-tab.tsx` - Added search provider Select dropdown

## Decisions Made
- Kept withMcpClient as deprecated wrapper delegating to withSearchMcp("duckduckgo", ...) for backward compatibility
- Used SEARCH_MCP_CONFIGS record pattern for easy addition of future search providers
- Validated searchProvider against whitelist in normalizeResearchConfig (defaults to "duckduckgo" for unknown values)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed archetype-researcher tests missing searchProvider**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Existing tests in archetype-researcher.test.ts created ResearchConfig objects without the new searchProvider field
- **Fix:** Added `searchProvider: "duckduckgo"` to all test ResearchConfig objects
- **Files modified:** backend/src/character/__tests__/archetype-researcher.test.ts
- **Verification:** Backend typecheck passes
- **Committed in:** 7bca68c (Task 1 commit)

**2. [Rule 3 - Blocking] Rebuilt shared package for backend typecheck**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Backend uses shared/dist/ which was stale after types.ts update
- **Fix:** Ran `npm run build` in shared/ to regenerate dist/
- **Verification:** Backend typecheck passes after rebuild

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for build correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Multi-provider search MCP infrastructure ready for future providers
- Settings UI complete with provider selection
- Backward compatible - existing DuckDuckGo-only setups work unchanged

---
*Phase: 11-content-import*
*Completed: 2026-03-19*
