"use client";

import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignNewFlowProvider, useCampaignNewFlow } from "@/components/campaign-new/flow-provider";
import { createEmptyDnaState } from "@/components/title/utils";

vi.mock("@/lib/api", () => ({
  fetchSettings: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  createDefaultSettings: vi.fn(() => ({
    providers: [],
    judge: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
    storyteller: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
    generator: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
    embedder: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
    fallback: { providerId: "", model: "", timeoutMs: 0, retryCount: 0 },
    images: { providerId: "", model: "", stylePrompt: "", enabled: false },
    research: { enabled: false, maxSearchSteps: 0, searchProvider: "duckduckgo" },
  })),
}));

vi.mock("@/components/title/use-new-campaign-wizard", async () => {
  const React = await import("react");
  const { createEmptyDnaState } = await import("@/components/title/utils");

  return {
    useNewCampaignWizard: (
      _settings: unknown,
      _onCreated: () => void,
      options?: {
        initialSession?: {
          campaignName?: string;
          campaignPremise?: string;
          campaignFranchise?: string;
          researchEnabled?: boolean;
          selectedWorldbooks?: Array<{ id: string; displayName: string }>;
          dnaState?: ReturnType<typeof createEmptyDnaState> | null;
          step?: 1 | 2;
        };
      },
    ) => {
      const initial = options?.initialSession;
      const [campaignName, setCampaignName] = React.useState(initial?.campaignName ?? "");
      const [campaignPremise, setCampaignPremise] = React.useState(initial?.campaignPremise ?? "");
      const [campaignFranchise, setCampaignFranchise] = React.useState(initial?.campaignFranchise ?? "");
      const [researchEnabled, setResearchEnabled] = React.useState(initial?.researchEnabled ?? true);
      const [selectedWorldbooks] = React.useState(initial?.selectedWorldbooks ?? []);
      const [step, setStep] = React.useState<1 | 2>(initial?.step ?? 1);
      const [dnaState, setDnaState] = React.useState(initial?.dnaState ?? null);

      return {
        open: true,
        step,
        handleOpenChange: vi.fn(),
        setStep,
        campaignName,
        setCampaignName,
        campaignPremise,
        setCampaignPremise,
        campaignFranchise,
        setCampaignFranchise,
        researchEnabled,
        setResearchEnabled,
        dnaState,
        isBusy: false,
        creatingCampaign: false,
        isGenerating: false,
        generationProgress: null,
        isSuggesting: false,
        suggestingCategory: null,
        canCreate: true,
        hasWorldbook: selectedWorldbooks.length > 0,
        worldbookLibrary: [],
        selectedWorldbooks,
        worldbookLibraryLoading: false,
        worldbookStatus: "idle",
        worldbookError: null,
        handleCreateWithSeeds: vi.fn(),
        handleNextToDna: async () => {
          setStep(2);
          setDnaState((current: ReturnType<typeof createEmptyDnaState> | null) => {
            if (current) {
              return current;
            }
            const next = createEmptyDnaState();
            next.geography.value = "Storm coast";
            return next;
          });
        },
        handleResuggestAll: vi.fn(),
        handleResuggestCategory: vi.fn(),
        handleSeedToggle: vi.fn(),
        handleSeedTextChange: (category: keyof ReturnType<typeof createEmptyDnaState>, value: string) => {
          setDnaState((current: ReturnType<typeof createEmptyDnaState> | null) => {
            const next = current ?? createEmptyDnaState();
            return {
              ...next,
              [category]: {
                ...next[category],
                value,
                isCustom: true,
              },
            };
          });
        },
        handleCreateWithDna: vi.fn(),
        handleWorldbookUpload: vi.fn(),
        toggleWorldbookSelection: vi.fn(),
      };
    },
  };
});

import { fetchSettings } from "@/lib/api";

const mockFetchSettings = vi.mocked(fetchSettings);

function FlowConsumer() {
  const flow = useCampaignNewFlow();
  return (
    <div>
      <div data-testid="campaign-name">{flow.campaignName}</div>
      <div data-testid="campaign-premise">{flow.campaignPremise}</div>
      <div data-testid="campaign-step">{flow.step}</div>
      <div data-testid="dna-geography">{String(flow.dnaState?.geography.value ?? "")}</div>
      <button type="button" onClick={() => flow.setCampaignName("Arcadia")}>
        Set name
      </button>
      <button type="button" onClick={() => flow.setCampaignPremise("A haunted coast.")}>
        Set premise
      </button>
      <button type="button" onClick={() => void flow.handleNextToDna()}>
        Continue
      </button>
      <button type="button" onClick={() => flow.handleSeedTextChange("geography", "Storm coast")}>
        Edit geography
      </button>
    </div>
  );
}

describe("CampaignNewFlowProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockFetchSettings.mockResolvedValue({
      providers: [],
      judge: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
      storyteller: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
      generator: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
      embedder: { providerId: "", model: "", temperature: 0, maxTokens: 0 },
      fallback: { providerId: "", model: "", timeoutMs: 0, retryCount: 0 },
      images: { providerId: "", model: "", stylePrompt: "", enabled: false },
      research: { enabled: false, maxSearchSteps: 0, searchProvider: "duckduckgo" },
    });
  });

  it("rehydrates persisted concept and DNA state after the routed subtree remounts", async () => {
    const firstRender = render(
      <CampaignNewFlowProvider>
        <FlowConsumer />
      </CampaignNewFlowProvider>,
    );

    await waitFor(() => {
      expect(mockFetchSettings).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Set name" }));
      fireEvent.click(screen.getByRole("button", { name: "Set premise" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit geography" }));
    });

    expect(screen.getByTestId("campaign-name")).toHaveTextContent("Arcadia");
    expect(screen.getByTestId("campaign-step")).toHaveTextContent("2");
    expect(screen.getByTestId("dna-geography")).toHaveTextContent("Storm coast");

    firstRender.unmount();

    render(
      <CampaignNewFlowProvider>
        <FlowConsumer />
      </CampaignNewFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("campaign-name")).toHaveTextContent("Arcadia");
    });

    expect(screen.getByTestId("campaign-premise")).toHaveTextContent("A haunted coast.");
    expect(screen.getByTestId("campaign-step")).toHaveTextContent("2");
    expect(screen.getByTestId("dna-geography")).toHaveTextContent("Storm coast");
  });
});
