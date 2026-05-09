# Phase 72: worldgen-authority-propagation-regression-audit - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 34
**Analogs found:** 33 / 34
**Mapper constraint:** Do not edit production code during planning. Production files below are conditional boundaries only; change them later only after focused tests prove a real invariant gap.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts` | test fixture | transform | same file | exact |
| `backend/src/worldgen/__tests__/research-artifact.test.ts` | test | transform | same file | exact |
| `backend/src/worldgen/__tests__/ip-researcher.test.ts` | test | request-response, external I/O | same file | exact |
| `backend/src/routes/__tests__/schemas.test.ts` | test | request-response validation | same file | exact |
| `backend/src/routes/__tests__/worldgen.test.ts` | test | request-response, streaming route | same file | exact |
| `backend/src/campaign/__tests__/manager.test.ts` | test | file-I/O persistence | same file | exact |
| `backend/src/worldgen/__tests__/seed-suggester.test.ts` | test | prompt transform | same file | exact |
| `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` | test | batch transform | same file | exact |
| `backend/src/worldgen/__tests__/lore-extractor.test.ts` | test | prompt transform | same file | exact |
| `backend/src/worldgen/__tests__/npcs-step.test.ts` | test | batch, dispatch | same file | exact |
| `backend/src/character/__tests__/enrich-npc-batch.test.ts` | test | batch, dispatch | same file | exact |
| `backend/src/character/ingestion/__tests__/power-assessor.test.ts` | test | dispatch | same file | exact |
| `backend/src/character/ingestion/__tests__/classifier.test.ts` | test | transform | same file | exact |
| `backend/src/character/ingestion/__tests__/pipeline.test.ts` | test | staged pipeline, dispatch | same file | exact |
| `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` | test | event-driven, request-response | same file | exact |
| `frontend/lib/__tests__/character-drafts.test.ts` | test | transform | same file | exact |
| `frontend/components/world-review/__tests__/npcs-section.test.tsx` | test | component, event-driven | same file | exact |
| `frontend/lib/__tests__/api.test.ts` | possible new test | request-response, streaming body | `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` | no-direct-analog |
| `backend/src/worldgen/research-artifact.ts` | utility | transform, schema validation | same file | exact |
| `backend/src/worldgen/ip-researcher.ts` | service | request-response, external I/O | same file | exact |
| `backend/src/routes/schemas.ts` | route schema | request-response validation | same file | exact |
| `backend/src/routes/worldgen.ts` | route | request-response, streaming | same file | exact |
| `backend/src/campaign/manager.ts` | service | file-I/O persistence | same file | exact |
| `backend/src/worldgen/scaffold-steps/prompt-utils.ts` | utility | prompt transform | same file | exact |
| `backend/src/worldgen/seed-suggester.ts` | service | prompt transform | same file | exact |
| `backend/src/worldgen/lore-extractor.ts` | service | prompt transform | same file | exact |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | service | batch, dispatch | same file | exact |
| `backend/src/character/enrich-npc-batch.ts` | service | batch, dispatch | same file | exact |
| `backend/src/character/ingestion/power-assessor.ts` | service | dispatch | same file | exact |
| `backend/src/character/ingestion/classifier.ts` | utility | transform | same file | exact |
| `frontend/lib/api.ts` | frontend API utility | request-response, streaming | same file | role-match |
| `frontend/components/title/use-new-campaign-wizard.ts` | hook/provider | event-driven, request-response | same file | exact |
| `frontend/lib/character-drafts.ts` | utility | transform | same file | exact |
| `frontend/components/world-review/npcs-section.tsx` | component | event-driven, transform | same file | exact |

## Pattern Assignments

### `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts` (test fixture, transform)

**Analog:** same file

**Base mixed-source fixture pattern** (lines 3-29):
```typescript
export const jjkWithNarutoPowerSystemArtifact = {
  version: 2,
  rawPremise: "Jujutsu Kaisen world with Naruto power system",
  rawKnownIP: null,
  researchBrief: {
    interpretationSummary:
      "Use Jujutsu Kaisen as the world basis. Use Naruto only as a mechanics overlay for the power system.",
    ambiguityNotes: [
      "The premise mixes two sources, but it names Jujutsu Kaisen as the world and Naruto as the power-system source.",
    ],
    sourceUsageRules: [
      {
        sourceLabel: "Jujutsu Kaisen",
        role: "world_basis",
        useFor: ["locations", "factions", "npcs", "timeline"],
        avoidFor: ["power_system"],
        rationale:
          "The user asked for a Jujutsu Kaisen world, so its institutions, locations, factions, and cast context define the setting.",
      },
      {
        sourceLabel: "Naruto",
        role: "mechanics_overlay",
        useFor: ["power_system"],
        avoidFor: ["locations", "factions", "npcs", "timeline"],
```

**Clone/mutator pattern** (lines 185-190):
```typescript
export function makeArtifactWith(
  mutate: (artifact: WorldgenResearchArtifactV2) => void,
): WorldgenResearchArtifactV2 {
  const artifact = cloneJjkNarutoArtifact();
  mutate(artifact);
  return artifact;
}
```

**Oversized case table pattern** (lines 199-260):
```typescript
export const oversizedArtifactCases: Array<{
  name: string;
  artifact: WorldgenResearchArtifactV2;
}> = [
  {
    name: "summary over 1200 chars",
    artifact: makeArtifactWith((artifact) => {
      artifact.researchBrief.interpretationSummary = "x".repeat(1201);
    }),
  },
  {
    name: "more than 8 sources",
    artifact: makeArtifactWith((artifact) => {
      artifact.researchBrief.sourceUsageRules = Array.from({ length: 9 }, (_, index) => ({
        sourceLabel: `Source ${index}`,
        role: "reference_only",
        useFor: ["tone"],
        avoidFor: [],
        rationale: "Bounded test source.",
      }));
    }),
  },
```

**Copy rule:** Extend this fixture for overlong snippets, prompt-injection snippets, `researchArtifact: null` route payloads, Gojo canonical NPC, and original supporting NPC. Do not create duplicate JJK/Naruto fixtures unless a test needs a materially different source-role matrix.

---

### `backend/src/worldgen/__tests__/research-artifact.test.ts` and `backend/src/worldgen/research-artifact.ts` (parser/provider sanitization)

**Analog:** `backend/src/worldgen/research-artifact.ts`

**Imports/test fixture pattern** (lines 1-16):
```typescript
import { describe, expect, it } from "vitest";

import {
  buildWorldgenResearchContextBlock,
  buildIpContextBlock,
} from "../scaffold-steps/prompt-utils.js";
import {
  formatWorldgenResearchArtifactBlock,
  parseWorldgenResearchArtifact,
} from "../research-artifact.js";
import {
  jjkWithNarutoPowerSystemArtifact,
  makeArtifactWith,
  makePromptInjectionArtifact,
  oversizedArtifactCases,
} from "./fixtures/jjk-naruto-artifact.js";
```

**Sanitization boundary pattern** (lines 18-58):
```typescript
function externalSnippetString(max: number) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      return value.trim().slice(0, max);
    },
    z.string().min(1).max(max),
  );
}

const searchResultSchema = z.object({
  jobId: externalSnippetString(64),
  title: externalSnippetString(180),
  description: externalSnippetString(700),
  url: externalSnippetString(700),
});

const searchResultsSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return value;
    return value.slice(0, MAX_SEARCH_RESULTS);
  },
  z.array(searchResultSchema).max(MAX_SEARCH_RESULTS),
);
```

**Parse entrypoint pattern** (lines 185-186):
```typescript
export function parseWorldgenResearchArtifact(value: unknown): WorldgenResearchArtifactV2 {
  return normalizeWorldgenResearchArtifact(worldgenResearchArtifactSchema.parse(value));
}
```

**Regression test pattern** (lines 77-100):
```typescript
it("caps overlong external search snippets instead of rejecting the artifact", () => {
  const parsed = parseWorldgenResearchArtifact(
    makeArtifactWith((artifact) => {
      artifact.searchResults[0]!.description = "x".repeat(701);
    }),
  );

  expect(parsed.searchResults[0]?.description).toHaveLength(700);
});

it("caps external search result count instead of rejecting provider overflow", () => {
  const parsed = parseWorldgenResearchArtifact(
    makeArtifactWith((artifact) => {
      artifact.searchResults = Array.from({ length: 49 }, (_, index) => ({
        jobId: "jjk-world-structure",
        title: `Result ${index}`,
        description: "Bounded test result.",
        url: `https://example.test/${index}`,
      }));
    }),
  );

  expect(parsed.searchResults).toHaveLength(48);
  expect(parsed.searchResults.at(-1)?.url).toBe("https://example.test/47");
});
```

**Copy rule:** For new provider payload hardening tests, sanitize only untrusted provider/search snippets before strict artifact parse. Keep semantic fields strict unless a failing test proves a mechanical cap should apply.

---

### `backend/src/worldgen/__tests__/ip-researcher.test.ts` and `backend/src/worldgen/ip-researcher.ts` (provider ingress and sufficiency)

**Analog:** `backend/src/worldgen/__tests__/ip-researcher.test.ts`

**Mocked artifact generation pattern** (lines 100-128):
```typescript
function mockArtifactGeneration(artifact = cloneJjkNarutoArtifact()) {
    vi.mocked(safeGenerateObject)
        .mockResolvedValueOnce({
            object: {
                researchBrief: artifact.researchBrief,
            },
        } as never)
        .mockResolvedValueOnce({
            object: artifact.generatedContext,
        } as never);
    mockedWebSearch.mockImplementation(async (query: string) => {
        if (/Jujutsu Kaisen/i.test(query)) {
            return [
                {
                    title: "Jujutsu Kaisen institutions",
                    description: "Tokyo Jujutsu High coordinates sorcerer missions in modern Japan.",
                    url: "https://example.test/jjk-institutions",
                },
            ];
        }
```

**Provider overflow test pattern** (lines 204-232):
```typescript
it("caps overlong external search descriptions before final artifact validation", async () => {
    const artifactFixture = cloneJjkNarutoArtifact();
    vi.mocked(safeGenerateObject)
        .mockResolvedValueOnce({
            object: {
                researchBrief: artifactFixture.researchBrief,
            },
        } as never)
        .mockResolvedValueOnce({
            object: artifactFixture.generatedContext,
        } as never);
    mockedWebSearch.mockResolvedValue([
        {
            title: "Long search snippet",
            description: "x".repeat(701),
            url: "https://example.test/long-snippet",
        },
    ]);

    const result = await researchWorldgenArtifact(
        makeReq({
            premise: "Jujutsu Kaisen world with Naruto power system",
        }),
        fakeRole,
        1,
    );

    expect(result?.searchResults[0]?.description).toHaveLength(700);
});
```

**Production provider ingress pattern** (lines 422-446):
```typescript
async function runArtifactSearchJobs(
  jobs: WorldgenResearchSearchJob[],
  searchConfig: SearchConfig,
  resultsPerJob = ARTIFACT_SEARCH_RESULTS_PER_JOB,
): Promise<WorldgenResearchSearchResult[]> {
  const searchResults: WorldgenResearchSearchResult[] = [];

  for (const job of jobs) {
    try {
      const results = await webSearch(job.query, searchConfig, resultsPerJob);
      for (const result of results.slice(0, resultsPerJob)) {
        searchResults.push({
          jobId: job.id,
          title: result.title,
          description: result.description,
          url: result.url,
        });
      }
```

**Sufficiency merge pattern** (lines 608-655):
```typescript
const searchResults = await runArtifactSearchJobs(followUpJobs, searchConfig);
if (searchResults.length === 0) {
  log.info(`Artifact sufficiency found gaps for ${step}, but searches returned no results`);
  return normalizedArtifact;
}

return parseWorldgenResearchArtifact({
  ...normalizedArtifact,
  researchBrief: {
    ...normalizedArtifact.researchBrief,
    searchJobs: dedupeSearchJobs(
      [...normalizedArtifact.researchBrief.searchJobs, ...followUpJobs],
      12,
    ),
  },
  searchResults: [...normalizedArtifact.searchResults, ...searchResults].slice(0, 48),
  generatedContext: {
    ...normalizedArtifact.generatedContext,
    keyFacts: dedupeByExactText([
      ...normalizedArtifact.generatedContext.keyFacts,
      ...extracted.facts,
    ]),
```

**Copy rule:** Add sufficiency follow-up tests with mocked `safeGenerateObject` and `mockedWebSearch` before changing `evaluateResearchArtifactSufficiency`. Assert parser returns normalized artifact on provider overflow or logs and falls back as designed.

---

### `backend/src/routes/__tests__/schemas.test.ts` and `backend/src/routes/schemas.ts` (request validation)

**Analog:** `backend/src/routes/__tests__/schemas.test.ts`

**Schema boundary pattern** (lines 305-332):
```typescript
const worldgenResearchArtifactPayloadSchema = worldgenResearchArtifactSchema.nullable().optional();

export const suggestSeedSchema = z.object({
  premise: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "premise is required.")),
  category: seedCategorySchema,
  ipContext: ipContextSchema,
  premiseDivergence: premiseDivergenceSchema,
  researchArtifact: worldgenResearchArtifactPayloadSchema,
});

export const generateWorldSchema = z.object({
  campaignId: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "campaignId is required.")),
  ipContext: ipContextSchema,
  premiseDivergence: premiseDivergenceSchema,
  researchArtifact: worldgenResearchArtifactPayloadSchema,
});
```

**Schema test layout pattern** (lines 614-676):
```typescript
describe("generateWorldSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts a non-empty campaignId", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "abc-123-def",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.campaignId).toBe("abc-123-def");
      }
    });

    it("accepts optional premiseDivergence beside ipContext", () => {
      const result = generateWorldSchema.safeParse({
        campaignId: "abc-123-def",
        ipContext: {
          franchise: "Voices of the Void",
          keyFacts: ["The signal base sits in a remote valley."],
          tonalNotes: ["lonely"],
          source: "mcp",
        },
        premiseDivergence: {
```

**Copy rule:** If adding `researchArtifact: null` schema coverage, put it under `generateWorldSchema` and `suggestSeedSchema` valid-input sections. Assert nullable payload is accepted by schema, then route test decides lane semantics.

---

### `backend/src/routes/__tests__/worldgen.test.ts` and `backend/src/routes/worldgen.ts` (artifact vs legacy route lanes)

**Analog:** `backend/src/routes/__tests__/worldgen.test.ts`

**Suggest-seeds route return pattern** (lines 256-310):
```typescript
let ipContext = null;
let researchArtifact: WorldgenResearchArtifactV2 | null = null;
if (result.data.selectedWorldbooks?.length) {
  const composed = await composeSelectedWorldbooks(result.data.selectedWorldbooks, result.data.premise);
  ipContext = composed.ipContext;
} else if (result.data.worldbookEntries?.length) {
  ipContext = worldbookToIpContext(result.data.worldbookEntries, result.data.name ?? "Worldbook");
} else {
  const franchiseName = result.data.franchise?.trim();
  if (franchiseName && result.data.research !== false) {
    researchArtifact = await researchWorldgenArtifact(
      { premise: result.data.premise, name: result.data.name ?? "", knownIP: franchiseName, research: settings.research },
      gen.resolved,
      settings.research.maxSearchSteps,
    );
  }
}

return c.json({
  ...seeds,
  _ipContext: ipContext,
  _researchArtifact: researchArtifact,
  _premiseDivergence: premiseDivergence,
});
```

**Generate route lane pattern** (lines 389-417):
```typescript
const hasBodyResearchArtifact = Object.prototype.hasOwnProperty.call(
  result.data,
  "researchArtifact",
);
let researchArtifact = result.data.researchArtifact ?? null;
if (researchArtifact) {
  saveWorldgenResearchArtifact(campaignId, researchArtifact);
}
if (!researchArtifact && !hasBodyResearchArtifact) {
  researchArtifact = loadWorldgenResearchArtifact(campaignId);
}

const bodyIpContext = researchArtifact ? null : result.data.ipContext;
const bodyPremiseDivergence = researchArtifact
  ? null
  : result.data.premiseDivergence ?? null;
let ipContext = researchArtifact ? null : bodyIpContext ?? loadIpContext(campaignId);
let premiseDivergence = researchArtifact
  ? null
  : bodyPremiseDivergence ?? loadPremiseDivergence(campaignId);
let researchFrame = researchArtifact ? null : loadWorldgenResearchFrame(campaignId);
```

**Route regression pattern: request artifact wins over stale legacy fields** (lines 678-712):
```typescript
it("accepts a v2 research artifact body, saves it, and passes it into scaffold generation without legacy research frames", async () => {
  const artifact = cloneJjkNarutoArtifact();

  mockedGenerateWorldScaffold.mockResolvedValue({
    scaffold: {
      refinedPremise: "Shibuya burns under two intertwined power systems.",
      locations: [{ name: "Shibuya", description: "District", tags: [], isStarting: true, connectedTo: [] }],
      factions: [],
      npcs: [],
      loreCards: [],
    },
    enrichedIpContext: null,
  } as any);

  const res = await app.request("/api/worldgen/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId: CAMPAIGN_ID, ipContext: null, researchArtifact: artifact }),
  });

  expect(res.status).toBe(200);
  await res.text();
  expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID, artifact);
  expect(mockedResearchKnownIP).not.toHaveBeenCalled();
  expect(mockedSaveWorldgenResearchFrame).not.toHaveBeenCalled();
  expect(mockedLoadWorldgenResearchFrame).not.toHaveBeenCalled();
```

**Route regression pattern: stored artifact loads when omitted** (lines 714-742):
```typescript
it("loads a cached v2 research artifact when generate omits browser pass-through", async () => {
  const artifact = cloneJjkNarutoArtifact();

  mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
  mockedGenerateWorldScaffold.mockResolvedValue({
    scaffold: {
      refinedPremise: "Cached artifact world",
      locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
      factions: [],
      npcs: [],
      loreCards: [],
    },
    enrichedIpContext: null,
  } as any);

  const res = await app.request("/api/worldgen/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
  });

  expect(res.status).toBe(200);
  await res.text();
  expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
  expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
```

**Save-edits artifact-first lore pattern** (lines 1921-1971):
```typescript
it("passes stored v2 artifact context into lore re-extraction without legacy context", async () => {
  const artifact = cloneJjkNarutoArtifact();
  const cachedIpContext = {
    franchise: "Naruto and Jujutsu Kaisen",
    keyFacts: ["Hidden Cloud Village remains cached from legacy data."],
    tonalNotes: ["mixed canon"],
    source: "mcp" as const,
  };

  mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
  mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
  mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);

  const res = await app.request("/api/worldgen/save-edits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId: CAMPAIGN_ID, scaffold: validScaffold }),
  });

  expect(res.status).toBe(200);
  expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
  expect(mockedLoadIpContext).not.toHaveBeenCalled();
  expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
```

**Regenerate artifact-first pattern** (lines 2374-2458):
```typescript
it("uses a stored v2 artifact as the only research lane when regenerating with legacy context cached", async () => {
  const artifact = cloneJjkNarutoArtifact();
  const cachedIpContext = {
    franchise: "Naruto and Jujutsu Kaisen",
    keyFacts: ["Hidden Mist Village remains cached from a legacy generated world."],
    tonalNotes: ["mixed canon"],
    source: "mcp" as const,
  };

  mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
  mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
  mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
  mockedGenerateLocations.mockResolvedValue(locs as any);

  const res = await app.request("/api/worldgen/regenerate-section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId: CAMPAIGN_ID,
      section: "locations",
      refinedPremise: "A dark world",
    }),
  });

  expect(res.status).toBe(200);
  expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
  expect(mockedLoadIpContext).not.toHaveBeenCalled();
  expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
```

**Copy rule:** Add the explicit `researchArtifact: null` regression beside the existing cached-artifact test. Decide expected behavior first:

- If `null` means "omitted", copy the stored-artifact test and change body to `{ campaignId: CAMPAIGN_ID, researchArtifact: null }`; assert stored artifact still flows into `generateWorldScaffold`.
- If `null` means "clear/suppress artifact", add a test proving that explicit semantic and document why a client may erase stored artifact authority.

---

### `backend/src/campaign/__tests__/manager.test.ts` and `backend/src/campaign/manager.ts` (artifact persistence)

**Analog:** `backend/src/campaign/__tests__/manager.test.ts`

**Read/save production pattern** (lines 71-80, 405-429):
```typescript
return {
  name: parsed.name,
  premise: parsed.premise ?? "",
  seeds: parseWorldSeeds(parsed.seeds) ?? undefined,
  ipContext: parsed.ipContext ?? undefined,
  premiseDivergence: parsed.premiseDivergence ?? undefined,
  worldgenResearchFrame: parsed.worldgenResearchFrame ?? undefined,
  worldgenResearchArtifact: parsed.worldgenResearchArtifact
    ? parseWorldgenResearchArtifact(parsed.worldgenResearchArtifact)
    : undefined,
};

export function saveWorldgenResearchArtifact(
  campaignId: string,
  worldgenResearchArtifact: WorldgenResearchArtifactV2,
): void {
  assertSafeId(campaignId);
  const parsedArtifact = parseWorldgenResearchArtifact(worldgenResearchArtifact);
  updateCampaignConfig(campaignId, (config) => ({
    ...config,
    worldgenResearchArtifact: parsedArtifact,
  }));
}
```

**Persistence regression pattern** (lines 868-910):
```typescript
it("readCampaignConfig returns a valid v2 worldgenResearchArtifact when present", () => {
  vi.spyOn(fs, "existsSync").mockReturnValue(true);
  vi.spyOn(fs, "readFileSync").mockReturnValue(
    JSON.stringify({
      name: "Test",
      premise: "Jujutsu Kaisen world with Naruto power system",
      createdAt: 1000,
      worldgenResearchArtifact: jjkWithNarutoPowerSystemArtifact,
    }),
  );

  expect(readCampaignConfig("test-id")).toMatchObject({
    name: "Test",
    premise: "Jujutsu Kaisen world with Naruto power system",
    worldgenResearchArtifact: jjkWithNarutoPowerSystemArtifact,
  });
});

it("saveWorldgenResearchArtifact writes the artifact beside legacy config fields", () => {
  vi.spyOn(fs, "existsSync").mockReturnValue(true);
  vi.spyOn(fs, "readFileSync").mockReturnValue(
    JSON.stringify({
      name: "Test",
      premise: "P",
      createdAt: 1000,
      ipContext: legacyIpContext,
      premiseDivergence,
      worldgenResearchFrame,
```

**Copy rule:** Add campaign config long-payload parsing tests here if parser failure appears at file load/save boundary. Do not silently mutate legacy configs when reading; existing test lines 929-944 cover that pattern.

---

### `backend/src/worldgen/__tests__/seed-suggester.test.ts`, `backend/src/worldgen/__tests__/scaffold-resilience.test.ts`, and prompt helpers (prompt lane isolation)

**Analogs:** `backend/src/worldgen/scaffold-steps/prompt-utils.ts`, `backend/src/worldgen/seed-suggester.ts`

**Artifact-first prompt helper pattern** (lines 126-139):
```typescript
export function buildWorldgenResearchContextBlock(input: {
  researchArtifact?: WorldgenResearchArtifactV2 | null;
  ipContext?: IpResearchContext | null;
  target: string;
}): string {
  if (input.researchArtifact) {
    const target = input.target.trim() || "world generation";
    return `RESEARCH CONTEXT FOR ${target.toUpperCase()}:
Use the artifact source usage rules below. Do not collapse mixed sources into a single backend-selected franchise, and do not use a source for categories listed in avoidFor.
${formatWorldgenResearchArtifactBlock(input.researchArtifact)}`;
  }

  return buildIpContextBlock(input.ipContext ?? null);
}
```

**Seed prompt artifact-first branch** (lines 102-115):
```typescript
const ipInstruction = researchArtifact
  ? `Use the approved research context below to define the current ${label.toLowerCase()} from the raw premise and artifact-authored source usage rules.`
  : ipContext
    ? `This world is the ${ipContext.franchise} universe. Define its current ${label.toLowerCase()} by starting from canon and then applying only the interpreted divergence consequences. Use the franchise's own terminology.`
    : `This is an original world. Generate a specific, concrete ${label.toLowerCase()} that follows logically from the premise.`;

const ipBlock = buildWorldgenResearchContextBlock({
  researchArtifact,
  ipContext,
  target: `${label} DNA`,
});
const knownIpContract = researchArtifact
```

**Seed test pattern** (lines 178-199):
```typescript
it("uses artifact source rules for mixed-premise seed prompts without canonical franchise wording", async () => {
  setupSequentialMocks();

  await suggestWorldSeeds({
    premise: "Jujutsu Kaisen world with Naruto power system",
    role: fakeRole,
    ipContext: null,
    researchArtifact: jjkWithNarutoPowerSystemArtifact,
  } as never);

  const firstGenerationPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
    .prompt as string;
  expect(firstGenerationPrompt).toContain("RESEARCH CONTEXT FOR GEOGRAPHY DNA");
  expect(firstGenerationPrompt).toContain("Source usage rules:");
  expect(firstGenerationPrompt).toContain("Jujutsu Kaisen: role=world_basis");
  expect(firstGenerationPrompt).toContain("useFor=locations, factions, npcs, timeline");
  expect(firstGenerationPrompt).toContain("Naruto: role=mechanics_overlay");
  expect(firstGenerationPrompt).toContain("useFor=power_system");
  expect(firstGenerationPrompt).toContain("avoidFor=locations, factions, npcs, timeline");
  for (const phrase of forbiddenArtifactPromptPhrases) {
    expect(firstGenerationPrompt).not.toContain(phrase);
  }
});
```

**Location/faction prompt test pattern** (lines 197-238):
```typescript
await generateLocationsStep(
  {
    ...fakeReq,
    premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
    researchArtifact: jjkWithNarutoPowerSystemArtifact,
  },
  jjkWithNarutoPowerSystemArtifact.rawPremise,
  pollutedMixedIpContext,
);

const planPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
  .prompt as string;
const detailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
  .prompt as string;

expectArtifactRulesForTarget(planPrompt, "locations");
expectArtifactRulesForTarget(detailPrompt, "locations");
expectNoNarutoWorldStructure(planPrompt);
expectNoNarutoWorldStructure(detailPrompt);
```

**Scaffold orchestration pattern** (lines 356-452):
```typescript
const mockEvaluateResearchSufficiency = vi.fn(async (ctx: unknown) => ctx);
const mockEvaluateResearchArtifactSufficiency = vi.fn(async () => enrichedArtifact);

vi.doMock("../ip-researcher.js", () => ({
  evaluateResearchSufficiency: mockEvaluateResearchSufficiency,
  evaluateResearchArtifactSufficiency: mockEvaluateResearchArtifactSufficiency,
}));

const { generateWorldScaffold } = await import("../scaffold-generator.js");

const result = await generateWorldScaffold({
  ...fakeReq,
  premise: originalArtifact.rawPremise,
  ipContext: pollutedMixedIpContext,
  researchArtifact: originalArtifact,
  judgeRole: fakeReq.role,
  research: { enabled: true, searchProvider: "brave", maxSearchSteps: 3 },
});

expect(mockEvaluateResearchSufficiency).not.toHaveBeenCalled();
expect(mockEvaluateResearchArtifactSufficiency).toHaveBeenCalledTimes(3);
expect(mockGenerateLocationsStep.mock.calls[0]?.[0]).toMatchObject({
  researchArtifact: enrichedArtifact,
});
expect(mockExtractLoreCards.mock.calls[0]?.[7]).toBe(enrichedArtifact);
expect(result.researchArtifact).toBe(enrichedArtifact);
```

**Lore prompt routing pattern** (lines 212-241):
```typescript
await extractLoreCards(
  fakeScaffold,
  fakeRole,
  null,
  null,
  undefined,
  undefined,
  undefined,
  jjkToneOverlayNarutoPowerSystemArtifact,
);

const prompts = mockGenerateObject.mock.calls.map(
  (call) => (call[0] as Record<string, unknown>).prompt as string,
);
const npcPrompt = prompts[2]!;
const conceptPrompt = prompts[3]!;

expect(prompts.join("\n")).toContain("RESEARCH CONTEXT FOR LORE CARDS");
expect(prompts.join("\n")).toContain("Jujutsu Kaisen: role=tone_overlay; useFor=tone; avoidFor=locations, factions, npcs, timeline, power_system");
expect(prompts.join("\n")).toContain("Naruto: role=mechanics_overlay; useFor=power_system");
expect(npcPrompt).toContain("Ability lore may use only sources whose useFor includes power_system: Naruto");
expect(conceptPrompt).toContain("Do not create ability cards from sources without power_system use: Jujutsu Kaisen");
expect(prompts.join("\n")).not.toContain("FRANCHISE REFERENCE");
expect(prompts.join("\n")).not.toContain("Build the canonical world");
```

**Copy rule:** New prompt tests should pass both `researchArtifact` and polluted/stale `ipContext`, then assert artifact source rules are present and forbidden legacy prompt fragments are absent. Keep separate no-artifact compatibility tests with `researchArtifact: null`.

---

### `backend/src/worldgen/__tests__/npcs-step.test.ts` and `backend/src/worldgen/scaffold-steps/npcs-step.ts` (NPC canonical identity and source dispatch)

**Analog:** `backend/src/worldgen/__tests__/npcs-step.test.ts`

**Artifact canonical-name dispatch pattern** (lines 164-240):
```typescript
function artifactHasCanonicalCharacter(
  artifact: NonNullable<GenerateScaffoldRequest["researchArtifact"]>,
  npcName: string,
): boolean {
  const names = artifact.generatedContext.canonicalNames?.characters ?? [];
  if (names.length === 0) return false;

  const canonicalKeys = new Set<string>();
  for (const name of names) {
    addNameKeys(canonicalKeys, name);
  }

  const npcKeys = new Set<string>();
  addNameKeys(npcKeys, npcName);
  for (const key of npcKeys) {
    if (canonicalKeys.has(key)) return true;
  }

  return false;
}

function artifactNpcFranchiseForName(
  artifact: NonNullable<GenerateScaffoldRequest["researchArtifact"]> | null | undefined,
  npcName: string,
): string | null {
  if (!artifact || !artifactHasCanonicalCharacter(artifact, npcName)) return null;

  return artifact.researchBrief.sourceUsageRules.find(sourceAllowsNpcIdentity)?.sourceLabel ?? null;
}

if (artifactFranchise) {
  return {
    canonicalStatus: canonicalStatusFromContext(req, null, item.draft.identity.displayName),
    franchise: artifactFranchise,
    ipContext: null,
    premiseDivergence: req.premiseDivergence ?? null,
  };
}

if (req.researchArtifact) {
  return {
    canonicalStatus: "original",
    franchise: null,
    ipContext: null,
    premiseDivergence: null,
  };
}
```

**Draft-to-enrichment handoff pattern** (lines 808-877):
```typescript
let draft = fromLegacyScaffoldNpc(legacyNpc, {
  canonicalStatus,
  sourceKind: "worldgen",
  currentLocationName: locationName,
  factionName,
  originMode: "resident",
});

if (result.length > 0) {
  const ctx = {
    gen: req.role,
    campaign: {
      premise: refinedPremise,
      ipContext,
      premiseDivergence: req.premiseDivergence ?? null,
    },
    settings: {
      research: req.research,
    } as IngestionContext["settings"],
    locationNames,
    factionNames,
  } as IngestionContext;

  const enrichedDrafts = await enrichNpcsBatch({
    items: result.map((npc) => ({
      draft: npc.draft!,
      tier: npc.tier ?? "supporting",
    })),
    buildClassification: (item) => buildWorldgenNpcClassification(item, req, ipContext),
    ctx,
```

**Gojo dispatch regression pattern** (lines 677-766):
```typescript
it("routes artifact canonical NPCs to known-IP power enrichment when ipContext is null", async () => {
  queueNpcPlans(
    [
      {
        name: "Satoru Gojo",
        role: "Protects students while investigating the chakra-overlay anomaly.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ],
    [
      {
        name: "Campus Quartermaster",
        role: "Supplies students with field kits before curse incidents.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ],
  );

  vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
    ...draft,
    powerStats: {
      ...buildPowerStatsStub(),
      attackPotency: { tier: "City", rank: 8 },
      speed: { tier: "Massively Hypersonic", rank: 9 },
      durability: { tier: "City", rank: 10 },
      intelligence: { tier: "Genius", rank: 8 },
    },
  }));
  vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => ({
    ...draft,
    powerStats: buildPowerStatsStub(),
  }));

  const result = await generateNpcsStep(
    {
      ...fakeReqWithResearch,
      premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
      researchArtifact: jjkWithNarutoPowerSystemArtifact,
    },
    jjkWithNarutoPowerSystemArtifact.rawPremise,
    ["Tokyo Jujutsu High"],
    ["Jujutsu Headquarters"],
    null,
  );

  expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(1);
  expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      franchise: "Jujutsu Kaisen",
    }),
  );
  expect(assessOriginalCharacterPowerStats).toHaveBeenCalledTimes(1);
  expect(result[0]?.draft?.identity.canonicalStatus).toBe("known_ip_canonical");
  expect(result[0]?.draft?.powerStats?.attackPotency.tier).toBe("City");
  expect(result[1]?.draft?.identity.canonicalStatus).toBe("original");
  expect(result[1]?.draft?.powerStats?.attackPotency.tier).toBe("Human");
});
```

**Legacy no-artifact compatibility pattern** (lines 793-821):
```typescript
await generateNpcsStep(
  { ...fakeReqWithResearch, researchArtifact: null },
  "Naruto, but Sakura was trained by Orochimaru.",
  ["Konohagakure"],
  ["Konohagakure"],
  {
    franchise: "Naruto",
    keyFacts: ["Naruto Uzumaki remains the Seventh Hokage."],
    tonalNotes: ["Shonen action"],
    canonicalNames: {
      locations: ["Konohagakure"],
      factions: ["Konohagakure"],
      characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
    },
    source: "mcp",
  },
);

const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
  .prompt as string;
expect(keyPlanPrompt).toContain("List 6-10 CANONICAL characters from Naruto.");
expect(keyPlanPrompt).toContain("CANONICAL CHARACTERS FROM NARUTO");
expect(keyPlanPrompt).toContain("LEGACY IP REFERENCE (Naruto, verified via mcp)");
expect(keyPlanPrompt).toContain("KNOWN-IP GENERATION CONTRACT FOR KEY NPCS");
```

**Copy rule:** Add new NPC regressions in this file when behavior depends on artifact `generatedContext.canonicalNames.characters` or `sourceUsageRules`. Keep one canonical Gojo and one original supporting NPC in same test to prove both branches.

---

### `backend/src/character/__tests__/enrich-npc-batch.test.ts` and `backend/src/character/ingestion/__tests__/power-assessor.test.ts` (power-stat dispatch)

**Analogs:** `backend/src/character/enrich-npc-batch.ts`, `backend/src/character/ingestion/power-assessor.ts`

**Batch dispatch production pattern** (lines 40-64):
```typescript
export async function enrichNpcsBatch(
  opts: EnrichNpcsBatchOptions,
): Promise<CharacterDraft[]> {
  const { items, buildClassification, buildSources, ctx } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  if (items.length === 0) {
    return [];
  }

  for (let start = 0; start < items.length; start += concurrency) {
    const chunk = items.slice(start, start + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item) =>
        assessPowerStats({
          draft: item.draft,
          sources: buildSources ? buildSources(item) : EMPTY_SOURCES,
          classification: buildClassification(item),
          researchDigest: opts.researchDigest ?? null,
          ctx,
        }),
      ),
    );
```

**Batch test pattern** (lines 166-224):
```typescript
it("routes known-IP key tier to assessPowerStats with canonicalStatus='known_ip_canonical' (D-01)", async () => {
  const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Key Canon"), tier: "key" }];

  await enrichNpcsBatch({
    items,
    buildClassification: () => classificationKnownIp(),
    ctx: makeCtx(),
  });

  expect(vi.mocked(assessPowerStats)).toHaveBeenCalledTimes(1);
  const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
  expect(call?.classification.canonicalStatus).toBe("known_ip_canonical");
  expect(call?.classification.franchise).toBe("TestFranchise");
});

it("routes original-world key tier to assessPowerStats with canonicalStatus='original' (D-02)", async () => {
  const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Key Original"), tier: "key" }];

  await enrichNpcsBatch({
    items,
    buildClassification: () => classificationOriginal(),
    ctx: makeCtx(),
  });

  const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
  expect(call?.classification.canonicalStatus).toBe("original");
  expect(call?.classification.franchise).toBeNull();
});
```

**Power assessor production pattern** (lines 55-90):
```typescript
if (status === "known_ip_canonical" || status === "known_ip_diverged") {
  if (!classification.franchise) {
    throw new IngestionPipelineError({
      stage: "power_assess",
      attempts: 0,
      cause: null,
      message: `Cannot run canon PowerStats assessment without a franchise (got ${classification.franchise}).`,
    });
  }
  if (!ctx.settings.research?.enabled) {
    throw new IngestionPipelineError({
      stage: "power_assess",
      attempts: 0,
      cause: null,
      message: `Canon PowerStats assessment requires research to be enabled for ${draft.identity.displayName}.`,
    });
  }
  return await enrichKnownIpWorldgenNpcDraft({
    draft,
    franchise: classification.franchise,
    role: ctx.gen,
    research: ctx.settings.research,
    premise: ctx.campaign.premise,
    premiseDivergence: classification.premiseDivergence,
    overrideText: sources.overrideText ?? undefined,
  });
}

// original / imported branch
return await assessOriginalCharacterPowerStats({
```

**Power assessor test pattern** (lines 69-177):
```typescript
it("dispatches known_ip_canonical to enrichKnownIpWorldgenNpcDraft with franchise + overrideText", async () => {
  const out = await assessPowerStats({
    draft: gojoDraft as unknown as CharacterDraft,
    sources: { ...baseSources, overrideText: "weaker than canon" },
    classification: {
      canonicalStatus: "known_ip_canonical",
      franchise: "Jujutsu Kaisen",
      ipContext: null,
      premiseDivergence: null,
    },
    researchDigest: "digest",
    ctx: baseCtx,
  });
  expect(enrichCalls).toHaveLength(1);
  expect(enrichCalls[0].franchise).toBe("Jujutsu Kaisen");
  expect(enrichCalls[0].overrideText).toBe("weaker than canon");
  expect(out.powerStats).toEqual(enrichedStats);
});

it("throws IngestionPipelineError when canon branch has no franchise", async () => {
  await expect(
    assessPowerStats({
      draft: gojoDraft as unknown as CharacterDraft,
      sources: baseSources,
      classification: {
        canonicalStatus: "known_ip_canonical",
        franchise: null,
        ipContext: null,
        premiseDivergence: null,
      },
      researchDigest: null,
      ctx: baseCtx,
    })
  ).rejects.toThrow(IngestionPipelineError);
});
```

**Copy rule:** If Phase 72 adds another dispatch invariant, keep assertions at the classification object level, not only final `powerStats`, so the test fails at the authority handoff.

---

### `backend/src/character/ingestion/__tests__/classifier.test.ts` and `backend/src/character/ingestion/__tests__/pipeline.test.ts` (generic ingestion adjacency)

**Analogs:** `backend/src/character/ingestion/classifier.ts`, `backend/src/character/ingestion/pipeline.ts`

**Current classifier limitation pattern** (lines 19-55):
```typescript
export function classifyCanonicalStatus(opts: {
  sources: IngestionSources;
  ipContext: IpResearchContext | null;
  premiseDivergence: PremiseDivergence | null;
}): IngestionClassification {
  const { sources, ipContext, premiseDivergence } = opts;
  const canonicalNames = ipContext?.canonicalNames?.characters ?? [];
  const excluded = ipContext?.excludedCharacters ?? [];

  const candidateName =
    sources.displayName ??
    (sources.archetype
      ? findNameInArchetype(sources.archetype, canonicalNames)
      : null);

  const hasCanonMatch =
    candidateName != null && nameMatches(candidateName, canonicalNames);

  let canonicalStatus: IngestionClassification["canonicalStatus"];
  if (hasCanonMatch) {
    canonicalStatus = excluded.some(
      (e) => e.toLowerCase() === candidateName!.toLowerCase(),
    )
      ? "known_ip_diverged"
      : "known_ip_canonical";
  } else if (sources.card) {
    canonicalStatus = "imported";
  } else {
    canonicalStatus = "original";
  }

  return {
    canonicalStatus,
    franchise: ipContext?.franchise ?? null,
    ipContext: ipContext ?? null,
    premiseDivergence: premiseDivergence ?? null,
  };
}
```

**Pipeline handoff pattern** (lines 68-95):
```typescript
// Stage 2: classify (+ optional synthesis-time research)
const classification = classifyCanonicalStatus({
  sources,
  ipContext: ctx.campaign.ipContext,
  premiseDivergence: ctx.campaign.premiseDivergence,
});
log.info("ingestCharacterDraft: classified", {
  canonicalStatus: classification.canonicalStatus,
  franchise: classification.franchise,
});

const researchDigest = await runCanonResearch(classification, sources, ctx);

// Stage 3: synthesize
const draft = await synthesizeDraftFromSources({
  sources,
  classification,
  researchDigest,
  ctx,
});

// Stage 4: assess PowerStats
const enriched = await assessPowerStats({
  draft,
  sources,
  classification,
  researchDigest,
  ctx,
```

**Classifier test pattern** (lines 26-104):
```typescript
describe("classifyCanonicalStatus", () => {
  it("returns known_ip_canonical when card name matches canonical characters", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Gojo Satoru", card: {} as any },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("known_ip_canonical");
    expect(out.franchise).toBe("Jujutsu Kaisen");
  });

  it("returns imported when card exists but name is not canonical", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, displayName: "Serin Varn", card: {} as any },
      ipContext: jjkContext,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("imported");
  });

  it("returns original for generate mode with no ipContext", () => {
    const out = classifyCanonicalStatus({
      sources: { ...baseSources, mode: "generate" },
      ipContext: null,
      premiseDivergence: null,
    });
    expect(out.canonicalStatus).toBe("original");
  });
});
```

**Pipeline test pattern** (lines 65-131):
```typescript
describe("ingestCharacterDraft", () => {
  it("end-to-end runs all stages for parse mode and returns powerStats", async () => {
    const input: IngestionInput = {
      mode: "parse",
      campaignId: "c1",
      role: "player",
      freeText: "a haunted clockmaker",
    };
    const out = await ingestCharacterDraft(input, baseCtx);
    expect(out.powerStats).toBeDefined();
    expect(out.powerStats!.attackPotency.tier).toBe("Universal");
    expect(synthesizeDraftFromSources).toHaveBeenCalledTimes(1);
    expect(assessPowerStats).toHaveBeenCalledTimes(1);
  });

  it("throws IngestionPipelineError when powerStats missing after pipeline", async () => {
    (assessPowerStats as any).mockResolvedValueOnce({ ...mockDraft, powerStats: undefined });
    await expect(
      ingestCharacterDraft(
        { mode: "parse", campaignId: "c1", role: "player", freeText: "x" },
        baseCtx,
      ),
    ).rejects.toThrow(/powerStats is undefined/);
  });
```

**Copy rule:** Treat generic ingestion as adjacency unless planner explicitly includes player/import flows in Phase 72. If included, write failing classifier/pipeline tests first showing an artifact-backed campaign cannot classify Gojo as original/imported only because `ipContext` is null. Production type changes may be required because `IngestionContext.campaign` currently has `ipContext` but no `worldgenResearchArtifact`.

---

### `frontend/lib/api.ts`, `frontend/components/title/use-new-campaign-wizard.ts`, and wizard tests (`_researchArtifact` transport)

**Analog:** `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx`

**Current API gap pattern** (lines 729-766):
```typescript
export function suggestSeeds(
  premise: string,
  opts?: {
    name?: string;
    franchise?: string;
    research?: boolean;
    selectedWorldbooks?: CampaignWorldbookSelection[];
    worldbookEntries?: ClassifiedWorldBookEntry[];
  }
): Promise<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }> {
  return apiPost<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }>("/api/worldgen/suggest-seeds", {
    premise,
    name: opts?.name,
    franchise: opts?.franchise,
    research: opts?.research,
    selectedWorldbooks: opts?.selectedWorldbooks,
    worldbookEntries: opts?.worldbookEntries,
  });
}

export function suggestSeed(
  premise: string,
  category: SeedCategory,
  ipContext?: IpContext | null,
  premiseDivergence?: PremiseDivergence | null,
): Promise<RollSeedResult> {
  return apiPost<RollSeedResult>("/api/worldgen/suggest-seed", {
    premise,
    category,
    ipContext: ipContext ?? null,
    premiseDivergence: premiseDivergence ?? null,
  });
}
```

**Current generation body pattern** (lines 934-950):
```typescript
export async function generateWorld(
  campaignId: string,
  onProgress?: (progress: GenerationProgress) => void,
  ipContext?: IpContext | null,
  premiseDivergence?: PremiseDivergence | null,
): Promise<GenerateWorldResult> {
  const body: Record<string, unknown> = { campaignId };
  if (ipContext) {
    body.ipContext = ipContext;
  }
  if (premiseDivergence) {
    body.premiseDivergence = premiseDivergence;
  }
  const res = await fetch(`${API_BASE}/api/worldgen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
```

**Current wizard state gap pattern** (lines 103-104, 405-417, 485-490):
```typescript
const [ipContext, setIpContext] = useState<IpContext | null>(null);
const [premiseDivergence, setPremiseDivergence] = useState<PremiseDivergence | null>(null);

const suggested = await suggestSeeds(campaignPremise.trim(), {
    name: campaignName.trim(),
    franchise: campaignFranchise.trim() || undefined,
    research: researchEnabled,
    selectedWorldbooks: selectedWorldbooks.length > 0 ? selectedWorldbooks : undefined,
  });
if (suggested._ipContext) {
  setIpContext(suggested._ipContext);
}
if (suggested._premiseDivergence) {
  setPremiseDivergence(suggested._premiseDivergence);
}

const result = await suggestSeed(
  campaignPremise.trim(),
  category,
  ipContext,
  premiseDivergence,
);
```

**Wizard test mock pattern** (lines 153-162, 218-225):
```typescript
mockSuggestSeeds.mockResolvedValue({
  geography: "Cliffside kingdoms",
  politicalStructure: "Merchant republics",
  centralConflict: "An occult trade war",
  culturalFlavor: ["masked festivals"],
  environment: "Sea caves",
  wildcard: "Whispering relics",
  _ipContext: null,
  _premiseDivergence: null,
});

expect(mockSuggestSeeds).toHaveBeenCalledWith(
  "A haunted coast of guild cities.",
  expect.objectContaining({
    name: "Arcadia",
    selectedWorldbooks: [LIBRARY_ITEMS[1]],
  }),
);
expect(mockSuggestSeeds.mock.calls[0]?.[1]).not.toHaveProperty("worldbookEntries");
```

**Copy rule:** If frontend transport is implemented, add `WorldgenResearchArtifactV2` typing to `frontend/lib/api.ts`, store `researchArtifact` in wizard state, pass it to `suggestSeed` and `generateWorld`, and update wizard tests to assert `_researchArtifact` travels through. If planner chooses backend fallback instead, add explicit route tests proving fallback behavior and leave frontend API unchanged.

---

### `frontend/lib/__tests__/character-drafts.test.ts`, `frontend/components/world-review/__tests__/npcs-section.test.tsx`, and review identity payloads

**Analogs:** `frontend/lib/character-drafts.ts`, `frontend/components/world-review/npcs-section.tsx`

**Current fallback identity pattern** (lines 431-439):
```typescript
export function scaffoldNpcToDraft(npc: ScaffoldNpc): CharacterDraft {
  const tier = resolveScaffoldNpcTier(npc);
  const base = npc.draft ?? {
    identity: {
      role: "npc" as const,
      tier: mapScaffoldTierToDraftTier(tier),
      displayName: npc.name,
      canonicalStatus: "original" as const,
      baseFacts: {
```

**Current empty draft pattern** (lines 545-555):
```typescript
export function createEmptyNpcDraft(
  locationName: string,
  tier: ScaffoldNpc["tier"],
): CharacterDraft {
  return normalizeCharacterDraft({
    identity: {
      role: "npc",
      tier: mapScaffoldTierToDraftTier(tier),
      displayName: "",
      canonicalStatus: "original",
    },
```

**Draft round-trip test pattern** (lines 114-145):
```typescript
it("derives compatibility persona and goals from richer identity when shallow fields are empty", () => {
  const richIdentityDraft = makeNpcDraft({
    profile: {
      species: "Human",
      gender: "Woman",
      ageText: "34",
      appearance: "Scarred officer",
      backgroundSummary: "",
      personaSummary: "",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Captain Mira",
      canonicalStatus: "known_ip_canonical",
      baseFacts: {
        biography: "Veteran harbor marshal who held the breakwater during the Black Tide.",
        socialRole: ["Harbor marshal", "Watch captain"],
        hardConstraints: ["Will not abandon the harbor to smugglers"],
```

**NpcsSection component test pattern** (lines 312-370):
```typescript
it("renders personality between tags and power stats on the npc card", async () => {
  const user = userEvent.setup();
  renderSection({
    npcs: [
      makeNpc({
        draft: makeDraft({
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Marshal Vale",
            canonicalStatus: "original",
            personality: makeDraft().identity.personality,
          },
          powerStats: MOCK_POWER_STATS,
        }),
      }),
    ],
  });

  const card = screen.getByTestId("npc-card");
  const tagsHeading = within(card).getByText(/^tags$/i);
  const personality = within(card).getByRole("region", { name: /personality/i });
  const powerStatsHeading = within(card).getByText(/^power stats$/i);
  const powerStats = powerStatsHeading.closest("div");
```

**Copy rule:** For review payload preservation, prefer a `character-drafts.test.ts` transform test first: `ScaffoldNpc` with `draft.identity.canonicalStatus: "known_ip_canonical"` must round-trip through `scaffoldNpcToDraft` or `characterDraftToScaffoldNpc` without becoming `original`. Add `NpcsSection` test only if UI rendering or edit events are touched.

---

## Shared Patterns

### Artifact-First Lane

**Source:** `backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139`, `backend/src/routes/worldgen.ts:389-417`

**Apply to:** routes, seed suggester, scaffold steps, lore extraction, NPC generation.

Pattern:
```typescript
if (researchArtifact) {
  // use artifact context
  // ignore legacy ipContext / premiseDivergence / researchFrame for semantic ownership
} else {
  // legacy no-artifact compatibility lane
}
```

Test shape:
```typescript
expect(mockedLoadIpContext).not.toHaveBeenCalled();
expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
expect(prompt).toContain("RESEARCH CONTEXT FOR");
expect(prompt).not.toContain("FRANCHISE REFERENCE");
expect(prompt).not.toContain("Build the canonical world");
```

### Provider Boundary Sanitization

**Source:** `backend/src/worldgen/research-artifact.ts:18-58`

**Apply to:** parser/provider payload tests and any production fix around external search result ingestion.

Pattern:
```typescript
z.preprocess(
  (value) => typeof value === "string" ? value.trim().slice(0, max) : value,
  z.string().min(1).max(max),
)
```

### Canonical NPC Dispatch

**Source:** `backend/src/worldgen/scaffold-steps/npcs-step.ts:164-240`, `backend/src/character/ingestion/power-assessor.ts:55-90`

**Apply to:** NPC tests, enrichment tests, power dispatch tests.

Pattern:
```typescript
expect(result[0]?.draft?.identity.canonicalStatus).toBe("known_ip_canonical");
expect(result[0]?.draft?.powerStats?.attackPotency.tier).toBe("City");
expect(result[1]?.draft?.identity.canonicalStatus).toBe("original");
expect(result[1]?.draft?.powerStats?.attackPotency.tier).toBe("Human");
```

### Frontend Transport Decision Point

**Source:** `frontend/lib/api.ts:729-766`, `frontend/components/title/use-new-campaign-wizard.ts:103-490`

**Apply to:** frontend artifact handoff tests.

Current gap:
```typescript
suggestSeeds(): Promise<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }>
```

Missing if transport is chosen:
```typescript
_researchArtifact?: WorldgenResearchArtifactV2 | null
```

### Final Negative Scans

**Source:** `72-VALIDATION.md`

Use after implementation:
```bash
rg -n "Canonical subject|FRANCHISE REFERENCE|Build the canonical world|This world is the Naruto universe|Five Great Nations|Hidden Mist Village|Hidden Cloud Village|Mizukage|Raikage|Hashirama|Tobirama" backend/src/worldgen backend/src/routes --glob '!**/__tests__/**' --glob '!**/test-fixtures/**'
rg -n "_researchArtifact|worldgenResearchArtifact|canonicalStatus: \"original\"|classifyCanonicalStatus\\(" backend/src frontend shared/src
rg -n "researchArtifact" frontend backend/src/routes backend/src/worldgen backend/src/character -g "*.ts" -g "*.tsx"
```

Baseline during mapping:

- Forbidden production prompt scan returned no matches in `backend/src/worldgen` and `backend/src/routes` outside tests/fixtures.
- `_researchArtifact` appears in backend route/tests but not frontend API/wizard state.
- `classifyCanonicalStatus(` appears in generic ingestion pipeline and classifier tests only; no artifact parameter exists there today.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/lib/__tests__/api.test.ts` | possible new test | request-response, streaming body | No existing direct frontend API unit test for request body serialization. If planner wants isolated API transport coverage, copy mock style from `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` and body-shape expectations from backend route tests. |

## Metadata

**Analog search scope:** `backend/src/worldgen`, `backend/src/routes`, `backend/src/campaign`, `backend/src/character`, `frontend/lib`, `frontend/components/title`, `frontend/components/world-review`, `shared/src`

**Files scanned:** 455 source/test files under `backend/src`, `frontend`, and `shared/src`

**GitNexus context:** `WorldForge`, indexed 2026-04-26, 290 files, 2332 symbols, 6538 relationships, 186 processes

**Pattern extraction date:** 2026-04-26

**Worktree note:** Existing worktree was dirty before writing this file. Mapper touched only `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-PATTERNS.md`.
