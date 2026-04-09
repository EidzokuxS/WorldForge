import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  NarrativeLog: ({
    canRetryUndo,
    isStreaming,
    messages,
    onRetry,
    turnPhase,
  }: {
    canRetryUndo?: boolean;
    isStreaming?: boolean;
    messages?: Array<{ role: string; content: string }>;
    onRetry?: () => void;
    turnPhase?: "idle" | "streaming" | "finalizing";
  }) => (
    <div data-testid="narrative-log">
      <div data-testid="turn-phase">
        {turnPhase ?? (isStreaming ? "streaming" : "idle")}
      </div>
      {messages?.map((message, index) => (
        <p key={`${message.role}-${index}`}>{message.content}</p>
      ))}
      {turnPhase === "finalizing" ? (
        <p>The world is still resolving. Retry and undo unlock when the turn is complete.</p>
      ) : null}
      {turnPhase !== "finalizing" && isStreaming ? (
        <p>The storyteller is weaving the scene...</p>
      ) : null}
      {canRetryUndo ? (
        <button type="button" onClick={onRetry}>
          Retry turn
        </button>
      ) : null}
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
  ActionBar: ({
    disabled,
    isLoading,
    onChange,
    onSubmit,
    value,
  }: {
    disabled?: boolean;
    isLoading?: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    value: string;
  }) => (
    <div data-testid="action-bar">
      <textarea
        aria-label="Action input"
        disabled={disabled || isLoading}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={onSubmit}
      >
        Submit action
      </button>
    </div>
  ),
}));
vi.mock("@/components/game/oracle-panel", () => ({
  OraclePanel: () => <div data-testid="oracle-panel" />,
}));
vi.mock("@/components/game/quick-actions", () => ({
  QuickActions: ({
    actions,
    disabled,
    onAction,
  }: {
    actions?: Array<{ action: string; label: string }>;
    disabled?: boolean;
    onAction: (action: string) => void;
  }) => (
    <div data-testid="quick-actions">
      {actions?.map((action) => (
        <button
          key={action.action}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action.action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

import { toast } from "sonner";
import {
  apiGet,
  chatAction,
  chatHistory,
  chatRetry,
  getActiveCampaign,
  getRememberedCampaignId,
  getWorldData,
  loadCampaign,
  parseTurnSSE,
} from "@/lib/api";
import GamePage from "../page";

const mockedToast = vi.mocked(toast);
const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetWorld = vi.mocked(getWorldData);
const mockedApiGet = vi.mocked(apiGet);
const mockedChatAction = vi.mocked(chatAction);
const mockedChatHistory = vi.mocked(chatHistory);
const mockedChatRetry = vi.mocked(chatRetry);
const mockedGetRememberedCampaignId = vi.mocked(getRememberedCampaignId);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedParseTurnSSE = vi.mocked(parseTurnSSE);

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
  hasLiveTurnSnapshot: false,
};

function createStreamResponse(): Response {
  return new Response("event: done\ndata: {}\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function renderReadyGame(history = fakeChatHistory) {
  mockedGetActive.mockResolvedValue(fakeCampaign as never);
  mockedChatHistory.mockResolvedValue(history as never);
  mockedGetWorld.mockResolvedValue(fakeWorldData as never);

  render(<GamePage />);

  return waitFor(() => {
    expect(screen.getByTestId("location-panel")).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRememberedCampaignId.mockReturnValue(null);
  mockedParseTurnSSE.mockImplementation(async (_body, handlers) => {
    handlers.onDone();
  });
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
    await renderReadyGame();

    expect(screen.getByTestId("narrative-log")).toBeInTheDocument();
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
    expect(screen.getByTestId("lore-panel")).toBeInTheDocument();
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
    expect(screen.getByTestId("oracle-panel")).toBeInTheDocument();
    expect(screen.getByTestId("quick-actions")).toBeInTheDocument();
  });

  it("renders toolbar with Title, Settings, and Saves buttons", async () => {
    await renderReadyGame();

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Saves")).toBeInTheDocument();
  });

  it("renders checkpoint panel when campaign is active", async () => {
    await renderReadyGame();

    expect(screen.getByTestId("checkpoint-panel")).toBeInTheDocument();
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
    await renderReadyGame({
      ...fakeChatHistory,
      hasLiveTurnSnapshot: true,
    });
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedChatRetry.mockResolvedValue(createStreamResponse() as never);

    fireEvent.change(screen.getByLabelText("Action input"), {
      target: { value: "Scout ahead" },
    });
    fireEvent.click(screen.getByText("Submit action"));

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

  it("does not expose retry controls for reloaded history without a live snapshot", async () => {
    await renderReadyGame();

    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
  });

  it("keeps retry, quick actions, and the player-facing status non-ready during finalization", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);

    let finishTurn: (() => void) | null = null;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The gate shudders open.");
      handlers.onQuickActions([{ label: "Press forward", action: "Press forward" }]);
      (handlers as typeof handlers & { onFinalizing?: () => void }).onFinalizing?.();
      await new Promise<void>((resolve) => {
        finishTurn = resolve;
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Action input"), {
      target: { value: "Open the gate" },
    });
    fireEvent.click(screen.getByText("Submit action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
    expect(screen.queryByText("Press forward")).not.toBeInTheDocument();
    expect(screen.getByText("The world is still resolving. Retry and undo unlock when the turn is complete.")).toBeInTheDocument();
    expect(screen.queryByText("The storyteller is weaving the scene...")).not.toBeInTheDocument();
    expect(screen.getByText("Submit action")).toBeDisabled();

    finishTurn?.();
    await waitFor(() => {
      expect(screen.getByText("Retry turn")).toBeInTheDocument();
    });
  });

  it("reveals quick actions only after authoritative done arrives", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);

    let releaseDone: (() => void) | null = null;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The scouts return.");
      handlers.onQuickActions([{ label: "Ask for details", action: "Ask for details" }]);
      (handlers as typeof handlers & { onFinalizing?: () => void }).onFinalizing?.();
      await new Promise<void>((resolve) => {
        releaseDone = resolve;
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Action input"), {
      target: { value: "Send the scouts" },
    });
    fireEvent.click(screen.getByText("Submit action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Ask for details")).not.toBeInTheDocument();

    releaseDone?.();

    await waitFor(() => {
      expect(screen.getByText("Ask for details")).toBeInTheDocument();
    });
  });

  it("restores the honest pre-turn boundary after a failed retry", async () => {
    const completedHistory = {
      messages: [
        { role: "user" as const, content: "Wake up" },
        { role: "assistant" as const, content: "You wake inside the ruin." },
        { role: "user" as const, content: "Open the gate" },
        { role: "assistant" as const, content: "The gate grinds open." },
      ],
      premise: "A dark world",
      hasLiveTurnSnapshot: true,
    };
    const restoredBoundaryHistory = {
      messages: [
        { role: "user" as const, content: "Wake up" },
        { role: "assistant" as const, content: "You wake inside the ruin." },
      ],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    };

    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(completedHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);
    mockedChatRetry.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockRejectedValueOnce(new Error("Retry replay failed"));

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByText("Retry turn")).toBeInTheDocument();
    });

    mockedChatHistory.mockResolvedValue(restoredBoundaryHistory as never);
    fireEvent.click(screen.getByText("Retry turn"));

    await waitFor(() => {
      expect(screen.queryByText("Open the gate")).not.toBeInTheDocument();
    });

    expect(screen.getByText("You wake inside the ruin.")).toBeInTheDocument();
    expect(screen.queryByText("The gate grinds open.")).not.toBeInTheDocument();
    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
    expect(mockedToast.error).toHaveBeenCalledWith("Failed to retry", {
      description: "Retry replay failed",
    });
    expect(screen.getByText("Submit action")).toBeEnabled();
  });
});
