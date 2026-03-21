# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files:**
- Backend: `kebab-case.ts` (e.g., `seed-roller.ts`, `ip-researcher.ts`, `npc-generator.ts`)
- Frontend pages: `page.tsx` inside route directories (Next.js App Router convention)
- Frontend components: `kebab-case.tsx` (e.g., `character-form.tsx`, `character-panel.tsx`)
- Test files: `*.test.ts` inside `__tests__/` subdirectories
- Shared package: `kebab-case.ts` (e.g., `settings.ts`, `errors.ts`)

**Functions:**
- Use `camelCase` for all functions: `rollWorldSeeds()`, `parseBody()`, `getErrorMessage()`
- Exported functions start with verbs: `create`, `get`, `load`, `save`, `resolve`, `parse`, `generate`, `delete`
- Route helper pattern: `resolveGenerator()`, `resolveStoryteller()`, `resolveEmbedder()`
- Frontend API wrappers: `apiGet<T>()`, `apiPost<T>()`, `apiDelete<T>()`, `apiStreamPost()`

**Variables:**
- `camelCase` everywhere: `campaignId`, `worldData`, `locationNames`
- Boolean variables use `is`/`has` prefix or descriptive adjectives: `isStarting`, `cancelled`, `busy`
- Constants: `UPPER_SNAKE_CASE` for module-level constants: `ALL_CATEGORIES`, `SEED_CATEGORIES`, `API_BASE`

**Types:**
- `PascalCase` for interfaces and types: `WorldSeeds`, `ParsedCharacter`, `ScaffoldNpc`
- Interfaces preferred over type aliases for object shapes
- Discriminated unions for variant types: `ResolveResult`, `CharacterResult`
- Props interfaces named `{ComponentName}Props`: `CharacterPanelProps`, `CharacterFormProps`

**Database columns:**
- SQL uses `snake_case`: `campaign_id`, `created_at`, `is_starting`
- Drizzle schema maps to `camelCase` JS: `campaignId`, `createdAt`, `isStarting`

## Code Style

**Formatting:**
- No Prettier config file detected; formatting relies on editor defaults
- 2-space indentation
- Semicolons always used
- Double quotes for strings in source code
- Trailing commas in multi-line arrays/objects

**Linting:**
- Frontend: ESLint with `eslint-config-next` (core-web-vitals + TypeScript), config at `frontend/eslint.config.mjs`
- Backend: No ESLint config; relies on TypeScript strict mode
- Run frontend lint: `npm --prefix frontend run lint`
- Run backend typecheck: `npm --prefix backend run typecheck`

**TypeScript:**
- Strict mode enabled in all three packages (`backend/tsconfig.json`, `frontend/tsconfig.json`, `shared/tsconfig.json`)
- ES modules everywhere (`"type": "module"` in backend `package.json`)
- Backend target: ES2022, module: NodeNext
- Frontend target: ES2017, module: esnext, moduleResolution: bundler
- Use `type` imports where only types are needed: `import type { Context } from "hono"`

## Import Organization

**Order:**
1. External packages (e.g., `hono`, `drizzle-orm`, `zod`, `ai`, `react`)
2. Shared package (`@worldforge/shared`)
3. Internal modules with `.js` extension (backend) or `@/` alias (frontend)

**Path Aliases:**
- Frontend: `@/*` maps to project root (e.g., `@/lib/api`, `@/components/ui/button`)
- Shared: `@worldforge/shared` used from both frontend and backend
- Backend: Relative imports with `.js` extension required (NodeNext module resolution): `../lib/errors.js`, `./schemas.js`

**Backend import extension rule:** Always use `.js` extension on relative imports even though source files are `.ts`. This is required by NodeNext module resolution.

## Error Handling

**Backend Route Pattern:**
Every route handler wraps its entire body in try/catch. Use `parseBody()` for request validation and `getErrorMessage()`/`getErrorStatus()` for error responses.

```typescript
app.post("/endpoint", async (c) => {
  try {
    const result = await parseBody(c, someSchema);
    if ("response" in result) return result.response;

    const { field } = result.data;
    // ... business logic ...
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Fallback message.") },
      getErrorStatus(error)
    );
  }
});
```

**Key error utilities:**
- `AppError` class at `backend/src/lib/errors.ts` - custom error with `statusCode` (defaults to 500)
- `getErrorStatus(error, fallback?)` - extracts status from AppError, only returns 400/404/500
- `getErrorMessage(error, fallback?)` - extracts message from Error instances, returns fallback for non-Error values
- `parseBody(c, schema)` - parses JSON body against Zod schema, returns `{ data }` or `{ response }` (pre-built error response)
- `zodFirstError(error)` - extracts first Zod issue message

**Frontend API Pattern:**
All API calls use thin wrappers (`apiGet`, `apiPost`, `apiDelete`) that throw on non-ok responses. Error messages extracted via `readErrorMessage()` at `frontend/lib/api.ts`.

```typescript
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return (await res.json()) as T;
}
```

**Discriminated union results:**
Use `"error" in result` / `"resolved" in result` pattern for functions that can fail without throwing:

```typescript
export type ResolveResult =
  | { resolved: ResolvedRole }
  | { error: string; status: 400 };

const gen = resolveGenerator(settings);
if ("error" in gen) return c.json({ error: gen.error }, gen.status);
```

## Logging

**Framework:** `console` (no structured logging library)

**Patterns:**
- `console.error()` for recoverable failures in non-critical paths (e.g., embedding failures)
- No debug/info logging observed; errors are surfaced via HTTP responses

## Validation

**Framework:** Zod (`zod` v4.3+)

**Schema location:** All route-level schemas centralized in `backend/src/routes/schemas.ts`

**Patterns:**
- String trimming via `.transform(s => s.trim()).pipe(z.string().min(1))` for required strings
- `.default()` for optional fields with fallback values
- `.strip()` to remove unknown keys from nested objects
- `.refine()` for cross-field validation (e.g., locationNames required when role is "key")
- `z.discriminatedUnion()` for variant request bodies (e.g., `regenerateSectionSchema`)

## Comments

**When to Comment:**
- Section dividers use `// ───── Section Name ─────` pattern (Unicode box-drawing characters)
- JSDoc-style `/** */` comments used sparingly, mainly on utility functions like `parseBody`
- Inline comments explain non-obvious business logic (e.g., "Single player per campaign")
- Test files use horizontal rule dividers: `// ---------------------------------------------------------------------------`

**JSDoc/TSDoc:**
- Minimal usage; types serve as documentation
- Used on `parseBody()` and on `_uid` field in `ScaffoldNpc`

## Function Design

**Size:** Most functions are small (10-30 lines). Route handlers can be longer (30-60 lines) due to the try/catch + validation + business logic pattern.

**Parameters:** Use object parameters for functions with 3+ args (e.g., `generateWorldScaffold({ campaignId, name, premise, seeds, role, research })`)

**Return Values:**
- Route handlers return `c.json()` with data or `{ error: string }` and appropriate status code
- Business logic functions return typed objects
- Discriminated unions for functions that can fail: `{ data } | { response }`, `{ resolved } | { error, status }`

## Module Design

**Exports:**
- Default export for Hono route apps: `export default app` in each route file
- Named exports for everything else: functions, types, constants
- Re-exports via index files: `backend/src/ai/index.ts`, `backend/src/settings/index.ts`, `shared/src/index.ts`

**Barrel Files:**
- Used in `backend/src/ai/index.ts`, `backend/src/settings/index.ts`, `backend/src/worldgen/index.ts`
- `shared/src/index.ts` re-exports all public types and functions
- Frontend: No barrel files; direct imports from specific files

## React Component Conventions

**Client Components:**
- Always start with `"use client"` directive
- Use named function exports: `export function CharacterPanel()`
- Props destructured in function signature
- State managed with `useState`, side effects with `useEffect`
- Cleanup pattern for async effects: `let cancelled = false` with cleanup returning `() => { cancelled = true }`

**Styling:**
- Tailwind CSS utility classes exclusively (no CSS modules, no styled-components)
- Shadcn UI components from `@/components/ui/` (Button, Textarea, Label, ScrollArea, etc.)
- Dark theme with custom color tokens: `text-bone`, `bg-card`, `text-muted-foreground`, `border-border`
- Responsive: `lg:w-[280px]` breakpoint pattern for sidebars

**Icons:** Lucide React (`lucide-react`): `Loader2`, `Sparkles`, `Upload`, `Wand2`, `AlertTriangle`

## Database Conventions

**ORM:** Drizzle with `better-sqlite3` (synchronous operations)

**Query pattern:** Use Drizzle query builder, not raw SQL:
```typescript
const db = getDb();
db.select().from(locations).where(eq(locations.campaignId, id)).all();
```

**JSON fields:** Arrays and objects stored as JSON strings in SQLite text columns. Parsed client-side with safe `parseJsonArray()`/`parseJsonObject()` helpers that catch parse errors.

**IDs:** UUID strings via `crypto.randomUUID()`

**Migrations:** Drizzle Kit generates migrations to `backend/drizzle/`. Generate with `npm run db:generate` from backend directory.

---

*Convention analysis: 2026-03-09*
