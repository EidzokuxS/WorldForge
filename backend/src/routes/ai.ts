import { generateText } from "ai";
import { Hono } from "hono";
import {
  createModel,
  resolveRoleModel,
  testProviderConnection,
} from "../ai/index.js";
import { clampTokens, getErrorMessage, getErrorStatus } from "../lib/index.js";
import { parseBody } from "./helpers.js";
import { testProviderSchema, testRoleSchema } from "./schemas.js";

const app = new Hono();

app.post("/providers/test", async (c) => {
  try {
    const result = await parseBody(c, testProviderSchema);
    if ("response" in result) return result.response;

    const { baseUrl, model, apiKey } = result.data;
    const testResult = await testProviderConnection({
      id: "test-provider",
      name: "Test Provider",
      baseUrl,
      apiKey,
      model,
    });
    return c.json(testResult, 200);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Provider test failed.") },
      getErrorStatus(error)
    );
  }
});

app.post("/ai/test-role", async (c) => {
  try {
    const result = await parseBody(c, testRoleSchema);
    if ("response" in result) return result.response;

    const roleName = result.data.role;
    const providers = result.data.providers;
    const roleConfig = result.data.roles[roleName];
    if (!roleConfig) {
      return c.json({ error: `Missing role config for "${roleName}".` }, 400);
    }

    if (!roleConfig.providerId) {
      return c.json({ error: "Role providerId is required." }, 400);
    }

    const start = Date.now();
    let resolvedModel = "";
    try {
      const resolvedRole = resolveRoleModel(roleConfig, providers);
      resolvedModel = resolvedRole.provider.model;

      let prompt: string;
      if (roleName === "judge") {
        prompt =
          'You are a game judge. Respond with a JSON object: { "ruling": "allowed", "reason": "test" }';
      } else if (roleName === "storyteller") {
        prompt =
          "You are a storyteller. In one sentence, describe a mysterious tavern at midnight.";
      } else {
        prompt =
          'You are a world generator. Respond with a JSON object: { "location": "Misty Harbor", "tags": ["Foggy", "Port", "Dangerous"] }';
      }

      const aiResult = await generateText({
        model: createModel(resolvedRole.provider),
        prompt,
        temperature: resolvedRole.temperature,
        maxOutputTokens: clampTokens(resolvedRole.maxTokens),
      });

      return c.json({
        success: true,
        role: roleName,
        model: resolvedRole.provider.model,
        response: aiResult.text,
        latencyMs: Date.now() - start,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Role model test failed.");
      return c.json(
        {
          success: false,
          role: roleName,
          model: resolvedModel,
          error: message,
          latencyMs: Date.now() - start,
        },
        getErrorStatus(error)
      );
    }
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Role test failed.") },
      getErrorStatus(error)
    );
  }
});

export default app;
