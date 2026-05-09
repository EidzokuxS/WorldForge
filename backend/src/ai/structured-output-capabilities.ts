export type StructuredOutputPrimaryStrategy =
  | "native_schema"
  | "native_json"
  | "tool_mode"
  | "text_fallback";

export type StructuredOutputTraceStrategy =
  | StructuredOutputPrimaryStrategy
  | "repair"
  | "full_retry";

export type StructuredOutputRequestedMode =
  | "auto"
  | "json"
  | "tool"
  | "native_schema"
  | "native_json"
  | "tool_mode"
  | "text_fallback";

export type StructuredOutputProtocol =
  | "openai-compatible"
  | "anthropic-compatible";

export type StructuredOutputTransport =
  | "chat-completions"
  | "anthropic-messages";

export interface StructuredOutputModelMetadata {
  providerId?: string;
  providerName?: string;
  model: string;
  protocol: StructuredOutputProtocol;
  baseUrlFamily: string;
  transport: StructuredOutputTransport;
  capabilityKey: string;
}

export interface StructuredOutputCapabilityDecision {
  primaryStrategy: StructuredOutputPrimaryStrategy;
  fallbackStrategy: "text_fallback";
  requestedMode: StructuredOutputRequestedMode;
  actualMode: StructuredOutputPrimaryStrategy;
  reason: string;
  capabilityKey?: string;
}

export interface ResolveStructuredOutputCapabilityInput {
  metadata?: StructuredOutputModelMetadata | null;
  requestedMode?: StructuredOutputRequestedMode;
}

export interface BuildStructuredOutputModelMetadataInput {
  providerId?: string;
  providerName?: string;
  model: string;
  protocol: StructuredOutputProtocol;
  baseUrl: string;
  transport: StructuredOutputTransport;
}

const metadataByModel = new WeakMap<object, StructuredOutputModelMetadata>();

function cleanIdentityPart(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeStructuredOutputBaseUrlFamily(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export function buildStructuredOutputCapabilityKey(
  metadata: Omit<StructuredOutputModelMetadata, "capabilityKey">,
): string {
  return [
    `provider:${metadata.providerId ?? "unknown"}`,
    `providerName:${metadata.providerName ?? "unknown"}`,
    `model:${metadata.model}`,
    `protocol:${metadata.protocol}`,
    `baseUrlFamily:${metadata.baseUrlFamily}`,
    `transport:${metadata.transport}`,
  ].join("|");
}

export function buildStructuredOutputModelMetadata(
  input: BuildStructuredOutputModelMetadataInput,
): StructuredOutputModelMetadata {
  const metadataWithoutKey = {
    providerId: cleanIdentityPart(input.providerId),
    providerName: cleanIdentityPart(input.providerName),
    model: input.model,
    protocol: input.protocol,
    baseUrlFamily: normalizeStructuredOutputBaseUrlFamily(input.baseUrl),
    transport: input.transport,
  } satisfies Omit<StructuredOutputModelMetadata, "capabilityKey">;

  return {
    ...metadataWithoutKey,
    capabilityKey: buildStructuredOutputCapabilityKey(metadataWithoutKey),
  };
}

export function rememberStructuredOutputModelMetadata(
  model: unknown,
  metadata: StructuredOutputModelMetadata,
): void {
  if (!model || typeof model !== "object") return;
  metadataByModel.set(model, metadata);
}

export function getStructuredOutputModelMetadata(
  model: unknown,
): StructuredOutputModelMetadata | undefined {
  if (!model || typeof model !== "object") return undefined;
  return metadataByModel.get(model);
}

function resolvePrimaryStrategy(
  requestedMode: StructuredOutputRequestedMode,
  metadata?: StructuredOutputModelMetadata | null,
): StructuredOutputPrimaryStrategy {
  if (!metadata) return "text_fallback";

  switch (requestedMode) {
    case "json":
    case "native_json":
      return "native_json";
    case "tool":
    case "tool_mode":
      return "tool_mode";
    case "text_fallback":
      return "text_fallback";
    case "native_schema":
      return "native_schema";
    case "auto":
      return prefersJsonObjectMode(metadata) ? "native_json" : "native_schema";
  }
}

function prefersJsonObjectMode(metadata: StructuredOutputModelMetadata): boolean {
  return (
    metadata.protocol === "openai-compatible" &&
    metadata.transport === "chat-completions" &&
    metadata.baseUrlFamily === "opencode.ai"
  );
}

export function resolveStructuredOutputCapability(
  input: ResolveStructuredOutputCapabilityInput,
): StructuredOutputCapabilityDecision {
  const requestedMode = input.requestedMode ?? "auto";
  const primaryStrategy = resolvePrimaryStrategy(requestedMode, input.metadata);
  const metadataLabel = input.metadata
    ? input.metadata.capabilityKey
    : "unknown-provider-model";

  return {
    primaryStrategy,
    fallbackStrategy: "text_fallback",
    requestedMode,
    actualMode: primaryStrategy,
    capabilityKey: input.metadata?.capabilityKey,
    reason:
      primaryStrategy === "text_fallback" && !input.metadata
        ? "No provider/model metadata is registered; using explicit text fallback."
        : `Resolved ${requestedMode} to ${primaryStrategy} for ${metadataLabel}.`,
  };
}
