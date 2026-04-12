import { Hono } from "hono";
import crypto from "node:crypto";
import {
  getPersonaTemplate,
  readCampaignConfig,
  savePersonaTemplates,
} from "../campaign/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { parseBody, requireLoadedCampaign } from "./helpers.js";
import {
  applyPersonaTemplateSchema,
  createPersonaTemplateSchema,
  updatePersonaTemplateSchema,
} from "./schemas.js";
import {
  applyPersonaTemplate,
  createPersonaTemplateSummary,
} from "../character/persona-templates.js";
import {
  createCharacterRecordFromDraft,
  toLegacyNpcDraft,
  toLegacyPlayerCharacter,
} from "../character/record-adapters.js";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const campaignId = c.req.param("id") ?? "";
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const templates = readCampaignConfig(campaignId).personaTemplates ?? [];
    return c.json({
      personaTemplates: templates.map(createPersonaTemplateSummary),
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load persona templates.") },
      getErrorStatus(error),
    );
  }
});

app.post("/", async (c) => {
  try {
    const result = await parseBody(c, createPersonaTemplateSchema);
    if ("response" in result) return result.response;

    const { campaignId, ...payload } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const now = Date.now();
    const existing = readCampaignConfig(campaignId).personaTemplates ?? [];
    const template = {
      id: crypto.randomUUID(),
      campaignId,
      ...payload,
      createdAt: now,
      updatedAt: now,
    };

    savePersonaTemplates(campaignId, [...existing, template]);
    return c.json({ template }, 201);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create persona template.") },
      getErrorStatus(error),
    );
  }
});

app.put("/:templateId", async (c) => {
  try {
    const result = await parseBody(c, updatePersonaTemplateSchema);
    if ("response" in result) return result.response;

    const routeCampaignId = c.req.param("id") ?? "";
    const routeTemplateId = c.req.param("templateId") ?? "";
    const { campaignId, templateId, patch } = result.data;
    if (routeCampaignId !== campaignId || routeTemplateId !== templateId) {
      return c.json({ error: "Campaign or template id mismatch." }, 400);
    }

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const existing = readCampaignConfig(campaignId).personaTemplates ?? [];
    const index = existing.findIndex((item) => item.id === templateId);
    if (index === -1) {
      return c.json({ error: "Persona template not found." }, 404);
    }

    const nextTemplate = {
      ...existing[index],
      ...patch,
      patch: patch.patch ?? existing[index].patch,
      updatedAt: Date.now(),
    };
    const next = [...existing];
    next[index] = nextTemplate;
    savePersonaTemplates(campaignId, next);

    return c.json({ template: nextTemplate });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to update persona template.") },
      getErrorStatus(error),
    );
  }
});

app.delete("/:templateId", async (c) => {
  try {
    const campaignId = c.req.param("id") ?? "";
    const templateId = c.req.param("templateId") ?? "";
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const existing = readCampaignConfig(campaignId).personaTemplates ?? [];
    const next = existing.filter((template) => template.id !== templateId);
    if (next.length === existing.length) {
      return c.json({ error: "Persona template not found." }, 404);
    }

    savePersonaTemplates(campaignId, next);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete persona template.") },
      getErrorStatus(error),
    );
  }
});

app.post("/:templateId/apply", async (c) => {
  try {
    const result = await parseBody(c, applyPersonaTemplateSchema);
    if ("response" in result) return result.response;

    const routeCampaignId = c.req.param("id") ?? "";
    const routeTemplateId = c.req.param("templateId") ?? "";
    const { campaignId, templateId, draft } = result.data;
    if (routeCampaignId !== campaignId || routeTemplateId !== templateId) {
      return c.json({ error: "Campaign or template id mismatch." }, 400);
    }

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const template = getPersonaTemplate(campaignId, templateId);
    if (!template) {
      return c.json({ error: "Persona template not found." }, 404);
    }

    const nextDraft = applyPersonaTemplate(draft, template);
    const record = createCharacterRecordFromDraft(nextDraft, {
      id: `draft:${nextDraft.identity.displayName || "character"}`,
      campaignId,
    });

    if (nextDraft.identity.role === "npc") {
      return c.json({
        draft: nextDraft,
        characterRecord: record,
        npc: toLegacyNpcDraft(record),
        personaTemplate: createPersonaTemplateSummary(template),
      });
    }

    return c.json({
      draft: nextDraft,
      characterRecord: record,
      character: toLegacyPlayerCharacter(record),
      personaTemplate: createPersonaTemplateSummary(template),
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to apply persona template.") },
      getErrorStatus(error),
    );
  }
});

export default app;
