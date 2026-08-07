import { createHash } from "node:crypto";

const MAX_PROVIDER_MESSAGE_LENGTH = 240;
const MAX_PROVIDER_COORDINATE_LENGTH = 120;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_NUMERIC_VALUE = 10_000_000;

const JSON_SCHEMA_TOP_LEVEL_KEYWORDS = new Set([
  "$comment",
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contentEncoding",
  "contentMediaType",
  "default",
  "definitions",
  "dependentRequired",
  "dependentSchemas",
  "description",
  "else",
  "enum",
  "examples",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "if",
  "items",
  "maxContains",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minContains",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "prefixItems",
  "properties",
  "propertyNames",
  "readOnly",
  "required",
  "then",
  "title",
  "type",
  "unevaluatedItems",
  "unevaluatedProperties",
  "uniqueItems",
  "writeOnly",
]);

const SAFE_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

const SAFE_THINKING_TYPES = new Set(["disabled", "enabled"]);
const SAFE_TOOL_CHOICE_TYPES = new Set(["function", "tool"]);
const SAFE_TOOL_CHOICE_VALUES = new Set(["auto", "none", "required"]);

export const ZAI_FETCH_DIAGNOSTIC_EVENT = "ai.zai_fetch.failure";

type RecordValue = Record<string, unknown>;

export interface ZaiProviderErrorMetadata {
  code?: string;
  parameter?: string;
  message?: string;
}

export interface ZaiFetchRequestMetadata {
  method: string;
  endpointClass: string;
  requestBodyShapeHash?: string;
  selectedMode?: "tool" | "native_json";
  schemaHash?: string;
  schemaKeywords?: string[];
  toolCount?: number;
  toolNameHash?: string;
  toolStrict?: boolean;
  forcedToolChoiceShape?: Record<string, unknown> | string;
  thinkingTypePresent?: boolean;
  thinkingType?: "disabled" | "enabled";
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ZaiFetchResponseMetadata {
  status: number;
  contentType?: string;
  requestId?: string;
  providerErrorCode?: string;
  providerErrorParameter?: string;
  providerErrorMessage?: string;
}

export interface ZaiFetchDiagnostic {
  request: ZaiFetchRequestMetadata;
  response?: ZaiFetchResponseMetadata;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalizeShape(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return "depth";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    const itemShapes = Array.from(
      new Set(
        value
          .slice(0, 32)
          .map((item) => JSON.stringify(canonicalizeShape(item, depth + 1))),
      ),
    ).sort();
    return {
      type: "array",
      length: value.length,
      items: itemShapes,
    };
  }

  if (isRecord(value)) {
    return {
      type: "object",
      entries: Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeShape(value[key], depth + 1)]),
    };
  }

  return typeof value;
}

function canonicalizeJson(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return "depth";
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key], depth + 1)]),
    );
  }

  return value;
}

export function hashZaiRequestShape(value: unknown): string {
  return hashText(JSON.stringify(canonicalizeShape(value)));
}

function hashZaiCanonicalJson(value: unknown): string {
  return hashText(JSON.stringify(canonicalizeJson(value)));
}

function sanitizeToken(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maxLength ||
    !/^[A-Za-z0-9._:/-]+$/.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function sanitizeParameter(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  const isJsonPointer = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(trimmed);
  const isDottedPath = /^(?:[A-Za-z0-9._-]+|(?:[A-Za-z0-9._-]+|\[\d+\])+(?:\.[A-Za-z0-9._-]+|\[\d+\])*)$/.test(
    trimmed,
  );
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_PROVIDER_COORDINATE_LENGTH ||
    (!isJsonPointer && !isDottedPath)
  ) {
    return undefined;
  }
  return trimmed;
}

function sanitizeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_PROVIDER_MESSAGE_LENGTH ||
    /api[\s_-]*key|authorization|bearer|cookie|password|secret|prompt|player|prose|actor|location|campaign|https?:\/\/|\bmessages?\b/i.test(
      normalized,
    )
  ) {
    return undefined;
  }

  return normalized;
}

export function extractZaiProviderError(value: unknown): ZaiProviderErrorMetadata {
  if (!isRecord(value) || !isRecord(value.error)) {
    return {};
  }

  const error = value.error;
  const metadata: ZaiProviderErrorMetadata = {};
  const code = sanitizeToken(error.code, MAX_PROVIDER_COORDINATE_LENGTH);
  const parameter = sanitizeParameter(
    error.param ?? error.parameter ?? error.pointer ?? error.path,
  );
  const message = sanitizeProviderMessage(error.message);

  if (code) metadata.code = code;
  if (parameter) metadata.parameter = parameter;
  if (message) metadata.message = message;
  return metadata;
}

function readUrl(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (isRecord(input) && typeof input.url === "string") {
    return input.url;
  }
  return "";
}

function endpointClass(input: unknown): string {
  const rawUrl = readUrl(input);
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    if (pathname.includes("/chat/completions")) {
      return "chat_completions";
    }
  } catch {
    if (rawUrl.toLowerCase().includes("/chat/completions")) {
      return "chat_completions";
    }
  }
  return "other";
}

function requestMethod(init: { method?: unknown } | undefined): string {
  const method = typeof init?.method === "string" ? init.method.toUpperCase() : "GET";
  return SAFE_METHODS.has(method) ? method : "OTHER";
}

function bodyObject(body: unknown): RecordValue | undefined {
  return isRecord(body) ? body : undefined;
}

function findSchemas(body: RecordValue): unknown[] {
  const schemas: unknown[] = [];
  const responseFormat = isRecord(body.response_format) ? body.response_format : undefined;
  const jsonSchema = responseFormat && isRecord(responseFormat.json_schema)
    ? responseFormat.json_schema
    : undefined;
  if (jsonSchema && isRecord(jsonSchema.schema)) {
    schemas.push(jsonSchema.schema);
  }

  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (!isRecord(tool) || !isRecord(tool.function)) continue;
      if (isRecord(tool.function.parameters)) {
        schemas.push(tool.function.parameters);
      }
    }
  }
  return schemas;
}

function schemaMetadata(body: RecordValue): Pick<ZaiFetchRequestMetadata, "schemaHash" | "schemaKeywords"> {
  const schemas = findSchemas(body);
  if (schemas.length === 0) {
    return {};
  }

  const keywords = Array.from(
    new Set(
      schemas.flatMap((schema) =>
        isRecord(schema)
          ? Object.keys(schema).filter((key) => JSON_SCHEMA_TOP_LEVEL_KEYWORDS.has(key))
          : [],
      ),
    ),
  ).sort();

  return {
    schemaHash: hashZaiCanonicalJson(schemas.length === 1 ? schemas[0] : schemas),
    schemaKeywords: keywords,
  };
}

function toolMetadata(body: RecordValue): Pick<
  ZaiFetchRequestMetadata,
  "toolCount" | "toolNameHash" | "toolStrict"
> {
  if (!Array.isArray(body.tools)) {
    return {};
  }

  const tools = body.tools.filter(isRecord);
  const names = tools
    .map((tool) => (isRecord(tool.function) ? tool.function.name : undefined))
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .sort();
  const strictValues = tools
    .map((tool) => (isRecord(tool.function) ? tool.function.strict : undefined))
    .filter((strict): strict is boolean => typeof strict === "boolean");
  const metadata: Pick<ZaiFetchRequestMetadata, "toolCount" | "toolNameHash" | "toolStrict"> = {
    toolCount: Math.min(tools.length, 1_000),
  };

  if (names.length > 0) {
    metadata.toolNameHash = hashZaiCanonicalJson(names);
  }
  if (strictValues.length > 0 && strictValues.every((value) => value === strictValues[0])) {
    metadata.toolStrict = strictValues[0];
  }
  return metadata;
}

function toolChoiceShape(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === "string") {
    return SAFE_TOOL_CHOICE_VALUES.has(value) ? value : "other";
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const type = typeof value.type === "string" && SAFE_TOOL_CHOICE_TYPES.has(value.type)
    ? value.type
    : undefined;
  const fn = isRecord(value.function) ? value.function : undefined;
  return {
    kind: "object",
    ...(type ? { type } : {}),
    functionNamePresent: typeof fn?.name === "string" && fn.name.length > 0,
  };
}

function finiteNumber(value: unknown, max = MAX_NUMERIC_VALUE): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > max) {
    return undefined;
  }
  return value;
}

function maxOutputTokens(body: RecordValue): number | undefined {
  for (const key of ["max_output_tokens", "max_completion_tokens", "max_tokens"]) {
    const value = finiteNumber(body[key]);
    if (value !== undefined && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function selectedMode(body: RecordValue, toolCount: number | undefined): "tool" | "native_json" | undefined {
  if (toolCount !== undefined && toolCount > 0) {
    return "tool";
  }
  const responseFormat = isRecord(body.response_format) ? body.response_format : undefined;
  return responseFormat?.type === "json_schema" || responseFormat?.type === "json_object"
    ? "native_json"
    : undefined;
}

function thinkingMetadata(body: RecordValue): Pick<ZaiFetchRequestMetadata, "thinkingTypePresent" | "thinkingType"> {
  const present = Object.prototype.hasOwnProperty.call(body, "thinking");
  const thinking = isRecord(body.thinking) ? body.thinking : undefined;
  const type = typeof thinking?.type === "string" && SAFE_THINKING_TYPES.has(thinking.type)
    ? thinking.type as "disabled" | "enabled"
    : undefined;
  return {
    thinkingTypePresent: present,
    ...(type ? { thinkingType: type } : {}),
  };
}

export function buildZaiFetchRequestMetadata(
  input: unknown,
  init: { method?: unknown } | undefined,
  body: unknown,
): ZaiFetchRequestMetadata {
  const metadata: ZaiFetchRequestMetadata = {
    method: requestMethod(init),
    endpointClass: endpointClass(input),
  };
  const bodyRecord = bodyObject(body);
  if (!bodyRecord) {
    return metadata;
  }

  metadata.requestBodyShapeHash = hashZaiRequestShape(bodyRecord);
  const tools = toolMetadata(bodyRecord);
  Object.assign(metadata, tools, schemaMetadata(bodyRecord), thinkingMetadata(bodyRecord));
  const mode = selectedMode(bodyRecord, tools.toolCount);
  if (mode) metadata.selectedMode = mode;
  const choice = Object.prototype.hasOwnProperty.call(bodyRecord, "tool_choice")
    ? toolChoiceShape(bodyRecord.tool_choice)
    : undefined;
  if (choice !== undefined) metadata.forcedToolChoiceShape = choice;

  const outputTokens = maxOutputTokens(bodyRecord);
  if (outputTokens !== undefined) metadata.maxOutputTokens = outputTokens;
  const temperature = finiteNumber(bodyRecord.temperature, 100);
  if (temperature !== undefined) metadata.temperature = temperature;
  return metadata;
}

function sanitizeContentType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+(?:;\s*[A-Za-z0-9._-]+=[A-Za-z0-9._-]+)*$/.test(normalized)
    ? normalized.slice(0, 120)
    : undefined;
}

function sanitizeRequestId(value: string | undefined): string | undefined {
  return sanitizeToken(value, MAX_REQUEST_ID_LENGTH);
}

export function buildZaiFetchDiagnostic(args: {
  input: unknown;
  init: { method?: unknown } | undefined;
  body: unknown;
  response?: {
    status: number;
    contentType?: string;
    requestId?: string;
    providerError?: ZaiProviderErrorMetadata;
  };
}): ZaiFetchDiagnostic {
  const diagnostic: ZaiFetchDiagnostic = {
    request: buildZaiFetchRequestMetadata(args.input, args.init, args.body),
  };
  if (args.response) {
    const status = Number.isInteger(args.response.status)
      ? Math.max(100, Math.min(599, args.response.status))
      : 0;
    diagnostic.response = {
      status,
      ...(sanitizeContentType(args.response.contentType)
        ? { contentType: sanitizeContentType(args.response.contentType) }
        : {}),
      ...(sanitizeRequestId(args.response.requestId)
        ? { requestId: sanitizeRequestId(args.response.requestId) }
        : {}),
      ...(args.response.providerError?.code
        ? { providerErrorCode: args.response.providerError.code }
        : {}),
      ...(args.response.providerError?.parameter
        ? { providerErrorParameter: args.response.providerError.parameter }
        : {}),
      ...(args.response.providerError?.message
        ? { providerErrorMessage: args.response.providerError.message }
        : {}),
    };
  }
  return diagnostic;
}
