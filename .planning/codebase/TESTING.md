# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Runner:**
- Vitest 3.2+ (both backend and frontend)
- Backend config: `backend/vitest.config.ts`
- Frontend config: `frontend/vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect` (Chai-compatible API)

**Run Commands:**
```bash
cd backend && npm test          # Run all backend tests
cd backend && npm run test:watch  # Watch mode
cd frontend && npx vitest run   # Run frontend tests (no script alias)
```

## Test File Organization

**Location:**
- Co-located `__tests__/` subdirectories next to source files
- Pattern: `src/{module}/__tests__/{file}.test.ts`

**Naming:**
- `{source-file-name}.test.ts` matching the file under test
- Example: `backend/src/lib/errors.ts` -> `backend/src/lib/__tests__/errors.test.ts`

**Structure:**
```
backend/src/
├── ai/__tests__/
│   ├── provider-registry.test.ts
│   ├── resolve-role-model.test.ts
│   ├── storyteller.test.ts
│   └── test-connection.test.ts
├── campaign/__tests__/
│   ├── chat-history.test.ts
│   └── paths.test.ts
├── db/__tests__/
│   └── schema.test.ts
├── lib/__tests__/
│   ├── clamp.test.ts
│   ├── errors.test.ts
│   └── type-guards.test.ts
├── routes/__tests__/
│   ├── helpers.test.ts
│   └── schemas.test.ts
├── settings/__tests__/
│   ├── index.test.ts
│   └── manager.test.ts
└── worldgen/__tests__/
    ├── index.test.ts
    ├── ip-researcher.test.ts
    └── seed-roller.test.ts

frontend/
├── components/title/__tests__/
│   └── utils.test.ts
└── lib/__tests__/
    ├── api.test.ts
    └── settings.test.ts

shared/src/__tests__/
├── chat.test.ts
└── settings.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Section divider comment
// ---------------------------------------------------------------------------
describe("functionOrClassName", () => {
  describe("with specific scenario", () => {
    it("does expected behavior", () => {
      const result = functionUnderTest(input);
      expect(result).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("handles null input", () => {
      expect(functionUnderTest(null)).toBe(fallback);
    });
  });
});
```

**Key patterns:**
- Nested `describe` blocks to group by scenario/feature area
- Horizontal rule comments (`// ----`) to visually separate top-level `describe` blocks
- `it` descriptions are imperative: "returns defaults for null", "trims whitespace", "rejects invalid values"
- Each test is self-contained; no shared mutable state between tests unless via `beforeEach`

**Setup/Teardown:**
```typescript
beforeEach(() => {
  vi.resetAllMocks();  // Reset mock state between tests
});

afterEach(() => {
  spy.mockRestore();  // Restore spied functions
});
```

**Parameterized tests:**
```typescript
// Using it.each for tabular test data
it.each([
  ["null", null],
  ["undefined", undefined],
  ["number", 42],
  ["string", "hello"],
])("returns null for %s", (_label, value) => {
  expect(parseWorldSeeds(value)).toBeNull();
});

// Using it.each with array of values
it.each(STRING_CATEGORIES)(
  "returns a non-empty string for %s",
  (category) => {
    const result = rollSeed(category);
    expect(typeof result).toBe("string");
  },
);
```

## Mocking

**Framework:** Vitest built-in `vi.mock()` and `vi.spyOn()`

**Module Mocking Pattern:**
```typescript
// Mock BEFORE importing the module under test
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { loadSettings, saveSettings } from "../manager.js";

const mockedFs = vi.mocked(fs);
```

**Spy Pattern:**
```typescript
let randomIntSpy: any;

beforeEach(() => {
  randomIntSpy = vi.spyOn(crypto, "randomInt");
});

afterEach(() => {
  randomIntSpy.mockRestore();
});

it("returns deterministic output", () => {
  randomIntSpy.mockReturnValue(0);
  const result = rollSeed("geography");
  expect(result).toBe("Vast archipelago of floating islands");
});
```

**Manual Response Mocking (Frontend):**
```typescript
const response = {
  json: async () => ({ error: "Something went wrong" }),
  statusText: "Internal Server Error",
} as unknown as Response;
expect(await readErrorMessage(response)).toBe("Something went wrong");
```

**What to Mock:**
- File system operations (`node:fs`)
- Crypto random functions when testing deterministic behavior
- HTTP Response objects in frontend tests

**What NOT to Mock:**
- Pure functions (Zod schemas, parsers, rollers, error utilities)
- Shared package exports (test them directly)
- Drizzle schema definitions

## Fixtures and Factories

**Test Data Helpers:**
```typescript
// Factory function for test objects
function makeCustomProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "custom-1",
    name: "Custom Provider",
    baseUrl: "https://custom.example.com/v1",
    apiKey: "sk-custom-key",
    defaultModel: "custom-model",
    isBuiltin: false,
    ...overrides,
  };
}

// Wrapper for defaults
function defaults(): Settings {
  return createDefaultSettings();
}

// Minimal valid input builder
function makeMinimalValidSettings(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  const d = defaults();
  return { ...d, ...overrides };
}
```

**Location:**
- Helpers defined inline at the top of each test file
- No shared test fixtures directory
- Use production factory functions (e.g., `createDefaultSettings()`) where available

## Coverage

**Requirements:** No coverage thresholds enforced

**View Coverage:**
```bash
cd backend && npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Predominant test type
- Test individual functions, schemas, and utilities in isolation
- Pure function tests: no mocks needed (schemas, parsers, error helpers)
- Tests with mocks: file system, crypto random

**Integration Tests:**
- Not present as a separate category
- Route handlers are not tested via HTTP; only their dependencies (schemas, helpers) are unit-tested

**E2E Tests:**
- Not in the test suite; uses PinchTab browser automation (external tool, not committed)
- No Playwright or Cypress

## Common Patterns

**Schema Validation Testing:**
```typescript
describe("schemaName", () => {
  it("accepts valid input", () => {
    const result = schema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.field).toBe(expectedValue);
    }
  });

  it("rejects invalid input", () => {
    const result = schema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("applies transforms", () => {
    const result = schema.safeParse({ field: "  untrimmed  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.field).toBe("untrimmed");
    }
  });
});
```

**Round-Trip Testing:**
```typescript
describe("round-trip", () => {
  it("parseWorldSeeds accepts output of rollWorldSeeds", () => {
    const seeds = rollWorldSeeds();
    const parsed = parseWorldSeeds(seeds);
    expect(parsed).not.toBeNull();
  });

  it("normalizing default settings returns equivalent defaults", () => {
    const d = defaults();
    const result = normalizeSettings(d);
    expect(result.judge.temperature).toBe(d.judge.temperature);
  });
});
```

**Boundary Value Testing:**
```typescript
it("clamps temperature to [0, 2] range", () => {
  const result = normalizeSettings({ storyteller: { temperature: 5.0 } });
  expect(result.storyteller.temperature).toBeLessThanOrEqual(2);

  const result2 = normalizeSettings({ storyteller: { temperature: -1 } });
  expect(result2.storyteller.temperature).toBeGreaterThanOrEqual(0);
});
```

**Probabilistic Testing (for random outputs):**
```typescript
it("produces varied results across multiple calls", () => {
  const results = Array.from({ length: 20 }, () => rollWorldSeeds());
  const geographies = new Set(results.map((s) => s.geography));
  expect(geographies.size).toBeGreaterThan(1);
});

it("returns unique items (no duplicates)", () => {
  for (let i = 0; i < 30; i++) {
    const result = rollSeed("culturalFlavor") as string[];
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  }
});
```

## Test Configuration Details

**Backend (`backend/vitest.config.ts`):**
```typescript
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Frontend (`frontend/vitest.config.ts`):**
```typescript
export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@worldforge/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
```

Frontend test config aliases `@` and `@worldforge/shared` to resolve correctly outside Next.js build. Backend tests rely on NodeNext resolution with `.js` extensions.

---

*Testing analysis: 2026-03-09*
