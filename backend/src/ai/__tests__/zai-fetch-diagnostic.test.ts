import { describe, expect, it } from "vitest";
import {
  buildZaiFetchDiagnostic,
  buildZaiFetchRequestMetadata,
  extractZaiProviderError,
  hashZaiRequestShape,
} from "../zai-fetch-diagnostic.js";

describe("Z.AI fetch diagnostic helper", () => {
  it("hashes canonical request shapes without including request values", () => {
    const first = hashZaiRequestShape({
      model: "glm-5.1",
      messages: [{ role: "user", content: "first private sentence" }],
      temperature: 0.2,
    });
    const second = hashZaiRequestShape({
      temperature: 0.9,
      messages: [{ content: "second private sentence", role: "user" }],
      model: "another-model",
    });
    const changedShape = hashZaiRequestShape({
      model: "another-model",
      messages: [{ role: "user", content: 42 }],
      temperature: 0.9,
    });

    expect(first).toBe(second);
    expect(changedShape).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps request metadata to the allowlisted shape and schema coordinates", () => {
    const metadata = buildZaiFetchRequestMetadata(
      "https://api.z.ai/api/paas/v4/chat/completions?api_key=do-not-log",
      { method: "post" },
      {
        model: "glm-5.1",
        messages: [{ role: "user", content: "private player prose" }],
        temperature: 0.7,
        max_tokens: 4096,
        tools: [
          {
            type: "function",
            function: {
              name: "private_tool_name",
              strict: true,
              parameters: {
                type: "object",
                properties: { secretProperty: { type: "string" } },
                required: ["secretProperty"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "private_tool_name" } },
        thinking: { type: "disabled" },
      },
    );

    expect(metadata.method).toBe("POST");
    expect(metadata.endpointClass).toBe("chat_completions");
    expect(metadata.selectedMode).toBe("tool");
    expect(metadata.schemaKeywords).toEqual(["properties", "required", "type"]);
    expect(metadata.toolCount).toBe(1);
    expect(metadata.toolStrict).toBe(true);
    expect(metadata.forcedToolChoiceShape).toEqual({
      kind: "object",
      type: "function",
      functionNamePresent: true,
    });
    expect(metadata.thinkingTypePresent).toBe(true);
    expect(metadata.thinkingType).toBe("disabled");
    expect(metadata.temperature).toBe(0.7);
    expect(metadata.maxOutputTokens).toBe(4096);
    expect(JSON.stringify(metadata)).not.toContain("private");
    expect(JSON.stringify(metadata)).not.toContain("secretProperty");
    expect(Object.keys(metadata).sort()).toEqual([
      "endpointClass",
      "forcedToolChoiceShape",
      "maxOutputTokens",
      "method",
      "requestBodyShapeHash",
      "schemaHash",
      "schemaKeywords",
      "selectedMode",
      "temperature",
      "thinkingType",
      "thinkingTypePresent",
      "toolCount",
      "toolNameHash",
      "toolStrict",
    ].sort());
  });

  it("extracts only bounded structured provider coordinates", () => {
    const safe = extractZaiProviderError({
      error: {
        code: "invalid_parameter",
        param: "tools[0].function.parameters",
        message: "Invalid API parameter, please check the documentation.",
        secret: "do-not-log",
      },
      prompt: "private player prose",
    });
    expect(safe).toEqual({
      code: "invalid_parameter",
      parameter: "tools[0].function.parameters",
      message: "Invalid API parameter, please check the documentation.",
    });
    expect(JSON.stringify(safe)).not.toContain("do-not-log");
    expect(JSON.stringify(safe)).not.toContain("player");

    expect(
      extractZaiProviderError({
        error: { message: "Player prose and secret should not be logged." },
      }),
    ).toEqual({});
  });

  it("builds response diagnostics with only bounded response metadata", () => {
    const diagnostic = buildZaiFetchDiagnostic({
      input: "https://api.z.ai/api/paas/v4/chat/completions?token=secret",
      init: { method: "POST" },
      body: { model: "glm-5.1", messages: [{ content: "private prose" }] },
      response: {
        status: 400,
        contentType: "application/json; charset=utf-8",
        requestId: "req_123",
        providerError: {
          code: "invalid_parameter",
          parameter: "tools[0].function.parameters",
          message: "Invalid API parameter, please check the documentation.",
        },
      },
    });

    expect(diagnostic.response).toEqual({
      status: 400,
      contentType: "application/json; charset=utf-8",
      requestId: "req_123",
      providerErrorCode: "invalid_parameter",
      providerErrorParameter: "tools[0].function.parameters",
      providerErrorMessage: "Invalid API parameter, please check the documentation.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(JSON.stringify(diagnostic)).not.toContain("private prose");
  });
});
