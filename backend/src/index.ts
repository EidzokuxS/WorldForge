import { execSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";

// Kill any zombie process holding our port (fixes --watch restart on Windows)
const port = Number(process.env.PORT) || 3001;
try {
  if (process.platform === "win32") {
    const out = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const pids = [...new Set(out.split("\n").map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      if (pid !== String(process.pid)) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" }); } catch {}
      }
    }
  }
} catch {
  // No process on port — normal case
}

import aiRoutes from "./routes/ai.js";
import campaignRoutes from "./routes/campaigns.js";
import chatRoutes from "./routes/chat.js";
import loreRoutes from "./routes/lore.js";
import settingsRoutes from "./routes/settings.js";
import worldgenRoutes from "./routes/worldgen.js";
import characterRoutes from "./routes/character.js";
import imageRoutes from "./routes/images.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("/api/debug/prompt", async (c) => {
  try {
    const { getActiveCampaign } = await import("./campaign/index.js");
    const { assemblePrompt } = await import("./engine/index.js");

    const campaign = getActiveCampaign();
    if (!campaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    const action = c.req.query("action") ?? "";

    const assembled = await assemblePrompt({
      campaignId: campaign.id,
      contextWindow: 8192,
      playerAction: action || undefined,
    });

    return c.json({
      sections: assembled.sections.map((s) => ({
        name: s.name,
        estimatedTokens: s.estimatedTokens,
        contentPreview: s.content.slice(0, 100),
      })),
      totalTokens: assembled.totalTokens,
      budgetUsed: assembled.budgetUsed,
    });
  } catch (error) {
    const { getErrorMessage, getErrorStatus } = await import("./lib/index.js");
    return c.json(
      { error: getErrorMessage(error, "Debug prompt failed.") },
      getErrorStatus(error)
    );
  }
});

app.route("/api/settings", settingsRoutes);
app.route("/api/campaigns", campaignRoutes);
app.route("/api/campaigns", loreRoutes);
app.route("/api/worldgen", worldgenRoutes);
app.route("/api/worldgen", characterRoutes);
app.route("/api", aiRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/images", imageRoutes);

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      ws.send(
        JSON.stringify({
          type: "connection",
          message: "connected",
        })
      );
    },
    onMessage(event, ws) {
      if (event.data === "ping") {
        ws.send("pong");
      }
    },
  }))
);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`WorldForge backend listening on http://localhost:${info.port}`);
  }
);

injectWebSocket(server);

// Graceful shutdown — ensures port is freed on Ctrl+C (especially on Windows)
function shutdown() {
  console.log("\nShutting down...");
  server.close(() => process.exit(0));
  // Force exit after 3s if server.close hangs
  setTimeout(() => process.exit(1), 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGTERM", shutdown);
