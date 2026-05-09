import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockSafeGenerateObject = vi.fn();
const mockCreateModel = vi.fn((config: unknown) => ({
  config,
  modelId: "mock-live-model",
}));
const mockResolveProviderProtocol = vi.fn((_config: unknown) => "openai-compatible");

vi.mock("../generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockSafeGenerateObject(...args),
}));

vi.mock("../provider-registry.js", () => ({
  createModel: (config: unknown) => mockCreateModel(config),
  resolveProviderProtocol: (config: unknown) => mockResolveProviderProtocol(config),
}));

const {
  buildDefaultStructuredOutputConformanceCases,
  runStructuredOutputConformance,
} = await import("../structured-output-conformance.js");

const failureFixturesDir = path.resolve(process.cwd(), "src/ai/__tests__/fixtures/structured-output-failures");

function readFailureFixture(fixtureId: string): { malformedObject: unknown } {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(failureFixturesDir, "manifest.json"), "utf8"),
  ) as { fixtures: Array<{ fixtureId: string; file: string }> };
  const entry = manifest.fixtures.find((fixture) => fixture.fixtureId === fixtureId);
  if (!entry) throw new Error(`Missing fixture manifest entry: ${fixtureId}`);

  return JSON.parse(
    fs.readFileSync(path.join(failureFixturesDir, entry.file), "utf8"),
  ) as { malformedObject: unknown };
}

describe("structured output conformance harness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports provider, model, schema, mode, strategy, usage, repair, semanticPass, and success fields", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: { hp: 5 },
      trace: {
        requestedMode: "auto",
        strategy: "native_schema",
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 16,
        },
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "shape_probe",
          fixtureIds: ["shape-probe-fixture"],
          requestedMode: "auto",
          schema: z.object({ hp: z.number() }),
          prompt: "Return the test HP object.",
          semanticCheck: (object: unknown) => (object as { hp: number }).hp === 5,
        },
      ],
    });

    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      providerId: "mock-provider",
      providerName: "Mock Provider",
      protocol: "openai-compatible",
      model: "mock-model",
      schemaId: "shape_probe",
      fixtureIds: ["shape-probe-fixture"],
      requestedMode: "auto",
      strategy: "native_schema",
      latencyMs: expect.any(Number),
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
      errorType: undefined,
      repairUsed: false,
      fallbackOrRepairUsed: false,
      semanticPass: true,
      primaryPromptContractSuccess: true,
      primaryFailureReason: undefined,
      success: true,
    });
  });

  it("forwards explicit conformance requested modes to safeGenerateObject", async () => {
    const requestedModes = [
      "auto",
      "json",
      "tool",
      "native_schema",
      "native_json",
      "tool_mode",
      "text_fallback",
    ] as const;
    mockSafeGenerateObject.mockImplementation((opts: { mode?: string }) => Promise.resolve({
      object: { ok: true },
      trace: {
        requestedMode: opts.mode ?? "auto",
        strategy: "text_fallback",
      },
    }));

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: requestedModes.map((requestedMode) => ({
        schemaId: `mode_${requestedMode}`,
        requestedMode,
        schema: z.object({ ok: z.boolean() }),
        prompt: `Return ok for ${requestedMode}.`,
      })),
    });

    expect(mockSafeGenerateObject.mock.calls.map(([opts]) => (opts as { mode?: string }).mode)).toEqual([
      undefined,
      "json",
      "tool",
      "native_schema",
      "native_json",
      "tool_mode",
      "text_fallback",
    ]);
    expect(report.results.map((result) => result.requestedMode)).toEqual([...requestedModes]);
  });

  it("fails explicit mode conformance when the exercised strategy does not match", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: { ok: true },
      trace: {
        requestedMode: "tool",
        strategy: "text_fallback",
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "tool_mode_probe",
          requestedMode: "tool",
          schema: z.object({ ok: z.boolean() }),
          prompt: "Return ok using tool mode.",
          semanticCheck: (object: unknown) => (object as { ok: boolean }).ok,
        },
      ],
    });

    expect(report.results[0]).toMatchObject({
      requestedMode: "tool",
      strategy: "text_fallback",
      errorType: "strategy_mismatch",
      fallbackOrRepairUsed: true,
      semanticPass: true,
      primaryPromptContractSuccess: false,
      success: true,
    });
    expect(report.results[0]?.errorMessage).toContain("requested tool exercised text_fallback");
    expect(report.results[0]?.primaryFailureReason).toContain("requested tool exercised text_fallback");
  });

  it("fails explicit mode conformance when repair masks a fallback strategy", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: { ok: true },
      trace: {
        requestedMode: "tool",
        strategy: "repair",
        primaryStrategy: "tool_mode",
        fallbackStrategy: "text_fallback",
        repairedFromStrategy: "text_fallback",
        repair: {
          text: "{\"ok\":\"true\"}",
          cleanedText: "{\"ok\":true}",
          strategy: "repair",
          issues: "[ok] Invalid input: expected boolean, received string",
        },
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "tool_mode_repair_probe",
          requestedMode: "tool",
          schema: z.object({ ok: z.boolean() }),
          prompt: "Return ok using tool mode.",
          semanticCheck: (object: unknown) => (object as { ok: boolean }).ok,
        },
      ],
    });

    expect(report.results[0]).toMatchObject({
      requestedMode: "tool",
      strategy: "repair",
      errorType: "strategy_mismatch",
      repairUsed: true,
      fallbackOrRepairUsed: true,
      semanticPass: true,
      primaryPromptContractSuccess: false,
      success: true,
    });
    expect(report.results[0]?.errorMessage).toContain("requested tool exercised text_fallback");
    expect(report.results[0]?.primaryFailureReason).toContain("requested tool exercised text_fallback");
  });

  it("reports fallback JSON success as final success but not primary prompt-contract success", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: { ok: true },
      trace: {
        requestedMode: "native_schema",
        strategy: "text_fallback",
        primaryStrategy: "native_schema",
        fallbackStrategy: "text_fallback",
        fallbackReason: "native structured output rejected by provider",
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "native_schema_fallback_probe",
          requestedMode: "native_schema",
          schema: z.object({ ok: z.boolean() }),
          prompt: "Return ok using native schema mode.",
          semanticCheck: (object: unknown) => (object as { ok: boolean }).ok,
        },
      ],
    });

    expect(report.results[0]).toMatchObject({
      requestedMode: "native_schema",
      strategy: "text_fallback",
      repairUsed: false,
      fallbackOrRepairUsed: true,
      semanticPass: true,
      primaryPromptContractSuccess: false,
      success: true,
    });
    expect(report.results[0]?.primaryFailureReason).toContain("fallback used");
  });

  it("reports requested-mode mismatch separately from final validation success", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: { ok: true },
      trace: {
        requestedMode: "tool",
        strategy: "native_json",
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "tool_strategy_mismatch_probe",
          requestedMode: "tool",
          schema: z.object({ ok: z.boolean() }),
          prompt: "Return ok using tool mode.",
          semanticCheck: (object: unknown) => (object as { ok: boolean }).ok,
        },
      ],
    });

    expect(report.results[0]).toMatchObject({
      requestedMode: "tool",
      strategy: "native_json",
      fallbackOrRepairUsed: false,
      semanticPass: true,
      primaryPromptContractSuccess: false,
      success: true,
    });
    expect(report.results[0]?.primaryFailureReason).toContain("requested tool exercised native_json");
  });

  it("includes representative WorldForge structured-output cases", () => {
    expect(buildDefaultStructuredOutputConformanceCases().map((testCase) => testCase.schemaId)).toEqual([
      "generated_context_citations_canonicalNames",
      "semantic_scene_plan_actions",
      "runtime_tool_input_quick_actions",
      "oracle_overlong_rationale",
      "power_stats_axes",
      "worldbook_source_filter_selection",
      "script_personality_output_shape",
      "npc_offscreen_updates",
      "context_compression_indices",
      "external_metadata_caps",
      "enum_tool_selection",
      "id_reference_mapping",
    ]);
  });

  it("maps every sanitized malformed-output fixture to a rejecting conformance case", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(failureFixturesDir, "manifest.json"), "utf8"),
    ) as { fixtures: Array<{ fixtureId: string }> };
    const cases = buildDefaultStructuredOutputConformanceCases();
    const caseFixtureIds = cases.flatMap((testCase) => testCase.fixtureIds ?? []);
    const requiredFixtureIds = [
      "kimi-citations-string",
      "mimo-canonical-names-string",
      "deepseek-scene-plan-missing-action",
      "deepseek-payload-vs-input",
      "glm-overlong-rationale",
      "unsupported-tool-name",
      "lazy-power-stats",
    ];

    expect(manifest.fixtures.map((fixture) => fixture.fixtureId)).toEqual(requiredFixtureIds);
    expect(caseFixtureIds).toEqual(expect.arrayContaining(requiredFixtureIds));

    for (const fixtureId of requiredFixtureIds) {
      const testCase = cases.find((candidate) => candidate.fixtureIds?.includes(fixtureId));
      if (!testCase) throw new Error(`No conformance case maps fixture ${fixtureId}`);
      const fixture = readFailureFixture(fixtureId);
      const parsed = testCase.schema.safeParse(fixture.malformedObject);
      const semantic = parsed.success
        ? await testCase.semanticCheck?.(parsed.data as never)
        : undefined;
      const semanticPass = typeof semantic === "boolean" ? semantic : semantic?.pass;

      expect(parsed.success && semanticPass !== false).toBe(false);
    }
  });

  it("rejects semantic scene plan conformance without planned actions", async () => {
    const testCase = buildDefaultStructuredOutputConformanceCases().find(
      (candidate) => candidate.schemaId === "semantic_scene_plan_actions",
    );
    if (!testCase) throw new Error("semantic_scene_plan_actions case missing");

    const emptyActionsOutput = {
      actionInterpretation: {
        actorRef: "player",
        intent: "address Satoru Gojo",
        targetRefs: ["satoru_gojo"],
      },
      plannedActions: [],
    };

    expect(testCase.schema.safeParse(emptyActionsOutput).success).toBe(false);
    const semantic = await testCase.semanticCheck?.(emptyActionsOutput as never);
    expect(typeof semantic === "boolean" ? semantic : semantic?.pass).toBe(false);
  });

  it("does not require model output to include backend-owned search job IDs", () => {
    const testCase = buildDefaultStructuredOutputConformanceCases().find(
      (candidate) => candidate.schemaId === "external_metadata_caps",
    );
    if (!testCase) throw new Error("external_metadata_caps case missing");

    const parsed = testCase.schema.safeParse({
      searchResults: [
        {
          title: "Tokyo Jujutsu High",
          description: "A capped snippet that backend search code can attach to a deterministic job.",
          url: "https://example.test/tokyo-jujutsu-high",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("reports semantic validation failure without mutating campaign state", async () => {
    const campaignState = {
      tick: 7,
      actors: ["player", "gojo"],
    };
    const beforeState = JSON.stringify(campaignState);
    mockSafeGenerateObject.mockResolvedValue({
      object: { hp: 99 },
      trace: {
        requestedMode: "auto",
        strategy: "text_fallback",
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "mock-provider",
          providerName: "Mock Provider",
          protocol: "openai-compatible",
          model: "mock-model",
          languageModel: { modelId: "mock-model" } as never,
        },
      ],
      cases: [
        {
          schemaId: "semantic_failure_probe",
          schema: z.object({ hp: z.number() }),
          prompt: "Return HP inside the legal range.",
          semanticCheck: (object: unknown) => ({
            pass: (object as { hp: number }).hp >= 0 && (object as { hp: number }).hp <= 5,
            message: "hp must stay inside deterministic backend bounds",
          }),
        },
      ],
    });

    expect(report.results[0]).toMatchObject({
      success: false,
      errorType: "semantic_validation",
      semanticPass: false,
      primaryPromptContractSuccess: false,
    });
    expect(report.results[0]?.primaryFailureReason).toContain("hp must stay inside deterministic backend bounds");
    expect(JSON.stringify(campaignState)).toBe(beforeState);
  });

  it("keeps the conformance module non-mutating and reports no apiKey secret fields", async () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/ai/structured-output-conformance.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\bgetDb\b/);
    expect(source).not.toMatch(/\bexecuteToolCall\b/);
    expect(source).not.toMatch(/campaign\/manager|campaigns\/|routes\//);

    mockSafeGenerateObject.mockResolvedValue({
      object: { ok: true },
      trace: {
        requestedMode: "auto",
        strategy: "text_fallback",
      },
    });

    const report = await runStructuredOutputConformance({
      providers: [
        {
          providerId: "secret-provider",
          providerName: "Secret Provider",
          protocol: "openai-compatible",
          model: "secret-model",
          languageModel: { modelId: "secret-model" } as never,
          apiKey: "sk-should-not-appear",
        } as never,
      ],
      cases: [
        {
          schemaId: "secret_probe",
          schema: z.object({ ok: z.boolean() }),
          prompt: "Return ok.",
          semanticCheck: (object: unknown) => (object as { ok: boolean }).ok,
        },
      ],
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("sk-should-not-appear");
    expect(serialized).not.toContain("apiKey");
  });

  it("CLI returns a skipped report without reading settings when live conformance is not enabled", async () => {
    const { runStructuredOutputConformanceCli } = await import("../../scripts/structured-output-conformance.js");
    const output: string[] = [];
    const readSettingsText = vi.fn();

    const exitCode = await runStructuredOutputConformanceCli({
      env: {},
      write: (text: string) => output.push(text),
      readSettingsText,
    });

    expect(exitCode).toBe(0);
    expect(readSettingsText).not.toHaveBeenCalled();
    expect(JSON.parse(output.join(""))).toMatchObject({
      skipped: true,
      summary: {
        total: 0,
      },
    });
  });

  it("CLI reads configured providers only in live mode and strips apiKey values from output", async () => {
    const { runStructuredOutputConformanceCli } = await import("../../scripts/structured-output-conformance.js");
    const output: string[] = [];
    const observedProviders: unknown[] = [];

    const exitCode = await runStructuredOutputConformanceCli({
      env: {
        WORLDFORGE_LIVE_PROVIDER_CONFORMANCE: "1",
      },
      write: (text: string) => output.push(text),
      readSettingsText: () => JSON.stringify({
        providers: [
          {
            id: "live-provider",
            name: "Live Provider",
            baseUrl: "https://provider.example/v1",
            apiKey: "sk-live-secret",
            defaultModel: "live-model",
          },
        ],
        judge: {
          providerId: "live-provider",
          model: "live-model",
        },
      }),
      runConformance: async ({ providers }: { providers: unknown[] }) => {
        observedProviders.push(...providers);
        return {
          generatedAt: "2026-04-27T00:00:00.000Z",
          summary: {
            providers: providers.length,
            cases: 0,
            total: 0,
            passed: 0,
            failed: 0,
            semanticFailed: 0,
          },
          results: [],
        };
      },
    });

    const serialized = output.join("");
    expect(exitCode).toBe(0);
    expect(mockCreateModel).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "sk-live-secret",
      model: "live-model",
    }));
    expect(observedProviders).toHaveLength(1);
    expect(serialized).not.toContain("sk-live-secret");
    expect(serialized).not.toContain("apiKey");
  });

  it("CLI skips inactive remote builtin providers without credentials in live mode", async () => {
    const { runStructuredOutputConformanceCli } = await import("../../scripts/structured-output-conformance.js");
    const output: string[] = [];
    const observedProviders: Array<{ providerId?: string }> = [];

    const exitCode = await runStructuredOutputConformanceCli({
      env: {
        WORLDFORGE_LIVE_PROVIDER_CONFORMANCE: "1",
      },
      write: (text: string) => output.push(text),
      readSettingsText: () => JSON.stringify({
        providers: [
          {
            id: "builtin-openai",
            name: "OpenAI",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            defaultModel: "gpt-4o-mini",
          },
          {
            id: "custom-active",
            name: "Custom Active",
            baseUrl: "https://provider.example/v1",
            apiKey: "sk-active-secret",
            defaultModel: "active-model",
          },
        ],
        judge: {
          providerId: "custom-active",
          model: "active-model",
        },
      }),
      runConformance: async ({ providers }: { providers: Array<{ providerId?: string }> }) => {
        observedProviders.push(...providers);
        return {
          generatedAt: "2026-04-27T00:00:00.000Z",
          summary: {
            providers: providers.length,
            cases: 0,
            total: 0,
            passed: 0,
            failed: 0,
            semanticFailed: 0,
          },
          results: [],
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(observedProviders.map((provider) => provider.providerId)).toEqual(["custom-active"]);
    expect(JSON.stringify(output)).not.toContain("sk-active-secret");
  });

  it("CLI tests distinct active structured role models instead of provider defaults", async () => {
    const { runStructuredOutputConformanceCli } = await import("../../scripts/structured-output-conformance.js");
    const observedProviders: Array<{ model?: string }> = [];

    const exitCode = await runStructuredOutputConformanceCli({
      env: {
        WORLDFORGE_LIVE_PROVIDER_CONFORMANCE: "1",
      },
      write: () => {},
      readSettingsText: () => JSON.stringify({
        providers: [
          {
            id: "shared-provider",
            name: "Shared Provider",
            baseUrl: "https://provider.example/v1",
            apiKey: "sk-active-secret",
            defaultModel: "default-prose-model",
          },
        ],
        judge: {
          providerId: "shared-provider",
          model: "judge-structured-model",
        },
        generator: {
          providerId: "shared-provider",
          model: "generator-structured-model",
        },
        storyteller: {
          providerId: "shared-provider",
          model: "storyteller-prose-model",
        },
      }),
      runConformance: async ({ providers }: { providers: Array<{ model?: string }> }) => {
        observedProviders.push(...providers);
        return {
          generatedAt: "2026-04-28T00:00:00.000Z",
          summary: {
            providers: providers.length,
            cases: 0,
            total: 0,
            passed: 0,
            failed: 0,
            semanticFailed: 0,
          },
          results: [],
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(observedProviders.map((provider) => provider.model)).toEqual([
      "judge-structured-model",
      "generator-structured-model",
    ]);
  });

  it("CLI output preserves primary-vs-repair fields and fixture IDs from reports", async () => {
    const { runStructuredOutputConformanceCli } = await import("../../scripts/structured-output-conformance.js");
    const output: string[] = [];

    const exitCode = await runStructuredOutputConformanceCli({
      env: {
        WORLDFORGE_LIVE_PROVIDER_CONFORMANCE: "1",
      },
      write: (text: string) => output.push(text),
      readSettingsText: () => JSON.stringify({
        providers: [
          {
            id: "shared-provider",
            name: "Shared Provider",
            baseUrl: "https://provider.example/v1",
            apiKey: "sk-active-secret",
            defaultModel: "default-prose-model",
          },
        ],
        judge: {
          providerId: "shared-provider",
          model: "judge-structured-model",
        },
      }),
      runConformance: async () => ({
        generatedAt: "2026-04-28T00:00:00.000Z",
        summary: {
          providers: 1,
          cases: 1,
          total: 1,
          passed: 1,
          failed: 0,
          semanticFailed: 0,
        },
        results: [
          {
            providerId: "shared-provider",
            providerName: "Shared Provider",
            protocol: "openai-compatible",
            model: "judge-structured-model",
            schemaId: "generated_context_citations_canonicalNames",
            fixtureIds: ["kimi-citations-string"],
            requestedMode: "native_schema",
            strategy: "repair",
            latencyMs: 42,
            repairUsed: true,
            fallbackOrRepairUsed: true,
            semanticPass: true,
            primaryPromptContractSuccess: false,
            primaryFailureReason: "repair used after text_fallback",
            success: true,
          },
        ],
      }),
    });

    const serialized = output.join("");
    const parsed = JSON.parse(serialized) as {
      results: Array<{
        fixtureIds?: string[];
        fallbackOrRepairUsed?: boolean;
        primaryPromptContractSuccess?: boolean;
        primaryFailureReason?: string;
      }>;
    };

    expect(exitCode).toBe(0);
    expect(serialized).not.toContain("sk-active-secret");
    expect(parsed.results[0]).toMatchObject({
      fixtureIds: ["kimi-citations-string"],
      fallbackOrRepairUsed: true,
      primaryPromptContractSuccess: false,
      primaryFailureReason: "repair used after text_fallback",
    });
  });

  it("exposes the backend structured-output conformance npm script", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["structured-output:conformance"]).toBe(
      "tsx src/scripts/structured-output-conformance.ts",
    );
  });
});
