import { createLogger } from "../lib/index.js";

const log = createLogger("worldgen-debug-progress");

type OperationKind = "suggest-seeds" | "generate-world";
type OperationStatus = "running" | "completed" | "failed";

export interface WorldgenOperationSnapshot {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  label: string;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  heartbeatCount: number;
  campaignId?: string;
  franchise?: string;
  premisePreview?: string;
  error?: string;
}

const activeOperations = new Map<string, WorldgenOperationSnapshot>();
const recentOperations: WorldgenOperationSnapshot[] = [];
const RECENT_LIMIT = 25;

function updateElapsed(snapshot: WorldgenOperationSnapshot): WorldgenOperationSnapshot {
  return {
    ...snapshot,
    elapsedMs: Math.max(0, snapshot.updatedAt - snapshot.startedAt),
  };
}

function pushRecent(snapshot: WorldgenOperationSnapshot): void {
  recentOperations.unshift(updateElapsed(snapshot));
  if (recentOperations.length > RECENT_LIMIT) {
    recentOperations.length = RECENT_LIMIT;
  }
}

export function listWorldgenOperations(): {
  active: WorldgenOperationSnapshot[];
  recent: WorldgenOperationSnapshot[];
} {
  const now = Date.now();
  return {
    active: Array.from(activeOperations.values())
      .map((snapshot) => updateElapsed({ ...snapshot, updatedAt: now })),
    recent: recentOperations.map((snapshot) => updateElapsed(snapshot)),
  };
}

export function beginWorldgenOperation(input: {
  kind: OperationKind;
  label: string;
  campaignId?: string;
  franchise?: string;
  premise?: string;
}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  let finished = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const snapshot: WorldgenOperationSnapshot = {
    id,
    kind: input.kind,
    status: "running",
    label: input.label,
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    heartbeatCount: 0,
    campaignId: input.campaignId,
    franchise: input.franchise,
    premisePreview: input.premise?.slice(0, 200),
  };
  activeOperations.set(id, snapshot);

  function patch(next: Partial<WorldgenOperationSnapshot>): void {
    if (finished) return;
    const current = activeOperations.get(id);
    if (!current) return;
    activeOperations.set(id, {
      ...current,
      ...next,
      updatedAt: Date.now(),
    });
  }

  return {
    id,
    setLabel(label: string): void {
      patch({ label });
    },
    startHeartbeat(intervalMs = 10000): void {
      if (heartbeatTimer) return;
      heartbeatTimer = setInterval(() => {
        const current = activeOperations.get(id);
        if (!current) return;
        const heartbeatCount = current.heartbeatCount + 1;
        const updatedAt = Date.now();
        const next = {
          ...current,
          heartbeatCount,
          updatedAt,
        };
        activeOperations.set(id, next);
        const elapsedSeconds = Math.round((updatedAt - current.startedAt) / 1000);
        log.info(
          `[${current.kind}] ${current.label} still running (${elapsedSeconds}s elapsed, heartbeat #${heartbeatCount})`,
        );
      }, intervalMs);
    },
    finish(status: Exclude<OperationStatus, "running">, error?: unknown): void {
      if (finished) return;
      finished = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const current = activeOperations.get(id);
      if (!current) return;
      const finalized: WorldgenOperationSnapshot = {
        ...current,
        status,
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : typeof error === "string" ? error : undefined,
      };
      activeOperations.delete(id);
      pushRecent(finalized);
    },
  };
}
