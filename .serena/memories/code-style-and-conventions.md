# Code Style & Conventions

## TypeScript
- **Strict mode** everywhere (backend: ES2022/NodeNext, frontend: ES2017/bundler)
- ES Modules (`"type": "module"` in backend/shared)
- Imports use `.js` extensions in backend (NodeNext resolution)
- Path alias `@/*` in frontend (maps to project root)

## Naming
- **camelCase** for variables, functions, parameters
- **PascalCase** for types, interfaces, classes
- **kebab-case** for file names (e.g., `provider-registry.ts`, `chat-history.ts`)
- **UPPER_CASE** not used for constants (prefer `const camelCase`)
- Test files: `__tests__/filename.test.ts` colocated with source

## Code Patterns
- **Zod schemas** for all API payloads and AI tool definitions
- **Drizzle query builder**, not raw SQL
- **Vercel AI SDK** functions (`streamText`, `generateText`) — never raw fetch to LLM APIs
- **AppError class** for HTTP errors with `statusCode`
- **Route handlers**: outer try/catch, `parseBody()` for Zod validation, `getErrorStatus(error)` for status codes
- **Hono sub-apps**: each route file exports a Hono app, mounted in main index.ts
- Shared types/constants in `@worldforge/shared` — import from there, never duplicate

## Testing (Vitest)
- `describe` / `it` / `expect` from vitest
- Descriptive test names: `it("returns default fallback for null")`
- Nested `describe` blocks for logical grouping
- No mocking frameworks observed — direct unit tests
- Tests import from source with `.js` extension

## Frontend
- React 19 + Next.js App Router
- Tailwind CSS v4 for styling
- shadcn/ui components in `components/ui/`
- Component files: PascalCase in JSX, kebab-case file names
- `"use client"` directive where needed

## Error Handling
- All route handlers: outer try/catch wrapping entire body
- `parseBody(schema, body)` for request validation
- `getErrorStatus(error)` for HTTP status extraction
- `getErrorMessage(error)` for safe error message extraction
- `AppError(message, statusCode)` for custom HTTP errors

## No Docstrings / No Comments Policy
- Code should be self-explanatory
- Only add comments where logic isn't self-evident
- No JSDoc unless explicitly requested
