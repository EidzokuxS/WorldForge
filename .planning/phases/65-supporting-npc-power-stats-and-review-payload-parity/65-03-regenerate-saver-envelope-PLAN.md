---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 03
slug: regenerate-saver-envelope
type: execute
wave: 2
status: draft
depends_on: [65-01]
files_modified:
  - backend/src/routes/__tests__/worldgen.test.ts
  - backend/src/worldgen/__tests__/scaffold-saver.test.ts
  - frontend/components/world-review/__tests__/npcs-section.test.tsx
  - frontend/components/world-review/npcs-section.tsx
autonomous: true
requirements: [P65-R3, P65-R5, P65-R6, P65-R7, P65-R8]
must_haves:
  truths:
    - "A new real-step integration test 'regenerate-section section=npcs enriches PowerStats on all 4 NPC quadrants' in backend/src/routes/__tests__/worldgen.test.ts. Test mocks ONLY innermost seams (safeGenerateObject + enrichKnownIpWorldgenNpcDraft + assessOriginalCharacterPowerStats); exercises the REAL /api/worldgen/regenerate-section route, the REAL generateNpcsStep, and the REAL enrichNpcsBatch/assessPowerStats dispatcher via HTTP app.request. Asserts response body npcs[*].draft.powerStats non-null for both tiers in both world modes. Known-IP quadrant tests explicitly set fakeSettings.research.enabled=true so the canon branch passes the research-required gate at power-assessor.ts:64."
    - "A new real-step integration test proves fail-closed behavior on regenerate-section: when assessOriginalCharacterPowerStats rejects (original branch has internal retry; guaranteed IngestionPipelineError stage=power_assess on exhaustion), the /regenerate-section POST returns a non-2xx error response carrying the IngestionPipelineError message; NO partial npcs array is emitted."
    - "A new saver regression test 'reconcileDraftBackedScaffoldNpc preserves draft.powerStats on supporting-tier round-trip' in backend/src/worldgen/__tests__/scaffold-saver.test.ts. Fixture: a draft-backed ScaffoldNpc with tier='supporting' carrying non-null draft.powerStats. Test inspects the MOCKED dbCalls transaction log (NOT a real DB round-trip) — it filters dbCalls for npc inserts, JSON.parses the serialized characterRecord field, and asserts the parsed powerStats matches the fixture. Pattern matches scaffold-saver.test.ts:361 (pre-existing dbCalls[0].data → characterRecord assertion). No code change to scaffold-saver.ts (D-07)."
    - "frontend/components/world-review/npcs-section.tsx handlers handleParse, handleGenerate, handleResearch, handleImport now attach result.draft to the merged scaffold NPC so draft.powerStats survives the spread-merge pattern. Change scope: add `draft: result.draft ?? result.npc.draft ?? null` to the existing spread-merge object. Option A from CONTEXT Claude's Discretion — least-invasive frontend-only fix."
    - "Extends the EXISTING parameterized creation-flow test block at frontend/components/world-review/__tests__/npcs-section.test.tsx:387 (the `it.each` iterating over Describe, Import V2 Card, Research Archetype, and AI Generate modes). For each mode, the API mock return value is updated to include `draft: { ...baseDraft, powerStats: MOCK_POWER_STATS }`, and the `createdNpc` extraction at line 470 (`onChange.mock.calls[0][0][0] as ScaffoldNpc`) is followed by an assertion: `expect(createdNpc.draft?.powerStats).toEqual(MOCK_POWER_STATS)`. This directly tests that all four creation handlers preserve result.draft through the merge — catching the exact bug class described in P65-R7. Adding the 'AI Generate' case (currently absent from the 3-entry it.each) extends coverage to all 4 modes."
    - "A complementary frontend render-null test 'PowerStatsSection does NOT render when scaffold NPC has null draft.powerStats' as secondary coverage (demoted from primary per Codex HIGH on Plan 03). Fixture: scaffold NPC with draft.powerStats === null. Assert no PowerStatsSection markup. This prevents accidental regression of the line-544 conditional."
    - "NO code change to backend/src/worldgen/scaffold-saver.ts (D-07 zero-code-change gate)."
    - "NO code change to frontend/components/character-creation/power-stats-section.tsx (D-09 zero-UI-change gate)."
    - "NO modification to the render condition at npcs-section.tsx:544 (`{npc.draft?.powerStats ? ... : null}`). The production UI component change is limited to the 4 creation handlers attaching result.draft to the merged scaffold NPC."
    - "npm --prefix backend test -- run worldgen exits 0 (new regenerate integration tests green)."
    - "npm --prefix backend test -- run scaffold-saver exits 0 (new saver regression green)."
    - "npm --prefix frontend test -- run npcs-section exits 0 (extended it.each all 4 modes green + null render test green)."
    - "npm --prefix backend run typecheck exits 0."
    - "Scoped-eslint primary gate: `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` exits 0 (no new lint violations on the 2 edited files)."
  artifacts:
    - path: backend/src/routes/__tests__/worldgen.test.ts
      provides: "Real-step integration coverage for /api/worldgen/regenerate-section section=npcs proving all 4 quadrants enrich PowerStats and fail-closed propagates IngestionPipelineError through HTTP. Known-IP tests set research.enabled=true to match production preconditions."
      contains: "powerStats"
    - path: backend/src/worldgen/__tests__/scaffold-saver.test.ts
      provides: "Regression test for reconcileDraftBackedScaffoldNpc preserving draft.powerStats on supporting-tier round-trip via mocked dbCalls transaction log — mirrors the pre-existing line-361 pattern."
      contains: "powerStats"
    - path: frontend/components/world-review/__tests__/npcs-section.test.tsx
      provides: "Handler-flow parity proof across all 4 creation modes via extension of the existing it.each block at line 387; plus render-null secondary coverage."
      contains: "draft?.powerStats"
    - path: frontend/components/world-review/npcs-section.tsx
      provides: "Creation handlers handleParse, handleGenerate, handleResearch, handleImport now preserve result.draft on the merged scaffold NPC so draft.powerStats reaches the review UI."
      contains: "draft: result.draft"
  key_links:
    - from: backend/src/routes/__tests__/worldgen.test.ts
      to: backend/src/routes/worldgen.ts
      via: "app.request('/api/worldgen/regenerate-section', ...) exercises real handler; real generateNpcsStep runs; real enrichNpcsBatch + real assessPowerStats dispatcher run; innermost assessment functions mocked; research.enabled=true for canon quadrants"
      pattern: "regenerate-section"
    - from: backend/src/worldgen/__tests__/scaffold-saver.test.ts
      to: backend/src/worldgen/scaffold-saver.ts
      via: "saveScaffoldToDb with draft-backed supporting-tier ScaffoldNpc; inspect dbCalls log + JSON.parse characterRecord to assert powerStats survived"
      pattern: "dbCalls|characterRecord"
    - from: frontend/components/world-review/npcs-section.tsx
      to: frontend/lib/api.ts
      via: "handleParse/handleGenerate/handleResearch/handleImport consume ingestion response envelope {npc, draft, characterRecord} and attach draft to merged scaffold"
      pattern: "result.draft"
---

<objective>
Close the remaining three Phase 65 gaps:

1. **Regenerate-section parity** (P65-R5) — The `/api/worldgen/regenerate-section` handler inherits worldgen's pipeline, so Plan 02's fix flows through automatically. This plan adds a real-step HTTP integration test mirroring the Phase 64 `64-03` pattern to PROVE parity at the route boundary, not just at the module boundary. **Known-IP cases set `fakeSettings.research.enabled=true`** to match the dispatcher's preconditions at `power-assessor.ts:64` (Codex MEDIUM).

2. **Scaffold-saver round-trip** (P65-R6) — Per CONTEXT D-07, `scaffold-saver.ts` already preserves `draft.powerStats` via `reconcileDraftBackedScaffoldNpc`. The contract is untested for supporting-tier draft-backed NPCs. This plan adds a regression fixture + assertion **using the MOCKED `dbCalls` transaction-log pattern that already exists at `scaffold-saver.test.ts:361`** (Codex MEDIUM). NO code change.

3. **Review payload envelope** (P65-R7) — The 4 creation handlers in `npcs-section.tsx` (handleParse, handleGenerate, handleResearch, handleImport) spread `...result.npc` onto the scaffold list, but `toLegacyNpcDraft` strips `draft` from `result.npc`, so `draft.powerStats` is lost before it reaches the PowerStatsSection at line 544. Fix: attach `result.draft` onto the merged scaffold NPC (CONTEXT Claude's Discretion Option A — least-invasive frontend-only change).

4. **UI render regression + handler-flow proof** (P65-R8) — **Extend the existing parameterized `it.each` creation-flow test at `npcs-section.test.tsx:387`** to assert `createdNpc.draft?.powerStats` for all 4 creation modes (Describe / Import V2 Card / Research Archetype / AI Generate — add the missing 4th entry) (Codex HIGH). This directly tests the P65-R7 fix at the handler boundary. Keep a null-render secondary test for line-544 conditional coverage. NO code change to the render condition or to `PowerStatsSection` itself (D-09).

Output:
- Backend integration tests on `/regenerate-section section=npcs` (all 4 quadrants + fail-closed + research.enabled gate).
- Backend saver regression via mocked dbCalls pattern.
- Frontend creation-handler fix (4 one-liners adding `draft: result.draft ?? result.npc.draft ?? null`).
- Frontend: extended it.each (4 modes) with `draft?.powerStats` assertion + null-render secondary test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-enrich-npcs-batch-helper-PLAN.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-worldgen-npcs-step-integration-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-03-regenerate-integration-test-PLAN.md
@CLAUDE.md
@backend/src/routes/worldgen.ts
@backend/src/routes/__tests__/worldgen.test.ts
@backend/src/worldgen/scaffold-steps/npcs-step.ts
@backend/src/worldgen/scaffold-saver.ts
@backend/src/worldgen/__tests__/scaffold-saver.test.ts
@backend/src/character/record-adapters.ts
@backend/src/character/enrich-npc-batch.ts
@backend/src/character/ingestion/power-assessor.ts
@frontend/components/world-review/npcs-section.tsx
@frontend/components/world-review/__tests__/npcs-section.test.tsx
@frontend/lib/character-drafts.ts

<interfaces>
<!-- Current regenerate-section handler (backend/src/routes/worldgen.ts:594-597): -->
```ts
case "npcs": {
  const npcs = await generateNpcsStep(req, result.data.refinedPremise, result.data.locationNames, result.data.factionNames, ipContext, result.data.additionalInstruction);
  return c.json({ npcs });
}
```
This route is UNCHANGED by Plan 03 — Plan 02's fix to generateNpcsStep flows through automatically. Plan 03 adds the HTTP-level integration test to PROVE it.

<!-- Dispatcher gate at backend/src/character/ingestion/power-assessor.ts:64 — VERIFIED: -->
```ts
if (!ctx.settings.research?.enabled) {
  throw new IngestionPipelineError({
    stage: "power_assess",
    attempts: 0,
    cause: null,
    message: `Canon PowerStats assessment requires research to be enabled for ${draft.identity.displayName}.`,
  });
}
```
Known-IP quadrant tests MUST set fakeSettings.research.enabled=true (or equivalent per the existing worldgen.test.ts harness convention) before the POST, or the canon branch will throw before reaching the mocked enrichKnownIpWorldgenNpcDraft.

<!-- CONTEXT D-07: scaffold-saver.ts line 176 — this is the draft-backed path that already preserves draft.powerStats: -->
```ts
const canonicalDraft = npc.draft
  ? reconcileDraftBackedScaffoldNpc({ ...npc, draft: npc.draft })
  : fromLegacyScaffoldNpc(npc, { ... });
```

<!-- VERIFIED test harness pattern at scaffold-saver.test.ts:344-363 + line 386 — uses mocked dbCalls log, NOT real DB: -->
```ts
saveScaffoldToDb("campaign-1", scaffold);
const npcInserts = dbCalls.filter(
  (c) => c.op === "insert" && c.table === "npcs",
);
const aldric = npcInserts[0]!.data as Record<string, unknown>;
expect(aldric.characterRecord).toBeDefined();
// And at line 387: JSON.parse(persistedNpc.characterRecord as string)
```

<!-- Existing it.each creation-flow test at npcs-section.test.tsx:387-473 (VERIFIED): currently 3 entries (Describe, Import V2 Card, Research Archetype). Needs one more entry for AI Generate (generateCharacter mock is already set up at line 454). -->

<!-- CONTEXT Claude's Discretion — Option A (recommended): frontend one-liner per handler: -->
```ts
// BEFORE (lossy — result.npc was produced by toLegacyNpcDraft which strips draft):
const npc = assignUid(syncNpcTier({ ...result.npc, characterRecord: ... }, creationTier));

// AFTER (Option A fix):
const npc = assignUid(syncNpcTier({
  ...result.npc,
  draft: result.draft ?? result.npc.draft ?? null,
  characterRecord: result.characterRecord ?? result.npc.characterRecord ?? null,
}, creationTier));
```

<!-- CONTEXT D-09: render condition at npcs-section.tsx:544 — do NOT modify: -->
```tsx
{npc.draft?.powerStats ? (
  <div className="mt-1 border-t ...">
    <PowerStatsSection powerStats={npc.draft.powerStats} />
  </div>
) : null}
```

<!-- Phase 64 Plan 64-03 vi.mock strategy for mocking innermost seams while running real route: -->
- `vi.doUnmock("../../worldgen/index.js")` so the real `generateNpcsStep` runs.
- `vi.doMock("../../ai/generate-object-safe.js", ...)` for the LLM seam.
- Phase 65 extends this with:
  - `vi.doMock("../../character/known-ip-worldgen-research.js", ...)` for canon assessment.
  - `vi.doMock("../../character/ingestion/assess-original.js", ...)` for original-world assessment.

<!-- Ingestion response envelope (existing — not changing backend side): -->
```ts
type IngestionResponse = {
  role: "player" | "key";
  npc: ScaffoldNpc;                    // produced by toLegacyNpcDraft — strips draft
  draft: CharacterDraft;               // authoritative — carries powerStats
  characterRecord: CharacterRecord | null;
};
```
</interfaces>

<project_conventions>
- CONTEXT D-07: NO code change to `backend/src/worldgen/scaffold-saver.ts`. Only a new test fixture.
- CONTEXT D-09: NO code change to `PowerStatsSection` or to the line-544 render condition. Only regression tests added.
- Envelope fix is frontend-only (Option A). Do NOT modify `toLegacyNpcDraft` in `record-adapters.ts` (Option C is explicitly rejected).
- Frontend component test uses Vitest + @testing-library/react — follow the existing pattern in `frontend/components/world-review/__tests__/npcs-section.test.tsx`.
- Integration-test mock seams: match the Phase 64 Plan 64-03 pattern — inner seams (assessment functions + LLM) are mocked, `generateNpcsStep` + `enrichNpcsBatch` + `assessPowerStats` run real.
- Known-IP quadrant route tests set `fakeSettings.research.enabled = true` before POST (Codex MEDIUM).
- Saver test inspects the mocked `dbCalls` log, NOT a real DB round-trip — mirrors existing `scaffold-saver.test.ts:361` pattern (Codex MEDIUM).
- Backend verification commands: `npm --prefix backend test -- run <pattern>`, `npm --prefix backend run typecheck`.
- Frontend verification: `npm --prefix frontend test -- run <pattern>`; lint gate is scoped-eslint on the 2 edited files (primary path per Phase 65 review — Codex MEDIUM).
</project_conventions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add real-step integration tests for /regenerate-section on all 4 quadrants + fail-closed (P65-R5) — research.enabled=true on canon tests</name>
  <files>backend/src/routes/__tests__/worldgen.test.ts</files>
  <read_first>
    - backend/src/routes/__tests__/worldgen.test.ts (full — understand top-level vi.mock blocks, the existing regenerate-section describe block structure, the existing Phase 64 "regenerate-section section=npcs — real step integration (P64-R5)" block as the structural template, and how fakeSettings are constructed)
    - backend/src/routes/worldgen.ts (lines 519-607, specifically 594-597 for case "npcs")
    - backend/src/worldgen/scaffold-steps/npcs-step.ts (full — confirm the real-step call chain post-Plan-02)
    - backend/src/character/enrich-npc-batch.ts (Plan 01 — the module under test via its internal calls)
    - backend/src/character/ingestion/power-assessor.ts (dispatcher — line 64 research.enabled gate that must be satisfied for known-IP tests)
    - backend/src/character/known-ip-worldgen-research.ts (the seam to mock)
    - backend/src/character/ingestion/assess-original.ts (the other seam to mock)
    - backend/src/character/ingestion/errors.ts (IngestionPipelineError for fail-closed assertion)
    - .planning/phases/64-npc-personality-regeneration-parity/64-03-regenerate-integration-test-PLAN.md (structural template)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-04 fail-closed at HTTP boundary, D-08 integration test convention)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex MEDIUM research.enabled gate)
  </read_first>
  <behavior>
    Append a new describe block to `worldgen.test.ts` titled "regenerate-section section=npcs — Phase 65 PowerStats enrichment (P65-R5)". Inside:

    **Test 1 — known-IP both tiers enrich via HTTP (research.enabled=true):**
    - `vi.doUnmock("../../worldgen/index.js")` so real generateNpcsStep runs.
    - `vi.doMock("../../ai/generate-object-safe.js", ...)` returning plan(key) → plan(supporting) → detail(NPC1) → detail(NPC2).
    - `vi.doMock("../../character/known-ip-worldgen-research.js", ...)` returning `{ enrichKnownIpWorldgenNpcDraft: vi.fn().mockImplementation(async ({ draft }) => ({ ...draft, powerStats: stub() })), ...schemaReExports }`.
    - **Set fakeSettings.research.enabled=true** (or whichever setting key the existing harness uses — read the file). Without this, `power-assessor.ts:64` throws before the mocked enrichKnownIpWorldgenNpcDraft is reached.
    - POST `/api/worldgen/regenerate-section` with `section: "npcs"`, ipContext-bearing campaign.
    - Assert response `200`; body `npcs` has length 2; BOTH `npcs[*].draft.powerStats` non-null.

    **Test 2 — original-world both tiers enrich via HTTP:**
    - Same pattern but with `vi.doMock` on `assess-original.js` and ipContext-null campaign loader.
    - research.enabled is not required on this branch (original path does not gate on research), but keeping fakeSettings consistent with production is fine.
    - Assert both returned npcs have `draft.powerStats` populated.

    **Test 3 — fail-closed at HTTP boundary (original branch for guaranteed IngestionPipelineError):**
    - Mock `assessOriginalCharacterPowerStats` to reject (original branch has internal retry → guaranteed `IngestionPipelineError{stage:"power_assess"}` on exhaustion).
    - ipContext null.
    - Assert response is non-200 (expect `500` or whatever the existing `getErrorStatus(error)` maps to for `IngestionPipelineError`).
    - Assert response body does NOT contain a partial `npcs` array (no silent degradation).
  </behavior>
  <action>
**Step A — inspect the existing Phase 64 Plan 64-03 describe block + fakeSettings shape:**

Read `backend/src/routes/__tests__/worldgen.test.ts` and locate the block titled `"/api/worldgen/regenerate-section section=npcs — real step integration (P64-R5)"`. Read how it sets up `beforeEach` / `afterEach` with `vi.resetModules` + `vi.doUnmock("../../worldgen/index.js")` + `vi.doMock("../../ai/generate-object-safe.js", ...)`. Locate the fakeSettings fixture (search for `research` or `SettingsConfig` pattern in the file). Identify the exact field path used to toggle research.

**Step B — append a Phase 65 describe block modeled on the Phase 64 one:**

```ts
describe("/api/worldgen/regenerate-section section=npcs — Phase 65 PowerStats enrichment (P65-R5)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doMock("../../ai/generate-object-safe.js", () => ({
      safeGenerateObject: vi.fn(),
    }));
    vi.doMock("../../character/known-ip-worldgen-research.js", () => ({
      enrichKnownIpWorldgenNpcDraft: vi.fn(),
      // Re-export any schemas/helpers consumed by assess-original.ts imports (lines 4-13):
      loosePowerStatsSchema: {},
      normalizeLlmPowerStats: vi.fn(),
      repairPowerStats: vi.fn(),
      AP_DUR_TIER_LIST: "",
      SPEED_TIER_LIST: "",
      INTELLIGENCE_TIER_LIST: "",
      describeZodIssues: vi.fn(),
      recordFromUnknown: vi.fn(),
    }));
    vi.doMock("../../character/ingestion/assess-original.js", () => ({
      assessOriginalCharacterPowerStats: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../ai/generate-object-safe.js");
    vi.doUnmock("../../character/known-ip-worldgen-research.js");
    vi.doUnmock("../../character/ingestion/assess-original.js");
  });

  const stubPowerStats = () => ({
    attackPotency: { tier: "Human", rank: 5 },
    speed: { tier: "Normal Human", rank: 5 },
    durability: { tier: "Human", rank: 5 },
    intelligence: { tier: "Average", rank: 5 },
    hax: [],
    vulnerabilities: [],
  });

  const fullDetail = (name: string) => ({
    persona: `${name} is a stoic guard.`,
    tags: ["Stoic"],
    goals: { shortTerm: ["Hold the gate"], longTerm: ["Retire with honor"] },
    selfImage: "The last one standing.",
    socialRoles: ["Gate Warden"],
    personalitySummary: `${name} summary`,
    personalityVoice: `${name} voice`,
    personalityDecisionStyle: "Deliberate",
    personalityWorldview: "Order over chaos",
    personalityContradictions: ["Loyalty vs resentment"],
    personalityMythology: "The last post-keeper",
    personalitySampleLines: [`I stand at this post. Always.`, `Protocol is law.`],
  });

  it("enriches PowerStats on both tiers (known-IP world, research.enabled=true) via real route", async () => {
    const { default: app } = await import("../../index.js");
    const { safeGenerateObject } = await import("../../ai/generate-object-safe.js");
    const { enrichKnownIpWorldgenNpcDraft } = await import("../../character/known-ip-worldgen-research.js");
    const mockLlm = vi.mocked(safeGenerateObject);
    const mockCanonEnrich = vi.mocked(enrichKnownIpWorldgenNpcDraft);

    // CODEX MEDIUM: research.enabled must be true for the canon branch to pass
    // the power-assessor.ts:64 gate before reaching the mocked enrich function.
    // Use the existing fakeSettings helper or directly set the campaign's settings.research.enabled:
    await seedCampaignSettings(CAMPAIGN_ID_WITH_IP, { research: { enabled: true, maxSearchSteps: 6 } });

    mockLlm
      .mockResolvedValueOnce({ object: { npcs: [{ name: "Keyed", role: "captain", locationName: "Castle", factionName: null }] } } as any)
      .mockResolvedValueOnce({ object: { npcs: [{ name: "Minor", role: "guard", locationName: "Castle", factionName: null }] } } as any)
      .mockResolvedValueOnce({ object: fullDetail("Keyed") } as any)
      .mockResolvedValueOnce({ object: fullDetail("Minor") } as any);

    mockCanonEnrich.mockImplementation(async ({ draft }) => ({ ...draft, powerStats: stubPowerStats() }));

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID_WITH_IP,
        section: "npcs",
        refinedPremise: "A gritty world",
        locationNames: ["Castle"],
        factionNames: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npcs).toHaveLength(2);
    for (const npc of body.npcs) {
      expect(npc.draft).toBeDefined();
      expect(npc.draft.powerStats).toBeDefined();
      expect(npc.draft.powerStats).not.toBeNull();
    }
    // Both tiers (key + supporting) must route through canon enrichment
    expect(mockCanonEnrich).toHaveBeenCalledTimes(2);
  });

  it("enriches PowerStats on both tiers (original world) via real route", async () => {
    const { default: app } = await import("../../index.js");
    const { safeGenerateObject } = await import("../../ai/generate-object-safe.js");
    const { assessOriginalCharacterPowerStats } = await import("../../character/ingestion/assess-original.js");
    const mockLlm = vi.mocked(safeGenerateObject);
    const mockOrigAssess = vi.mocked(assessOriginalCharacterPowerStats);

    mockLlm
      .mockResolvedValueOnce({ object: { npcs: [{ name: "Captain", role: "leader", locationName: "Village", factionName: null }] } } as any)
      .mockResolvedValueOnce({ object: { npcs: [{ name: "Farmer", role: "villager", locationName: "Village", factionName: null }] } } as any)
      .mockResolvedValueOnce({ object: fullDetail("Captain") } as any)
      .mockResolvedValueOnce({ object: fullDetail("Farmer") } as any);

    mockOrigAssess.mockImplementation(async ({ draft }) => ({ ...draft, powerStats: stubPowerStats() }));

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID_ORIGINAL,
        section: "npcs",
        refinedPremise: "A homebrew setting",
        locationNames: ["Village"],
        factionNames: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npcs).toHaveLength(2);
    for (const npc of body.npcs) {
      expect(npc.draft.powerStats).toBeDefined();
      expect(npc.draft.powerStats).not.toBeNull();
    }
    expect(mockOrigAssess).toHaveBeenCalledTimes(2);
  });

  it("fails closed with IngestionPipelineError when assessment retries exhaust (original branch)", async () => {
    const { default: app } = await import("../../index.js");
    const { safeGenerateObject } = await import("../../ai/generate-object-safe.js");
    const { assessOriginalCharacterPowerStats } = await import("../../character/ingestion/assess-original.js");
    const mockLlm = vi.mocked(safeGenerateObject);
    const mockOrigAssess = vi.mocked(assessOriginalCharacterPowerStats);

    mockLlm
      .mockResolvedValueOnce({ object: { npcs: [] } } as any)
      .mockResolvedValueOnce({ object: { npcs: [{ name: "Doomed", role: "villager", locationName: "Village", factionName: null }] } } as any)
      .mockResolvedValueOnce({ object: fullDetail("Doomed") } as any);

    // Original branch's assessment function rejects → internal withPipelineRetry exhausts → IngestionPipelineError thrown.
    // Note: the MOCK replaces the function entirely, so the real retry is not exercised. To prove
    // the error SURFACES at HTTP, simply throw the IngestionPipelineError directly from the mock,
    // matching what the real retry exhaustion would produce:
    mockOrigAssess.mockRejectedValue(new IngestionPipelineError({
      stage: "power_assess",
      attempts: 3,
      cause: new Error("original assessment failed"),
      message: "assessment exhausted retries",
    }));

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID_ORIGINAL,
        section: "npcs",
        refinedPremise: "A homebrew setting",
        locationNames: ["Village"],
        factionNames: [],
      }),
    });

    expect(res.status).toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.npcs).toBeUndefined();
    expect(body.error ?? body.message ?? "").toMatch(/power_assess|assessment exhausted|IngestionPipelineError/i);
  }, 15000);
});
```

**NOTE — fixture / campaign IDs:** the existing test file uses a specific `CAMPAIGN_ID` (and potentially separate ones for known-IP vs original). Read the top of the file to identify the right fixture to reuse. If only one campaign fixture exists, load additional IPContext/premise-divergence via the existing `loadIpContext` mock or by pre-seeding the fixture's config.json in the test harness.

**NOTE — import path for the Hono app:** match the path the Phase 64 Plan 64-03 block uses.

**NOTE — fakeSettings shape for research.enabled:** the existing test file likely uses a `seedCampaignSettings` / `setFakeSettings` helper or inlines settings in the campaign fixture. Read the file and use the same path. The dispatcher reads `ctx.settings.research?.enabled` — so the path in the test fixture must terminate in `research: { enabled: true }`.

**Step C — run tests:**

```
npm --prefix backend test -- run worldgen
```

Expect all 3 new tests GREEN (Plan 01 + Plan 02 have already landed their primitives and wiring). All existing Phase 64 tests must remain GREEN.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run worldgen</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Phase 65 PowerStats enrichment (P65-R5)" backend/src/routes/__tests__/worldgen.test.ts` returns >= 1
    - 3 new `it(...)` blocks present: `grep -c "enriches PowerStats on both tiers\\|fails closed with IngestionPipelineError" backend/src/routes/__tests__/worldgen.test.ts` returns >= 3
    - `grep -c "vi.doMock.*known-ip-worldgen-research\\|vi.doMock.*assess-original" backend/src/routes/__tests__/worldgen.test.ts` returns >= 2
    - **research.enabled gate (Codex MEDIUM):** known-IP test explicitly configures research.enabled=true — `grep -c "research.*enabled.*true\\|research:.*{.*enabled.*true" backend/src/routes/__tests__/worldgen.test.ts` returns >= 1 (anchored in the new Phase 65 describe block)
    - `grep -c "power_assess" backend/src/routes/__tests__/worldgen.test.ts` returns >= 1 (fail-closed stage reference)
    - `npm --prefix backend test -- run worldgen` exits 0
    - No changes to `backend/src/routes/worldgen.ts` — `git diff backend/src/routes/worldgen.ts` empty
    - Existing Phase 64 "real step integration (P64-R5)" block still intact — `grep -c "P64-R5" backend/src/routes/__tests__/worldgen.test.ts` returns >= 1
  </acceptance_criteria>
  <done>3 new real-step integration tests on /regenerate-section pass; all 4 NPC quadrants proven to enrich via HTTP; known-IP tests honor the research.enabled gate; fail-closed proven at route boundary.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add saver regression test for supporting-tier draft-backed NPC powerStats via dbCalls log (P65-R6, D-07)</name>
  <files>backend/src/worldgen/__tests__/scaffold-saver.test.ts</files>
  <read_first>
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts (full — specifically lines 344-420 to observe the EXISTING dbCalls pattern: `saveScaffoldToDb(...)`, `dbCalls.filter(...)`, `npcInserts[0]!.data`, and the JSON.parse(characterRecord) pattern at line 387)
    - backend/src/worldgen/scaffold-saver.ts (lines 166-210 — the insertNpcs function and the reconcileDraftBackedScaffoldNpc call at line 176-180)
    - backend/src/character/record-adapters.ts (reconcileDraftBackedScaffoldNpc function body — confirm it preserves draft.powerStats)
    - shared/src/types.ts (PowerStats + ScaffoldNpc + CharacterDraft types)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-07 zero-code-change rule)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex MEDIUM saver harness mismatch)
  </read_first>
  <behavior>
    Add one new test case to the existing `scaffold-saver.test.ts`. Fixture: a `WorldScaffold` containing one `ScaffoldNpc` with:
    - `tier: "supporting"`
    - `draft` populated, specifically with `draft.powerStats` set to a concrete `PowerStats` object.

    Run `saveScaffoldToDb(campaignId, scaffold)` — the real function under test. Then, **following the EXISTING dbCalls transaction-log pattern at line 344-363 and line 386-387**, filter `dbCalls` for NPC inserts, extract the data payload, JSON.parse the serialized `characterRecord` field, and assert `powerStats` survived with the expected tier/rank/hax/vulnerabilities values.

    NO real DB round-trip. NO new `loadScaffoldFromDb` helper. The existing test file is a mocked transaction-log suite (confirmed by orchestrator verification); the new test matches that pattern.
  </behavior>
  <action>
**Step A — confirm the existing dbCalls pattern:**

The existing test at line 344-363 (`insertNpcs sets tier to 'key'...`) and line 365-420 (`draft-backed NPC edit convergence...`) already demonstrate the pattern:

```ts
saveScaffoldToDb("campaign-1", scaffold);
const npcInserts = dbCalls.filter(
  (c) => c.op === "insert" && c.table === "npcs",
);
const persistedNpc = npcInserts[0]!.data as Record<string, unknown>;
const characterRecord = JSON.parse(persistedNpc.characterRecord as string) as { ... };
```

Mirror this pattern exactly.

**Step B — add the regression test case:**

```ts
it("preserves draft.powerStats on supporting-tier draft-backed NPC via the dbCalls characterRecord payload (P65-R6, D-07)", () => {
  const scaffold = buildScaffold();

  // Override NPC 0 to be a draft-backed supporting-tier NPC with explicit powerStats.
  scaffold.npcs[0] = {
    ...scaffold.npcs[0]!,
    name: "Minor Guard",
    tier: "supporting",
    draft: {
      // Build on the existing test draft shape used elsewhere in this file.
      // Copy the minimal CharacterDraft fixture that adjacent tests use; ensure
      // powerStats is explicitly populated with specific tier/rank values.
      ...(scaffold.npcs[0]!.draft ?? makeSupportingDraft()),
      identity: {
        ...(scaffold.npcs[0]!.draft?.identity ?? {}),
        displayName: "Minor Guard",
        tier: "persistent",
      },
      powerStats: {
        attackPotency: { tier: "Street level", rank: 4 },
        speed: { tier: "Athletic", rank: 5 },
        durability: { tier: "Street level", rank: 3 },
        intelligence: { tier: "Average", rank: 5 },
        hax: [
          { name: "Polearm reach", type: "Reach", bypassTier: null, limitations: ["Melee only"] },
        ],
        vulnerabilities: [
          { description: "Tires quickly", severity: "minor" },
        ],
      },
    } as unknown as CharacterDraft,
  };

  saveScaffoldToDb("campaign-1", scaffold);

  // VERIFIED harness pattern — inspect mocked dbCalls, NOT a real DB round-trip.
  const npcInserts = dbCalls.filter(
    (c) => c.op === "insert" && c.table === "npcs",
  );
  // Find the supporting NPC in the inserts (by name) — order in dbCalls matches scaffold.npcs order per existing tests
  const persistedNpc = npcInserts.find((c) => {
    const data = c.data as Record<string, unknown>;
    return data.name === "Minor Guard";
  })!.data as Record<string, unknown>;

  expect(persistedNpc.characterRecord).toBeDefined();
  const characterRecord = JSON.parse(persistedNpc.characterRecord as string) as {
    powerStats: PowerStats;
  };

  expect(characterRecord.powerStats).toBeDefined();
  expect(characterRecord.powerStats).not.toBeNull();
  expect(characterRecord.powerStats.attackPotency.tier).toBe("Street level");
  expect(characterRecord.powerStats.attackPotency.rank).toBe(4);
  expect(characterRecord.powerStats.hax).toHaveLength(1);
  expect(characterRecord.powerStats.hax[0].name).toBe("Polearm reach");
  expect(characterRecord.powerStats.vulnerabilities).toHaveLength(1);
  expect(characterRecord.powerStats.vulnerabilities[0].severity).toBe("minor");
});
```

**NOTE — fixture construction:** the file already has a `buildScaffold()` helper and draft fixtures. Reuse them. The `makeSupportingDraft()` reference above is illustrative — read the file to find the actual helper name; if none exists, inline a minimal valid CharacterDraft matching the shape of drafts at lines 365-420.

**Step C — run tests:**

```
npm --prefix backend test -- run scaffold-saver
```

The new test must pass IF `reconcileDraftBackedScaffoldNpc` + `createCharacterRecordFromDraft` + the projection onto `characterRecord` JSON correctly preserves `powerStats`. Per CONTEXT D-07, they already do. If the test fails, investigate the round-trip path WITHOUT modifying `scaffold-saver.ts` — a failure here means the CONTEXT assumption was wrong and the orchestrator must be alerted.

**Step D — scope check:**

```
git diff backend/src/worldgen/scaffold-saver.ts
```

MUST be empty — D-07 zero-code-change gate.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run scaffold-saver</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "preserves draft.powerStats on supporting-tier\\|P65-R6" backend/src/worldgen/__tests__/scaffold-saver.test.ts` returns >= 1
    - `grep -c "Street level\\|Polearm reach" backend/src/worldgen/__tests__/scaffold-saver.test.ts` returns >= 1 (fixture specificity)
    - **dbCalls pattern (Codex MEDIUM):** `grep -c "dbCalls" backend/src/worldgen/__tests__/scaffold-saver.test.ts` count > pre-task baseline (new test adds dbCalls reference)
    - **characterRecord parsing (Codex MEDIUM):** new test references JSON.parse(...characterRecord...) — `grep -c "JSON.parse.*characterRecord\\|characterRecord.*as string" backend/src/worldgen/__tests__/scaffold-saver.test.ts` count > pre-task baseline
    - **No real DB round-trip invented:** `grep -c "loadScaffoldFromDb\\|readCampaignWorld" backend/src/worldgen/__tests__/scaffold-saver.test.ts` returns 0 (or matches pre-task baseline — no NEW round-trip helper introduced)
    - `npm --prefix backend test -- run scaffold-saver` exits 0
    - `git diff backend/src/worldgen/scaffold-saver.ts` returns empty (D-07)
    - `git diff backend/src/character/record-adapters.ts` returns empty (reconcile helper untouched)
  </acceptance_criteria>
  <done>Saver regression test proves draft.powerStats survives supporting-tier serialization via the existing mocked dbCalls pattern — no real DB round-trip invented, no code change to saver or record-adapter.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fix review payload envelope — attach result.draft in 4 creation handlers (P65-R7)</name>
  <files>frontend/components/world-review/npcs-section.tsx</files>
  <read_first>
    - frontend/components/world-review/npcs-section.tsx (lines 190-381 — the 4 creation handlers handleParse, handleGenerate, handleResearch, handleImport)
    - frontend/lib/character-drafts.ts (characterDraftToScaffoldNpc, scaffoldNpcToDraft, syncScaffoldTierToDraft — know what fields the ScaffoldNpc carries and how draft relates)
    - backend/src/character/record-adapters.ts (toLegacyNpcDraft — confirm it strips draft)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (Claude's Discretion — Option A recommended)
  </read_first>
  <behavior>
    In each of the 4 creation handlers (handleParse, handleGenerate, handleResearch, handleImport), locate the spread-merge object literal that constructs the `npc` variable passed to `assignUid(syncNpcTier(...))`. Add one new field: `draft: result.draft ?? result.npc.draft ?? null`. This preserves the authoritative draft (including `draft.powerStats`) through the merge, so the line-544 conditional render at `PowerStatsSection` lights up for freshly-created NPCs.

    Do NOT change:
    - The `syncNpcTier` wrapper
    - The `assignUid` wrapper
    - The `characterRecord` field
    - The order of fields in the spread
    - Any other handler logic
  </behavior>
  <action>
**Step A — locate the 4 handler sites:**

Read `frontend/components/world-review/npcs-section.tsx:190-381`. Each handler has a block like:

```tsx
const npc = assignUid(
  syncNpcTier(
    {
      ...result.npc,
      characterRecord:
        result.characterRecord ?? result.npc.characterRecord ?? null,
    },
    creationTier,
  ),
);
```

**Step B — apply the one-line fix to each handler:**

In each handler, add `draft: result.draft ?? result.npc.draft ?? null,` inside the spread-merge literal. Example AFTER:

```tsx
const npc = assignUid(
  syncNpcTier(
    {
      ...result.npc,
      draft: result.draft ?? result.npc.draft ?? null,
      characterRecord:
        result.characterRecord ?? result.npc.characterRecord ?? null,
    },
    creationTier,
  ),
);
```

Apply to all 4 handlers:
- `handleParse` (around line 204)
- `handleGenerate` (around line 246)
- `handleResearch` (around line 288)
- `handleImport` (around line 350)

**Step C — verify ScaffoldNpc type accepts `draft`:**

Read `frontend/lib/character-drafts.ts` or the shared type definition for `ScaffoldNpc`. It must already have an optional `draft?: CharacterDraft | null` field (it does — the existing rendering at line 544 reads `npc.draft?.powerStats`).

**Step D — run typecheck + scoped lint:**

```
npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx
```

Primary lint gate (Codex MEDIUM): scoped-eslint on the 2 edited files. Full-repo `npm --prefix frontend run lint` remains an aspirational secondary check but is not blocking due to known pre-existing noise.

**Step E — scope check:**

```
git diff frontend/components/world-review/npcs-section.tsx
```

Diff should show exactly 4 one-line additions, no other changes. Specifically:
- No modification to the line-544 render condition.
- No modification to `PowerStatsSection` import.
- No modification to the 4 handler signatures or their `void runIngestion(...)` closures.
  </action>
  <verify>
    <automated>npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx && git diff --stat frontend/components/world-review/npcs-section.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "draft: result.draft ?? result.npc.draft ?? null" frontend/components/world-review/npcs-section.tsx` returns 4
    - Scoped lint exits 0: `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` exit code is 0 (no new lint violations on the 2 edited files)
    - Line-544 render condition unchanged: `grep -c "{npc.draft?.powerStats ? (" frontend/components/world-review/npcs-section.tsx` returns 1
    - No change to PowerStatsSection component: `git diff frontend/components/character-creation/power-stats-section.tsx` returns empty (D-09)
    - No change to toLegacyNpcDraft: `git diff backend/src/character/record-adapters.ts` returns empty
    - API envelope type exposes `draft` field: `grep -n "\\bdraft\\b" frontend/lib/api.ts` returns `draft` in the typed return of `parseCharacter`, `generateCharacter`, `researchCharacter`, and `importV2Card`. If any helper is missing `draft` in its typed return, add the one-line type addition to `frontend/lib/api.ts` (and `@worldforge/shared` types if the type lives there) as part of this task so `result.draft` is type-safe on all 4 call sites.
  </acceptance_criteria>
  <done>4 one-line additions in the 4 handlers preserve result.draft through the merge; PowerStatsSection lights up for freshly-created supporting NPCs; scoped lint green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Extend the EXISTING it.each creation-flow test (all 4 modes) to assert draft.powerStats parity + add render-null secondary test (P65-R7, P65-R8, D-09)</name>
  <files>frontend/components/world-review/__tests__/npcs-section.test.tsx</files>
  <read_first>
    - frontend/components/world-review/__tests__/npcs-section.test.tsx (focus on lines 387-473 — the EXISTING it.each block that is the primary hook point; also lines 1-100 for MOCK_POWER_STATS fixture + apiMocks; and lines 201-250 for makeCharacterResultNpc helper that builds the 4-mode API mock return values)
    - frontend/components/world-review/npcs-section.tsx (line 544 — the conditional render being locked; lines 525-548 for context)
    - frontend/components/character-creation/power-stats-section.tsx (understand what markup/role PowerStatsSection renders — for the render-null assertion selector)
    - frontend/lib/character-drafts.ts (scaffold/draft helpers if fixtures need them)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (D-09 zero-UI-code-change rule)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex HIGH on Plan 03 — extend existing parameterized test for direct handler-flow proof)
  </read_first>
  <behavior>
    **Primary deliverable (Codex HIGH):** Extend the existing `it.each` creation-flow test at lines 387-473 to assert `createdNpc.draft?.powerStats` for all 4 creation modes. This directly tests the Task 3 production fix at the exact handler boundary where the bug lives.

    The existing it.each has 3 entries (Describe / Import V2 Card / Research Archetype) — add a 4th entry for "AI Generate" (the `generateCharacter` mock is already set up at line 454 but has no `it.each` row). After extending to 4 entries:

    1. Update each API mock return value (`apiMocks.parseCharacter.mockResolvedValue(...)`, etc.) to return a draft carrying `powerStats: MOCK_POWER_STATS` (MOCK_POWER_STATS fixture already exists at line 12). Do this by extending `makeCharacterResultNpc` (or inline) to accept a `powerStats` override and wire it into the returned `draft`.

    2. Inside the `it.each` arrow body — right after the existing `expect(createdNpc.tier).toBe("supporting")` at line 471 — add:
       ```ts
       expect(createdNpc.draft?.powerStats).toEqual(MOCK_POWER_STATS);
       ```

    This closes the loop: the mock returns a draft with powerStats → the handler merges `result.draft` per Task 3 → `onChange` receives a scaffold NPC whose `draft.powerStats` is populated → the assertion fires per mode.

    **Secondary deliverable:** Add one new render-null test locking the line-544 conditional render for the null case (prevent accidental regression). Can coexist with the it.each extension.
  </behavior>
  <action>
**Step A — extend the it.each entries from 3 to 4:**

At line 446 (end of existing array), add a 4th entry for "AI Generate":

```ts
{
  name: "AI Generate",
  trigger: /ai generate/i,  // confirm the exact tab label in the component
  complete: async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByPlaceholderText(/prompt/i), "a conjured captain");  // confirm placeholder in component
    await user.click(screen.getByRole("button", { name: /^generate$/i }));
  },
  calledWith: () =>
    expect(apiMocks.generateCharacter).toHaveBeenCalledWith(
      "campaign-1",
      "a conjured captain",
      "key",
      ["Tavern", "Forest"],
      ["The Order"],
      "",
    ),
},
```

(Read npcs-section.tsx for the exact trigger label, placeholder text, button label, and generateCharacter call signature before finalizing this entry. The pattern is analogous to the Research Archetype entry.)

**Step B — wire MOCK_POWER_STATS into the 4 mocked API results:**

At the top of the `it.each` arrow body (before `renderSection(...)`), update the existing mock-setup lines (451-454):

```ts
apiMocks.parseCharacter.mockResolvedValue(makeCharacterResultNpc({ name: "Parsed NPC", persona: "Parsed persona" }, "key", MOCK_POWER_STATS));
apiMocks.importV2Card.mockResolvedValue(makeCharacterResultNpc({ name: "Imported NPC", persona: "Imported persona" }, "key", MOCK_POWER_STATS));
apiMocks.researchCharacter.mockResolvedValue(makeCharacterResultNpc({ name: "Generated NPC", persona: "Generated persona" }, "key", MOCK_POWER_STATS));
apiMocks.generateCharacter.mockResolvedValue(makeCharacterResultNpc({ name: "Conjured NPC", persona: "Conjured persona" }, "key", MOCK_POWER_STATS));
```

This requires extending the `makeCharacterResultNpc` helper (lines 201-250) to accept an optional 3rd `powerStats` param and wire it into the returned draft:

```ts
function makeCharacterResultNpc(
  overrides: Partial<ScaffoldNpc> = {},
  tier: "key" | "supporting" = "key",
  powerStats: PowerStats | null = null,  // NEW
): Extract<CharacterResult, { role: "key" }> {
  const npc = makeNpc({
    _uid: undefined,
    tier,
    draft: makeDraft({
      identity: { ... },
      profile: { ... },
      socialContext: { ... },
      motivations: { ... },
      ...(powerStats !== null ? { powerStats } : {}),  // NEW — via makeDraft's overrides.powerStats
    }),
    ...overrides,
  });

  return {
    role: "key",
    draft: npc.draft as CharacterDraft,
    npc,
  };
}
```

(`makeDraft` already accepts `overrides.powerStats` at line 164 — verified.)

**Step C — add the assertion inside the it.each arrow body:**

At line 472 (right after the existing tier assertions):

```ts
calledWith();
const createdNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
expect(createdNpc.tier).toBe("supporting");
expect(createdNpc.draft?.identity.tier).toBe("supporting");
// NEW (P65-R7): assert all 4 creation handlers preserve result.draft.powerStats through the merge.
expect(createdNpc.draft?.powerStats).toEqual(MOCK_POWER_STATS);
```

This single line, inside the parameterized block, runs 4 times — once per mode.

**Step D — add the secondary render-null test:**

Append a new `describe` block after the existing NpcsSection block:

```tsx
describe("NpcsSection — Phase 65 PowerStatsSection render-null (P65-R8, D-09)", () => {
  it("does NOT render PowerStatsSection when draft.powerStats is null (line-544 conditional contract)", () => {
    const npcs = [
      makeNpc({
        _uid: "legacy-1",
        name: "Legacy NPC",
        tier: "supporting" as const,
        draft: makeDraft({ powerStats: null }),  // explicit null
      }),
    ];

    render(
      <NpcsSection
        campaignId="campaign-1"
        npcs={npcs}
        onChange={vi.fn()}
        onRegenerate={vi.fn()}
        regenerating={false}
        locationNames={["Castle"]}
        factionNames={[]}
      />,
    );

    // Pick the exact PowerStatsSection label copy from power-stats-section.tsx —
    // existing test at line 334 uses "Power Stats" heading. Reuse that.
    expect(screen.queryByText(/^power stats$/i)).toBeNull();
  });
});
```

Exact label matching: the existing test at lines 334 uses `within(card).getByText(/^power stats$/i)` — mirror that exact regex.

**Step E — run tests:**

```
npm --prefix frontend test -- run npcs-section
```

Expect:
- The extended it.each now runs 4 iterations (not 3), each with the `draft?.powerStats` assertion passing.
- The new render-null test passes.
- All pre-existing tests still green.

If the 4th it.each entry reveals the component does not have an "AI Generate" tab with those exact labels, adjust labels or drop the 4th entry and document the scope narrowing. The minimum viable outcome is: the existing 3 it.each entries gain the `draft?.powerStats` assertion (covers 3 of 4 handlers directly — still addresses the Codex HIGH concern by direct handler-flow proof for 3 handlers and indirect for the 4th via the fact that all 4 share the same merge pattern after Task 3).
  </action>
  <verify>
    <automated>npm --prefix frontend test -- run npcs-section</automated>
  </verify>
  <acceptance_criteria>
    - **Handler-flow proof (Codex HIGH):** `grep -c "createdNpc.draft?.powerStats" frontend/components/world-review/__tests__/npcs-section.test.tsx` returns >= 1 — a single assertion inside the parameterized it.each that runs once per mode
    - **it.each extended to 4 modes:** `grep -c "name: \"Describe\"\\|name: \"Import V2 Card\"\\|name: \"Research Archetype\"\\|name: \"AI Generate\"" frontend/components/world-review/__tests__/npcs-section.test.tsx` returns >= 4. (If the 4th "AI Generate" entry cannot be added due to component label mismatch, acceptance narrows to >= 3 — with the trade-off documented in SUMMARY.md.)
    - **MOCK_POWER_STATS wired into all 4 mocks:** `grep -c "MOCK_POWER_STATS" frontend/components/world-review/__tests__/npcs-section.test.tsx` returns >= 4 (once per mock-setup line inside the it.each body, plus the original fixture definition)
    - **Render-null secondary test:** `grep -c "does NOT render PowerStatsSection when draft.powerStats is null" frontend/components/world-review/__tests__/npcs-section.test.tsx` returns >= 1
    - `npm --prefix frontend test -- run npcs-section` exits 0
    - No modification to `frontend/components/character-creation/power-stats-section.tsx` — `git diff frontend/components/character-creation/power-stats-section.tsx` returns empty (D-09)
    - No modification to the line-544 render condition in npcs-section.tsx (already covered by Task 3 acceptance)
  </acceptance_criteria>
  <done>Existing it.each extended to assert draft?.powerStats across all 4 creation modes (or 3 if "AI Generate" tab labels mismatch and scope narrowed); render-null secondary test added; D-09 zero-UI-code-change preserved.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run worldgen` exits 0 — new regenerate-section real-step integration tests green (P65-R5 proven at HTTP boundary; known-IP tests satisfy research.enabled gate).
- `npm --prefix backend test -- run scaffold-saver` exits 0 — supporting-tier draft via dbCalls characterRecord pattern green (P65-R6, D-07 preserved).
- `npm --prefix frontend test -- run npcs-section` exits 0 — extended it.each (all 4 modes) with draft?.powerStats assertion + null-render test green (P65-R7 + P65-R8, D-09 preserved).
- `npm --prefix backend run typecheck` exits 0.
- `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` exits 0 (scoped primary lint gate).
- `git diff backend/src/worldgen/scaffold-saver.ts` empty (D-07).
- `git diff backend/src/character/record-adapters.ts` empty (toLegacyNpcDraft unchanged — Option A).
- `git diff frontend/components/character-creation/power-stats-section.tsx` empty (D-09).
- Line-544 render condition unchanged.
</verification>

<success_criteria>
- `/api/worldgen/regenerate-section section=npcs` proven to enrich PowerStats across all 4 NPC quadrants at HTTP boundary; known-IP tests satisfy the dispatcher's research.enabled precondition.
- Scaffold-saver preserves `draft.powerStats` on draft-backed supporting-tier via the existing mocked-dbCalls pattern with ZERO code change.
- Review UI payload envelope carries `draft.powerStats` into the PowerStatsSection for freshly-created NPCs via a 4-line frontend-only fix.
- Existing it.each creation-flow test extended to 4 modes AND augmented with a direct `draft?.powerStats` parity assertion — this is the primary handler-flow proof.
- PowerStatsSection null-render behavior locked as secondary coverage.
</success_criteria>

<requirement_coverage>
- **P65-R3** (fail-closed retry — layer 3 of 3, HTTP boundary): Task 1 Test 3 proves `/api/worldgen/regenerate-section` returns a non-2xx response carrying the `IngestionPipelineError` when NPC enrichment retries exhaust; no partial `npcs` array is emitted.
- **P65-R5** (regenerate-section parity at HTTP boundary): Task 1 — 3 real-step integration tests covering both world modes + fail-closed; known-IP branch honors the research.enabled gate.
- **P65-R6** (saver round-trip): Task 2 — draft-backed supporting-tier fixture via the mocked dbCalls transaction-log pattern; D-07 zero-code-change respected.
- **P65-R7** (review payload envelope parity): Task 3 — 4 handlers attach `result.draft`. Task 4 — extended it.each provides DIRECT handler-flow proof across all 4 creation modes (the Codex HIGH fix).
- **P65-R8** (UI render regression lock): Task 4 render-null secondary test covers the line-544 conditional contract; Task 3 scope-gate covers the D-09 zero-UI-code-change.
</requirement_coverage>

<estimates>
- Effort: ~90-110 min Claude execution total across 4 tasks (regen integration tests mirror 64-03 with research.enabled wiring; saver regression follows existing dbCalls pattern; 4 handler fix; it.each extension + null-render test).
- Test runtime: < 30s combined.
- Wave 2: depends only on Plan 01 for the shared helper.
</estimates>

<risks>
- **R1 — vi.doMock / vi.resetModules fragility across Phase 64 and Phase 65 describe blocks in worldgen.test.ts.** The Phase 64 Plan 64-03 block already uses doMock/doUnmock for `worldgen/index.js`. Adding another describe block with additional doMocks must not collide. Mitigation: mirror the Phase 64 afterEach `vi.doUnmock` cleanup for every new mock introduced.
- **R2 — Campaign fixture with ipContext vs without.** The existing worldgen.test.ts may have only one CAMPAIGN_ID. Tests 1 and 2 need one ipContext-present and one ipContext-null campaign. Mitigation: either extend the fixture helper to accept an `ipContext` param, or mock `loadIpContext` to return different values per test. Also ensure fakeSettings exposes `research.enabled` per the dispatcher's gate.
- **R3 — "AI Generate" it.each 4th entry label mismatch.** Component may use "Generate", "Create", or another label instead of "AI Generate". Mitigation: read `npcs-section.tsx` tab labels first; if the 4th entry cannot match, narrow scope to 3 modes with direct handler-flow proof + 1 mode (generateCharacter) covered indirectly via shared merge pattern + lint of the shared code path. Document the narrowing in SUMMARY.md.
- **R4 — PowerStatsSection null-render label ambiguity.** Use the same `/^power stats$/i` regex the existing test at line 334 uses — known to match exactly the PowerStatsSection heading.
- **R5 — `result.draft` field availability on API envelope.** The backend ingestion routes (Phase 60) already return `{ role, npc, draft, characterRecord }`. The 4 frontend API helpers `parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card` must expose `draft` on the result type. Mitigation: read `frontend/lib/api.ts` and confirm the return-type definitions include `draft`. If not, a small type-definition fix accompanies Task 3.
- **R6 — Plan 03 runs in parallel with Plan 02.** If Plan 02 has not landed, Task 1's real-step integration tests will FAIL because `generateNpcsStep` still has the old gate. This is correct RED behavior but confusing when running Plan 03 tests in isolation. Mitigation: orchestrator runs Plan 02 and Plan 03 in the same wave but typically sequences Plan 02 first; if not, the failure points squarely at the Plan 02 scope and is self-documenting.
</risks>

<output>
After completion, create `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md` with:
- Task breakdown (regen integration w/ research.enabled + saver dbCalls regression + envelope fix + it.each extension + null-render test)
- Test outputs for backend (worldgen + scaffold-saver) and frontend (npcs-section)
- Diff summary — exactly 1 production code change (4 one-liners in npcs-section.tsx); 3 test files modified/extended
- Confirmation D-07, D-09, and Option A scope gates preserved (scaffold-saver.ts + record-adapters.ts + power-stats-section.tsx all untouched)
- Note on whether the it.each was successfully extended to 4 modes or narrowed to 3 (R3 mitigation outcome)
</output>
