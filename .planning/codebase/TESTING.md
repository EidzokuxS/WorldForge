# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Runner:**
- Vitest 3.x (both backend and frontend)
- Backend config: `backend/vitest.config.ts` — includes `src/**/*.test.ts`
- Frontend config: `frontend/vitest.config.ts` — includes `**/__tests__/**/*.test.ts`
- Shared config: `shared/vitest.config.ts` (inferred from dist output)

**Assertion Library:**
- Vitest built-in (`expect`) — no separate assertion library

**Run Commands:**
```bash
cd backend && npm test              # Run all backend tests (vitest run)
cd backend && npm run test:watch    # Watch mode
cd frontend && npx vitest run       # Run all frontend tests
cd shared && npx vitest run         # Run shared tests
```

No coverage command configured in `package.json` scripts — run manually with `--coverage` flag.

## Test File Organization

**Location:**
- Co-located in `__tests__/` subdirectory: `src/worldgen/__tests__/seed-roller.test.ts` sits next to `src/worldgen/seed-roller.ts`
- Never mixed alongside source in the same directory level

**Naming:**
- `{source-file-name}.test.ts` — always mirrors the module under test
- e.g., `manager.ts` → `manager.test.ts`, `lore-cards.ts` → `lore-cards.test.ts`

**Structure:**
```
backend/src/
├── worldgen/
│   ├── seed-roller.ts
│   ├── scaffold-generator.ts
│   └── __tests__/
│       ├── seed-roller.test.ts
│       ├── scaffold-generator.test.ts  (not present yet)
│       └── ...
├── routes/
│   ├── campaigns.ts
│   └── __tests__/
│       └── campaigns.test.ts
frontend/
├── components/title/
│   ├── utils.ts
│   └── __tests__/
│       └── utils.test.ts
└── lib/
    └── __tests__/
        ├── api.test.ts
        └── settings.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Section Header (matches source module section)
// ---------------------------------------------------------------------------
describe("functionName", () => {
  describe("sub-scenario or category", () => {
    it("does specific thing when condition", () => {
      // arrange
      // act
      // assert
    });
  });
});
```

**Patterns:**
- Section dividers `// ----` separate top-level describe blocks — visual grouping in longer test files
- `beforeEach(() => { vi.clearAllMocks(); })` — always clear mocks between tests
- `beforeEach` / `afterEach` for spy setup/restore (not `beforeAll`)
- `it.each(array)("description %s", (item) => { ... })` for data-driven tests
- Fixtures defined at module level as `const`, not regenerated per test
- Factory functions (`makeReq`, `makeCustomProvider`, `createMockDb`) for complex fixture construction

**Async tests:**
```typescript
it("creates campaign and returns 201", async () => {
  mockedCreate.mockResolvedValue(created as any);
  const res = await app.request("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New World", premise: "A dark fantasy realm" }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body).toEqual(created);
});
```

## Mocking

**Framework:** `vi` from Vitest — `vi.mock`, `vi.fn`, `vi.spyOn`, `vi.mocked`

**Module mock pattern (hoisted, before imports):**
```typescript
// Mocks MUST appear before the import of the module under test
vi.mock("../../campaign/index.js", () => ({
  createCampaign: vi.fn(),
  listCampaigns: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Import mocked functions for typed access
import { createCampaign, listCampaigns } from "../../campaign/index.js";
const mockedCreate = vi.mocked(createCampaign);
const mockedList = vi.mocked(listCampaigns);
```

**AI SDK mocking (for worldgen/character tests):**
```typescript
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,           // spread actual to preserve non-mocked exports
    generateText: vi.fn(),
    generateObject: vi.fn(),
  };
});
// Then in tests:
mockGenerateObject.mockResolvedValueOnce({ object: fakeSeeds });
```

**Node built-in mocking:**
```typescript
vi.mock("node:fs", () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
// For default export modules:
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));
```

**Spy pattern (for testing side effects):**
```typescript
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});
```

**Factory function for complex mock objects:**
```typescript
function createMockDb(hasTable = false) {
  const mockTable = {
    vectorSearch: vi.fn().mockReturnThis(),
    distanceType: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  };
  return {
    tableNames: vi.fn().mockResolvedValue(hasTable ? ["lore_cards"] : []),
    createTable: vi.fn().mockResolvedValue(mockTable),
    _mockTable: mockTable,  // expose for assertions
  };
}
```

**What to Mock:**
- All external I/O: `node:fs`, `node:crypto` (when determinism matters)
- All AI SDK calls: `generateObject`, `generateText`, `streamText`
- All database access: `getDb`, LanceDB connection module
- All campaign manager functions imported in routes
- External packages: `@ai-sdk/mcp`, MCP transports

**What NOT to Mock:**
- Pure functions with no side effects (test directly: `rollSeed`, `parseWorldSeeds`, `formatUtcDate`)
- Zod schemas (test schema behavior directly)
- The Hono app itself — instantiate real app with `new Hono()` in route tests

## Route Testing Pattern

Route tests use Hono's built-in `app.request()` — no HTTP server needed:
```typescript
const app = new Hono();
app.route("/api/campaigns", campaignRoutes);

const res = await app.request("/api/campaigns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test", premise: "A premise" }),
});

expect(res.status).toBe(201);
const body = await res.json();
expect(body).toHaveProperty("id");
```

Always test both happy path AND error path (e.g., service throws → expect 500 + `{ error: ... }`).

## Fixtures and Factories

**Inline constant fixtures for simple data:**
```typescript
const CAMPAIGN_ID = "abc-123";
const fakeCards = [
  { id: "1", term: "Ironhaven", definition: "A fortified city.", category: "location" as const },
];
```

**Factory functions for parameterized fixtures:**
```typescript
function makeReq(overrides: Partial<GenerateScaffoldRequest> = {}): GenerateScaffoldRequest {
  return {
    campaignId: "test-campaign",
    premise: "A generic world.",
    role: { provider: { ... }, temperature: 0.7, maxTokens: 2048 },
    ...overrides,
  };
}
```

**Location:** Defined at module top, before `describe` blocks.

## Coverage

**Requirements:** No enforced coverage threshold — no `coverage` script in `package.json`.

**Current scope:** 57 test files covering all major backend modules. Untested areas include `engine/` modules (some tested) and frontend components (only utility functions tested).

**View Coverage:**
```bash
cd backend && npx vitest run --coverage
cd frontend && npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Scope: Pure functions, utility modules, business logic (seed-roller, errors, type-guards, settings/manager, worldgen functions)
- Pattern: Test inputs/outputs directly, mock all I/O
- Location: `src/**/__tests__/*.test.ts`

**Integration Tests:**
- Scope: Hono route handlers with mocked service layer (`routes/__tests__/`)
- Pattern: Real Hono app + `app.request()` + mocked dependencies, tests HTTP contract (status, body shape)
- Examples: `campaigns.test.ts`, `chat.test.ts`, `lore.test.ts`, `settings.test.ts`

**E2E Tests:**
- Framework: PinchTab (not Playwright) — accessibility-tree-based browser automation via HTTP API (port 9867)
- Location: Not in repo source tree; run via `/e2e` command
- Critical flows: Campaign creation, character creation, game chat

## Common Patterns

**Testing probabilistic behavior (retry loop):**
```typescript
it("returns 2 or 3 items", () => {
  const lengths = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const result = rollSeed("culturalFlavor") as string[];
    lengths.add(result.length);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(3);
  }
  // With 50 iterations we almost certainly see both 2 and 3
});
```

**Deterministic testing of random behavior (spy on crypto):**
```typescript
let randomIntSpy: MockInstance;
beforeEach(() => { randomIntSpy = vi.spyOn(crypto, "randomInt"); });
afterEach(() => { randomIntSpy.mockRestore(); });

it("returns first item when randomInt returns 0", () => {
  randomIntSpy.mockReturnValue(0);
  expect(rollSeed("geography")).toBe("Vast archipelago of floating islands");
});
```

**Testing error conditions:**
```typescript
it("returns 500 when createCampaign throws", async () => {
  mockedCreate.mockRejectedValue(new Error("create failed"));
  const res = await app.request("/api/campaigns", { method: "POST", ... });
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body).toHaveProperty("error");
});
```

**Round-trip integration test:**
```typescript
it("parseWorldSeeds accepts output of rollWorldSeeds", () => {
  const seeds = rollWorldSeeds();
  const parsed = parseWorldSeeds(seeds);
  expect(parsed).not.toBeNull();
  for (const key of STRING_CATEGORIES) {
    expect(parsed![key]).toBe(seeds[key]);
  }
});
```

**`as any` usage:** Used sparingly when mock return type doesn't match the full shape:
```typescript
mockedList.mockReturnValue(campaigns as any);
mockedCreate.mockResolvedValue(created as any);
```
Acceptable for test-only code; not allowed in production source.

---

*Testing analysis: 2026-03-19*
