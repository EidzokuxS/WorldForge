import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  loadCampaign: vi.fn(),
  getWorldData: vi.fn(),
  getLoreCards: vi.fn(),
  saveWorldEdits: vi.fn(),
  regenerateSection: vi.fn(),
}));

vi.mock("@/lib/world-data-helpers", () => ({
  toEditableScaffold: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/world-review/premise-section", () => ({
  PremiseSection: () => <div>Premise Section</div>,
}));
vi.mock("@/components/world-review/locations-section", () => ({
  LocationsSection: () => <div>Locations Section</div>,
}));
vi.mock("@/components/world-review/factions-section", () => ({
  FactionsSection: () => <div>Factions Section</div>,
}));
vi.mock("@/components/world-review/npcs-section", () => ({
  NpcsSection: (props: {
    locationNames: string[];
    onRegenerate: (instruction: string | undefined) => void;
  }) => (
    <div>
      <div>NPC Section</div>
      <div data-testid="npc-location-names">{props.locationNames.join("|")}</div>
      <button type="button" onClick={() => props.onRegenerate("keep scoped scenes")}>
        Regenerate NPCs
      </button>
    </div>
  ),
}));
vi.mock("@/components/world-review/lore-section", () => ({
  LoreSection: () => <div>Lore Section</div>,
}));

import { getLoreCards, getWorldData, loadCampaign, regenerateSection, saveWorldEdits } from "@/lib/api";
import { toEditableScaffold } from "@/lib/world-data-helpers";
import WorldReviewPage from "@/app/(non-game)/campaign/[id]/review/page";

const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedGetWorldData = vi.mocked(getWorldData);
const mockedGetLoreCards = vi.mocked(getLoreCards);
const mockedRegenerateSection = vi.mocked(regenerateSection);
const mockedSaveWorldEdits = vi.mocked(saveWorldEdits);
const mockedToEditableScaffold = vi.mocked(toEditableScaffold);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldReviewPage", () => {
  it("renders the V4 review overview, tabs, and primary action", async () => {
    const user = userEvent.setup();
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLoreCards.mockResolvedValue([]);
    mockedToEditableScaffold.mockReturnValue({
      refinedPremise: "A world",
      locations: [
        {
          name: "Ironkeep",
          description: "A keep over the river.",
          tags: ["fortified"],
          isStarting: true,
          connectedTo: [],
          kind: "macro",
          parentLocationName: null,
        },
      ],
      factions: [{ name: "The Order", tags: ["strict"], goals: ["Hold the city"], assets: [], territoryNames: ["Ironkeep"] }],
      npcs: [
        {
          name: "Garan Steel",
          persona: "Tracks the gate and keeps the old road closed.",
          tags: ["warden", "local"],
          goals: { shortTerm: ["Keep the gate sealed"], longTerm: ["Restore the old oath"] },
          locationName: "Ironkeep",
          sceneLocationName: "Ironkeep",
          factionName: "The Order",
          tier: "key",
          draft: {
            identity: {
              role: "npc",
              tier: "key",
              displayName: "Garan Steel",
              canonicalStatus: "original",
              baseFacts: {
                biography: "Former outrider turned gatekeeper.",
                socialRole: ["Gate warden"],
                hardConstraints: [],
              },
              behavioralCore: {
                attachments: ["Ironkeep"],
                selfImage: "The last honest guard",
                pressureResponses: ["Falls back to procedure when threatened"],
              },
            },
            profile: {
              species: "Human",
              gender: "male",
              ageText: "late forties",
              appearance: "Weathered and formal.",
              backgroundSummary: "Former outrider turned gatekeeper.",
              personaSummary: "Garan keeps order through ritual, memory, and stubborn care.",
            },
            socialContext: {
              factionId: null,
              factionName: "The Order",
              homeLocationId: null,
              homeLocationName: "Ironkeep",
              currentLocationId: null,
              currentLocationName: "Ironkeep",
              relationshipRefs: [],
              socialStatus: ["warden"],
              originMode: "resident",
            },
            motivations: {
              shortTermGoals: ["Keep the gate sealed"],
              longTermGoals: ["Restore the old oath"],
              beliefs: ["Rules survive panic"],
              drives: ["Duty"],
              frictions: ["Distrusts improvisation"],
            },
            capabilities: {
              traits: ["Patient"],
              skills: [{ name: "Gate protocol", tier: "Skilled" }],
              flaws: ["Rigid"],
              specialties: ["Locks"],
              wealthTier: "Poor",
            },
            state: { hp: 10, conditions: [], statusFlags: [], activityState: "watching" },
            loadout: { inventorySeed: [], equippedItemRefs: [], currencyNotes: "", signatureItems: ["Gate key"] },
            startConditions: { entryPressure: ["The road is restless"] },
            provenance: { sourceKind: "worldgen", importMode: null, templateId: null, archetypePrompt: null, worldgenOrigin: null },
          },
        },
      ],
      loreCards: [],
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Where it begins")).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Cast/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Locations/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Factions/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Lore cards/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /World DNA/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Issues/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Character" })).toBeInTheDocument();
    expect(screen.queryByText("World review")).not.toBeInTheDocument();
    expect(screen.queryByText("What needs review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open issues/i })).not.toBeInTheDocument();
    expect(document.querySelector(".wf-review-screen")).not.toBeNull();
    expect(document.querySelector(".wf-review-frame")).not.toBeNull();
    expect(document.querySelector(".wf-review-tablist")).not.toBeNull();
    expect(document.querySelector(".wf-review-health")).not.toBeNull();
    expect(document.querySelector(".wf-review-cast")).not.toBeNull();
    expect(document.querySelector(".wf-review-locs")).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: /Cast/ }));
    expect(screen.getByRole("button", { name: /Create NPC/ })).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("Capabilities")).toBeInTheDocument();
    expect(screen.getAllByText(/Former outrider turned gatekeeper/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Open NPC editor/ }));
    expect(screen.getByText("NPC Section")).toBeInTheDocument();
  });

  it("blocks world review when the campaign is not generation-ready", async () => {
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: false,
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("World generation required")).toBeInTheDocument();
    });

    expect(mockedGetWorldData).not.toHaveBeenCalled();
    expect(screen.queryByText("Premise Section")).not.toBeInTheDocument();
  });

  it("passes the full location namespace to NPC regeneration, including persistent sublocations", async () => {
    const user = userEvent.setup();
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLoreCards.mockResolvedValue([]);
    mockedRegenerateSection.mockResolvedValue({ npcs: [] } as never);
    mockedToEditableScaffold.mockReturnValue({
      refinedPremise: "A world",
      locations: [
        {
          name: "Shibuya District",
          description: "Macro district",
          tags: [],
          isStarting: true,
          connectedTo: ["Platform B5"],
          kind: "macro",
          parentLocationName: null,
        },
        {
          name: "Platform B5",
          description: "Persistent scene",
          tags: [],
          isStarting: false,
          connectedTo: ["Shibuya District"],
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya District",
        },
      ],
      factions: [{ name: "The Order", tags: [], goals: [], assets: [], territoryNames: [] }],
      npcs: [],
      loreCards: [],
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await user.click(await screen.findByRole("button", { name: "Edit world" }));
    expect(screen.getByTestId("npc-location-names")).toHaveTextContent("Shibuya District|Platform B5");

    await user.click(screen.getByRole("button", { name: "Regenerate NPCs" }));

    await waitFor(() => {
      expect(mockedRegenerateSection).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "npcs",
          locations: expect.arrayContaining([
            expect.objectContaining({
              name: "Shibuya District",
              kind: "macro",
              parentLocationName: null,
            }),
            expect.objectContaining({
              name: "Platform B5",
              kind: "persistent_sublocation",
              parentLocationName: "Shibuya District",
            }),
          ]),
          locationNames: ["Shibuya District", "Platform B5"],
          additionalInstruction: "keep scoped scenes",
        }),
      );
    });
  });

  it("saves hierarchy and NPC scene fields unchanged from the editable scaffold", async () => {
    const user = userEvent.setup();
    mockedLoadCampaign.mockResolvedValue({
      id: "campaign-1",
      name: "Arcadia",
      premise: "A world",
      generationComplete: true,
    } as never);
    mockedGetWorldData.mockResolvedValue({ locations: [], factions: [], npcs: [], relationships: [] } as never);
    mockedGetLoreCards.mockResolvedValue([]);
    mockedSaveWorldEdits.mockResolvedValue(undefined as never);
    mockedToEditableScaffold.mockReturnValue({
      refinedPremise: "A world",
      locations: [
        {
          name: "Shibuya District",
          description: "Macro district",
          tags: [],
          isStarting: true,
          connectedTo: ["Platform B5"],
          kind: "macro",
          parentLocationName: null,
        },
        {
          name: "Platform B5",
          description: "Persistent scene",
          tags: [],
          isStarting: false,
          connectedTo: ["Shibuya District"],
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya District",
        },
      ],
      factions: [],
      npcs: [
        {
          name: "Station Warden",
          persona: "Tracks the trains.",
          tags: [],
          goals: { shortTerm: [], longTerm: [] },
          locationName: "Shibuya District",
          sceneLocationName: "Platform B5",
          factionName: null,
          tier: "supporting",
        },
      ],
      loreCards: [],
    } as never);

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading route...</div>}>
          <WorldReviewPage params={Promise.resolve({ id: "campaign-1" })} />
        </Suspense>,
      );
    });

    await user.click(await screen.findByRole("button", { name: "Continue to Character" }));

    await waitFor(() => {
      expect(mockedSaveWorldEdits).toHaveBeenCalledWith(
        "campaign-1",
        expect.objectContaining({
          locations: [
            expect.objectContaining({ kind: "macro", parentLocationName: null }),
            expect.objectContaining({
              kind: "persistent_sublocation",
              parentLocationName: "Shibuya District",
            }),
          ],
          npcs: [
            expect.objectContaining({
              locationName: "Shibuya District",
              sceneLocationName: "Platform B5",
            }),
          ],
        }),
      );
    });
  });
});
