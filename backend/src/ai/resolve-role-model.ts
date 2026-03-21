import type { ProviderConfig } from "./provider-registry.js";

export interface RoleSettings {
  providerId: string;
  model?: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderSettings {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export interface ResolvedRole {
  provider: ProviderConfig;
  temperature: number;
  maxTokens: number;
}

export function resolveRoleModel(
  role: RoleSettings,
  providers: ProviderSettings[]
): ResolvedRole {
  const provider = providers.find((item) => item.id === role.providerId);
  if (!provider) {
    throw new Error(`Provider "${role.providerId}" not found`);
  }

  const model = role.model?.trim() || provider.defaultModel;
  if (!model) {
    throw new Error(`No model configured for provider "${provider.name}"`);
  }

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model,
    },
    temperature: role.temperature,
    maxTokens: role.maxTokens,
  };
}
