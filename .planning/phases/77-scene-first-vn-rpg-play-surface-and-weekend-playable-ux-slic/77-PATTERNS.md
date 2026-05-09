# Phase 77: Scene-First VN/RPG Play Surface and Weekend Playable UX Slice - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 30 planned frontend/source/test files
**Analogs found:** 30 / 30
**Research file:** No `77-RESEARCH.md` exists in this phase directory; scope comes from `77-CONTEXT.md` and current frontend code.

## Current `/game` State Ownership and Data Flow

`frontend/app/game/page.tsx` is the current authority for `/game` runtime state. Keep it as the owner for campaign/session state, backend turn calls, SSE parsing, world refresh, and reload restoration. New scene/drawer components should receive already-derived props and callbacks; they should not call backend turn routes directly.

**State owner pattern** (`frontend/app/game/page.tsx` lines 234-252):
```typescript
export default function GamePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [activeCampaign, setActiveCampaign] = useState<CampaignMeta | null>(null);
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("idle");
  const [sceneProgress, setSceneProgress] = useState<SceneProgress>(null);
  const [showRawReasoning, setShowRawReasoning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasLiveTurnSnapshot, setHasLiveTurnSnapshot] = useState(false);
  const [lastOracleResult, setLastOracleResult] = useState<OracleResultData | null>(null);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [travelFeedback, setTravelFeedback] = useState<string | null>(null);
  const bufferedQuickActionsRef = useRef<QuickAction[]>([]);
  const messagesRef = useRef<DisplayChatMessage[]>([]);
  const openingRequestCampaignRef = useRef<string | null>(null);
```

**Restore/reload pattern** (`frontend/app/game/page.tsx` lines 315-329, 435-453):
```typescript
const [history, world] = await Promise.all([
  chatHistory(campaignId),
  getWorldData(campaignId),
]);
const safeMessages = Array.isArray(history.messages)
  ? history.messages.filter(isChatMessage)
  : [];
const displayMessages = toDisplayMessages(safeMessages);

setMessages(displayMessages);
setHasLiveTurnSnapshot(history.hasLiveTurnSnapshot);
setWorldData(world);
```

```typescript
let campaign = await getActiveCampaign();
if (!campaign) {
  const rememberedCampaignId = getRememberedCampaignId();
  if (rememberedCampaignId) {
    campaign = await loadCampaign(rememberedCampaignId).catch(() => null);
  }
}

setActiveCampaign(campaign);
const restored = await restoreGameplayState(campaign.id);
if (!cancelled && !restored.hasNarratedAssistantMessage) {
  void requestOpeningScene(campaign.id);
}
```

**Backend turn pattern** (`frontend/app/game/page.tsx` lines 652-724):
```typescript
const submitAction = async (actionText: string) => {
  if (!actionText || isTurnBusy || !activeCampaign) return;

  const lookupRequest = parseExplicitLookupCommand(actionText);
  if (lookupRequest) {
    await submitLookup(actionText, lookupRequest);
    return;
  }

  setTurnPhase("idle");
  setSceneProgress("scene-settling");
  setLastOracleResult(null);
  setTravelFeedback(null);
  clearQuickActionState();

  const response = await chatAction(activeCampaign.id, actionText, actionText, "");
  const userMessage: ChatMessage = { role: "user", content: actionText };
  setMessages((current) => [...current, userMessage]);

  await parseTurnSSE(response.body, {
    onNarrative: (text) => {
      narrativeText += text;
      setSceneProgress(null);
      setTurnPhase("streaming");
      upsertAssistantMessage(narrativeText);
    },
    onReasoning: attachReasoningToLatestAssistant,
    onOracleResult: (result) => setLastOracleResult(result as OracleResultData),
    onStateUpdate: (update) => {
      const locationChange = getLocationChangeUpdate(update);
      if (locationChange) setTravelFeedback(formatTravelFeedback(locationChange));
      void refreshWorldData(activeCampaign.id);
    },
    onQuickActions: (actions) => bufferQuickActions(actions),
    onFinalizing: () => {
      setSceneProgress(null);
      setTurnPhase("finalizing");
    },
    onDone: () => {
      setHasLiveTurnSnapshot(true);
      revealBufferedQuickActions();
      void refreshWorldData(activeCampaign.id);
    },
  });
};
```

**Presentation/local controls rule:** `Send` and `Continue` must use `submitAction`/`chatAction`. `Next`, `Auto`, and `Log` must only advance local display state or open drawers; they must not call `chatAction`, `chatOpening`, `chatRetry`, `chatLookup`, or `parseTurnSSE`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/app/game/page.tsx` | route/state owner | streaming + request-response | self, `frontend/lib/api.ts` | exact |
| `frontend/components/game/game-scene-shell.tsx` | component | transform/render | `frontend/app/game/page.tsx` render shell | role-match |
| `frontend/components/game/scene-backdrop.tsx` | component | transform/render | `frontend/app/game/page.tsx` background layer | partial |
| `frontend/components/game/scene-hud.tsx` | component | transform/render | toolbar in `frontend/app/game/page.tsx`, `CharacterPanel` status blocks | role-match |
| `frontend/components/game/presence-layer.tsx` | component | transform/render | `getAuthoritativeSceneNpcs`, `LocationPanel` People Here/Nearby Signs | exact |
| `frontend/components/game/narration-dock.tsx` | component | presentation-event | `NarrativeLog` | exact |
| `frontend/components/game/display-beat.tsx` | component/utility | transform | `gameplay-text.ts`, `RichTextMessage`, `SpecialMessageBlock` | exact |
| `frontend/components/game/action-dock.tsx` | component | request-response trigger | `ActionBar`, `QuickActions` | exact |
| `frontend/components/game/widget-rail.tsx` | component | local UI events | toolbar buttons in `page.tsx` | role-match |
| `frontend/components/game/drawer-host.tsx` | component | local UI events | `CheckpointPanel`, `ui/dialog.tsx` | role-match |
| `frontend/components/game/inspect-drawer.tsx` | component | transform/render | `OraclePanel`, raw reasoning block in `NarrativeLog` | role-match |
| `frontend/components/game/world-drawer.tsx` | component | transform + request trigger | `LocationPanel` | exact |
| `frontend/components/game/log-drawer.tsx` | component | transform/render | `NarrativeLog` full scrollback | exact |
| `frontend/components/game/inventory-drawer.tsx` | component | transform/render | inventory/equipment sections in `CharacterPanel` | role-match |
| `frontend/components/game/journal-drawer.tsx` | component | request-response read/search | `LorePanel` | exact |
| `frontend/components/game/character-drawer.tsx` | component | transform/render | `CharacterPanel` | exact |
| `frontend/components/game/narrative-log.tsx` | component | presentation-event | self | exact |
| `frontend/components/game/action-bar.tsx` | component | controlled input | self | exact |
| `frontend/components/game/oracle-panel.tsx` | component | transform/render | self | exact |
| `frontend/components/game/location-panel.tsx` | component | transform + request trigger | self | exact |
| `frontend/components/game/character-panel.tsx` | component | transform/render | self | exact |
| `frontend/components/game/lore-panel.tsx` | component | request-response read/search | self | exact |
| `frontend/components/game/quick-actions.tsx` | component | local UI events + backend trigger callback | self | exact |
| `frontend/app/game/__tests__/page.test.tsx` | test | streaming + request-response | self | exact |
| `frontend/components/game/__tests__/game-scene-shell.test.tsx` | test | transform/render | Phase 59 shell tests in `page.test.tsx` | role-match |
| `frontend/components/game/__tests__/presence-layer.test.tsx` | test | transform/render | `location-panel.test.tsx`, scene-scope tests in `page.test.tsx` | exact |
| `frontend/components/game/__tests__/narration-dock.test.tsx` | test | presentation-event | `narrative-log.test.tsx`, `rich-text-message.test.tsx` | exact |
| `frontend/components/game/__tests__/action-dock.test.tsx` | test | controlled input + request trigger | `action-bar.test.tsx`, `quick-actions.test.tsx` | exact |
| `frontend/components/game/__tests__/drawer-host.test.tsx` | test | local UI events | `checkpoint-panel.test.tsx`, `lore-panel.layout.test.tsx` | role-match |
| `frontend/components/game/__tests__/display-beat.test.tsx` | test | transform | `rich-text-message.test.tsx` | exact |

## Pattern Assignments

### `frontend/app/game/page.tsx` (route/state owner, streaming)

**Keep ownership here:** active campaign, history/world restore, input draft, turn phase, scene progress, quick-action buffering, oracle result, travel feedback, drawer open state, and backend callbacks.

**Derived world slices pattern** (`frontend/app/game/page.tsx` lines 481-548):
```typescript
const currentLocation = useMemo(() => {
  if (!worldData || !player?.currentLocationId) return null;
  return worldData.locations.find((l) => l.id === player.currentLocationId) ?? null;
}, [worldData, player]);

const npcsHere = useMemo(() => {
  if (!worldData) return [];
  return currentScene
    ? getAuthoritativeSceneNpcs(worldData)
    : getFallbackSceneNpcs(worldData);
}, [currentScene, worldData]);

const playerCarriedItems = useMemo(() => player?.inventory ?? [], [player]);
const playerEquippedItems = useMemo(() => player?.equipment ?? [], [player]);

const canInteract = Boolean(activeCampaign) && !isInitializing;
const isTurnBusy = turnPhase !== "idle" || sceneProgress !== null;
```

**Input callback pattern** (`frontend/app/game/page.tsx` lines 891-913):
```typescript
const canRetryUndo =
  hasLiveTurnSnapshot &&
  turnPhase === "idle" &&
  messages.length >= 2 &&
  messages[messages.length - 1]?.role === "assistant";

const handleSubmitAction = () => {
  const playerAction = input.trim();
  if (!playerAction) return;
  setInput("");
  void submitAction(playerAction);
};

const handleQuickAction = (actionText: string) => {
  if (isTurnBusy) return;
  void submitAction(actionText);
};

const handleMove = (targetLocationName: string) => {
  if (isTurnBusy) return;
  void submitAction(`go to ${targetLocationName}`);
};
```

**Execution guidance:** add Phase 77 UI state here or in tiny hooks owned by this page:
- `activeDrawer: "log" | "world" | "inspect" | "inventory" | "journal" | "character" | null`
- `addressMode: "act" | "speak" | "observe" | "ask-gm"`
- local presentation cursor/auto state for `Next` and `Auto`
- per-campaign draft persistence keyed by `activeCampaign.id`

Do not move `submitAction`, `submitLookup`, `handleRetry`, `handleUndo`, `handleEdit`, `requestOpeningScene`, or `restoreGameplayState` into visual components in Phase 77.

### Scene Shell Files

Applies to:
- `frontend/components/game/game-scene-shell.tsx`
- `frontend/components/game/scene-backdrop.tsx`
- `frontend/components/game/scene-hud.tsx`
- `frontend/components/game/widget-rail.tsx`

**Analog:** current page shell and toolbar.

**Shell layout pattern** (`frontend/app/game/page.tsx` lines 924-1039):
```tsx
<div
  data-testid="game-shell"
  data-shell-region="game-root"
  className="relative flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
>
  <div className="pointer-events-none absolute inset-0 ..." />
  <div className="relative z-10 flex flex-none items-center justify-between border-b border-white/8 bg-zinc-950/90 px-4 py-2">
    ...
  </div>
  <div
    data-shell-region="game-columns"
    className="relative z-10 flex min-h-0 flex-1 gap-4 overflow-hidden px-3 pb-3 pt-3 sm:px-4 lg:px-5"
  >
    <section
      data-testid="game-reader-column"
      data-shell-region="reader"
      className="order-1 flex min-h-0 flex-1 flex-col gap-4 xl:order-2"
    >
      ...
    </section>
  </div>
</div>
```

**Test contract to preserve** (`frontend/app/game/__tests__/page.test.tsx` lines 1241-1288):
```typescript
const shell = screen.getByTestId("game-shell");
expect(shell).toHaveClass("h-screen");
expect(shell).not.toHaveClass("min-h-screen");
expect(shell).toHaveClass("flex", "flex-col", "overflow-hidden");

const columns = document.querySelector('[data-shell-region="game-columns"]');
expect(columns!.className).toMatch(/flex-1/);
expect(columns!.className).toMatch(/min-h-0/);
expect(columns!.className).toMatch(/overflow-hidden/);
```

**Execution guidance:** `GameSceneShell` should replace the tri-column dashboard layout with scene-first composition, but keep `h-screen`, `min-h-0`, `overflow-hidden`, `data-testid="game-shell"`, `data-shell-region="game-root"`, `data-shell-region="reader"`, and `data-shell-region="action-dock"` unless tests are deliberately migrated.

### `frontend/components/game/presence-layer.tsx` (component, transform/render)

**Analog:** scene-authoritative NPC derivation plus `LocationPanel` presentation.

**Scene-authoritative pattern** (`frontend/app/game/page.tsx` lines 105-155):
```typescript
function getAuthoritativeSceneNpcs(worldData: WorldData) {
  const currentScene = worldData.currentScene;
  if (!currentScene) return [];

  const npcById = new Map(worldData.npcs.map((npc) => [npc.id, npc]));
  const clearNpcIds = currentScene.clearNpcIds.length > 0
    ? currentScene.clearNpcIds
    : currentScene.sceneNpcIds.filter((npcId) => currentScene.awareness.byNpcId[npcId] === "clear");

  return clearNpcIds
    .map((npcId) => npcById.get(npcId))
    .filter((npc): npc is NonNullable<typeof npc> => Boolean(npc))
    .map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier }));
}
```

**World scene type contract** (`frontend/lib/api-types.ts` lines 31-41):
```typescript
export interface WorldCurrentScene {
  id: string | null;
  name: string | null;
  broadLocationId: string | null;
  broadLocationName: string | null;
  sceneNpcIds: string[];
  clearNpcIds: string[];
  awareness: {
    byNpcId: Record<string, WorldSceneAwarenessBand>;
    hintSignals: string[];
  };
}
```

**Panel render pattern** (`frontend/components/game/location-panel.tsx` lines 138-172):
```tsx
<h4 className={sectionLabelClass}>Nearby Signs</h4>
{hintSignals.length > 0 ? (
  <ul className="space-y-2">
    {hintSignals.map((signal, index) => (
      <li key={`${signal}-${index}`} className={`${cardClass} text-sm leading-6 text-zinc-300`}>
        {signal}
      </li>
    ))}
  </ul>
) : (
  <p className={`${cardClass} text-sm text-zinc-500`}>
    No immediate signals stand out beyond the current scene.
  </p>
)}

<h4 className={sectionLabelClass}>People Here</h4>
{npcsHere.length > 0 ? ... : ...}
```

**Test analog** (`frontend/app/game/__tests__/page.test.tsx` lines 526-579):
```typescript
currentScene: {
  sceneNpcIds: ["npc-1", "npc-2"],
  clearNpcIds: ["npc-1"],
  awareness: {
    byNpcId: { "npc-1": "clear", "npc-2": "hint" },
    hintSignals: ["A pressure shift moves along the platform edge."],
  },
},
...
expect(screen.getByTestId("location-people-count")).toHaveTextContent("1");
expect(screen.getByTestId("location-people-names")).toHaveTextContent("Nobara Kugisaki");
expect(screen.getByTestId("location-people-names")).not.toHaveTextContent("Satoru Gojo");
```

**Execution guidance:** scene layer shows only clear/current-scene actors. Hints and sensed nearby actors belong in separate copy/visual treatment. Same broad location is not presence.

### Narration and Display Beat Files

Applies to:
- `frontend/components/game/narration-dock.tsx`
- `frontend/components/game/display-beat.tsx`
- `frontend/components/game/narrative-log.tsx`
- `frontend/components/game/log-drawer.tsx`

**Analog:** `NarrativeLog`, `gameplay-text.ts`, `RichTextMessage`, `SpecialMessageBlock`.

**Props/state pattern** (`frontend/components/game/narrative-log.tsx` lines 15-41):
```typescript
interface NarrativeLogProps {
  messages: Array<ChatMessage & { debugReasoning?: string | null }>;
  isStreaming: boolean;
  turnPhase?: "idle" | "streaming" | "finalizing";
  sceneProgress?: "opening" | "scene-settling" | null;
  showRawReasoning?: boolean;
  onRetry?: () => void;
  onUndo?: () => void;
  onEdit?: (index: number, content: string) => void;
  canRetryUndo?: boolean;
}
```

**Support/status classification** (`frontend/components/game/narrative-log.tsx` lines 87-111):
```typescript
const progressMessages = [
  (isStreaming || turnPhase === "streaming") && "The storyteller is weaving the scene...",
  sceneProgress === "opening" && "The opening scene is taking shape...",
  sceneProgress === "scene-settling" && "The scene is still settling into place...",
  turnPhase === "finalizing" && "The world is still resolving...",
].filter((message): message is string => Boolean(message));

const renderSupportMessage = (kind: GameMessageKind, content: string) => {
  const normalizedContent =
    kind === "lookup" || kind === "compare" ? stripLookupPrefix(content) : content;

  if (kind === "lookup" || kind === "compare" || kind === "system" || kind === "mechanical" || kind === "progress") {
    return <SpecialMessageBlock kind={kind} content={normalizedContent} />;
  }
```

**Display beat helper pattern** (`frontend/lib/gameplay-text.ts` lines 3-60):
```typescript
export type GameMessageKind =
  | "narration"
  | "player"
  | "system"
  | "lookup"
  | "compare"
  | "mechanical"
  | "progress";

export function deriveGameMessageKind(role: ChatRole, content: string): GameMessageKind {
  if (role === "user") return "player";
  if (role === "system") return "system";

  const lookupEntry = parseLookupLogEntry(content.trim());
  if (lookupEntry) {
    const lookupKind = lookupEntry.lookupKind.trim().toLowerCase();
    return lookupKind === "power_profile" || lookupKind === "compare" ? "compare" : "lookup";
  }
  ...
}
```

**Rich text subset pattern** (`frontend/components/game/rich-text-message.tsx` lines 18-63):
```tsx
const paragraphs = splitGameplayParagraphs(content);
...
<Markdown
  remarkPlugins={[remarkGfm]}
  skipHtml
  unwrapDisallowed
  allowedElements={["em", "strong", "br"]}
>
  {preserveSoftBreaks(paragraph)}
</Markdown>
```

**Execution guidance:** `NarrationDock` should show latest staged beat plus local `Next`/`Auto` controls. `LogDrawer` should reuse full scrollback behavior. `DisplayBeat` should adapt existing `deriveGameMessageKind`/`RichTextMessage`/`SpecialMessageBlock`; do not create a new markdown dialect.

### Action Dock Files

Applies to:
- `frontend/components/game/action-dock.tsx`
- `frontend/components/game/action-bar.tsx`
- `frontend/components/game/quick-actions.tsx`

**Analog:** current controlled `ActionBar` and delayed `QuickActions`.

**Controlled input pattern** (`frontend/components/game/action-bar.tsx` lines 27-104):
```tsx
export function ActionBar({
  value,
  disabled = false,
  isLoading,
  turnPhase = isLoading ? "streaming" : "idle",
  onChange,
  onSubmit,
}: ActionBarProps) {
  const trimmedLength = value.trim().length;
  const canSubmit =
    trimmedLength > 0 &&
    value.length <= MAX_ACTION_LENGTH &&
    !disabled &&
    !isLoading;

  return (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }
      }}
      disabled={disabled || isLoading}
      maxLength={MAX_ACTION_LENGTH}
    />
  );
}
```

**Quick actions pattern** (`frontend/components/game/quick-actions.tsx` lines 16-39):
```tsx
export function QuickActions({ actions, onAction, disabled }: QuickActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="border-t border-white/8 bg-white/[0.03] px-4 py-3 sm:px-5">
      <p className="text-[11px] text-zinc-500">
        Unlocks after authoritative turn completion
      </p>
      {actions.map((qa, i) => (
        <button key={i} onClick={() => onAction(qa.action)} disabled={disabled}>
          {qa.label}
        </button>
      ))}
    </div>
  );
}
```

**Test analog** (`frontend/components/game/__tests__/action-bar.test.tsx` lines 54-71):
```typescript
fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
expect(onSubmit).toHaveBeenCalledOnce();

fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
expect(onSubmit).not.toHaveBeenCalled();
```

**Execution guidance:** keep `ActionDock` as one raw narrative input plus Send/Continue. Do not add required `Act`, `Speak`, `Observe`, or similar modes. Preserve controlled value/onChange/onSubmit. Draft persistence belongs above or beside `ActionDock`, keyed by campaign id. `Continue` should call the same backend path as a real submitted action through exported `CONTINUE_ACTION_PAYLOAD`, not duplicated inline literals. `Next`, `Auto`, and `Log` are local only.

### Drawer Host and Drawer Files

Applies to:
- `frontend/components/game/drawer-host.tsx`
- `frontend/components/game/inspect-drawer.tsx`
- `frontend/components/game/world-drawer.tsx`
- `frontend/components/game/inventory-drawer.tsx`
- `frontend/components/game/journal-drawer.tsx`
- `frontend/components/game/character-drawer.tsx`

**Closest analog:** `CheckpointPanel` uses controlled `Dialog` plus nested confirmation dialogs. There is no existing `Drawer` or `Sheet` primitive.

**Controlled dialog pattern** (`frontend/components/game/checkpoint-panel.tsx` lines 41-67, 112-198):
```tsx
export function CheckpointPanel({ campaignId, open, onClose }: CheckpointPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCheckpoints(campaignId);
      setCheckpoints(list);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Checkpoints</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">...</ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

**Dialog primitive pattern** (`frontend/components/ui/dialog.tsx` lines 50-80):
```tsx
function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] ...",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && <DialogPrimitive.Close data-slot="dialog-close">...</DialogPrimitive.Close>}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
```

**ScrollArea contract** (`frontend/components/ui/scroll-area.tsx` lines 8-25):
```tsx
<ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn("relative", className)}>
  <ScrollAreaPrimitive.Viewport
    data-slot="scroll-area-viewport"
    className="size-full rounded-[inherit] ..."
  >
    {children}
  </ScrollAreaPrimitive.Viewport>
  <ScrollBar />
</ScrollAreaPrimitive.Root>
```

**Execution guidance:** implement drawers as controlled overlays (`activeDrawer` in `page.tsx`, `DrawerHost` renders the right drawer). If adding a side-drawer wrapper, build it on the existing Radix dialog pattern rather than introducing a second modal stack. Drawer open/close must not reset the action draft.

### Existing Components To Reuse Or Move

| Existing Component | Phase 77 Treatment | Notes |
|---|---|---|
| `NarrativeLog` | split/reuse | Latest beat in `NarrationDock`; full history in `LogDrawer`. Preserve edit/retry/undo and raw reasoning gating. |
| `ActionBar` | reuse inside `ActionDock` | Keep controlled value. Do not add required action-category modes around it. |
| `QuickActions` | reuse inside `ActionDock` or compact beat options | Keep hidden until authoritative `done`. |
| `OraclePanel` | move behind `InspectDrawer` by default | Player-facing mechanic beat may be summarized elsewhere; raw chance/roll/reasoning stays inspect-only. |
| `LocationPanel` | move into `WorldDrawer`; mine scene fields for HUD | Scene layer should not show broad-location NPCs. |
| `CharacterPanel` | move into `CharacterDrawer`; reuse inventory/equipment for `InventoryDrawer` | Keep authoritative `player.inventory` and `player.equipment` props. |
| `LorePanel` | move into `JournalDrawer` | It owns lore fetch/search state by `campaignId`; keep this contained. |
| `CheckpointPanel` | keep as existing modal | Do not convert to game drawer unless explicitly scoped later. |

## Shared Patterns

### SSE and Backend Turn Authority

**Source:** `frontend/lib/api.ts` lines 782-825 and 1232-1262.

```typescript
export interface TurnSSEHandlers {
  onSceneSettling?: (status: { stage?: string; phase?: string; opening?: boolean }) => void;
  onLookupResult?: (result: LookupResultEvent) => void;
  onNarrative: (text: string) => void;
  onReasoning?: (payload: { text: string }) => void;
  onOracleResult: (result: { chance: number; roll: number; outcome: string; reasoning: string }) => void;
  onStateUpdate: (update: { tool: string; args: unknown; result: unknown }) => void;
  onQuickActions: (actions: Array<{ label: string; action: string }>) => void;
  onFinalizing?: () => void;
  onDone: () => void;
  onError: (error: string) => void;
}

case "quick_actions": handlers.onQuickActions(parsed.actions ?? parsed.result?.actions ?? []); break;
case "finalizing_turn": handlers.onFinalizing?.(); break;
case "done": handlers.onDone(); break;
```

```typescript
export function chatAction(campaignId: string, playerAction: string, intent: string, method: string): Promise<Response> {
  return apiStreamPost("/api/chat/action", { campaignId, playerAction, intent, method });
}

export function chatOpening(campaignId: string): Promise<Response> {
  return apiStreamPost("/api/chat/opening", { campaignId });
}
```

**Compatibility note:** in Phase 77, `intent` may mirror `playerAction` and `method` may stay empty because the existing route requires those fields. This is transport compatibility, not a product contract. Do not create UI that asks the player or frontend to pre-classify intent/method.

**Apply to:** `page.tsx`, `ActionDock`, `NarrationDock`, tests. Local presentation events must not fabricate or consume backend SSE lanes.

### Raw Reasoning and Inspect Containment

**Source:** `frontend/components/game/narrative-log.tsx` lines 219-229.

```tsx
{showReasoningDisclosure ? (
  <details className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
    <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
      Raw reasoning
    </summary>
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/35 p-3 font-mono text-xs leading-6 text-zinc-200">
      {reasoningText}
    </pre>
  </details>
) : null}
```

**Apply to:** `InspectDrawer`, `LogDrawer`. Raw reasoning is hidden by default and never required in the main play surface.

### Authoritative Inventory

**Source:** `frontend/app/game/page.tsx` lines 537-538 and `frontend/components/game/character-panel.tsx` lines 6-21.

```typescript
const playerCarriedItems = useMemo(() => player?.inventory ?? [], [player]);
const playerEquippedItems = useMemo(() => player?.equipment ?? [], [player]);
```

```typescript
interface CharacterPanelProps {
  player: { ... } | null;
  carriedItems: WorldPlayerInventoryItem[];
  equippedItems: WorldPlayerInventoryItem[];
  locationName: string | null;
  portraitUrl?: string;
}
```

**Apply to:** `CharacterDrawer`, `InventoryDrawer`, `SceneHUD`. Do not re-derive player inventory from `worldData.items`.

## Closest Tests and Helpers

### Page-Level Harness

**Source:** `frontend/app/game/__tests__/page.test.tsx` lines 1-33, 333-364.

```typescript
vi.mock("@/lib/api", () => ({
  chatAction: vi.fn(),
  chatEdit: vi.fn(),
  chatHistory: vi.fn(),
  chatLookup: vi.fn(),
  chatOpening: vi.fn(),
  chatRetry: vi.fn(),
  chatUndo: vi.fn(),
  getActiveCampaign: vi.fn(),
  getRememberedCampaignId: vi.fn(),
  getWorldData: vi.fn(),
  loadCampaign: vi.fn(),
  parseTurnSSE: vi.fn(),
}));

function renderReadyGame(history = fakeChatHistory) {
  mockedGetActive.mockResolvedValue(fakeCampaign as never);
  mockedChatHistory.mockResolvedValue(history as never);
  mockedGetWorld.mockResolvedValue(fakeWorldData as never);

  render(<GamePage />);

  return waitFor(() => {
    expect(screen.getByTestId("location-panel")).toBeInTheDocument();
  });
}
```

Use this harness for:
- drawer persistence gate
- `Next`/`Auto`/`Log` local-only gate
- `Send`/`Continue` backend-turn gate
- finalization/quick action reveal behavior
- reload remembered-campaign behavior

### Critical Existing Tests To Preserve

| Behavior | Existing Test |
|---|---|
| Opening scene is requested only when no narrated assistant message exists | `frontend/app/game/__tests__/page.test.tsx` lines 433-485 |
| Remembered campaign reload path | `frontend/app/game/__tests__/page.test.tsx` lines 729-746 |
| Explicit campaign id passed to chat action/retry | `frontend/app/game/__tests__/page.test.tsx` lines 749-775 |
| Scene-scoped presence honesty | `frontend/app/game/__tests__/page.test.tsx` lines 526-623 |
| Quick actions only after authoritative done | `frontend/app/game/__tests__/page.test.tsx` lines 1063-1127 |
| Travel feedback only from `location_change` SSE update | `frontend/app/game/__tests__/page.test.tsx` lines 1134-1178 |
| Retry rollback restores pre-turn boundary | `frontend/app/game/__tests__/page.test.tsx` lines 1182-1237 |
| Shell viewport/min-height contract | `frontend/app/game/__tests__/page.test.tsx` lines 1241-1288 |
| ActionBar controlled input and Enter/Shift+Enter | `frontend/components/game/__tests__/action-bar.test.tsx` lines 14-99 |
| Narrative rendering separates narration/player/support messages | `frontend/components/game/__tests__/narrative-log.test.tsx` lines 37-54 |
| Display beat classification | `frontend/components/game/__tests__/rich-text-message.test.tsx` lines 13-51 |
| Drawer/scroll layout precedent | `frontend/components/game/__tests__/lore-panel.layout.test.tsx` lines 1-30 |
| SSE finalization/reasoning lanes | `frontend/lib/__tests__/api.test.ts` lines 536-625 |

### New Phase 77 Tests Recommended

Add or extend tests in `frontend/app/game/__tests__/page.test.tsx`:
- Type a draft, open/close `Log`, `World`, `Inspect`, `Character`, assert the draft value remains.
- Click `Next`, `Auto`, `Log`, assert `chatAction`, `chatLookup`, `chatOpening`, `chatRetry`, and `parseTurnSSE` were not called.
- Click `Continue`, assert `chatAction(activeCampaign.id, ..., ..., ...)` is called and the input is disabled while busy.
- Assert Oracle/raw reasoning is absent from the default scene surface and present only through Inspect when opened.
- Assert clear/hint/off-screen actors are visually and semantically distinct.

Add component tests in `frontend/components/game/__tests__/`:
- `presence-layer.test.tsx`: clear actors render as present; hint signals render without hidden actor names.
- `drawer-host.test.tsx`: controlled `open`/`onClose`, active drawer switching, `ScrollArea` viewport exists.
- `action-dock.test.tsx`: address mode changes do not mutate draft; `Continue` calls supplied callback; `Next`/`Auto` call local callbacks.
- `narration-dock.test.tsx`: latest beat renders; full log is not duplicated in the dock; progress/finalizing status remains support UI.
- `display-beat.test.tsx`: reuse `deriveGameMessageKind` cases from `rich-text-message.test.tsx`.

## Recommended File Ownership / Write Set

**Primary write set:**
- `frontend/app/game/page.tsx`
- new files under `frontend/components/game/`
- `frontend/app/game/__tests__/page.test.tsx`
- new tests under `frontend/components/game/__tests__/`

**Reuse/move but avoid broad rewrites:**
- `frontend/components/game/action-bar.tsx`
- `frontend/components/game/quick-actions.tsx`
- `frontend/components/game/narrative-log.tsx`
- `frontend/components/game/oracle-panel.tsx`
- `frontend/components/game/location-panel.tsx`
- `frontend/components/game/character-panel.tsx`
- `frontend/components/game/lore-panel.tsx`

**Avoid modifying unless a concrete bug appears:**
- `frontend/lib/api.ts`
- `frontend/lib/api-types.ts`
- backend routes/turn processor
- shared chat message types

GitNexus impact check found `parseTurnSSE` is **CRITICAL** (`7` impacted symbols, `5` processes affected) and `getWorldData` is **HIGH** (`7` impacted symbols, `4` modules affected). Keep Phase 77 as frontend presentation orchestration unless planning explicitly expands scope.

## Refactor Risks

| Risk | Why It Breaks | Guardrail |
|---|---|---|
| Moving backend turn handlers into visual components | `submitAction`, retry, lookup, and opening share `turnPhase`, `sceneProgress`, message rollback, quick-action buffering, and world refresh. | Keep handlers in `page.tsx`; pass callbacks down. |
| Letting `Next`, `Auto`, or `Log` call backend helpers | Violates backend authority and can create phantom turns. | Tests must assert local controls do not call chat/SSE helpers. |
| Revealing quick actions before `done` | Existing code buffers actions on `quick_actions` and reveals only on `done`. | Preserve `bufferQuickActions`/`revealBufferedQuickActions` semantics. |
| Dropping `onFinalizing` | User can retry/act before state is fully settled. | Preserve finalizing status and disabled input tests. |
| Treating same broad location as visible presence | Makes hidden/sensed/off-screen actors appear interactable. | Scene layer uses `clearNpcIds`; hints use `awareness.hintSignals`; world drawer may show broader presence. |
| Replacing restore flow | Reload currently loads active campaign, then remembered campaign, then history/world, then opening scene if needed. | Keep `getActiveCampaign` -> `getRememberedCampaignId` -> `loadCampaign` ordering. |
| Losing action draft on drawer navigation | Current `input` is page state; drawer state must not remount or reset it. | Keep draft in `page.tsx`/hook keyed by campaign; drawers receive no draft ownership. |
| Moving raw Oracle/reasoning to default surface | Phase 77 requires debug hidden by default. | `OraclePanel` and raw reasoning go behind `InspectDrawer`; scene may show fiction-facing mechanical beat only. |
| Deriving inventory from `worldData.items` | Existing tests assert authoritative carried/equipped props from `player.inventory`/`player.equipment`. | Keep Character/Inventory drawers on explicit player collections. |

## No Exact Analog Found

| File/Need | Role | Data Flow | Reason | Planner Fallback |
|---|---|---|---|---|
| `DrawerHost` as a side drawer | component | local UI events | No existing `Drawer`/`Sheet` component exists in `frontend/components/ui`. | Reuse `Dialog`/`DialogContent` pattern and apply side-panel classes; keep `ScrollArea` viewport. |
| `SceneBackdrop` as place-first visual layer | component | transform/render | Existing page has abstract dark gradients, not a scene-place renderer. | Start from page shell background lines 924-929 and feed current location/scene labels into visual variants. |
| `Next`/`Auto` local staged beat controls | component | presentation-event | Current log streams all content directly; no staged beat cursor exists. | Add local presentation state in `page.tsx` or `NarrationDock`; do not touch backend turn API. |

## Metadata

**Analog search scope:** `frontend/app/game`, `frontend/components/game`, `frontend/components/ui`, `frontend/lib`, `frontend/lib/__tests__`
**Project instructions read:** `CLAUDE.md`; local `.claude/skills` / `.agents/skills` indexes checked
**GitNexus used:** repo `WorldForge`, `GamePage`/`NarrativeLog`/`ActionBar` context, `parseTurnSSE` and `getWorldData` impact
**Pattern extraction date:** 2026-05-01
