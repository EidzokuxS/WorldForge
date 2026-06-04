import type { LanguageModel } from "ai";
import { z, type ZodType } from "zod";
import { worldgenResearchArtifactSchema } from "../worldgen/research-artifact.js";
import { safeGenerateObject, type SafeGenerateTrace } from "./generate-object-safe.js";
import type { ProviderProtocol } from "./provider-registry.js";
import type {
  StructuredOutputRequestedMode,
  StructuredOutputTraceStrategy,
} from "./structured-output-capabilities.js";

export interface StructuredOutputSemanticCheckResult {
  pass: boolean;
  message?: string;
}

export interface StructuredOutputConformanceCase<TOutput = unknown> {
  schemaId: string;
  fixtureIds?: string[];
  schema: ZodType<TOutput>;
  prompt: string;
  system?: string;
  requestedMode?: StructuredOutputRequestedMode;
  semanticCheck?: (
    object: TOutput,
  ) => boolean | StructuredOutputSemanticCheckResult | Promise<boolean | StructuredOutputSemanticCheckResult>;
}

export interface StructuredOutputConformanceProvider {
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  model: string;
  languageModel: LanguageModel;
  requestedMode?: StructuredOutputRequestedMode;
}

export interface StructuredOutputConformanceResult {
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  model: string;
  schemaId: string;
  fixtureIds: string[];
  requestedMode: StructuredOutputRequestedMode;
  strategy?: StructuredOutputTraceStrategy;
  latencyMs: number;
  usage?: SafeGenerateTrace["usage"];
  errorType?: string;
  errorMessage?: string;
  repairUsed: boolean;
  fallbackOrRepairUsed: boolean;
  semanticPass: boolean;
  primaryPromptContractSuccess: boolean;
  primaryFailureReason?: string;
  success: boolean;
}

export interface StructuredOutputConformanceReport {
  generatedAt: string;
  skipped?: boolean;
  summary: {
    providers: number;
    cases: number;
    total: number;
    passed: number;
    failed: number;
    semanticFailed: number;
  };
  results: StructuredOutputConformanceResult[];
}

export interface RunStructuredOutputConformanceInput {
  providers: StructuredOutputConformanceProvider[];
  cases?: StructuredOutputConformanceCase[];
  generatedAt?: string;
}

const generatedContextSchema = worldgenResearchArtifactSchema.shape.generatedContext;
const CONFORMANCE_MAX_OUTPUT_TOKENS = 1800;
const CONFORMANCE_TIMEOUT_MS = 60000;
const STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS = {
  kimiCitationsString: "kimi-citations-string",
  mimoCanonicalNamesString: "mimo-canonical-names-string",
  deepseekScenePlanMissingAction: "deepseek-scene-plan-missing-action",
  deepseekPayloadVsInput: "deepseek-payload-vs-input",
  glmOverlongRationale: "glm-overlong-rationale",
  unsupportedToolName: "unsupported-tool-name",
  lazyPowerStats: "lazy-power-stats",
} as const;
const externalMetadataCapsSchema = z.object({
  searchResults: z
    .array(
      z
        .object({
          jobId: z.string().trim().min(1).max(64).optional(),
          title: z.string().trim().min(1).max(180),
          description: z.string().trim().min(1).max(700),
          url: z.string().trim().min(1).max(700),
        })
        .strict(),
    )
    .max(48),
}).strict();
const allowedToolNameSchema = z.enum(["add_tag", "log_event", "move_to", "offer_quick_actions"]);
const allowedReferenceSchema = z.enum(["player", "satoru_gojo", "tokyo_schoolyard"]);
const quickActionsInputSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            action: z.string().trim().min(1).max(220),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();

const runtimeToolQuickActionsSchema = z
  .object({
    plannedActions: z
      .array(
        z
          .object({
            actorRef: z.string().trim().min(1).max(160).optional(),
            toolName: z.literal("offer_quick_actions"),
            input: quickActionsInputSchema,
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

const semanticScenePlanActionsSchema = z
  .object({
    actionInterpretation: z
      .object({
        actorRef: z.string().trim().min(1).max(160),
        intent: z.string().trim().min(1).max(160),
        targetRefs: z.array(z.string().trim().min(1).max(160)).max(4).default([]),
      })
      .strict(),
    plannedActions: z
      .array(
        z.discriminatedUnion("toolName", [
          z
            .object({
              actorRef: z.string().trim().min(1).max(160).optional(),
              toolName: z.literal("offer_quick_actions"),
              input: quickActionsInputSchema,
            })
            .strict(),
          z
            .object({
              actorRef: z.string().trim().min(1).max(160).optional(),
              toolName: z.literal("log_event"),
              input: z
                .object({
                  text: z.string().trim().min(1).max(260),
                  importance: z.number().int().min(1).max(10).optional(),
                  participants: z.array(z.string().trim().min(1).max(120)).max(6).optional(),
                })
                .strict(),
            })
            .strict(),
          z
            .object({
              actorRef: z.string().trim().min(1).max(160).optional(),
              toolName: z.literal("move_to"),
              input: z
                .object({
                  targetLocationName: z.string().trim().min(1).max(120),
                })
                .strict(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(3),
  })
  .strict();

const oracleConformanceSchema = z
  .object({
    chance: z.number().int().min(1).max(99),
    reasoning: z.string().trim().min(1).max(500),
  })
  .strict();

const rankedTierSchema = z
  .object({
    tier: z.string().trim().min(1).max(80),
    rank: z.number().int().min(1).max(10),
  })
  .strict();

const powerStatsConformanceSchema = z
  .object({
    attackPotency: rankedTierSchema,
    speed: rankedTierSchema,
    durability: rankedTierSchema,
    intelligence: rankedTierSchema,
    hax: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            type: z.string().trim().min(1).max(80),
            bypassTier: z.string().trim().min(1).max(80).nullable(),
            limitations: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .max(8),
    vulnerabilities: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(240),
            severity: z.enum(["minor", "major", "critical"]),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const worldbookSourceFilterSchema = z
  .object({
    primarySource: z
      .object({
        sourceId: z.string().trim().min(1).max(120),
        reason: z.string().trim().min(1).max(220),
      })
      .strict()
      .nullable(),
    relevantEntries: z
      .array(
        z
          .object({
            entryId: z.string().trim().min(1).max(120),
            reason: z.string().trim().min(1).max(220),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const personalityScriptSchema = z
  .object({
    personality: z
      .object({
        summary: z.string().trim().min(1).max(600),
        voice: z.string().trim().min(1).max(500),
        decisionStyle: z.string().trim().min(1).max(500),
        worldview: z.string().trim().min(1).max(500),
        internalContradictions: z.array(z.string().trim().min(1).max(220)).max(4),
        personalMythology: z.string().trim().min(1).max(500),
        sampleLines: z.array(z.string().trim().min(20).max(240)).min(2).max(3),
      })
      .strict(),
  })
  .strict();

const npcOffscreenUpdateSchema = z
  .object({
    updates: z
      .array(
        z
          .object({
            npcName: z.string().trim().min(1).max(120),
            newLocation: z.string().trim().min(1).max(120).nullable(),
            actionSummary: z.string().trim().min(1).max(260),
            goalProgress: z.string().trim().min(1).max(180).nullable(),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();

const contextCompressionSchema = z
  .object({
    importantIndices: z.array(z.number().int().min(0)).max(12),
  })
  .strict();

const idReferenceMappingSchema = z
  .object({
    references: z
      .array(
        z
          .object({
            sourceRef: allowedReferenceSchema,
            relation: z.enum(["actor", "target", "location"]),
            reason: z.string().trim().min(1).max(180),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

type GeneratedContextConformance = z.infer<typeof generatedContextSchema>;
type GeneratedContextCitation = NonNullable<GeneratedContextConformance["citations"]>[number];
type SemanticScenePlanActionsConformance = z.infer<typeof semanticScenePlanActionsSchema>;
type RuntimeToolQuickActionsConformance = z.infer<typeof runtimeToolQuickActionsSchema>;
type OracleConformance = z.infer<typeof oracleConformanceSchema>;
type PowerStatsConformance = z.infer<typeof powerStatsConformanceSchema>;
type WorldbookSourceFilterConformance = z.infer<typeof worldbookSourceFilterSchema>;
type PersonalityScriptConformance = z.infer<typeof personalityScriptSchema>;
type NpcOffscreenUpdateConformance = z.infer<typeof npcOffscreenUpdateSchema>;
type ContextCompressionConformance = z.infer<typeof contextCompressionSchema>;
type ExternalMetadataCapsConformance = z.infer<typeof externalMetadataCapsSchema>;
type EnumToolSelectionConformance = {
  selectedTool: z.infer<typeof allowedToolNameSchema>;
  reason: string;
};
type IdReferenceMappingConformance = z.infer<typeof idReferenceMappingSchema>;

function semanticResult(
  value: boolean | StructuredOutputSemanticCheckResult | undefined,
): StructuredOutputSemanticCheckResult {
  if (value === undefined) return { pass: true };
  if (typeof value === "boolean") return { pass: value };
  return value;
}

function compactError(error: unknown): { errorType: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorType: error.name || "Error",
      errorMessage: error.message.slice(0, 280),
    };
  }

  return {
    errorType: typeof error,
    errorMessage: String(error).slice(0, 280),
  };
}

function requestedModeFor(
  provider: StructuredOutputConformanceProvider,
  testCase: StructuredOutputConformanceCase,
): StructuredOutputRequestedMode {
  return testCase.requestedMode ?? provider.requestedMode ?? "auto";
}

function modeForSafeGenerateObject(
  requestedMode: StructuredOutputRequestedMode,
): StructuredOutputRequestedMode | undefined {
  if (requestedMode === "auto") return undefined;
  return requestedMode;
}

function expectedStrategyForMode(
  requestedMode: StructuredOutputRequestedMode,
): StructuredOutputTraceStrategy | undefined {
  switch (requestedMode) {
    case "json":
    case "native_json":
      return "native_json";
    case "tool":
    case "tool_mode":
      return "tool_mode";
    case "native_schema":
      return "native_schema";
    case "text_fallback":
      return "text_fallback";
    case "auto":
      return undefined;
  }
}

function exercisedStrategyForTrace(trace: SafeGenerateTrace): StructuredOutputTraceStrategy | undefined {
  if (trace.strategy === "repair") {
    return trace.repairedFromStrategy;
  }
  return trace.strategy;
}

function fallbackUsedForTrace(
  trace: SafeGenerateTrace,
  expectedStrategy: StructuredOutputTraceStrategy | undefined,
): boolean {
  if (trace.fallbackReason) return true;
  if (trace.primaryStrategy && trace.primaryStrategy !== "text_fallback" && trace.strategy === "text_fallback") {
    return true;
  }
  if (expectedStrategy && expectedStrategy !== "text_fallback" && trace.strategy === "text_fallback") {
    return true;
  }
  return false;
}

function strategyMismatchReason(
  requestedMode: StructuredOutputRequestedMode,
  trace: SafeGenerateTrace,
): string {
  const exercisedStrategy = exercisedStrategyForTrace(trace) ?? trace.strategy ?? "unknown";
  return `requested ${requestedMode} exercised ${exercisedStrategy}`;
}

function primaryFailureReasonFor(input: {
  semantic: StructuredOutputSemanticCheckResult;
  strategyPass: boolean;
  requestedMode: StructuredOutputRequestedMode;
  trace: SafeGenerateTrace;
  fallbackUsed: boolean;
  repairUsed: boolean;
}): string | undefined {
  if (!input.semantic.pass) {
    return input.semantic.message?.slice(0, 280) ?? "semantic validation failed";
  }

  if (input.fallbackUsed && input.trace.fallbackReason) {
    return `fallback used: ${input.trace.fallbackReason.slice(0, 240)}`;
  }

  if (!input.strategyPass) {
    return strategyMismatchReason(input.requestedMode, input.trace);
  }

  if (input.repairUsed) {
    const repairedFrom = input.trace.repairedFromStrategy ?? input.trace.repair?.strategy ?? "unknown";
    return `repair used after ${repairedFrom}`;
  }

  if (input.fallbackUsed) {
    return `fallback used: ${strategyMismatchReason(input.requestedMode, input.trace)}`;
  }

  return undefined;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildDefaultStructuredOutputConformanceCases(): StructuredOutputConformanceCase[] {
  const cases = [
    {
      schemaId: "generated_context_citations_canonicalNames",
      fixtureIds: [
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.kimiCitationsString,
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.mimoCanonicalNamesString,
      ],
      schema: generatedContextSchema,
      system: "Return one compact JSON object only. Keep arrays as short as the prompt allows.",
      prompt: [
        "Return generatedContext for a Jujutsu Kaisen school scene with Naruto chakra overlay.",
        "Use exactly one keyFacts string and one tonalNotes string.",
        "Return exactly one citations object with jobId jjk-context and a short note.",
        "Return canonicalNames as an object with locations, factions, and characters arrays; use one name per array.",
        "Do not add markdown or prose outside JSON.",
      ].join(" "),
      semanticCheck: (object: GeneratedContextConformance) => ({
        pass:
          Array.isArray(object.keyFacts) &&
          Array.isArray(object.tonalNotes) &&
          (object.citations ?? []).every((citation: GeneratedContextCitation) => typeof citation.note === "string") &&
          (
            object.canonicalNames === undefined ||
            ["locations", "factions", "characters"].some((key) => {
              const value = object.canonicalNames?.[key as keyof NonNullable<typeof object.canonicalNames>];
              return Array.isArray(value);
            })
          ),
        message: "generated context must keep citations as objects and canonicalNames as grouped arrays",
      }),
    } satisfies StructuredOutputConformanceCase<GeneratedContextConformance>,
    {
      schemaId: "semantic_scene_plan_actions",
      fixtureIds: [
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.deepseekPayloadVsInput,
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.unsupportedToolName,
      ],
      schema: semanticScenePlanActionsSchema,
      prompt: [
        "Return a semantic scene plan action where the player addresses Satoru Gojo.",
        "Use allowed tool names only, and put tool arguments in input, never payload.",
      ].join(" "),
      semanticCheck: (object: SemanticScenePlanActionsConformance) => ({
        pass:
          object.plannedActions.length > 0 &&
          object.plannedActions.every((action: SemanticScenePlanActionsConformance["plannedActions"][number]) => allowedToolNameSchema.safeParse(action.toolName).success) &&
          object.plannedActions.every((action: SemanticScenePlanActionsConformance["plannedActions"][number]) => action.input !== undefined),
        message: "semantic scene actions must include allowed tool names and a primary input shape",
      }),
    } satisfies StructuredOutputConformanceCase<SemanticScenePlanActionsConformance>,
    {
      schemaId: "runtime_tool_input_quick_actions",
      fixtureIds: [
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.deepseekScenePlanMissingAction,
      ],
      schema: runtimeToolQuickActionsSchema,
      prompt: [
        "Return one planned offer_quick_actions tool call.",
        "Each quick action must include label and full action text.",
        "Use input.actions only; do not omit actions[].action.",
      ].join(" "),
      semanticCheck: (object: RuntimeToolQuickActionsConformance) => ({
        pass: object.plannedActions.every((plannedAction) =>
          plannedAction.input.actions.every((quickAction) => quickAction.action.trim().length > 0),
        ),
        message: "quick actions must include executable actions[].action text",
      }),
    } satisfies StructuredOutputConformanceCase<RuntimeToolQuickActionsConformance>,
    {
      schemaId: "oracle_overlong_rationale",
      fixtureIds: [
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.glmOverlongRationale,
      ],
      schema: oracleConformanceSchema,
      prompt: [
        "Return one Oracle object for a risky ward inspection.",
        "Use chance 1-99 and reasoning under 500 chars.",
        "Do not return outcome, confidence, visibleResult, or narrative prose.",
      ].join(" "),
      semanticCheck: (object: OracleConformance) => ({
        pass: object.reasoning.length <= 500 && object.chance > 0 && object.chance < 100,
        message: "oracle output must stay inside chance and reasoning caps",
      }),
    } satisfies StructuredOutputConformanceCase<OracleConformance>,
    {
      schemaId: "power_stats_axes",
      fixtureIds: [
        STRUCTURED_OUTPUT_FAILURE_FIXTURE_IDS.lazyPowerStats,
      ],
      schema: powerStatsConformanceSchema,
      prompt: [
        "Return one PowerStats object from explicit evidence.",
        "Include attackPotency, speed, durability, intelligence, hax, and vulnerabilities.",
        "Do not use vague labels such as godlike, fast, unknown, or many.",
      ].join(" "),
      semanticCheck: (object: PowerStatsConformance) => ({
        pass:
          [object.attackPotency, object.speed, object.durability, object.intelligence]
            .every((axis) => axis.rank >= 1 && axis.rank <= 10 && axis.tier.trim().length > 0) &&
          Array.isArray(object.hax) &&
          Array.isArray(object.vulnerabilities),
        message: "power stats must include all ranked axes plus hax/vulnerability arrays",
      }),
    } satisfies StructuredOutputConformanceCase<PowerStatsConformance>,
    {
      schemaId: "worldbook_source_filter_selection",
      schema: worldbookSourceFilterSchema,
      prompt: [
        "Select relevant worldbook source entries from provided IDs source-a and entry-1/entry-2.",
        "Return primarySource as null or a provided sourceId, plus relevantEntries from provided entry IDs only.",
        "Do not invent source identity or lore absent from the entries.",
      ].join(" "),
      semanticCheck: (object: WorldbookSourceFilterConformance) => ({
        pass:
          (object.primarySource === null || ["source-a", "source-b"].includes(object.primarySource.sourceId)) &&
          object.relevantEntries.every((entry) => ["entry-1", "entry-2", "entry-3"].includes(entry.entryId)),
        message: "worldbook source/filter selection must use provided source and entry IDs only",
      }),
    } satisfies StructuredOutputConformanceCase<WorldbookSourceFilterConformance>,
    {
      schemaId: "script_personality_output_shape",
      schema: personalityScriptSchema,
      prompt: [
        "Return a backfill personality object for an existing character record.",
        "Include summary, voice, decisionStyle, worldview, internalContradictions, personalMythology, and 2-3 sampleLines.",
        "Use only supplied source record facts; do not invent unsupported history.",
      ].join(" "),
      semanticCheck: (object: PersonalityScriptConformance) => ({
        pass:
          object.personality.summary.trim().length > 0 &&
          object.personality.sampleLines.length >= 2 &&
          object.personality.sampleLines.every((line) => line.length >= 20),
        message: "script personality output must include the full personality pack and sample lines",
      }),
    } satisfies StructuredOutputConformanceCase<PersonalityScriptConformance>,
    {
      schemaId: "npc_offscreen_updates",
      schema: npcOffscreenUpdateSchema,
      prompt: [
        "Return offscreen updates for listed NPCs Lord Blackwood and Mira only.",
        "Use updates [] when no specific offscreen action is justified.",
        "Do not invent unknown NPCs, locations, goals, or relationship facts.",
      ].join(" "),
      semanticCheck: (object: NpcOffscreenUpdateConformance) => ({
        pass: object.updates.every((update) =>
          ["Lord Blackwood", "Mira"].includes(update.npcName) &&
          !/maintained their position/i.test(update.actionSummary),
        ),
        message: "offscreen updates must name listed NPCs and specific supplied actions only",
      }),
    } satisfies StructuredOutputConformanceCase<NpcOffscreenUpdateConformance>,
    {
      schemaId: "context_compression_indices",
      schema: contextCompressionSchema,
      prompt: [
        "Return importantIndices from numbered middle messages 0 through 7.",
        "Return indices only, max 12 values, and use [] when nothing is important.",
        "Do not summarize, rewrite, or invent memory/lore content.",
      ].join(" "),
      semanticCheck: (object: ContextCompressionConformance) => ({
        pass: object.importantIndices.every((index) => index >= 0 && index <= 7),
        message: "context compression must select only existing numbered indices",
      }),
    } satisfies StructuredOutputConformanceCase<ContextCompressionConformance>,
    {
      schemaId: "external_metadata_caps",
      schema: externalMetadataCapsSchema,
      prompt: [
        "Return external search metadata for two capped search results.",
        "Descriptions and URLs must stay inside backend validation caps.",
        "Do not invent backend job IDs; backend search code attaches jobId when needed.",
      ].join(" "),
      semanticCheck: (object: ExternalMetadataCapsConformance) => ({
        pass:
          object.searchResults.length <= 48 &&
          object.searchResults.every((result: ExternalMetadataCapsConformance["searchResults"][number]) =>
            (result.jobId === undefined || result.jobId.length <= 64) &&
            result.title.length <= 180 &&
            result.description.length <= 700 &&
            result.url.length <= 700,
          ),
        message: "external metadata must stay inside backend cap validation",
      }),
    } satisfies StructuredOutputConformanceCase<ExternalMetadataCapsConformance>,
    {
      schemaId: "enum_tool_selection",
      schema: z
        .object({
          selectedTool: allowedToolNameSchema,
          reason: z.string().trim().min(1).max(180),
        })
        .strict(),
      prompt: "Select exactly one allowed runtime tool name for recording a memory event. Return selectedTool and reason only.",
      semanticCheck: (object: EnumToolSelectionConformance) => ({
        pass: allowedToolNameSchema.safeParse(object.selectedTool).success,
        message: "tool selection must stay inside the allowed enum",
      }),
    } satisfies StructuredOutputConformanceCase<EnumToolSelectionConformance>,
    {
      schemaId: "id_reference_mapping",
      schema: idReferenceMappingSchema,
      prompt: [
        "Return exactly one semantic reference: sourceRef player, relation actor, reason under 80 characters.",
        "Use semantic labels only; do not invent backend UUIDs because backend code derives final IDs.",
      ].join(" "),
      semanticCheck: (object: IdReferenceMappingConformance) => ({
        pass: object.references.every((reference: IdReferenceMappingConformance["references"][number]) => !isUuidLike(reference.sourceRef)),
        message: "model output must use semantic references rather than backend-owned UUIDs",
      }),
    } satisfies StructuredOutputConformanceCase<IdReferenceMappingConformance>,
  ];

  return cases as StructuredOutputConformanceCase[];
}

export async function runStructuredOutputConformance(
  input: RunStructuredOutputConformanceInput,
): Promise<StructuredOutputConformanceReport> {
  const cases = input.cases ?? buildDefaultStructuredOutputConformanceCases();
  const results: StructuredOutputConformanceResult[] = [];

  for (const provider of input.providers) {
    for (const testCase of cases) {
      const requestedMode = requestedModeFor(provider, testCase);
      const startedAt = Date.now();

      try {
        const generation = await safeGenerateObject({
          model: provider.languageModel,
          schema: testCase.schema,
          system: testCase.system,
          prompt: testCase.prompt,
          mode: modeForSafeGenerateObject(requestedMode),
          maxOutputTokens: CONFORMANCE_MAX_OUTPUT_TOKENS,
          timeout: {
            totalMs: CONFORMANCE_TIMEOUT_MS,
          },
          retries: 1,
        });
        const semantic = semanticResult(
          await testCase.semanticCheck?.(generation.object),
        );
        const repairUsed = generation.trace.strategy === "repair" || generation.trace.repair !== undefined;
        const expectedStrategy = expectedStrategyForMode(requestedMode);
        const exercisedStrategy = exercisedStrategyForTrace(generation.trace);
        const strategyPass =
          expectedStrategy === undefined ||
          exercisedStrategy === expectedStrategy;
        const fallbackUsed = fallbackUsedForTrace(generation.trace, expectedStrategy);
        const fallbackOrRepairUsed = fallbackUsed || repairUsed;
        const primaryFailureReason = primaryFailureReasonFor({
          semantic,
          strategyPass,
          requestedMode,
          trace: generation.trace,
          fallbackUsed,
          repairUsed,
        });
        const primaryPromptContractSuccess = semantic.pass && strategyPass && !fallbackOrRepairUsed;
        const success = semantic.pass;

        results.push({
          providerId: provider.providerId,
          providerName: provider.providerName,
          protocol: provider.protocol,
          model: provider.model,
          schemaId: testCase.schemaId,
          fixtureIds: testCase.fixtureIds ?? [],
          requestedMode,
          strategy: generation.trace.strategy,
          latencyMs: Date.now() - startedAt,
          usage: generation.trace.usage,
          errorType: !semantic.pass
            ? "semantic_validation"
            : strategyPass
              ? undefined
              : "strategy_mismatch",
          errorMessage: !semantic.pass
            ? semantic.message?.slice(0, 280)
            : strategyPass
              ? undefined
              : strategyMismatchReason(requestedMode, generation.trace),
          repairUsed,
          fallbackOrRepairUsed,
          semanticPass: semantic.pass,
          primaryPromptContractSuccess,
          primaryFailureReason,
          success,
        });
      } catch (error) {
        const compact = compactError(error);
        results.push({
          providerId: provider.providerId,
          providerName: provider.providerName,
          protocol: provider.protocol,
          model: provider.model,
          schemaId: testCase.schemaId,
          fixtureIds: testCase.fixtureIds ?? [],
          requestedMode,
          latencyMs: Date.now() - startedAt,
          errorType: compact.errorType,
          errorMessage: compact.errorMessage,
          repairUsed: false,
          fallbackOrRepairUsed: false,
          semanticPass: false,
          primaryPromptContractSuccess: false,
          primaryFailureReason: compact.errorMessage,
          success: false,
        });
      }
    }
  }

  const semanticFailed = results.filter((result) => result.errorType === "semantic_validation").length;
  const passed = results.filter((result) => result.success).length;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      providers: input.providers.length,
      cases: cases.length,
      total: results.length,
      passed,
      failed: results.length - passed,
      semanticFailed,
    },
    results,
  };
}
