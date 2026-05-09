import pino from "pino";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { getTurnContext, type TurnRole } from "./logger-context.js";

// ---------------------------------------------------------------------------
// Test-mode detection — when true, SKIP pino-pretty transport entirely.
// pino.transport() spawns a worker thread that resetLoggerForTest cannot
// reliably reap. Running N beforeEach cycles would accumulate N orphaned
// workers and eventually exhaust file handles (EMFILE). In tests we route
// logs straight to plain stdout instead.
// ---------------------------------------------------------------------------
function isTestMode(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST_WORKER_ID !== undefined
  );
}

// ---------------------------------------------------------------------------
// Log root — overridable by GSD_LOG_ROOT for tests. No process.chdir needed.
// ---------------------------------------------------------------------------
let logRootOverride: string | undefined = process.env.GSD_LOG_ROOT || undefined;

export function getLogRoot(): string {
  return logRootOverride ?? process.cwd();
}

export function setLogRoot(root: string | undefined): void {
  logRootOverride = root;
}

// ---------------------------------------------------------------------------
// Per-turn file path.
// Filename includes turnId slice so same-campaign same-tick retry attempts
// write to distinct files (e.g. `turn-7-abcdef12.jsonl`).
// ---------------------------------------------------------------------------
const openTurnKeys = new Set<string>();

export function getTurnFilePath(
  campaignId: string,
  tick: number,
  turnId: string,
): string {
  const idSlice = turnId.slice(0, 8);
  return join(
    getLogRoot(),
    "campaigns",
    campaignId,
    "logs",
    `turn-${tick}-${idSlice}.jsonl`,
  );
}

function ensureTurnDir(campaignId: string, turnId: string): void {
  const key = `${campaignId}:${turnId}`;
  if (openTurnKeys.has(key)) return;
  mkdirSync(join(getLogRoot(), "campaigns", campaignId, "logs"), {
    recursive: true,
  });
  openTurnKeys.add(key);
}

// ---------------------------------------------------------------------------
// Observability runtime cache — hot-path consumers read this, NOT loadSettings.
// ---------------------------------------------------------------------------
interface RuntimeObservability {
  enabled: boolean;
  dumpFullPrompts: boolean;
  roles: Record<TurnRole, boolean>;
}

function defaultRuntimeConfig(): RuntimeObservability {
  return {
    enabled: true,
    dumpFullPrompts: false,
    roles: {
      judge: true,
      storyteller: true,
      oracle: true,
      npcAgent: true,
      reflection: true,
      embedder: true,
      tool: true,
      prompt: true,
    },
  };
}

let cachedConfig: RuntimeObservability = defaultRuntimeConfig();

export function configureObservability(input: {
  enabled: boolean;
  dumpFullPrompts?: boolean;
  roles: Partial<Record<TurnRole, boolean>>;
}): void {
  cachedConfig = {
    enabled: input.enabled,
    dumpFullPrompts: input.dumpFullPrompts ?? cachedConfig.dumpFullPrompts,
    roles: {
      ...cachedConfig.roles,
      ...input.roles,
    } as Record<TurnRole, boolean>,
  };
}

export function getObservabilityConfigSnapshot(): Readonly<RuntimeObservability> {
  return cachedConfig;
}

export function shouldLogRole(
  role: TurnRole | undefined,
  level: "info" | "warn" | "error" | "debug",
): boolean {
  if (level === "warn" || level === "error") return true;
  if (!cachedConfig.enabled) return false;
  if (!role) return true;
  return cachedConfig.roles[role] ?? true;
}

// ---------------------------------------------------------------------------
// Sync-append dispatch. Every JSONL line lands on disk before callback returns.
// Crash-safe: an unexpected process exit cannot lose buffered log lines.
// ---------------------------------------------------------------------------
class TurnFileDispatch extends Writable {
  override _write(
    chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    try {
      const line = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const parsed = JSON.parse(line) as {
        campaignId?: string;
        turnId?: string;
        tick?: number;
      };
      if (
        parsed.campaignId &&
        parsed.turnId &&
        typeof parsed.tick === "number"
      ) {
        ensureTurnDir(parsed.campaignId, parsed.turnId);
        appendFileSync(
          getTurnFilePath(parsed.campaignId, parsed.tick, parsed.turnId),
          line,
        );
      }
      cb();
    } catch {
      // Never throw from the log path; drop malformed records silently ONLY
      // inside this dispatch (logger-internal). User-code log calls that
      // produced malformed JSON still return normally.
      cb();
    }
  }
}

let turnFileDispatch: Writable = new TurnFileDispatch();

// ---------------------------------------------------------------------------
// Pretty transport — production: throw if pino-pretty fails to load.
// Test mode: SKIPPED entirely (worker-leak prevention — see isTestMode).
// ---------------------------------------------------------------------------
function buildPrettyStreamOrPlainStdout(): Writable {
  if (isTestMode()) {
    // Plain stdout sink — no worker thread, nothing for resetLoggerForTest
    // to leak. A simple Writable wrapper avoids Node's stdout EOF-on-end
    // semantics closing the real stdout.
    const sink = new Writable({
      write(chunk, _enc, cb) {
        try {
          process.stdout.write(chunk);
        } catch {
          /* ignore stdout errors in test mode */
        }
        cb();
      },
    });
    return sink;
  }

  try {
    return pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:HH:MM:ss.l",
      },
    }) as unknown as Writable;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[logger-setup] FATAL: pino-pretty transport failed to initialize: ${msg}. ` +
        `Install pino-pretty@^13 or remove pretty transport from logger-setup.ts.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Redact paths — cover payload.* at every nesting depth up to SERIALIZE_MAX_DEPTH (6).
// Wrapping rule: createLogger calls child.info({ payload: serializePayload(data) }, msg)
// so every user-provided field appears under payload.*.
// ---------------------------------------------------------------------------
const REDACT_PATHS: string[] = [
  // Top-level (defensive — some code paths may bypass the payload wrapper)
  "apiKey",
  "Authorization",
  "authorization",
  "braveApiKey",
  "zaiApiKey",
  "headers.Authorization",
  "headers.authorization",
  "provider.apiKey",
  "providers[*].apiKey",
  "judgeProvider.apiKey",
  "storytellerProvider.apiKey",
  "generatorProvider.apiKey",
  "embedderProvider.apiKey",
  // payload.* — primary surface, depth 1
  "payload.apiKey",
  "payload.Authorization",
  "payload.authorization",
  "payload.braveApiKey",
  "payload.zaiApiKey",
  "payload.headers.Authorization",
  "payload.headers.authorization",
  "payload.provider.apiKey",
  "payload.providers[*].apiKey",
  "payload.judgeProvider.apiKey",
  "payload.storytellerProvider.apiKey",
  "payload.generatorProvider.apiKey",
  "payload.embedderProvider.apiKey",
  // payload.* nested wildcards — depth 2
  "payload.*.apiKey",
  "payload.*.Authorization",
  "payload.*.authorization",
  "payload.*.braveApiKey",
  "payload.*.zaiApiKey",
  "payload.*.headers.Authorization",
  "payload.*.providers[*].apiKey",
  // depth 3
  "payload.*.*.apiKey",
  "payload.*.*.Authorization",
  "payload.*.*.authorization",
  "payload.*.*.braveApiKey",
  "payload.*.*.zaiApiKey",
  // depth 4
  "payload.*.*.*.apiKey",
  "payload.*.*.*.Authorization",
  "payload.*.*.*.authorization",
  "payload.*.*.*.braveApiKey",
  "payload.*.*.*.zaiApiKey",
  // depth 5
  "payload.*.*.*.*.apiKey",
  "payload.*.*.*.*.Authorization",
  "payload.*.*.*.*.authorization",
  "payload.*.*.*.*.braveApiKey",
  "payload.*.*.*.*.zaiApiKey",
  // depth 6
  "payload.*.*.*.*.*.apiKey",
  "payload.*.*.*.*.*.Authorization",
  "payload.*.*.*.*.*.authorization",
  "payload.*.*.*.*.*.braveApiKey",
  "payload.*.*.*.*.*.zaiApiKey",
];

let rootPinoInstance = buildRootPino();

function buildRootPino(): pino.Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "debug",
      redact: { paths: REDACT_PATHS, remove: false, censor: "[REDACTED]" },
      mixin() {
        const ctx = getTurnContext();
        return ctx
          ? {
              turnId: ctx.turnId,
              campaignId: ctx.campaignId,
              tick: ctx.tick,
              role: ctx.role,
            }
          : {};
      },
    },
    pino.multistream([
      { stream: buildPrettyStreamOrPlainStdout(), level: "debug" },
      { stream: turnFileDispatch, level: "debug" },
    ]),
  );
}

// Proxy indirection lets `resetLoggerForTest` swap the underlying instance
// without breaking module-level imports held by other files.
export const rootPino = new Proxy({} as pino.Logger, {
  get(_t, prop) {
    return (rootPinoInstance as unknown as Record<string | symbol, unknown>)[
      prop as string | symbol
    ];
  },
});

/**
 * Test-only reset. Clears per-turn dir cache, rebuilds the dispatch stream
 * and root pino instance honoring the current GSD_LOG_ROOT. Because
 * `isTestMode()` short-circuits to plain stdout, there is no pino-pretty
 * worker thread to close — N reset cycles cost O(N) pino instances but
 * ZERO orphaned worker threads.
 */
export function resetLoggerForTest(opts?: { logRoot?: string }): void {
  if (opts?.logRoot !== undefined) setLogRoot(opts.logRoot);
  openTurnKeys.clear();
  turnFileDispatch = new TurnFileDispatch();
  rootPinoInstance = buildRootPino();
  cachedConfig = defaultRuntimeConfig();
}

/**
 * Test-only accessor for the current dispatch stream, so tests can wire
 * their own error-throwing sink and verify failure isolation.
 */
export function __setTurnFileDispatchForTest(stream: Writable): void {
  turnFileDispatch = stream;
  rootPinoInstance = buildRootPino();
}
