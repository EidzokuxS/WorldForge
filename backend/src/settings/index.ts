export {
  loadSettings,
  saveSettings,
  normalizeSettings,
  rebindProviderReferences,
} from "./manager.js";

export type {
  Provider,
  RoleConfig,
  ImageConfig,
  Settings,
} from "@worldforge/shared";

export {
  BUILTIN_PROVIDER_PRESETS,
  NONE_PROVIDER_ID,
  createDefaultSettings,
} from "@worldforge/shared";
