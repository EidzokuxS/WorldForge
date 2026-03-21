/**
 * Generic primary->fallback model retry utility.
 *
 * Used by Oracle, Storyteller, and Lore extraction to retry
 * with the configured Fallback role when the primary model fails.
 */

import type { ProviderConfig } from "./provider-registry.js";
import type { FallbackConfig, Provider } from "@worldforge/shared";
import { createLogger } from "../lib/index.js";

const log = createLogger("model-fallback");

/**
 * Try primaryFn first; on failure, try fallbackFn.
 * If both fail, throws the fallback error.
 */
export async function withModelFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await primaryFn();
  } catch (primaryError) {
    log.warn(`${context}: primary model failed, trying fallback`, primaryError);
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      log.error(`${context}: both primary and fallback models failed`, fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Resolve FallbackConfig + providers array into a ProviderConfig
 * suitable for createModel(). Returns null if fallback is not configured.
 */
export function resolveFallbackProvider(
  fallback: FallbackConfig,
  providers: Provider[]
): ProviderConfig | null {
  if (!fallback.providerId) return null;
  const provider = providers.find((p) => p.id === fallback.providerId);
  if (!provider) return null;
  const model = fallback.model?.trim() || provider.defaultModel;
  if (!model) return null;
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model,
  };
}
