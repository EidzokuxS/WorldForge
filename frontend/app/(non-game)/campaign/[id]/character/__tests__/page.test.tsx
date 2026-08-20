import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignPlayCharacterDraft, CampaignPlayState } from "@worldforge/shared";

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/campaign-player-card", () => ({ readCampaignPlayerCard: vi.fn() }));
vi.mock("@/lib/campaign-play-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campaign-play-api")>(),
  loadCampaignPlayState: vi.fn(),
  generateCampaignPlayPlayerDraft: vi.fn(),
  researchCampaignPlayPlayer: vi.fn(),
  parseCampaignPlayPlayerCard: vi.fn(),
  putCampaignPlayPlayer: vi.fn(),
}));
vi.mock("@/components/character-creation/campaign-player-intake", () => ({
  CampaignPlayerIntake: (props: {
    onDraft: (prompt: string) => Promise<void>;
    onResearch: (query: string) => Promise<void>;
    onCard: (file: File, importMode: "native" | "outsider") => Promise<void>;
  }) => <>
    <button type="button" onClick={() => void props.onDraft("An observant cartographer")}>Build test draft</button>
    <button type="button" onClick={() => void props.onResearch("Floodplain cartographers")}>Research test draft</button>
    <button type="button" onClick={() => void props.onCard(new File(["card"], "iria.json"), "outsider")}>Import test card</button>
  </>,
}));
vi.mock("@/components/character-creation/campaign-player-editor", () => ({
  CampaignPlayerEditor: ({ draft }: { draft: CampaignPlayCharacterDraft }) => <div>Editing {draft.name}</div>,
}));

import {
  CampaignPlayApiError,
  generateCampaignPlayPlayerDraft,
  loadCampaignPlayState,
  parseCampaignPlayPlayerCard,
  putCampaignPlayPlayer,
  researchCampaignPlayPlayer,
} from "@/lib/campaign-play-api";
import { readCampaignPlayerCard } from "@/lib/campaign-player-card";
import CharacterCreationPage from "@/app/(non-game)/campaign/[id]/character/page";

const draft: CampaignPlayCharacterDraft = {
  name: "Iria Vale",
  summary: "A patient cartographer.",
  species: "Human",
  gender: "Woman",
  ageText: "31",
  appearance: "Ink-stained hands.",
  biography: "She maps roads that no longer exist.",
  personality: {
    summary: "Careful and direct.",
    voice: "Measured",
    decisionStyle: "Evidence first",
    worldview: "Every place leaves a trace.",
    contradictions: ["Restless homebody"],
    mythology: "Rivers remember.",
    sampleLines: ["Show me where the road bends."],
  },
  motives: ["Finish the flood map"],
  beliefs: ["Maps are promises"],
  drives: ["Discover"],
  traits: ["Patient"],
  skills: [{ name: "Cartography", tier: "Master" }],
  flaws: ["Overcautious"],
  specialties: ["River deltas"],
  inventory: ["Field journal"],
  signatureItems: ["Brass compass"],
  source: { kind: "generated", importMode: null, label: "An observant cartographer" },
};

const state: CampaignPlayState = {
  campaignId: "campaign-1",
  phase: "character_required",
  acceptedWorldVersion: 7,
  worldVersion: 7,
  runtimeRevision: 3,
  character: null,
  openingOptions: [],
  currentLocation: null,
  visibleActors: [],
  visibleRoutes: [],
  visiblePressures: [],
  narration: null,
  consequences: [],
  activeTurn: null,
  possessions: [],
  obligations: [],
  narrationOperation: null,
  utilityActions: [],
  journalCursor: 0,
  projectionHash: "projection",
};

async function renderPage() {
  await act(async () => {
    render(<Suspense fallback={<div>Route loading</div>}><CharacterCreationPage params={Promise.resolve({ id: "campaign-1" })} /></Suspense>);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCampaignPlayState).mockResolvedValue(state);
  vi.mocked(generateCampaignPlayPlayerDraft).mockResolvedValue({ draft });
  vi.mocked(researchCampaignPlayPlayer).mockResolvedValue({ research: { summary: "Grounded notes", sources: [] } });
  vi.mocked(parseCampaignPlayPlayerCard).mockResolvedValue({ draft: { ...draft, source: { kind: "character_card", importMode: "outsider", label: "Iria Vale" } } });
  vi.mocked(readCampaignPlayerCard).mockResolvedValue(JSON.stringify({ spec: "chara_card_v2" }));
  vi.mocked(putCampaignPlayPlayer).mockResolvedValue({
    actorHandle: "player:iria",
    acceptedWorldVersion: 7,
    worldVersion: 8,
    runtimeRevision: 4,
  });
});

describe("CharacterCreationPage", () => {
  it("loads the Campaign Play character phase and offers player intake", async () => {
    await renderPage();

    expect(await screen.findByRole("button", { name: "Build test draft" })).toBeInTheDocument();
    expect(loadCampaignPlayState).toHaveBeenCalledWith("campaign-1");
    expect(screen.getByRole("link", { name: "Back to review" })).toHaveAttribute("href", "/campaign/campaign-1/review");
  });

  it("routes established characters to Campaign Play", async () => {
    vi.mocked(loadCampaignPlayState).mockResolvedValue({ ...state, phase: "opening_required", character: { name: "Iria", monogram: "IV", descriptor: "Cartographer", accent: "gold" } });

    await renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/campaign/campaign-1/play"));
  });

  it("saves the complete draft with server-authoritative versions and continues to Play", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Build test draft" }));
    expect(await screen.findByText("Editing Iria Vale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to opening" }));

    await waitFor(() => expect(putCampaignPlayPlayer).toHaveBeenCalledWith("campaign-1", {
      acceptedWorldVersion: 7,
      expectedWorldVersion: 7,
      expectedRuntimeRevision: 3,
      source: "generated",
      character: draft,
    }));
    expect(push).toHaveBeenCalledWith("/campaign/campaign-1/play");
  });

  it("reloads authoritative versions after a save conflict and preserves the draft for retry", async () => {
    const refreshedState = { ...state, worldVersion: 8, runtimeRevision: 4 };
    vi.mocked(loadCampaignPlayState)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(refreshedState);
    vi.mocked(putCampaignPlayPlayer)
      .mockRejectedValueOnce(new CampaignPlayApiError(
        "stale_runtime_revision",
        "Campaign state changed.",
        409,
        null,
      ))
      .mockResolvedValueOnce({
        actorHandle: "player:iria",
        acceptedWorldVersion: 7,
        worldVersion: 9,
        runtimeRevision: 5,
      });

    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Build test draft" }));
    expect(await screen.findByText("Editing Iria Vale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to opening" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Campaign state changed. Review the character and save again.",
    );
    expect(screen.getByText("Editing Iria Vale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to opening" }));

    await waitFor(() => expect(putCampaignPlayPlayer).toHaveBeenLastCalledWith("campaign-1", {
      acceptedWorldVersion: 7,
      expectedWorldVersion: 8,
      expectedRuntimeRevision: 4,
      source: "generated",
      character: draft,
    }));
    expect(push).toHaveBeenCalledWith("/campaign/campaign-1/play");
  });

  it("continues to Play when another session establishes the character first", async () => {
    vi.mocked(loadCampaignPlayState)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({
        ...state,
        phase: "opening_required",
        character: { name: "Iria", monogram: "IV", descriptor: "Cartographer", accent: "gold" },
      });
    vi.mocked(putCampaignPlayPlayer).mockRejectedValueOnce(new CampaignPlayApiError(
      "character_already_exists",
      "The campaign already has a player character.",
      409,
      null,
    ));

    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Build test draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue to opening" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/campaign/campaign-1/play"));
  });

  it("grounds a researched concept before generating its draft", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Research test draft" }));

    await waitFor(() => expect(researchCampaignPlayPlayer).toHaveBeenCalledWith("campaign-1", { query: "Floodplain cartographers" }));
    expect(generateCampaignPlayPlayerDraft).toHaveBeenCalledWith("campaign-1", {
      prompt: "Floodplain cartographers",
      research: { summary: "Grounded notes", sources: [] },
    });
  });

  it("sends complete card JSON and the chosen world placement to Campaign Play", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Import test card" }));

    await waitFor(() => expect(parseCampaignPlayPlayerCard).toHaveBeenCalledWith("campaign-1", {
      cardJson: JSON.stringify({ spec: "chara_card_v2" }),
      importMode: "outsider",
    }));
  });

  it("keeps Campaign Play failures visible", async () => {
    vi.mocked(generateCampaignPlayPlayerDraft).mockRejectedValue(new Error("character_generation_failed"));
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Build test draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("character_generation_failed");
  });
});
