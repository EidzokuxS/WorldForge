import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";

import aiRoutes from "./routes/ai.js";
import campaignRoutes from "./routes/campaigns.js";
import chatRoutes from "./routes/chat.js";
import loreRoutes from "./routes/lore.js";
import settingsRoutes from "./routes/settings.js";
import worldgenRoutes from "./routes/worldgen.js";

const app = new Hono();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/settings", settingsRoutes);
app.route("/api/campaigns", campaignRoutes);
app.route("/api/campaigns", loreRoutes);
app.route("/api/worldgen", worldgenRoutes);
app.route("/api", aiRoutes);
app.route("/api/chat", chatRoutes);

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
