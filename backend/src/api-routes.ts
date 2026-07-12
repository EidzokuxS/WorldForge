import type { Hono } from "hono";
import aiRoutes from "./routes/ai.js";
import campaignRoutes from "./routes/campaigns.js";
import campaignKernelRoutes from "./routes/campaign-kernel.js";
import campaignPlayRoutes from "./routes/campaign-play.js";
import campaignWorldRoutes from "./routes/campaign-world.js";
import imageRoutes from "./routes/images.js";
import loreRoutes from "./routes/lore.js";
import personaTemplateRoutes from "./routes/persona-templates.js";
import settingsRoutes from "./routes/settings.js";
import worldgenRoutes from "./routes/worldgen.js";

export function registerApiRoutes(app: Hono): void {
  app.route("/api/settings", settingsRoutes);
  app.route("/api/campaigns", campaignRoutes);
  app.route("/api/campaigns", campaignWorldRoutes);
  app.route("/api/campaigns", campaignPlayRoutes);
  app.route("/api/campaigns", loreRoutes);
  app.route("/api/campaigns/:id/persona-templates", personaTemplateRoutes);
  app.route("/api/worldgen", worldgenRoutes);
  app.route("/api/kernel", campaignKernelRoutes);
  app.route("/api", aiRoutes);
  app.route("/api/images", imageRoutes);
}
