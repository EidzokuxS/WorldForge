# Phase 56 Verification

Status: `passed`
Last updated: `2026-04-14`

Requirement:
- `TRUTH-01`

## Verified

1. Gameplay/worldgen no longer carry provider/model fallback config or runtime failover paths.
2. Character/worldgen routes no longer synthesize draft-only grounding or power profiles as a surrogate for real evidence.
3. Grounding synthesis now materializes only when evidence or stored sources exist; otherwise payloads stay explicitly empty.
4. Previously persisted grounding with no evidence sources is removed during hydration, so old synthetic records do not keep surfacing in review/gameplay UI.
5. Known-IP key NPC worldgen now reaches the intended replacement path end-to-end: per-character canon research produces non-empty `grounding/powerProfile/selfImage/socialRoles` instead of stopping at empty records after fallback removal.
6. Live worldgen/research generation calls no longer hide hardcoded output-token caps; active output limits now come from role/settings values or are omitted where no settings-backed cap exists.

## Verification Runs

```powershell
npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts src/character/__tests__/archetype-researcher.test.ts src/settings/__tests__/manager.test.ts src/worldgen/__tests__/worldbook-composition.test.ts src/routes/__tests__/worldgen.test.ts src/routes/__tests__/chat.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/images/__tests__/generate.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/turn-processor.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/routes/__tests__/settings.test.ts src/routes/__tests__/schemas.test.ts
```

Result: `473/473` passing

```powershell
npm --prefix backend exec vitest run src/character/__tests__/record-adapters.identity.test.ts src/routes/__tests__/character.test.ts src/character/__tests__/archetype-researcher.test.ts src/routes/__tests__/campaigns.test.ts src/worldgen/__tests__/scaffold-saver.test.ts
```

Result: `73/73` passing

```powershell
npm --prefix frontend exec vitest run components/world-review/__tests__/character-record-inspector.test.tsx components/world-review/__tests__/npcs-section.test.tsx lib/__tests__/world-data-helpers.test.ts
```

Result: `33/33` passing

```powershell
npm --prefix shared run build
```

Result: passed

```powershell
npx tsc -p frontend/tsconfig.json --noEmit
```

Result: passed

```powershell
npm --prefix backend exec vitest run src/character/__tests__/known-ip-worldgen-research.test.ts src/worldgen/__tests__/npcs-step.test.ts
```

Result: `9/9` passing

```powershell
npm --prefix backend exec vitest run src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/worldbook-importer.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts src/worldgen/__tests__/npcs-step.test.ts
```

Result: `54/54` passing

```powershell
npm --prefix backend exec vitest run src/ai/__tests__/test-connection.test.ts
```

Result: `4/4` passing

## Notes

- Honest retry behavior remains intentionally in place.
- Generic error/default helpers remain in place where they do not fabricate semantic content.
- No commit was created during this pass.
- The late hardening kept the phase fail-closed: it repaired the real evidence-backed path instead of reintroducing semantic substitute content.
- `known-ip-worldgen-research.ts` now tolerates nested alias payloads, clips bounded arrays before strict parse, and retries against remaining schema failures rather than failing on the first malformed repair.
