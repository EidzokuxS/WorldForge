import { Hono } from "hono";
import { loadSettings, saveSettings } from "../settings/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/errors.js";
import { parseBody, settingsPayloadSchema } from "./schemas.js";

const app = new Hono();

app.get("/", (c) => {
  try {
    return c.json(loadSettings());
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load settings.") },
      getErrorStatus(error)
    );
  }
});

app.post("/", async (c) => {
  const result = await parseBody(c, settingsPayloadSchema);
  if ("response" in result) return result.response;

  try {
    return c.json(saveSettings(result.data));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save settings.") },
      getErrorStatus(error)
    );
  }
});

export default app;
