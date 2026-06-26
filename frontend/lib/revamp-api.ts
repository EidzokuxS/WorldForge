import type {
  CampaignKernel,
  CharacterDraft,
  RevampCastMember,
  RevampCastSource,
} from "@worldforge/shared";
import type { CharacterImportMode } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

type RevampJsonError = {
  error?: string;
};

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data as RevampJsonError;
    throw new Error(error.error ?? `Revamp API request failed with ${res.status}.`);
  }
  return data as T;
}

async function revampGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  return readJson<T>(res);
}

async function revampPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(res);
}

export type RevampKernelResponse = {
  kernel: CampaignKernel;
};

export type RevampDraftResponse = {
  draft: CharacterDraft;
};

export type RevampSavePlayerResponse = {
  kernel: CampaignKernel;
  playerCharacter: RevampCastMember;
};

export function getRevampKernel(campaignId: string): Promise<RevampKernelResponse> {
  return revampGet(`/api/revamp/campaigns/${campaignId}/kernel`);
}

export function parseRevampPlayerCharacter(
  campaignId: string,
  body: {
    concept: string;
    overrideText?: string;
  },
): Promise<RevampDraftResponse> {
  return revampPost(`/api/revamp/campaigns/${campaignId}/player/parse`, body);
}

export function importRevampPlayerV2Card(
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
): Promise<RevampDraftResponse> {
  return revampPost(`/api/revamp/campaigns/${campaignId}/player/import-v2-card`, {
    ...card,
    importMode: options.importMode,
    ...(options.overrideText ? { overrideText: options.overrideText } : {}),
  });
}

export function saveRevampPlayerCharacter(
  campaignId: string,
  body: {
    draft: CharacterDraft;
    source: Extract<RevampCastSource, "player_created" | "player_imported">;
  },
): Promise<RevampSavePlayerResponse> {
  return revampPost(`/api/revamp/campaigns/${campaignId}/cast/player`, body);
}
