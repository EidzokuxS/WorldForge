# Deferred Items

- 2026-04-12: `npm --prefix backend run typecheck` still fails in pre-existing unrelated areas outside plan `46-02`, including `backend/src/ai/__tests__/provider-registry.test.ts`, `backend/src/engine/__tests__/tool-schemas.inventory-authority.test.ts`, `backend/src/engine/location-events.ts`, `backend/src/engine/target-context.ts`, and `backend/src/routes/worldgen.ts`. The scene-scope changes were verified with targeted Vitest suites instead.
