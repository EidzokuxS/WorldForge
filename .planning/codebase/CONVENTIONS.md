# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- kebab-case for all source files: `seed-roller.ts`, `lore-cards.ts`, `scaffold-generator.ts`
- Test files mirror source name with `.test.ts` suffix: `seed-roller.test.ts`
- Test files live in `__tests__/` subdirectory next to source: `src/worldgen/__tests__/seed-roller.test.ts`
- Index barrel files named `index.ts` for module entry points: `src/ai/index.ts`, `src/lib/index.ts`

**Functions:**
- camelCase for all functions: `rollSeed`, `parseCharacterDescription`, `createLogger`, `getErrorStatus`
- Async functions for I/O: `parseBody`, `loadCampaign`, `insertLoreCards`
- Boolean-returning functions prefixed with `is`/`has`/`requires`: `isRecord`, `requiresApiKey`, `isLocalProvider`
- Factory functions prefixed with `create`: `createLogger`, `createModel`, `createCampaign`
- Getter functions prefixed with `get`: `getDb`, `getActiveCampaign`, `getErrorStatus`
- Resolver functions prefixed with `resolve`: `resolveRoleModel`, `resolveGenerator`, `resolveStoryteller`

**Variables:**
- camelCase throughout: `campaignId`, `worldSeeds`, `locationNames`
- Mocked function variables prefixed with `mocked`: `mockedList`, `mockedCreate`, `mockedGetDb`
- Module-level logger always: `const log = createLogger("tag")` at top of file

**Types/Interfaces:**
- PascalCase: `AppError`, `ParsedCharacter`, `ResolvedRole`, `CharacterEndpointContext`
- Zod schemas named with `Schema` suffix: `characterSchema`, `worldSeedsSchema`, `settingsPayloadSchema`
- `type` keyword for aliases and imports; `interface` for structural shapes
- Zod-inferred types extracted with `z.infer<typeof xSchema>`

**Constants:**
- SCREAMING_SNAKE_CASE for true constants: `SEED_CATEGORIES`, `LOG_DIR`, `CAMPAIGN_ID`, `NONE_PROVIDER_ID`
- Module-level loggers lowercase: `const log = createLogger(...)`

## Code Style

**Formatting:**
- No Prettier config detected — formatting enforced via post-tool hook (`prettier` runs after every `.ts`/`.tsx` edit)
- 2-space indentation throughout
- Double quotes for strings in TypeScript (consistent across backend and frontend)
- Trailing commas in multi-line structures

**Linting:**
- Backend: TypeScript strict mode enforced via `tsconfig.json` (`"strict": true`)
- Frontend: ESLint with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- TypeScript check hook runs `tsc` after every `.ts`/`.tsx` edit

**TypeScript Config:**
- Backend: `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`
- Frontend: Next.js defaults with strict TypeScript
- Shared: compiled separately, consumed by both backend and frontend

## Import Organization

**Order:**
1. Node built-ins: `import { appendFileSync } from "node:fs"` (always use `node:` prefix)
2. Third-party packages: `import { Hono } from "hono"`, `import { z } from "zod"`
3. Shared workspace: `import type { PlayerCharacter } from "@worldforge/shared"`
4. Internal relative imports with `.js` extension: `import { createLogger } from "../lib/index.js"`

**Path Aliases:**
- Backend: none — only relative paths with explicit `.js` extension
- Frontend: `@/` alias maps to `frontend/` root: `import type { Settings } from "@/lib/types"`
- Shared: `@worldforge/shared` resolves to `shared/src` in vitest; to compiled `dist` in production

**Module Exports:**
- Barrel `index.ts` files aggregate and re-export from sub-modules
- Types exported separately with `export type { ... }` — named type exports, not `export *`
- Route files export `default app` (Hono instance)

## Error Handling

**Route-level pattern (all Hono route handlers):**
```typescript
app.get("/", (c) => {
  try {
    return c.json(listCampaigns());
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to list campaigns.") },
      getErrorStatus(error)
    );
  }
});
```
- Every route body wrapped in a single outer `try/catch`
- `getErrorMessage(error, "Fallback message.")` — always pass a human-readable fallback
- `getErrorStatus(error)` — maps `AppError.statusCode` to HTTP status; non-AppErrors return 500
- Never throw from route handlers; always return a `c.json(...)` response

**AppError class (`backend/src/lib/errors.ts`):**
```typescript
export class AppError extends Error {
  constructor(message: string, public readonly statusCode: number = 500) {
    super(message);
    this.name = "AppError";
  }
}
```
- Throw `AppError` for expected domain errors (e.g. `new AppError("Not found", 404)`)
- Plain `Error` for unexpected errors — caught at route boundary, mapped to 500

**Request validation pattern:**
```typescript
const result = await parseBody(c, createCampaignSchema);
if ("response" in result) return result.response;
const { name, premise } = result.data;
```
- `parseBody()` in `backend/src/routes/helpers.ts` handles JSON parse + Zod validation
- Returns discriminated union: `{ data }` on success or `{ response: Response }` on failure
- Early return pattern: check for error response immediately after `parseBody`

**Active campaign guard:**
```typescript
const campaign = requireActiveCampaign(c, id);
if (campaign instanceof Response) return campaign;
```
- `requireActiveCampaign()` returns campaign or 404 Response — always check `instanceof Response`

## Logging

**Framework:** Custom `createLogger` (`backend/src/lib/logger.ts`)

**Usage pattern:**
```typescript
// Module-level logger — one per file
const log = createLogger("worldgen");

// Usage
log.info("Starting scaffold generation", { campaignId });
log.warn("Embedder not configured — storing without vectors");
log.error("LanceDB write failed", error);
```

**Output format:** `[2026-01-15T10:30:00.000Z] [LEVEL] [tag] message\ndata`
- Writes to both console and daily file in `backend/logs/YYYY-MM-DD.log`
- Error objects serialized as `message + stack`; other data as JSON
- `console.log` for INFO/WARN, `console.error` for ERROR

**Rule:** Do not use raw `console.log` in source files — use `createLogger`. A Stop hook audits all modified files for `console.log` before session ends.

## Comments

**When to comment:**
- Section dividers in test files use `// -------` separator lines
- Complex logic with non-obvious behavior: inline `//` comments
- JSDoc-style `/** ... */` on exported utility functions with non-obvious signatures (`parseBody`, `requireActiveCampaign`)
- Type satisfies checks with explanatory comment: `// Compile-time check: ParsedCharacter must be assignable to PlayerCharacter`

**No-comment zones:**
- Simple CRUD operations — code is self-documenting
- Zod schema field descriptions go in `.describe("...")` — not comments

## Validation

**All schemas use Zod:**
```typescript
const schema = z.object({
  name: z.string().min(1),
  premise: z.string().min(1),
  seeds: worldSeedsSchema.optional(),
});
```
- Route input schemas live in `backend/src/routes/schemas.ts`
- AI tool schemas defined inline where used (co-located with AI call)
- All schemas use `.describe()` for AI-facing schemas (LLM sees these as field hints)
- `.safeParse()` for validation returning success/error; `.parse()` only inside try/catch

## Function Design

**Size:** Functions kept small; single responsibility. Files > 400 lines split by concern.

**Parameters:** Named options objects for functions with 3+ parameters:
```typescript
export async function parseCharacterDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter>
```

**Return Values:**
- Async functions return `Promise<T>` explicitly
- Discriminated unions for fallible operations: `{ data: T } | { response: Response }`, `{ resolved: R } | { error: string; status: 400 }`
- Never `null | T` when a typed union is clearer

## Module Design

**Barrel Files:** Every feature directory has `index.ts` re-exporting public API:
- `backend/src/ai/index.ts` — exports `createModel`, `resolveRoleModel`, `callStoryteller`, etc.
- `backend/src/lib/index.ts` — exports `errors`, `logger`, `type-guards`, `clamp`

**Import discipline:**
- Import from `index.js` (barrel), not from individual files: `from "../lib/index.js"` not `from "../lib/errors.js"`
- Exceptions: when the specific sub-module needs to be referenced by type (e.g., `from "../ai/resolve-role-model.js"` for a type only it defines)

---

*Convention analysis: 2026-03-19*
