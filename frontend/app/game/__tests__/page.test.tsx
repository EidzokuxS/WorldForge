import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(),
  apiStreamPost: vi.fn(),
  chatAction: vi.fn(),
  chatEdit: vi.fn(),
  chatHistory: vi.fn(),
  chatRetry: vi.fn(),
  chatUndo: vi.fn(),
  getActiveCampaign: vi.fn(),
  getRememberedCampaignId: vi.fn(),
  getImageUrl: vi.fn(),
  getWorldData: vi.fn(),
  loadCampaign: vi.fn(),
  parseTurnSSE: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/game/location-panel", () => ({
  LocationPanel: () => <div data-testid="location-panel" />,
}));
vi.mock("@/components/game/narrative-log", () => ({
  NarrativeLog: ({ onRetry }: { onRetry: () => void }) => (
    <div data-testid="narrative-log">
      <button type="button" onClick={onRetry}>
        Retry turn
      </button>
    </div>
  ),
}));
vi.mock("@/components/game/character-panel", () => ({
  CharacterPanel: () => <div data-testid="character-panel" />,
}));
vi.mock("@/components/game/lore-panel", () => ({
  LorePanel: () => <div data-testid="lore-panel" />,
}));
vi.mock("@/components/game/checkpoint-panel", () => ({
  CheckpointPanel: () => <div data-testid="checkpoint-panel" />,
}));
vi.mock("@/components/game/action-bar", () => ({
  ActionBar: () => <div data-testid="action-bar" />,
}));
vi.mock("@/components/game/oracle-panel", () => ({
  OraclePanel: () => <div data-testid="oracle-panel" />,
}));
vi.mock("@/components/game/quick-actions", () => ({
  QuickActions: ({ onAction }: { onAction: (action: string) => void }) => (
    <div data-testid="quick-actions">
      <button type="button" onClick={() => onAction("Scout ahead")}>
        Trigger quick action
      </button>
    </div>
  ),
}));

import {
  apiGet,
  chatAction,
  chatHistory,
  chatRetry,
  getActiveCampaign,
  getRememberedCampaignId,
  getWorldData,
  loadCampaign,
} from "@/lib/api";
import GamePage from "../page";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetWorld = vi.mocked(getWorldData);
const mockedApiGet = vi.mocked(apiGet);
const mockedChatAction = vi.mocked(chatAction);
const mockedChatHistory = vi.mocked(chatHistory);
const mockedChatRetry = vi.mocked(chatRetry);
const mockedGetRememberedCampaignId = vi.mocked(getRememberedCampaignId);
const mockedLoadCampaign = vi.mocked(loadCampaign);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fakeCampaign = {
  id: "test-campaign",
  name: "Test Campaign",
  premise: "A dark world",
};

const fakeWorldData = {
  player: {
    id: "player-1",
    name: "Hero",
    currentLocationId: "loc-1",
    tags: [],
    hp: 5,
  },
  locations: [
    { id: "loc-1", name: "Town Square", tags: [], connectedTo: ["loc-2"] },
    { id: "loc-2", name: "Dark Forest", tags: [], connectedTo: ["loc-1"] },
  ],
  npcs: [],
  factions: [],
  items: [],
  relationships: [],
};

const fakeChatHistory = {
  messages: [
    { role: "user" as const, content: "Look around" },
    { role: "assistant" as const, content: "You see a bustling town square." },
  ],
  premise: "A dark world",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRememberedCampaignId.mockReturnValue(null);
});

describe("GamePage", () => {
  it("renders loading state while initializing", () => {
    mockedGetActive.mockReturnValue(new Promise(() => {}));

    render(<GamePage />);

    expect(screen.getByText("Loading campaign...")).toBeInTheDocument();
  });

  it("redirects to title screen when no active campaign", async () => {
    mockedGetActive.mockResolvedValue(null as never);

    render(<GamePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("renders full game layout after initialization", async () => {
    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByTestId("location-panel")).toBeInTheDocument();
    });

    expect(screen.getByTestId("narrative-log")).toBeInTheDocument();
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
    expect(screen.getByTestId("lore-panel")).toBeInTheDocument();
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
    expect(screen.getByTestId("oracle-panel")).toBeInTheDocument();
    expect(screen.getByTestId("quick-actions")).toBeInTheDocument();
  });

  it("renders toolbar with Title, Settings, and Saves buttons", async () => {
    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
    });

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Saves")).toBeInTheDocument();
  });

  it("renders checkpoint panel when campaign is active", async () => {
    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByTestId("checkpoint-panel")).toBeInTheDocument();
    });
  });

  it("loads the remembered campaign before fetching explicit campaign history on reload", async () => {
    mockedGetActive.mockResolvedValue(null as never);
    mockedGetRememberedCampaignId.mockReturnValue(fakeCampaign.id);
    mockedLoadCampaign.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);

    render(<GamePage />);

    await waitFor(() => {
      expect(mockedLoadCampaign).toHaveBeenCalledWith(fakeCampaign.id);
    });

    await waitFor(() => {
      expect(mockedChatHistory).toHaveBeenCalledWith(fakeCampaign.id);
    });
    expect(mockedGetWorld).toHaveBeenCalledWith(fakeCampaign.id);
    expect(mockedApiGet).not.toHaveBeenCalled();
  });

  it("passes the active campaign id into the explicit gameplay helpers", async () => {
    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);
    mockedChatAction.mockResolvedValue(
      new Response("event: done\ndata: {}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }) as never,
    );
    mockedChatRetry.mockResolvedValue(
      new Response("event: done\ndata: {}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }) as never,
    );

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByTestId("quick-actions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Trigger quick action"));

    await waitFor(() => {
      expect(mockedChatAction).toHaveBeenCalledWith(
        fakeCampaign.id,
        "Scout ahead",
        "Scout ahead",
        "",
      );
    });

    fireEvent.click(screen.getByText("Retry turn"));

    await waitFor(() => {
      expect(mockedChatRetry).toHaveBeenCalledWith(fakeCampaign.id);
    });
  });
});
