import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const repoRoot = process.cwd().replace(/\\/g, "/").endsWith("/frontend")
  ? resolve(process.cwd(), "..")
  : process.cwd();
const repoPath = (path: string) => resolve(repoRoot, path);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockUseSettings = vi.fn();

vi.mock("@/lib/use-settings", () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(),
  apiStreamPost: vi.fn(),
  chatAction: vi.fn(),
  chatEdit: vi.fn(),
  chatHistory: vi.fn(),
  chatLookup: vi.fn(),
  chatOpening: vi.fn(),
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

const mockLocationPanel = vi.fn(
  ({
    connectedPaths,
    disabled,
    location,
    npcsHere,
    onMove,
    scene,
  }: {
    connectedPaths?: Array<{ id: string; name: string; travelCost?: number | null }>;
    disabled?: boolean;
    location?: { recentHappenings?: Array<{ id: string; summary: string }> } | null;
    npcsHere?: Array<{ id: string; name: string }>;
    onMove?: (targetLocationName: string) => void;
    scene?: { name?: string | null; broadLocationName?: string | null; hintSignals?: string[] } | null;
  }) => (
    <div data-testid="location-panel">
      <div data-testid="location-path-count">{connectedPaths?.length ?? 0}</div>
      <div data-testid="location-path-names">
        {(connectedPaths ?? []).map((path) => `${path.name}:${path.travelCost ?? "?"}`).join("|")}
      </div>
      {(connectedPaths ?? []).map((path) => (
        <button
          key={path.id}
          type="button"
          disabled={disabled}
          onClick={() => onMove?.(path.name)}
        >
          Travel to {path.name}
        </button>
      ))}
      <div data-testid="location-scene-name">{scene?.name ?? "none"}</div>
      <div data-testid="location-scene-broad-name">{scene?.broadLocationName ?? "none"}</div>
      <div data-testid="location-scene-hints">{(scene?.hintSignals ?? []).join("|")}</div>
      <div data-testid="recent-happenings-count">
        {location?.recentHappenings?.length ?? 0}
      </div>
      <div data-testid="location-people-count">{npcsHere?.length ?? 0}</div>
      <div data-testid="location-people-names">
        {(npcsHere ?? []).map((npc) => npc.name).join("|")}
      </div>
    </div>
  ),
);

vi.mock("@/components/game/location-panel", () => ({
  LocationPanel: (props: unknown) => mockLocationPanel(props as never),
}));
const narrativeLogMessageSnapshots: string[][] = [];
const mockNarrativeLog = vi.fn(
  ({
    canRetryUndo,
    isStreaming,
    messages,
    onRetry,
    sceneProgress,
    showRawReasoning,
    turnPhase,
  }: {
    canRetryUndo?: boolean;
    isStreaming?: boolean;
    messages?: Array<{ role: string; content: string; debugReasoning?: string | null }>;
    onRetry?: () => void;
    sceneProgress?: "opening" | "scene-settling" | null;
    showRawReasoning?: boolean;
    turnPhase?: "idle" | "streaming" | "finalizing";
  }) => (
    (() => {
      narrativeLogMessageSnapshots.push(
        (messages ?? []).map((message) => message.content),
      );

      return (
        <div data-testid="narrative-log">
          <div data-testid="turn-phase">
            {turnPhase ?? (isStreaming ? "streaming" : "idle")}
          </div>
          <div data-testid="scene-progress">{sceneProgress ?? "none"}</div>
          {messages?.length ? (
            messages.map((message, index) => (
              <p key={`${message.role}-${index}`}>{message.content}</p>
            ))
          ) : (
            <p>Begin your adventure when the opening scene is ready.</p>
          )}
          {showRawReasoning
            ? messages
                ?.filter(
                  (message) =>
                    message.role === "assistant"
                    && typeof message.debugReasoning === "string"
                    && message.debugReasoning.trim().length > 0
                    && !message.content.startsWith("[Lookup:"),
                )
                .map((message, index) => (
                  <div key={`reasoning-${index}`}>
                    <p>Raw reasoning</p>
                    <p>{message.debugReasoning}</p>
                  </div>
                ))
            : null}
          {sceneProgress === "opening" ? (
            <p>The opening scene is taking shape. The runtime is grounding your first moment before narration appears.</p>
          ) : null}
          {sceneProgress === "scene-settling" ? (
            <p>The GM is applying world changes before the narration begins.</p>
          ) : null}
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
      );
    })()
  ),
);
vi.mock("@/components/game/narrative-log", () => ({
  NarrativeLog: (props: unknown) => mockNarrativeLog(props as never),
}));
const mockCharacterPanel = vi.fn(() => <div data-testid="character-panel" />);
vi.mock("@/components/game/character-panel", () => ({
  CharacterPanel: (props: unknown) => mockCharacterPanel(props),
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
        placeholder="Detail your next action..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p>RP markup: &quot;speech&quot;, *action*, **emphasis**</p>
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

vi.mock("@/components/game/play-surface/game-scene-shell", () => ({
  GameSceneShell: ({
    actionDock,
    backdrop,
    drawerHost,
    hud,
    leftStageSlot,
    narrationDock,
    presenceSlot,
    rightStageSlot,
    stageOverlay,
    widgetRail,
  }: {
    actionDock: React.ReactNode;
    backdrop: React.ReactNode;
    drawerHost: React.ReactNode;
    hud: React.ReactNode;
    leftStageSlot?: React.ReactNode;
    narrationDock: React.ReactNode;
    presenceSlot?: React.ReactNode;
    rightStageSlot?: React.ReactNode;
    stageOverlay?: React.ReactNode;
    widgetRail: React.ReactNode;
  }) => (
    <main
      data-testid="game-scene-shell"
      data-shell-region="game-root"
      className="h-screen flex flex-col overflow-hidden"
    >
      {backdrop}
      {hud}
      {stageOverlay}
      <aside data-testid="stage-left-zone">{leftStageSlot}</aside>
      <aside data-testid="stage-right-zone">{rightStageSlot}</aside>
      {presenceSlot}
      <section data-testid="game-reader-column" data-shell-region="reader">
        {narrationDock}
      </section>
      <section data-testid="game-action-dock" data-shell-region="action-dock" className="flex-none">
        {actionDock}
      </section>
      {widgetRail}
      {drawerHost}
    </main>
  ),
}));

vi.mock("@/components/game/play-surface/scene-backdrop", () => ({
  SceneBackdrop: ({
    broadLocationName,
    sceneName,
  }: {
    broadLocationName?: string | null;
    sceneName?: string | null;
  }) => (
    <div data-testid="scene-backdrop">
      {sceneName ?? "Scene loading"} / {broadLocationName ?? "Unknown location"}
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/scene-hud", () => ({
  SceneHUD: ({
    onHome,
    onSaves,
    onSettings,
    status,
  }: {
    onHome?: () => void;
    onSaves?: () => void;
    onSettings?: () => void;
    status: string;
  }) => (
    <div data-testid="scene-hud">
      <span>{status}</span>
      <button type="button" onClick={onHome}>Home</button>
      <button type="button" onClick={onSettings}>Settings</button>
      <button type="button" onClick={onSaves}>Saves</button>
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/stage-overlay", () => ({
  StageOverlay: () => <div data-testid="stage-overlay" />,
}));

vi.mock("@/components/game/play-surface/presence-layer", () => ({
  PresenceLayer: ({
    hintSignals,
    offscreenAnchorCount,
    onSelectActor,
    selectedActorId,
    visibleActors,
  }: {
    hintSignals: string[];
    offscreenAnchorCount?: number;
    onSelectActor: (actorId: string) => void;
    selectedActorId: string | null;
    visibleActors: Array<{ id: string; name: string }>;
  }) => (
    <div data-testid="presence-layer">
      {visibleActors.map((actor) => (
        <button
          key={actor.id}
          type="button"
          aria-label={`Open ${actor.name} character details`}
          aria-pressed={selectedActorId === actor.id}
          onClick={() => onSelectActor(actor.id)}
        >
          {actor.name}
        </button>
      ))}
      {hintSignals.map((signal, index) => (
        <p key={`${signal}-${index}`} data-testid={`presence-hint-${index}`} aria-disabled="true">
          {signal}
        </p>
      ))}
      {offscreenAnchorCount ? (
        <p data-testid="presence-offscreen-anchor-count">{offscreenAnchorCount} off-screen anchors</p>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/narration-dock", () => ({
  NarrationDock: ({
    beats,
    onNextBeat,
    onOpenLog,
    onToggleAuto,
    statusCopy,
  }: {
    beats?: Array<{ text: string }>;
    onNextBeat: () => void;
    onOpenLog: () => void;
    onToggleAuto: () => void;
    statusCopy?: string;
  }) => (
    <div data-testid="narration-dock">
      {statusCopy ? <p>{statusCopy}</p> : <p>Ready</p>}
      {(beats ?? []).map((beat, index) => (
        <p key={`${beat.text}-${index}`}>{beat.text}</p>
      ))}
      <button type="button" onClick={onNextBeat}>Next</button>
      <button type="button" onClick={onToggleAuto}>Auto</button>
      <button type="button" onClick={onOpenLog}>Log</button>
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/action-dock", () => ({
  ActionDock: ({
    isBusy,
    onChange,
    onContinue,
    onSubmitAction,
    quickActions,
    value,
  }: {
    isBusy?: boolean;
    onChange: (value: string) => void;
    onContinue: () => void;
    onSubmitAction: (value: string) => void;
    quickActions: Array<{ action: string; label: string }>;
    value: string;
  }) => (
    <div data-testid="action-dock">
      <textarea
        aria-label="Scene action"
        disabled={isBusy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label="Send action"
        disabled={isBusy || value.trim().length === 0}
        onClick={() => onSubmitAction(value.trim())}
      >
        Send
      </button>
      <button type="button" disabled={isBusy} onClick={onContinue}>
        Continue
      </button>
      {quickActions.map((action) => (
        <button
          key={action.action}
          type="button"
          disabled={isBusy}
          onClick={() => onSubmitAction(action.action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/widget-rail", () => ({
  WidgetRail: ({
    activeDrawer,
    onOpenDrawer,
  }: {
    activeDrawer: string | null;
    onOpenDrawer: (drawer: string) => void;
  }) => (
    <div data-testid="widget-rail" data-active-drawer={activeDrawer ?? ""}>
      {["Log", "World", "Inventory", "Journal", "Character", "Inspect", "Saves"].map((label) => (
        <button
          key={label}
          type="button"
          data-active={activeDrawer === label.toLowerCase() ? "true" : "false"}
          onClick={() => onOpenDrawer(label.toLowerCase())}
        >
          {label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/drawer-host", () => ({
  DrawerHost: ({
    activeDrawer,
    onClose,
    playerName,
    selectedActorName,
    slots,
  }: {
    activeDrawer: string | null;
    onClose: () => void;
    playerName?: string | null;
    selectedActorName?: string | null;
    slots: Record<string, React.ReactNode>;
  }) => (
    <div data-testid="drawer-host" data-active-drawer={activeDrawer ?? ""}>
      {activeDrawer ? (
        <section role="dialog" aria-label={activeDrawer}>
          <button type="button" onClick={onClose}>Close drawer</button>
          {activeDrawer === "character" ? (
            <p>{`Viewing ${selectedActorName ?? playerName ?? "Character"}`}</p>
          ) : null}
          {slots[activeDrawer]}
        </section>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/game/play-surface/inspect-drawer", () => ({
  InspectDrawer: ({
    currentBeat,
    debugReasoning,
    oracleResult,
    showDebug,
    status,
  }: {
    currentBeat?: { text?: string; rawDetails?: { chance: number; roll: number; reasoning: string } } | null;
    debugReasoning?: string | null;
    oracleResult?: { chance: number; roll: number; outcome: string; reasoning: string } | null;
    showDebug?: boolean;
    status: string;
  }) => (
    <div data-testid="inspect-drawer">
      <p>{status}</p>
      {currentBeat?.text ? <p>{currentBeat.text}</p> : null}
      {oracleResult ? (
        <dl>
          <dt>Chance</dt>
          <dd>{oracleResult.chance}%</dd>
          <dt>Roll</dt>
          <dd>{oracleResult.roll}</dd>
          <dt>Outcome</dt>
          <dd>{oracleResult.outcome}</dd>
          <dt>Reason</dt>
          <dd>{oracleResult.reasoning}</dd>
        </dl>
      ) : (
        <p>No mechanics for the current beat. Raw details appear here only when available.</p>
      )}
      {showDebug && debugReasoning ? (
        <section>
          <h3>Raw reasoning</h3>
          <p>{debugReasoning}</p>
        </section>
      ) : null}
    </div>
  ),
}));

import { toast } from "sonner";
import {
  apiGet,
  chatAction,
  chatHistory,
  chatLookup,
  chatOpening,
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
const mockedChatLookup = vi.mocked(chatLookup);
const mockedChatOpening = vi.mocked(chatOpening);
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
    sceneScopeId: "loc-1",
    tags: [],
    hp: 5,
  },
  locations: [
    {
      id: "loc-1",
      name: "Town Square",
      description: "The plaza at the city center.",
      tags: [],
      connectedTo: ["loc-stale"],
      connectedPaths: [
        {
          edgeId: "edge-1",
          toLocationId: "loc-2",
          toLocationName: "Dark Forest",
          travelCost: 2,
          discovered: true,
        },
      ],
      recentHappenings: [
        {
          id: "event-1",
          locationId: "loc-1",
          sourceLocationId: null,
          anchorLocationId: null,
          eventType: "scene",
          summary: "The fountain still glows from last night's ritual.",
          tick: 12,
          importance: 3,
          archivedAtTick: null,
          createdAt: 1700000000000,
        },
      ],
    },
    {
      id: "loc-2",
      name: "Dark Forest",
      description: "Dense trees press close around the path.",
      tags: [],
      connectedTo: ["loc-1"],
      connectedPaths: [],
      recentHappenings: [],
    },
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
    expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
  });
}

function renderReadyGameWithWorld(worldData: unknown, history = fakeChatHistory) {
  mockedGetActive.mockResolvedValue(fakeCampaign as never);
  mockedChatHistory.mockResolvedValue(history as never);
  mockedGetWorld.mockResolvedValue(worldData as never);

  render(<GamePage />);

  return waitFor(() => {
    expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
  });
}

function openDrawer(label: string) {
  fireEvent.click(
    within(screen.getByTestId("widget-rail")).getByRole("button", { name: label }),
  );
}

function getLatestNarrativeLogProps() {
  return mockNarrativeLog.mock.calls.at(-1)?.[0] as
    | {
        messages?: Array<{ role: string; content: string; debugReasoning?: string | null }>;
        showRawReasoning?: boolean;
      }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  narrativeLogMessageSnapshots.length = 0;
  mockedGetRememberedCampaignId.mockReturnValue(null);
  mockUseSettings.mockReturnValue({
    settings: {
      ui: { showRawReasoning: false },
    },
    isLoading: false,
    isSaving: false,
    setSettings: vi.fn(),
    save: vi.fn(),
  });
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

  it("renders scene-first game layout after initialization without default drawer panels", async () => {
    await renderReadyGame();

    expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
    expect(screen.getByTestId("scene-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("narration-dock")).toBeInTheDocument();
    expect(screen.getByTestId("game-reader-column")).toBeInTheDocument();
    expect(screen.getByTestId("game-action-dock")).toBeInTheDocument();
    expect(screen.getByTestId("action-dock")).toBeInTheDocument();
    expect(screen.getByTestId("widget-rail")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-host")).toHaveAttribute("data-active-drawer", "");
    expect(screen.queryByTestId("narrative-log")).not.toBeInTheDocument();
    expect(screen.queryByTestId("location-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("character-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lore-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oracle-panel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scene action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("uses wide desktop stage zones for scene context instead of empty side bands", async () => {
    await renderReadyGame();

    expect(screen.getByTestId("stage-left-zone")).toHaveTextContent("Town Square");
    expect(screen.getByTestId("stage-left-zone")).toHaveTextContent("1 route nearby");
    expect(screen.getByTestId("stage-right-zone")).toHaveTextContent("Presence");
    expect(screen.getByTestId("stage-right-zone")).toHaveTextContent("No one visible");
  });

  it("opens existing Log, World, Character, Journal, Inspect, Inventory, and Saves surfaces from widgets", async () => {
    await renderReadyGame();

    openDrawer("Log");
    expect(screen.getByTestId("narrative-log")).toBeInTheDocument();

    openDrawer("World");
    expect(screen.getByTestId("location-panel")).toBeInTheDocument();

    openDrawer("Character");
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
    expect(screen.getByText("Viewing Hero")).toBeInTheDocument();

    openDrawer("Journal");
    expect(screen.getByTestId("lore-panel")).toBeInTheDocument();
    expect(screen.queryByText("World Lore")).not.toBeInTheDocument();

    openDrawer("Inspect");
    expect(screen.getByTestId("inspect-drawer")).toBeInTheDocument();
    expect(screen.getByText("No mechanics for the current beat. Raw details appear here only when available.")).toBeInTheDocument();

    openDrawer("Inventory");
    expect(screen.getByTestId("inventory-drawer")).toBeInTheDocument();

    openDrawer("Saves");
    expect(screen.getByTestId("checkpoint-panel")).toBeInTheDocument();
  });

  it("renders the scene-shell vertical slice instead of permanent cockpit columns", async () => {
    await renderReadyGame();

    expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
    expect(screen.getByTestId("scene-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("narration-dock")).toBeInTheDocument();
    expect(screen.getByTestId("action-dock")).toBeInTheDocument();
    expect(document.querySelector('[data-shell-region="game-columns"]')).toBeNull();
  });

  it("keeps Next, Auto, and Log local without backend turn helpers", async () => {
    await renderReadyGame();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(
      within(screen.getByTestId("narration-dock")).getByRole("button", { name: "Log" }),
    );

    expect(mockedChatAction).not.toHaveBeenCalled();
    expect(mockedChatOpening).not.toHaveBeenCalled();
    expect(mockedChatLookup).not.toHaveBeenCalled();
    expect(mockedChatRetry).not.toHaveBeenCalled();
    expect(mockedParseTurnSSE).not.toHaveBeenCalled();
    expect(screen.getByTestId("drawer-host")).toHaveAttribute("data-active-drawer", "log");
  });

  it("routes Send and visible Continue through the existing backend turn path", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Scout ahead" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatAction).toHaveBeenCalledWith(
        fakeCampaign.id,
        "Scout ahead",
        "Scout ahead",
        "",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockedChatAction).toHaveBeenCalledWith(
        fakeCampaign.id,
        "Continue scene.",
        "Continue scene.",
        "",
      );
    });
  });

  it("keeps the drafted action when the turn stream never opens", async () => {
    await renderReadyGame();
    mockedChatAction.mockRejectedValueOnce(new Error("backend restarting"));

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Open the nearest sealed office" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatAction).toHaveBeenCalledWith(
        fakeCampaign.id,
        "Open the nearest sealed office",
        "Open the nearest sealed office",
        "",
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Scene action")).toHaveValue(
        "Open the nearest sealed office",
      );
    });
  });

  it("contains oracle mechanics in Inspect and keeps raw debug terms out of the default scene", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onOracleResult({
        chance: 65,
        roll: 68,
        outcome: "miss",
        reasoning: "The timing almost works, but the platform crowd breaks line of sight.",
      });
      handlers.onNarrative("The curse slips away through the closing train doors.");
      handlers.onReasoning?.({ text: "debug-only provider trace" });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Catch the curse" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(screen.getByText("Close call")).toBeInTheDocument();
    });

    expect(screen.queryByText("Chance")).not.toBeInTheDocument();
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
    expect(screen.queryByText("scene-settling")).not.toBeInTheDocument();
    expect(screen.queryByText("payload")).not.toBeInTheDocument();
    expect(screen.queryByText("Support Actions")).not.toBeInTheDocument();

    openDrawer("Inspect");
    expect(screen.getByTestId("inspect-drawer")).toHaveTextContent("Close call");
    expect(screen.getByText("Chance")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("Roll")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("The timing almost works, but the platform crowd breaks line of sight.")).toBeInTheDocument();
    expect(screen.queryByText("debug-only provider trace")).not.toBeInTheDocument();
  });

  it("shows GM loop progress copy for Phase 81 scene-settling stages", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    let releaseTurn: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onSceneSettling?.({ phase: "gm-read" });
      handlers.onSceneSettling?.({ phase: "gm-action-checklist" });
      handlers.onSceneSettling?.({ phase: "tool-step" });
      handlers.onSceneSettling?.({ phase: "creating-local-scene" });
      handlers.onSceneSettling?.({ phase: "spawning-support-npc" });
      handlers.onSceneSettling?.({ phase: "promoting-support-npc" });
      handlers.onSceneSettling?.({ phase: "settling-tool-observation" });
      handlers.onSceneSettling?.({ phase: "cleaning-transient-scene" });
      handlers.onSceneSettling?.({ phase: "settled-packet" });
      await new Promise<void>((resolve) => {
        releaseTurn = resolve;
      });
      handlers.onSceneSettling?.({ phase: "final-narration" });
      handlers.onNarrative("The lock rattles once and holds.");
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Try the side door" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(screen.getByTestId("narration-dock")).toHaveTextContent("Syncing world truth");
    });
    expect(screen.queryByText("creating-local-scene")).not.toBeInTheDocument();
    expect(screen.queryByText("spawning-support-npc")).not.toBeInTheDocument();
    expect(screen.queryByText("promoting-support-npc")).not.toBeInTheDocument();
    expect(screen.queryByText("settling-tool-observation")).not.toBeInTheDocument();
    expect(screen.queryByText("cleaning-transient-scene")).not.toBeInTheDocument();
    expect(screen.queryByText("gm-read")).not.toBeInTheDocument();
    expect(screen.queryByText("gm-action-checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("tool-step")).not.toBeInTheDocument();
    expect(screen.queryByText("settled-packet")).not.toBeInTheDocument();

    releaseTurn?.();

    await waitFor(() => {
      expect(screen.getByText("The lock rattles once and holds.")).toBeInTheDocument();
    });
  });

  it("clears stale Oracle mechanics when a direct no-roll turn streams no oracle_result", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onOracleResult({
        chance: 65,
        roll: 68,
        outcome: "miss",
        reasoning: "Stale roll that belongs to the previous turn.",
      });
      handlers.onNarrative("The first turn needed mechanics.");
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Catch the curse" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(screen.getByText("Close call")).toBeInTheDocument();
    });

    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("Iru answers plainly without resistance.");
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Ask Iru if she is safe" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(2);
    });

    openDrawer("Inspect");
    expect(screen.getByText("No mechanics for the current beat. Raw details appear here only when available.")).toBeInTheDocument();
    expect(screen.queryByText("Chance")).not.toBeInTheDocument();
    expect(screen.queryByText("65%")).not.toBeInTheDocument();
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
    expect(screen.queryByText("68")).not.toBeInTheDocument();
  });

  it("does not require Act, Speak, or Observe mode controls for freeform turns", async () => {
    await renderReadyGame();

    expect(screen.getByLabelText("Scene action")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Act" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Speak" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Observe" })).not.toBeInTheDocument();
  });

  it("restores the action draft from the same campaign-scoped storage key", async () => {
    mockedGetActive.mockResolvedValue(fakeCampaign as never);
    mockedChatHistory.mockResolvedValue(fakeChatHistory as never);
    mockedGetWorld.mockResolvedValue(fakeWorldData as never);
    const { unmount } = render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Scene action")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Watch the platform edge" },
    });

    expect(window.localStorage.getItem(`worldforge:game:draft:${fakeCampaign.id}`)).toBe(
      "Watch the platform edge",
    );

    unmount();
    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Scene action")).toHaveValue("Watch the platform edge");
    });
  });

  it("preserves draft and scene state while opening and closing every drawer", async () => {
    await renderReadyGame();

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Hold the line while watching Nobara" },
    });

    for (const label of ["Log", "World", "Inventory", "Journal", "Character", "Inspect", "Saves"]) {
      openDrawer(label);
      expect(screen.getByLabelText("Scene action")).toHaveValue("Hold the line while watching Nobara");
      expect(screen.getByTestId("scene-backdrop")).toHaveTextContent("Town Square");
      fireEvent.click(screen.getByText("Close drawer"));
      expect(screen.getByLabelText("Scene action")).toHaveValue("Hold the line while watching Nobara");
    }
  });

  it("uses the exported Continue payload and extracted play-surface hook", () => {
    const pageSource = readFileSync(
      repoPath("frontend/app/game/page.tsx"),
      "utf8",
    );
    const playSurfaceSources = [
      "frontend/components/game/play-surface/game-scene-shell.tsx",
      "frontend/components/game/play-surface/action-dock.tsx",
      "frontend/components/game/play-surface/drawer-host.tsx",
    ].map((path) => readFileSync(repoPath(path), "utf8")).join("\n");

    expect(pageSource).toMatch(/CONTINUE_ACTION_PAYLOAD/);
    expect(pageSource).not.toMatch(/submitAction\("Continue scene\."\)/);
    expect(pageSource).toMatch(/useGamePlaySurfaceState/);
    expect(pageSource).toMatch(/InspectDrawer/);
    expect(pageSource).not.toMatch(/<OraclePanel/);
    expect(playSurfaceSources).toMatch(/data-shell-region="reader"/);
    expect(playSurfaceSources).toMatch(/data-shell-region="action-dock"/);
    expect(playSurfaceSources).toMatch(/backdrop-blur/);
  });

  it("does not render premise as opening narration and keeps a neutral opening placeholder on /game when no assistant messages exist", async () => {
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);
    await renderReadyGame({
      messages: [],
      premise: "You awake in a dungeon.",
      hasLiveTurnSnapshot: false,
    });

    expect(screen.queryByText("You awake in a dungeon.")).not.toBeInTheDocument();
    expect(screen.getByTestId("narration-dock")).toHaveTextContent("Ready");
  });

  it("requests opening scene generation when the campaign has no assistant messages", async () => {
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);

    await renderReadyGame({
      messages: [],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    await waitFor(() => {
      expect(mockedChatOpening).toHaveBeenCalledWith(fakeCampaign.id);
    });
  });

  it("still requests opening scene generation when history only contains factual lookup assistant entries", async () => {
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);

    await renderReadyGame({
      messages: [
        { role: "user" as const, content: "/lookup character: Satoru Gojo" },
        {
          role: "assistant" as const,
          content: "[Lookup: character_canon_fact] Gojo remains sealed until the Prison Realm opens.",
        },
      ],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    await waitFor(() => {
      expect(mockedChatOpening).toHaveBeenCalledWith(fakeCampaign.id);
    });
  });

  it("shows opening progress separately from finalizing while the first scene is being generated", async () => {
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);
    let releaseOpening: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onSceneSettling?.({ phase: "opening-hidden-pass", opening: true });
      await new Promise<void>((resolve) => {
        releaseOpening = resolve;
      });
      handlers.onNarrative("Lanternlight cuts across the market.");
      handlers.onDone();
    });

    await renderReadyGame({
      messages: [],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("scene-hud")).toHaveTextContent("Reading");
    });
    expect(screen.getByTestId("narration-dock")).toHaveTextContent("Grounding opening");
    expect(screen.queryByText("The world is still resolving. Retry and undo unlock when the turn is complete.")).not.toBeInTheDocument();

    if (releaseOpening) {
      releaseOpening();
    }

    await waitFor(() => {
      expect(screen.getByText("Lanternlight cuts across the market.")).toBeInTheDocument();
    });
  });

  it("renders HUD with Home, Settings, and Saves buttons", async () => {
    await renderReadyGame();

    const hud = screen.getByTestId("scene-hud");
    expect(within(hud).getByText("Home")).toBeInTheDocument();
    expect(within(hud).getByText("Settings")).toBeInTheDocument();
    expect(within(hud).getByText("Saves")).toBeInTheDocument();
  });

  it("renders checkpoint panel when campaign is active", async () => {
    await renderReadyGame();

    openDrawer("Saves");
    expect(screen.getByTestId("checkpoint-panel")).toBeInTheDocument();
  });

  it("wires connected paths and recent happenings from worldData into the location panel", async () => {
    await renderReadyGame();

    openDrawer("World");
    expect(screen.getByTestId("location-path-count")).toHaveTextContent("1");
    expect(screen.getByTestId("location-path-names")).toHaveTextContent("Dark Forest:2");
    expect(screen.getByTestId("recent-happenings-count")).toHaveTextContent("1");
  });

  it("treats People Here as encounter scope instead of same broad location membership on /game", async () => {
    const worldData = {
      ...fakeWorldData,
      currentScene: {
        id: "scene-platform-7",
        name: "Platform 7",
        broadLocationId: "loc-1",
        broadLocationName: "Town Square",
        sceneNpcIds: ["npc-1", "npc-2"],
        clearNpcIds: ["npc-1"],
        awareness: {
          byNpcId: {
            "npc-1": "clear",
            "npc-2": "hint",
          },
          hintSignals: ["A pressure shift moves along the platform edge."],
        },
      },
      npcs: [
        {
          id: "npc-1",
          name: "Nobara Kugisaki",
          tier: "key",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-platform-7",
        },
        {
          id: "npc-2",
          name: "Satoru Gojo",
          tier: "key",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-platform-7",
        },
        {
          id: "npc-3",
          name: "Rooftop Lookout",
          tier: "supporting",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-rooftop",
        },
      ],
    };

    await renderReadyGameWithWorld(worldData);

    const presenceLayer = screen.getByTestId("presence-layer");
    expect(within(presenceLayer).getByRole("button", { name: "Open Nobara Kugisaki character details" })).toBeInTheDocument();
    expect(within(presenceLayer).queryByRole("button", { name: /Satoru Gojo/ })).not.toBeInTheDocument();
    expect(within(presenceLayer).queryByRole("button", { name: /Rooftop Lookout/ })).not.toBeInTheDocument();
    expect(within(presenceLayer).getByTestId("presence-hint-0")).toHaveTextContent(
      "A pressure shift moves along the platform edge.",
    );

    openDrawer("World");
    expect(screen.getByTestId("location-people-count")).toHaveTextContent("1");
    expect(screen.getByTestId("location-people-names")).toHaveTextContent("Nobara Kugisaki");
    expect(screen.getByTestId("location-people-names")).not.toHaveTextContent("Satoru Gojo");
    expect(screen.getByTestId("location-people-names")).not.toHaveTextContent("Rooftop Lookout");
    expect(screen.getByTestId("location-scene-name")).toHaveTextContent("Platform 7");
    expect(screen.getByTestId("location-scene-broad-name")).toHaveTextContent("Town Square");
    expect(screen.getByTestId("location-scene-hints")).toHaveTextContent(
      "A pressure shift moves along the platform edge."
    );
  });

  it("opens Character scoped to visible actors and falls back to the player from the rail", async () => {
    const worldData = {
      ...fakeWorldData,
      currentScene: {
        id: "scene-platform-7",
        name: "Platform 7",
        broadLocationId: "loc-1",
        broadLocationName: "Town Square",
        sceneNpcIds: ["npc-1", "npc-2"],
        clearNpcIds: ["npc-1"],
        awareness: {
          byNpcId: {
            "npc-1": "clear",
            "npc-2": "hint",
          },
          hintSignals: ["A pressure shift moves along the platform edge."],
        },
      },
      npcs: [
        {
          id: "npc-1",
          name: "Nobara Kugisaki",
          tier: "key",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-platform-7",
          persona: "Hammer ready.",
          tags: ["sorcerer"],
        },
        {
          id: "npc-2",
          name: "Satoru Gojo",
          tier: "key",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-platform-7",
          persona: "Hidden pressure.",
          tags: ["sealed"],
        },
      ],
    };

    await renderReadyGameWithWorld(worldData);

    fireEvent.click(screen.getByRole("button", { name: "Open Nobara Kugisaki character details" }));
    expect(screen.getByTestId("drawer-host")).toHaveAttribute("data-active-drawer", "character");
    expect(screen.getByText("Viewing Nobara Kugisaki")).toBeInTheDocument();
    expect(mockCharacterPanel.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        player: expect.objectContaining({
          id: "npc-1",
          name: "Nobara Kugisaki",
        }),
      }),
    );

    fireEvent.click(screen.getByText("Close drawer"));
    openDrawer("Character");
    expect(screen.getByText("Viewing Hero")).toBeInTheDocument();
    expect(mockCharacterPanel.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        player: expect.objectContaining({
          id: "player-1",
          name: "Hero",
        }),
      }),
    );
  });

  it("uses legacy broad-location People Here fallback only when currentScene is absent", async () => {
    const worldData = {
      ...fakeWorldData,
      currentScene: null,
      player: {
        ...fakeWorldData.player,
        currentLocationId: "loc-1",
        sceneScopeId: null,
      },
      npcs: [
        {
          id: "npc-legacy-1",
          name: "Market Guard",
          tier: "supporting",
          currentLocationId: "loc-1",
          sceneScopeId: null,
        },
        {
          id: "npc-legacy-2",
          name: "Street Vendor",
          tier: "supporting",
          currentLocationId: "loc-1",
          sceneScopeId: null,
        },
        {
          id: "npc-away",
          name: "Forest Scout",
          tier: "supporting",
          currentLocationId: "loc-2",
          sceneScopeId: null,
        },
      ],
    };

    await renderReadyGameWithWorld(worldData);

    openDrawer("World");
    expect(screen.getByTestId("location-people-count")).toHaveTextContent("2");
    expect(screen.getByTestId("location-people-names")).toHaveTextContent("Market Guard");
    expect(screen.getByTestId("location-people-names")).toHaveTextContent("Street Vendor");
    expect(screen.getByTestId("location-people-names")).not.toHaveTextContent("Forest Scout");
    expect(screen.getByTestId("location-scene-name")).toHaveTextContent("none");
  });

  it("filters the current location out of authoritative connectedPaths travel options", async () => {
    const worldData = {
      ...fakeWorldData,
      locations: [
        {
          ...fakeWorldData.locations[0],
          connectedPaths: [
            {
              edgeId: "edge-self",
              toLocationId: "loc-1",
              toLocationName: "Town Square",
              travelCost: 0,
              discovered: true,
            },
            {
              edgeId: "edge-1",
              toLocationId: "loc-2",
              toLocationName: "Dark Forest",
              travelCost: 2,
              discovered: true,
            },
          ],
        },
        fakeWorldData.locations[1],
      ],
    };

    await renderReadyGameWithWorld(worldData);

    openDrawer("World");
    expect(screen.getByTestId("location-path-count")).toHaveTextContent("1");
    expect(screen.getByTestId("location-path-names")).toHaveTextContent("Dark Forest:2");
    expect(screen.getByTestId("location-path-names")).not.toHaveTextContent("Town Square:0");
  });

  it("filters the current location out of legacy connectedTo travel options", async () => {
    const worldData = {
      ...fakeWorldData,
      locations: [
        {
          ...fakeWorldData.locations[0],
          connectedTo: ["loc-1", "loc-2"],
          connectedPaths: [],
        },
        fakeWorldData.locations[1],
      ],
    };

    await renderReadyGameWithWorld(worldData);

    openDrawer("World");
    expect(screen.getByTestId("location-path-count")).toHaveTextContent("1");
    expect(screen.getByTestId("location-path-names")).toHaveTextContent("Dark Forest:?");
    expect(screen.getByTestId("location-path-names")).not.toHaveTextContent("Town Square:?");
  });

  it("keeps legitimate destinations and travel cost metadata after self-target filtering", async () => {
    const worldData = {
      ...fakeWorldData,
      locations: [
        {
          ...fakeWorldData.locations[0],
          connectedPaths: [
            {
              edgeId: "edge-self",
              toLocationId: "loc-1",
              toLocationName: "Town Square",
              travelCost: 0,
              discovered: true,
            },
            {
              edgeId: "edge-1",
              toLocationId: "loc-2",
              toLocationName: "Dark Forest",
              travelCost: 2,
              discovered: true,
            },
            {
              edgeId: "edge-2",
              toLocationId: "loc-3",
              toLocationName: "Moonlit Path",
              travelCost: 1,
              discovered: true,
            },
          ],
        },
        fakeWorldData.locations[1],
        {
          id: "loc-3",
          name: "Moonlit Path",
          description: "A winding lane lit by pale lanterns.",
          tags: [],
          connectedTo: ["loc-1"],
          connectedPaths: [],
          recentHappenings: [],
        },
      ],
    };

    await renderReadyGameWithWorld(worldData);

    openDrawer("World");
    expect(screen.getByTestId("location-path-count")).toHaveTextContent("2");
    expect(screen.getByTestId("location-path-names")).toHaveTextContent("Dark Forest:2");
    expect(screen.getByTestId("location-path-names")).toHaveTextContent("Moonlit Path:1");
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

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Scout ahead" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatAction).toHaveBeenCalledWith(
        fakeCampaign.id,
        "Scout ahead",
        "Scout ahead",
        "",
      );
    });

    openDrawer("Log");
    fireEvent.click(screen.getByText("Retry turn"));

    await waitFor(() => {
      expect(mockedChatRetry).toHaveBeenCalledWith(fakeCampaign.id);
    });
  });

  it("routes slash lookups through chatLookup and renders the factual answer in the existing log", async () => {
    await renderReadyGame();
    mockedChatLookup.mockResolvedValue(createStreamResponse() as never);
    openDrawer("Log");
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      (handlers as typeof handlers & {
        onLookupResult?: (result: {
          answer: string;
          lookupKind: string;
          subject: string;
        }) => void;
      }).onLookupResult?.({
        lookupKind: "character_canon_fact",
        subject: "Satoru Gojo",
        answer: "Satoru Gojo is the strongest modern jujutsu sorcerer in the stored canon baseline.",
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "/lookup Satoru Gojo" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatLookup).toHaveBeenCalledWith(fakeCampaign.id, {
        lookupKind: "character_canon_fact",
        subject: "Satoru Gojo",
      });
    });
    expect(mockedChatAction).not.toHaveBeenCalled();
    await waitFor(() => {
      const renderedLookupState = narrativeLogMessageSnapshots.some((snapshot) =>
        JSON.stringify(snapshot) === JSON.stringify([
          "Look around",
          "You see a bustling town square.",
          "/lookup Satoru Gojo",
          "[Lookup: character_canon_fact] Satoru Gojo is the strongest modern jujutsu sorcerer in the stored canon baseline.",
        ]));

      expect(renderedLookupState).toBe(true);
    });
  });

  it("routes slash compare requests through chatLookup and keeps the live assistant message on the persisted compare contract", async () => {
    await renderReadyGame();
    mockedChatLookup.mockResolvedValue(createStreamResponse() as never);
    openDrawer("Log");
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      (handlers as typeof handlers & {
        onLookupResult?: (result: {
          answer: string;
          lookupKind: string;
          subject: string;
        }) => void;
      }).onLookupResult?.({
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        answer: "Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "/compare Satoru Gojo vs Ryomen Sukuna" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatLookup).toHaveBeenCalledWith(fakeCampaign.id, {
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        compareAgainst: "Ryomen Sukuna",
      });
    });

    await waitFor(() => {
      const renderedCompareState = narrativeLogMessageSnapshots.some((snapshot) =>
        JSON.stringify(snapshot) === JSON.stringify([
          "Look around",
          "You see a bustling town square.",
          "/compare Satoru Gojo vs Ryomen Sukuna",
          "[Lookup: compare] Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
        ]));

      expect(renderedCompareState).toBe(true);
    });
  });

  it("rehydrates persisted lookup and compare history alongside their raw slash-command user messages after reload", async () => {
    await renderReadyGame({
      messages: [
        { role: "user" as const, content: "/lookup character: Satoru Gojo" },
        {
          role: "assistant" as const,
          content: "[Lookup: character_canon_fact] Gojo remains sealed until the Prison Realm opens.",
        },
        { role: "user" as const, content: "/compare Satoru Gojo vs Ryomen Sukuna" },
        {
          role: "assistant" as const,
          content: "[Lookup: compare] Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
        },
      ],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    openDrawer("Log");
    await waitFor(() => {
      const renderedReloadState = narrativeLogMessageSnapshots.some((snapshot) =>
        JSON.stringify(snapshot) === JSON.stringify([
          "/lookup character: Satoru Gojo",
          "[Lookup: character_canon_fact] Gojo remains sealed until the Prison Realm opens.",
          "/compare Satoru Gojo vs Ryomen Sukuna",
          "[Lookup: compare] Gojo controls spacing more cleanly, while Sukuna brings the harsher finishing ceiling.",
        ]));

      expect(renderedReloadState).toBe(true);
    });
  });

  it("shows Raw reasoning under the current assistant message only when settings.ui.showRawReasoning is enabled", async () => {
    mockUseSettings.mockReturnValue({
      settings: {
        ui: { showRawReasoning: true },
      },
      isLoading: false,
      isSaving: false,
      setSettings: vi.fn(),
      save: vi.fn(),
    });
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);
    let releaseOpening: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      await new Promise<void>((resolve) => {
        releaseOpening = () => {
          handlers.onNarrative("Lanternlight cuts across the market.");
          handlers.onReasoning?.({
            text: "The model separated visible narration from the private reasoning lane.",
          });
          handlers.onDone();
          resolve();
        };
      });
    });

    await renderReadyGame({
      messages: [],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    await waitFor(() => {
      expect(mockedChatOpening).toHaveBeenCalledWith(fakeCampaign.id);
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });

    if (releaseOpening) {
      releaseOpening();
    }

    openDrawer("Log");
    await waitFor(() => {
      const latestNarrativeLog = getLatestNarrativeLogProps();

      expect(latestNarrativeLog?.showRawReasoning).toBe(true);
      expect(latestNarrativeLog?.messages?.map((message) => message.content)).toContain(
        "Lanternlight cuts across the market.",
      );
      expect(
        latestNarrativeLog?.messages?.find((message) => message.role === "assistant")
          ?.debugReasoning,
      ).toBe("The model separated visible narration from the private reasoning lane.");
    });
  });

  it("does not show Raw reasoning when the persisted toggle is off even if a reasoning event arrives", async () => {
    mockedChatOpening.mockResolvedValue(createStreamResponse() as never);
    let releaseOpening: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      await new Promise<void>((resolve) => {
        releaseOpening = () => {
          handlers.onNarrative("Lanternlight cuts across the market.");
          handlers.onReasoning?.({
            text: "This should stay hidden while the toggle is off.",
          });
          handlers.onDone();
          resolve();
        };
      });
    });

    await renderReadyGame({
      messages: [],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    });

    await waitFor(() => {
      expect(mockedChatOpening).toHaveBeenCalledWith(fakeCampaign.id);
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });

    if (releaseOpening) {
      releaseOpening();
    }

    openDrawer("Log");
    await waitFor(() => {
      const latestNarrativeLog = getLatestNarrativeLogProps();

      expect(latestNarrativeLog?.showRawReasoning).toBe(false);
      expect(latestNarrativeLog?.messages?.map((message) => message.content)).toContain(
        "Lanternlight cuts across the market.",
      );
      expect(
        latestNarrativeLog?.messages?.find((message) => message.role === "assistant")
          ?.debugReasoning,
      ).toBe("This should stay hidden while the toggle is off.");
    });
  });

  it("passes authoritative carried and equipped collections into CharacterPanel instead of deriving player inventory from world.items", async () => {
    const worldData = {
      ...fakeWorldData,
      items: [
        {
          id: "legacy-bow",
          name: "Legacy Bow",
          tags: ["weapon"],
          ownerId: "player-1",
          locationId: null,
        },
        {
          id: "ground-lantern",
          name: "Ground Lantern",
          tags: ["utility"],
          ownerId: null,
          locationId: "loc-1",
        },
      ],
      player: {
        ...fakeWorldData.player,
        equippedItems: ["Legacy Bow"],
        inventory: [
          {
            id: "item-bedroll",
            name: "Bedroll",
            tags: ["gear"],
            equipState: "carried",
            equippedSlot: null,
            isSignature: false,
          },
        ],
        equipment: [
          {
            id: "item-sword",
            name: "Iron Sword",
            tags: ["weapon"],
            equipState: "equipped",
            equippedSlot: "hand",
            isSignature: true,
          },
        ],
      },
    };

    await renderReadyGameWithWorld(worldData);

    openDrawer("Character");
    await waitFor(() => {
      expect(mockCharacterPanel).toHaveBeenCalled();
    });

    const lastCall = (mockCharacterPanel.mock.calls.at(-1)?.[0] ?? {}) as {
      carriedItems?: Array<{ id: string; name: string }>;
      equippedItems?: Array<{ id: string; name: string }>;
      items?: Array<{ id: string; name: string }>;
    };

    expect(lastCall.carriedItems?.map((item) => item.name)).toEqual(["Bedroll"]);
    expect(lastCall.equippedItems?.map((item) => item.name)).toEqual(["Iron Sword"]);
    expect(lastCall.items).toBeUndefined();
  });

  it("does not expose retry controls for reloaded history without a live snapshot", async () => {
    await renderReadyGame();

    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
  });

  it("keeps retry, quick actions, and the player-facing status non-ready during finalization", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    openDrawer("Log");

    let finishTurn: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The gate shudders open.");
      handlers.onQuickActions([{ label: "Press forward", action: "Press forward" }]);
      handlers.onFinalizing?.({ stage: "rollback_critical" });
      await new Promise<void>((resolve) => {
        finishTurn = resolve;
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Open the gate" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
    expect(screen.queryByText("Press forward")).not.toBeInTheDocument();
    expect(screen.getByText("The world is still resolving. Retry and undo unlock when the turn is complete.")).toBeInTheDocument();
    expect(screen.getByTestId("narration-dock")).toHaveTextContent("Syncing world simulation");
    expect(screen.queryByText("The storyteller is weaving the scene...")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Send action")).toBeDisabled();

    if (finishTurn) {
      finishTurn();
    }
    await waitFor(() => {
      expect(screen.getByText("Retry turn")).toBeInTheDocument();
    });
  });

  it("keeps the action dock busy until done refresh synchronizes world state", async () => {
    const refreshedWorld = {
      ...fakeWorldData,
      currentScene: {
        id: "scene-pier",
        name: "Lantern-Lit Gondola Pier",
        broadLocationId: "loc-1",
        broadLocationName: "Town Square",
        sceneNpcIds: ["npc-gondolier"],
        clearNpcIds: ["npc-gondolier"],
        awareness: {
          byNpcId: { "npc-gondolier": "clear" },
          hintSignals: [],
        },
      },
      npcs: [
        {
          id: "npc-gondolier",
          name: "Gondolier",
          tier: "temporary",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-pier",
          persona: "Waiting by the pier.",
          tags: [],
        },
      ],
    };
    let resolveRefresh!: (value: unknown) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("A gondolier rises from behind the prow.");
      handlers.onFinalizing?.({ stage: "rollback_critical" });
      handlers.onDone();
    });

    await renderReadyGame();
    const initialWorldCallCount = mockedGetWorld.mock.calls.length;
    mockedGetWorld.mockImplementation(() => refreshPromise as never);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Ask the gondolier for a route" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedGetWorld.mock.calls.length).toBeGreaterThan(initialWorldCallCount);
    });
    expect(screen.getByLabelText("Scene action")).toBeDisabled();
    expect(screen.getByTestId("narration-dock")).toHaveTextContent("Syncing world state");

    resolveRefresh(refreshedWorld);

    await waitFor(() => {
      expect(screen.getByLabelText("Scene action")).toBeEnabled();
    });
    expect(screen.getByTestId("presence-layer")).toHaveTextContent("Gondolier");
  });

  it("reveals quick actions only after authoritative done arrives", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);

    let releaseDone: (() => void) | undefined;
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The scouts return.");
      handlers.onQuickActions([{ label: "Ask for details", action: "Ask for details" }]);
      handlers.onFinalizing?.();
      await new Promise<void>((resolve) => {
        releaseDone = resolve;
      });
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Send the scouts" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Ask for details")).not.toBeInTheDocument();

    if (releaseDone) {
      releaseDone();
    }

    await waitFor(() => {
      expect(screen.getByText("Ask for details")).toBeInTheDocument();
    });
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some((arg) => String(arg).includes("Maximum update depth exceeded")),
      ),
    ).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("covers the deterministic 10-turn playable UX slice without default raw debug", async () => {
    const worldData = {
      ...fakeWorldData,
      currentScene: {
        id: "scene-platform-7",
        name: "Platform 7",
        broadLocationId: "loc-1",
        broadLocationName: "Town Square",
        sceneNpcIds: ["npc-1"],
        clearNpcIds: ["npc-1"],
        awareness: {
          byNpcId: { "npc-1": "clear" },
          hintSignals: ["A pressure shift moves along the platform edge."],
        },
      },
      npcs: [
        {
          id: "npc-1",
          name: "Nobara Kugisaki",
          tier: "key",
          currentLocationId: "loc-1",
          sceneScopeId: "scene-platform-7",
          persona: "Hammer ready.",
          tags: ["sorcerer"],
        },
      ],
    };
    let turn = 0;

    await renderReadyGameWithWorld(worldData);
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    const waitForTurnCount = (count: number) =>
      waitFor(() => expect(mockedChatAction).toHaveBeenCalledTimes(count));
    mockedParseTurnSSE.mockImplementation(async (_body, handlers) => {
      turn += 1;
      if (turn === 2) {
        handlers.onOracleResult({
          chance: 72,
          roll: 28,
          outcome: "strong_hit",
          reasoning: "The route stays clear and the read is clean.",
        });
      }
      if (turn === 4) {
        handlers.onQuickActions([{ label: "Ask for details", action: "Ask for details" }]);
      }
      if (turn === 6) {
        handlers.onStateUpdate({
          type: "location_change",
          locationId: "loc-2",
          locationName: "Dark Forest",
          travelCost: 2,
          path: ["Town Square", "Dark Forest"],
        } as never);
      }
      handlers.onNarrative(`Turn ${turn} resolves into playable scene text.`);
      handlers.onDone();
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitForTurnCount(1);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Scout ahead for the safest route" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));
    await waitFor(() => expect(screen.getByText("Clean success")).toBeInTheDocument());
    await waitForTurnCount(2);

    fireEvent.click(screen.getByRole("button", { name: "Open Nobara Kugisaki character details" }));
    expect(screen.getByText("Viewing Nobara Kugisaki")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close drawer"));
    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Ask Nobara what she can see from the ticket gate" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));
    await waitForTurnCount(3);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Signal the group to hold while I listen" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));
    await waitFor(() => expect(screen.getByText("Ask for details")).toBeInTheDocument());
    await waitForTurnCount(4);
    fireEvent.click(screen.getByText("Ask for details"));
    await waitForTurnCount(5);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Keep this draft while checking a drawer" },
    });
    openDrawer("Inventory");
    expect(screen.getByLabelText("Scene action")).toHaveValue("Keep this draft while checking a drawer");
    fireEvent.click(screen.getByText("Close drawer"));
    expect(screen.getByLabelText("Scene action")).toHaveValue("Keep this draft while checking a drawer");
    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "" },
    });

    openDrawer("World");
    fireEvent.click(screen.getByRole("button", { name: "Travel to Dark Forest" }));
    await waitFor(() => expect(mockedChatAction).toHaveBeenCalledWith(
      fakeCampaign.id,
      "go to Dark Forest",
      "go to Dark Forest",
      "",
    ));
    await waitForTurnCount(6);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitForTurnCount(7);
    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Check the inventory straps before moving on" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));
    await waitForTurnCount(8);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitForTurnCount(9);
    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Mark the route back with a chalk sign" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitForTurnCount(10);
    const beforeLocalControls = mockedChatAction.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(within(screen.getByTestId("narration-dock")).getByRole("button", { name: "Log" }));
    expect(mockedChatAction).toHaveBeenCalledTimes(beforeLocalControls);
    expect(screen.queryByText("Chance")).not.toBeInTheDocument();
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
  });

  it("does not infer travel feedback from the submitted action before a location_change event arrives", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("You head for the treeline.");
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "go to Dark Forest" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedParseTurnSSE).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/Travel complete:/)).not.toBeInTheDocument();
  });

  it("surfaces travel feedback from streamed location_change state updates", async () => {
    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onStateUpdate({
        type: "location_change",
        locationId: "loc-2",
        locationName: "Dark Forest",
        travelCost: 2,
        tickAdvance: 2,
        path: ["Town Square", "Moonlit Path", "Dark Forest"],
      } as never);
      handlers.onDone();
    });

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "go to Dark Forest" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Travel complete: Dark Forest reached in 2 ticks via Town Square -> Moonlit Path -> Dark Forest."
        )
      ).toBeInTheDocument();
    });
  });

  it("restores authoritative state when an action stream errors after narration", async () => {
    const restoredBoundaryHistory = {
      messages: [
        { role: "user" as const, content: "Look around" },
        { role: "assistant" as const, content: "You see a bustling town square." },
      ],
      premise: "A dark world",
      hasLiveTurnSnapshot: false,
    };

    await renderReadyGame();
    mockedChatAction.mockResolvedValue(createStreamResponse() as never);
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The hatch opens onto a back room that should roll back.");
      handlers.onQuickActions([{ label: "Take the stamped chit", action: "Take the chit" }]);
      handlers.onFinalizing?.({ stage: "rollback_critical" });
      handlers.onError("Rollback-critical post-turn failed");
    });
    mockedChatHistory.mockResolvedValue(restoredBoundaryHistory as never);

    fireEvent.change(screen.getByLabelText("Scene action"), {
      target: { value: "Open the records hatch" },
    });
    fireEvent.click(screen.getByLabelText("Send action"));

    await waitFor(() => {
      expect(mockedChatHistory).toHaveBeenCalledTimes(2);
    });

    expect(screen.getAllByText("You see a bustling town square.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Open the records hatch")).not.toBeInTheDocument();
    expect(screen.queryByText("The hatch opens onto a back room that should roll back.")).not.toBeInTheDocument();
    expect(screen.queryByText("Take the stamped chit")).not.toBeInTheDocument();
    expect(mockedToast.error).toHaveBeenCalledWith("Failed to generate narrative", {
      description: "Rollback-critical post-turn failed",
    });
    expect(mockedToast.error).not.toHaveBeenCalledWith("Turn processing error", {
      description: "Rollback-critical post-turn failed",
    });
    expect(screen.getByLabelText("Send action")).toBeDisabled();
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
    mockedParseTurnSSE.mockImplementationOnce(async (_body, handlers) => {
      handlers.onNarrative("The gate shudders but does not yield.");
      handlers.onQuickActions([{ label: "Force it open", action: "Force it open" }]);
      handlers.onError("Retry replay failed");
    });

    render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByTestId("game-scene-shell")).toBeInTheDocument();
    });
    openDrawer("Log");
    expect(screen.getByText("Retry turn")).toBeInTheDocument();

    mockedChatHistory.mockResolvedValue(restoredBoundaryHistory as never);
    fireEvent.click(screen.getByText("Retry turn"));

    await waitFor(() => {
      expect(screen.getAllByText("You wake inside the ruin.").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Open the gate")).not.toBeInTheDocument();
    expect(screen.queryByText("The gate grinds open.")).not.toBeInTheDocument();
    expect(screen.queryByText("The gate shudders but does not yield.")).not.toBeInTheDocument();
    expect(screen.queryByText("Force it open")).not.toBeInTheDocument();
    expect(screen.queryByText("Retry turn")).not.toBeInTheDocument();
    expect(mockedToast.error).toHaveBeenCalledWith("Failed to retry", {
      description: "Retry replay failed",
    });
    expect(mockedToast.error).not.toHaveBeenCalledWith("Retry error", {
      description: "Retry replay failed",
    });
    expect(screen.getByLabelText("Send action")).toBeDisabled();
  });
});

describe("Phase 59: GamePage shell structure", () => {
  it("locks shell to viewport with h-screen (not min-h-screen) and uses flex flex-col overflow-hidden", async () => {
    await renderReadyGame();
    const shell = screen.getByTestId("game-scene-shell");
    expect(shell).toHaveClass("h-screen");
    expect(shell).not.toHaveClass("min-h-screen");
    expect(shell).toHaveClass("flex", "flex-col", "overflow-hidden");
  });

  it("marks the action dock as flex-none (not sticky, no -mt-10)", async () => {
    await renderReadyGame();
    const dock = screen.getByTestId("game-action-dock");
    expect(dock).toHaveClass("flex-none");
    expect(dock).not.toHaveClass("sticky");
    expect(dock.className).not.toMatch(/-mt-10/);
  });

  it("emits semantic shell-region hooks on root and reader column", async () => {
    await renderReadyGame();
    expect(screen.getByTestId("game-scene-shell")).toHaveAttribute(
      "data-shell-region",
      "game-root",
    );
    expect(screen.getByTestId("game-reader-column")).toHaveAttribute(
      "data-shell-region",
      "reader",
    );
  });

  it("does not render permanent left or right admin asides", async () => {
    await renderReadyGame();
    expect(
      document.querySelector('[data-shell-region="aside-left"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-shell-region="aside-right"]'),
    ).toBeNull();
  });

  it("does not render the tri-column row by default", async () => {
    await renderReadyGame();
    const columns = document.querySelector(
      '[data-shell-region="game-columns"]',
    );
    expect(columns).toBeNull();
  });
});
