import type {
  CampaignKernel,
  CharacterDraft,
} from "@worldforge/shared";
import type { CharacterImportMode } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const KERNEL_API_BASE = "/api/kernel";

type KernelJsonError = {
  error?: string;
};

type PlayerCastMember = NonNullable<CampaignKernel["castRegistry"]["playerCharacter"]>;
type PlayerCastSource = PlayerCastMember["source"];

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data as KernelJsonError;
    throw new Error(error.error ?? `Campaign kernel request failed with ${res.status}.`);
  }
  return data as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  return readJson<T>(res);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(res);
}

export type CampaignKernelResponse = {
  kernel: CampaignKernel;
};

export type PlayerDraftResponse = {
  draft: CharacterDraft;
};

export type SavePlayerCastResponse = {
  kernel: CampaignKernel;
  playerCharacter: PlayerCastMember;
};

export function loadCampaignKernel(campaignId: string): Promise<CampaignKernelResponse> {
  return apiGet(`${KERNEL_API_BASE}/campaigns/${campaignId}/kernel`);
}

export function parsePlayerCharacterDraft(
  campaignId: string,
  body: {
    concept: string;
    overrideText?: string;
  },
): Promise<PlayerDraftResponse> {
  return apiPost(`${KERNEL_API_BASE}/campaigns/${campaignId}/player/parse`, body);
}

export function importPlayerCard(
  campaignId: string,
  card: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    tags: string[];
    mesExample: string;
  },
  options: {
    importMode: CharacterImportMode;
    overrideText?: string;
  },
): Promise<PlayerDraftResponse> {
  return apiPost(`${KERNEL_API_BASE}/campaigns/${campaignId}/player/import-card`, {
    ...card,
    importMode: options.importMode,
    ...(options.overrideText ? { overrideText: options.overrideText } : {}),
  });
}

export function savePlayerCast(
  campaignId: string,
  body: {
    draft: CharacterDraft;
    source: Extract<PlayerCastSource, "player_created" | "player_imported">;
  },
): Promise<SavePlayerCastResponse> {
  return apiPost(`${KERNEL_API_BASE}/campaigns/${campaignId}/cast/player`, body);
}
