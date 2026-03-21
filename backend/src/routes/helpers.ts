import { isLocalProvider } from "@worldforge/shared";
import type { ProviderSettings, ResolvedRole, RoleSettings } from "../ai/index.js";
import { resolveRoleModel } from "../ai/index.js";
import { getErrorMessage } from "../lib/errors.js";
import type { Settings } from "../settings/index.js";

export function requiresApiKey(baseUrl: string): boolean {
  return !isLocalProvider(baseUrl);
}

export type ResolveResult =
  | { resolved: ResolvedRole }
  | { error: string; status: 400 };

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

