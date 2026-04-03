import type { Context } from "hono";
import { z } from "zod";
import { isLocalProvider } from "@worldforge/shared";
import type { CampaignMeta } from "@worldforge/shared";
import type { ProviderSettings, ResolvedRole, ResolveResult, RoleSettings } from "../ai/index.js";
import { resolveRoleModel } from "../ai/index.js";
import { getActiveCampaign, loadCampaign } from "../campaign/index.js";
import { getErrorMessage } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import type { Settings } from "../settings/index.js";
import { getDb } from "../db/index.js";
import { locations, factions } from "../db/schema.js";
import { eq } from "drizzle-orm";

export function requiresApiKey(baseUrl: string): boolean {
  return !isLocalProvider(baseUrl);
}

export type { ResolveResult };

function resolveRole(
  roleName: string,
  roleConfig: RoleSettings,
  providers: ProviderSettings[]
): ResolveResult {
  if (providers.length === 0 || !roleConfig.providerId) {
    return { error: `${roleName} not configured.`, status: 400 as const };
  }

  let resolved: ResolvedRole;
  try {
    resolved = resolveRoleModel(roleConfig, providers);
  } catch (error) {
    return {
      error: getErrorMessage(error, `${roleName} not configured.`),
      status: 400 as const,
    };
  }

  if (
    !resolved.provider.baseUrl.trim() ||
    !resolved.provider.model.trim() ||
    (requiresApiKey(resolved.provider.baseUrl) &&
      !resolved.provider.apiKey.trim())
  ) {
    return {
      error: `Configure ${roleName} API key in Settings first.`,
      status: 400 as const,
    };
  }

  return { resolved };
}

export function resolveGenerator(settings: Settings): ResolveResult {
  return resolveRole("Generator", settings.generator, settings.providers);
}

export function resolveStoryteller(settings: Settings): ResolveResult {
  return resolveRole("Storyteller", settings.storyteller, settings.providers);
}

export function resolveEmbedder(settings: Settings): ResolveResult {
  return resolveRole("Embedder", settings.embedder, settings.providers);
}

export function resolveJudge(settings: Settings): ResolveResult {
  return resolveRole("Judge", settings.judge, settings.providers);
}

// Utility: extract first Zod error message
export function zodFirstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation failed.";
}

/**
 * Parse a JSON request body and validate it against a Zod schema.
 * Returns `{ data }` on success or a ready-made Hono JSON error response.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { response: c.json({ error: "Invalid JSON body." }, 400) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: c.json({ error: zodFirstError(parsed.error) }, 400) };
  }

  return { data: parsed.data as z.infer<T> };
}

/**
 * Ensure the active campaign matches the given ID.
 * Returns the campaign on success, or a 404 JSON response on failure.
 */
export function requireActiveCampaign(
  c: Context,
  campaignId: string
): CampaignMeta | Response {
  const campaign = getActiveCampaign();
  if (!campaign || campaign.id !== campaignId) {
    return c.json({ error: "Campaign not active or not found." }, 404);
  }
  return campaign;
}

/**
 * Ensure a campaign is available for explicit :id routes even after a backend restart.
 */
export async function requireLoadedCampaign(
  c: Context,
  campaignId: string,
): Promise<CampaignMeta | Response> {
  const campaign = getActiveCampaign();
  if (campaign?.id === campaignId) {
    return campaign;
  }

  try {
    return await loadCampaign(campaignId);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Campaign not active or not found.") },
      404,
    );
  }
}

/**
 * Ensure generated-world routes only resolve for campaigns that completed world generation.
 */
export async function requireGeneratedCampaign(
  c: Context,
  campaignId: string,
): Promise<CampaignMeta | Response> {
  const campaign = await requireLoadedCampaign(c, campaignId);
  if (campaign instanceof Response) {
    return campaign;
  }

  if (!campaign.generationComplete) {
    return c.json(
      { error: "World generation is not complete for this campaign." },
      409,
    );
  }

  return campaign;
}

/**
 * Resolve location and faction names for character endpoints.
 * For "key" role, uses the names passed in the request body.
 * For "player" role, loads them from the DB.
 */
export function resolveNames(
  campaignId: string,
  role: "player" | "key",
  bodyLocationNames?: string[],
  bodyFactionNames?: string[],
): { locationNames: string[]; factionNames: string[] } | { error: string } {
  if (role === "key") {
    return {
      locationNames: bodyLocationNames ?? [],
      factionNames: bodyFactionNames ?? [],
    };
  }
  const db = getDb();
  const locationNames = db.select({ name: locations.name })
    .from(locations).where(eq(locations.campaignId, campaignId)).all().map((r) => r.name);
  if (locationNames.length === 0) {
    return { error: "No locations found. Generate the world first." };
  }
  const factionNames = db.select({ name: factions.name })
    .from(factions).where(eq(factions.campaignId, campaignId)).all().map((r) => r.name);
  return { locationNames, factionNames };
}

export interface CharacterEndpointContext {
  campaign: CampaignMeta;
  gen: ResolvedRole;
  settings: Settings;
  names: { locationNames: string[]; factionNames: string[] };
}

/**
 * Shared setup for character creation endpoints (parse/generate/research/import).
 * Returns either the resolved context or a ready-made error Response.
 */
export async function setupCharacterEndpoint(
  c: Context,
  campaignId: string,
  role: "player" | "key",
  bodyLocationNames?: string[],
  bodyFactionNames?: string[],
): Promise<CharacterEndpointContext | Response> {
  const campaign = await requireLoadedCampaign(c, campaignId);
  if (campaign instanceof Response) return campaign;

  const settings = loadSettings();
  const gen = resolveGenerator(settings);
  if ("error" in gen) return c.json({ error: gen.error }, gen.status);

  const names = resolveNames(campaignId, role, bodyLocationNames, bodyFactionNames);
  if ("error" in names) return c.json({ error: names.error }, 400);

  return { campaign, gen: gen.resolved, settings, names };
}

