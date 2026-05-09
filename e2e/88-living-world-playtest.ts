import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const MODE = (process.env.PHASE88_MODE ?? "deterministic").toLowerCase();
const PROFILE = (process.env.PHASE88_PROFILE ?? (MODE === "live" ? "smoke" : "focused")).toLowerCase();
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const BASE_ARTIFACT_DIR = join("output", "playwright", "phase-88-living-world");
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? join(BASE_ARTIFACT_DIR, RUN_ID);
const FETCH_RETRY_LIMIT = positiveInt(process.env.PHASE88_FETCH_RETRY_LIMIT, 8);
const FETCH_RETRY_BASE_MS = positiveInt(process.env.PHASE88_FETCH_RETRY_BASE_MS, 1_500);
const ACTION_SUBMIT_RETRY_LIMIT = nonNegativeInt(process.env.PHASE88_ACTION_SUBMIT_RETRY_LIMIT, 1);
const REUSE_EXISTING_CAMPAIGNS = process.env.PHASE88_REUSE_EXISTING_CAMPAIGNS === "1";
const CAMPAIGN_ID_OVERRIDES = parseCampaignIdOverrides(process.env.PHASE88_CAMPAIGN_IDS);
const CLONE_SOURCE_CAMPAIGNS = parseCampaignIdOverrides(process.env.PHASE88_CLONE_FROM_CAMPAIGNS);
const USE_CAMPAIGN_CLONES = process.env.PHASE88_USE_CAMPAIGN_CLONES === "1" || CLONE_SOURCE_CAMPAIGNS.size > 0;
const CLONE_POOL_SIZE = nonNegativeInt(process.env.PHASE88_CLONE_POOL_SIZE, 0);
const CHARS_DIR = process.env.PHASE88_CHARS_DIR ?? "X:\\Models\\Chars";
const CAMPAIGNS_ROOT = process.env.GSD_CAMPAIGNS_ROOT ?? join(process.cwd(), "campaigns");

type ChatMessage = { role: string; content: string };

type FreshPlayerSpec =
  | {
      mode: "parse";
      concept: string;
      overrideText?: string;
    }
  | {
      mode: "import-v2-card";
      cardPath: string;
      importMode: "native" | "outsider";
      overrideText?: string;
    };

interface FreshCampaignSpec {
  name: string;
  premise: string;
  worldgenSourceHint?: string;
  worldgenResearchEnabled: boolean;
  player: FreshPlayerSpec;
}

interface CampaignTemplate {
  key: string;
  label: string;
  existingCampaignId: string;
  purpose: string;
  fresh: FreshCampaignSpec;
}

interface ProvisionedCampaign {
  key: string;
  label: string;
  campaignId: string;
  purpose: string;
  source: "fresh" | "existing" | "clone";
  existingCampaignId?: string;
  sourceCampaignId?: string;
  routeId?: string;
  cloneIndex?: number;
  playerSource?: string;
}

interface CampaignProvisioningResult {
  campaignRecords: ProvisionedCampaign[];
  routeCampaigns: Map<string, ProvisionedCampaign>;
}

interface RouteSpec {
  id: string;
  label: string;
  campaignKey: string;
  hardGate: string;
  expectsWorldMutation: boolean;
  expectsWorldMutationByTurn?: boolean[];
  actions: string[];
}

interface ProfileSpec {
  label: string;
  routeIds: string[];
  turnsPerRoute: number;
}

interface VisualState {
  ready: boolean;
  hasActionInput: boolean;
  textareaDisabled: boolean;
  spinner: boolean;
  stageText: string;
  hasShake: boolean;
  hasFlash: boolean;
  hasBold: boolean;
  hasItalic: boolean;
  hasColoredText: boolean;
  overflowCount: number;
}

interface TurnRecord {
  campaignKey: string;
  campaignId: string;
  routeId: string;
  turn: number;
  action: string;
  elapsedMs: number;
  assistantText: string;
  screenshot: string | null;
  worldBeforeHash: string;
  worldAfterHash: string;
  worldChanged: boolean;
  visual: VisualState | null;
  hardFailures: string[];
  softReview: {
    status: "queued_for_llm_or_human" | "not_applicable";
    rubric: string[];
    samplePath: string | null;
  };
}

class ActionSubmissionLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionSubmissionLostError";
  }
}

interface RunSummary {
  phase: 88;
  mode: string;
  profile: string;
  runId: string;
  artifactDir: string;
  frontendUrl: string;
  backendUrl: string;
  startedAt: string;
  finishedAt: string;
  campaigns: ProvisionedCampaign[];
  routes: Array<Pick<RouteSpec, "id" | "label" | "campaignKey" | "hardGate" | "expectsWorldMutation">>;
  totals: {
    routes: number;
    turns: number;
    hardFailures: number;
    softReviewSamples: number;
  };
  status: "passed" | "failed";
  notes: string[];
}

interface CampaignMetaResponse {
  id: string;
  name: string;
}

interface GenerateWorldResult {
  refinedPremise?: string;
  locationCount?: number;
  npcCount?: number;
  factionCount?: number;
  loreCardCount?: number;
  startingLocation?: string;
}

interface CharacterDraftResponse {
  draft?: unknown;
  character?: unknown;
  playerId?: string;
}

interface V2CardInput {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  tags: string[];
  mesExample: string;
}

const campaignTemplates: CampaignTemplate[] = [
  {
    key: "lacquer-signal",
    label: "Fresh Lacquer Signal Pressure Test",
    existingCampaignId: "0ed6bb3c-a528-4067-8f29-86ebdd8d0637",
    purpose: "Original-world social/tourist pressure with local living-world drift.",
    fresh: {
      name: `P88 Fresh Lacquer Signal ${RUN_ID.slice(0, 10)}`,
      premise: [
        "A layered river city built on canal markets, tower bridges, shrine auditors, and signal-house families competing over message routes.",
        "An abandoned telegraph tower has begun answering with names of people who have not yet vanished.",
        "The player is an ordinary junior night courier with no heroic mandate; the city must keep moving even when the player behaves like a tourist.",
      ].join(" "),
      worldgenResearchEnabled: false,
      player: {
        mode: "parse",
        concept: [
          "Mira Voss, a junior night courier with a sealed lacquer message, ordinary social authority, sharp local instincts, and no supernatural immunity.",
          "Start near a public canal market or signal pier with a reason to observe rather than command events.",
        ].join(" "),
        overrideText: "Keep the player modestly capable. Do not make her the city savior or hidden ruler.",
      },
    },
  },
  {
    key: "urban-occult-crossover",
    label: "Fresh JJK Chakra Fault",
    existingCampaignId: "da183dd3-9e19-4ba3-ae72-c969af1ffe1d",
    purpose: "Known-IP discipline, combat/power mismatch, false claims, and canon pressure.",
    fresh: {
      name: `P88 Fresh JJK Chakra Fault ${RUN_ID.slice(0, 10)}`,
      premise: [
        "Jujutsu Kaisen, pre-Shibuya, remains the primary setting: Tokyo Jujutsu High, curse users, cursed spirits, and modern Tokyo occult politics are the baseline.",
        "Naruto-style chakra exists as a foreign anomalous power system leaking into this world, but the campaign must not become Konoha or a full Naruto political mashup.",
        "Canon heavyweight figures such as Satoru Gojo can exist as world powers, while the player begins as a minor, low-authority witness experimenting near the fault line.",
      ].join(" "),
      worldgenSourceHint: "Jujutsu Kaisen",
      worldgenResearchEnabled: true,
      player: {
        mode: "parse",
        concept: [
          "A minor curse-aware courier with weak chakra leakage and no institutional authority.",
          "They can bluff, run, observe, and survive small incidents, but cannot overpower elite sorcerers by narration.",
        ].join(" "),
        overrideText: "Do not make the player Naruto, Gojo, Sukuna, or a secret chosen one. Start in a public Tokyo occult-adjacent scene.",
      },
    },
  },
];

const routes: RouteSpec[] = [
  {
    id: "tourist-pressure",
    label: "Tourist route still gets world pressure",
    campaignKey: "lacquer-signal",
    hardGate: "World reacts without making the player the center of every plot.",
    expectsWorldMutation: true,
    actions: [
      "I ignore the message routes and spend an hour buying street food and watching canal traffic like a tourist.",
      "I ask the nearest visible vendor, clerk, or local service worker what changed in the district while I was eating, without volunteering to help.",
    ],
  },
  {
    id: "key-npc-offscreen",
    label: "Key NPC acts offscreen with visible consequence",
    campaignKey: "lacquer-signal",
    hardGate: "Key NPC/faction work appears as sourced pressure, not narrator omniscience.",
    expectsWorldMutation: true,
    expectsWorldMutationByTurn: [true, false],
    actions: [
      "I wait near the pier and do nothing useful, just watching who moves first.",
      "I follow only the public signs of whatever changed while I waited.",
    ],
  },
  {
    id: "faction-report-latency",
    label: "Faction reports are delayed and bounded",
    campaignKey: "lacquer-signal",
    hardGate: "Reports arrive through routes and do not instantly become omniscient truth.",
    expectsWorldMutation: true,
    expectsWorldMutationByTurn: [true, false],
    actions: [
      "I walk to the nearest public message counter, toll booth, signal desk, or staffed stall in the current district. If no clerk is already visible, I ask around for the ordinary worker who handles public reports; once I have a plausible public recipient, I tell them, \"Tower Three's western ledger is missing pages,\" but leave out where I heard it, then walk away before it can be verified.",
      "I spend fifteen minutes near that public counter or the nearest visible crowd and check whether anyone treats the ledger rumor as an unverified claim, challenge, or routed report.",
    ],
  },
  {
    id: "false-claim-boundary",
    label: "False claims stay claims",
    campaignKey: "urban-occult-crossover",
    hardGate: "A player lie becomes belief/report/provocation, not durable truth.",
    expectsWorldMutation: true,
    expectsWorldMutationByTurn: [true, false],
    actions: [
      "I step up to the nearest kiosk attendant or visible local witness and loudly claim that Satoru Gojo personally authorized my chakra experiment, even though I have no proof.",
      "I watch whether people accept it, challenge it, or pass it along as an unverified claim.",
    ],
  },
  {
    id: "combat-power-mismatch",
    label: "Combat respects power mismatch",
    campaignKey: "urban-occult-crossover",
    hardGate: "A weak actor cannot win by narration when the world rules say otherwise.",
    expectsWorldMutation: true,
    actions: [
      "I look for the nearest visible hostile sorcerer, curse-user, or dangerous patrol; if one is present, I pick a fight with a clumsy basic attack, and if none is visible, I provoke the nearest dangerous local actor into revealing the power gap.",
      "I try to recover position instead of pretending the first attack worked.",
    ],
  },
  {
    id: "memory-stress",
    label: "Memory stress does not leak hidden truth",
    campaignKey: "urban-occult-crossover",
    hardGate: "Memory retrieval stays sourced and does not dump hidden context.",
    expectsWorldMutation: false,
    actions: [
      "I ask three different people what they remember about the same suspicious event.",
      "I compare their answers and ask who actually witnessed it.",
    ],
  },
  {
    id: "rollback-sanity",
    label: "Checkpoint rollback has no future residue",
    campaignKey: "lacquer-signal",
    hardGate: "A restored checkpoint must not keep future jobs, reports, or memories alive.",
    expectsWorldMutation: true,
    actions: [
      "I create a noisy distraction, wait for the response, then return to the last clean save if needed.",
    ],
  },
  {
    id: "latency-stress",
    label: "Long turn remains valid without output clipping",
    campaignKey: "lacquer-signal",
    hardGate: "The harness observes long work without imposing arbitrary model-turn caps.",
    expectsWorldMutation: true,
    actions: [
      "I travel across the city, stopping at every public sign of trouble and asking for local context before choosing a destination.",
    ],
  },
];

const profiles: Record<string, ProfileSpec> = {
  smoke: {
    label: "Smoke",
    routeIds: ["tourist-pressure", "false-claim-boundary"],
    turnsPerRoute: 1,
  },
  focused: {
    label: "Focused",
    routeIds: [
      "tourist-pressure",
      "key-npc-offscreen",
      "faction-report-latency",
      "false-claim-boundary",
      "combat-power-mismatch",
      "rollback-sanity",
    ],
    turnsPerRoute: 2,
  },
  deep: {
    label: "Deep",
    routeIds: routes.map((route) => route.id),
    turnsPerRoute: 4,
  },
  "memory-stress": {
    label: "Memory stress",
    routeIds: ["memory-stress", "false-claim-boundary"],
    turnsPerRoute: 2,
  },
  "faction-report": {
    label: "Faction report",
    routeIds: ["faction-report-latency"],
    turnsPerRoute: 2,
  },
  "latency-stress": {
    label: "Latency stress",
    routeIds: ["latency-stress", "tourist-pressure"],
    turnsPerRoute: 1,
  },
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseCampaignIdOverrides(raw: string | undefined): Map<string, string> {
  const overrides = new Map<string, string>();
  if (!raw?.trim()) return overrides;
  for (const pair of raw.split(/[;,]/)) {
    const [key, campaignId] = pair.split("=").map((part) => part.trim());
    if (!key || !campaignId) continue;
    overrides.set(key, campaignId);
  }
  return overrides;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isConnectionFailure(error: unknown): boolean {
  return /ECONNREFUSED|fetch failed|socket hang up|UND_ERR_SOCKET|ECONNRESET/i.test(errorMessage(error));
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function campaignDir(campaignId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) {
    throw new Error(`Unsafe campaign id for filesystem operation: ${campaignId}`);
  }
  return resolve(CAMPAIGNS_ROOT, campaignId);
}

function assertInside(parentDir: string, childPath: string): void {
  const parent = resolve(parentDir);
  const child = resolve(childPath);
  if (child !== parent && !child.startsWith(`${parent}${sep}`)) {
    throw new Error(`Refusing filesystem operation outside ${parent}: ${child}`);
  }
}

function removeCampaignTransientDir(targetDir: string, childName: string): void {
  const childPath = resolve(targetDir, childName);
  assertInside(targetDir, childPath);
  rmSync(childPath, { recursive: true, force: true });
}

function rewriteCampaignIdInDatabase(stateDbPath: string, sourceCampaignId: string, targetCampaignId: string): string[] {
  const db = new Database(stateDbPath);
  const updatedTables: string[] = [];
  try {
    db.pragma("foreign_keys = OFF");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>;
    const rewrite = db.transaction(() => {
      if (tables.some((table) => table.name === "campaigns")) {
        const result = db.prepare("UPDATE campaigns SET id = ?, updated_at = ? WHERE id = ?")
          .run(targetCampaignId, Date.now(), sourceCampaignId);
        if (result.changes > 0) updatedTables.push("campaigns");
      }
      for (const table of tables) {
        const tableName = quoteSqlIdentifier(table.name);
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "campaign_id")) continue;
        const result = db.prepare(`UPDATE ${tableName} SET campaign_id = ? WHERE campaign_id = ?`)
          .run(targetCampaignId, sourceCampaignId);
        if (result.changes > 0) updatedTables.push(table.name);
      }
    });
    rewrite();
    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`Campaign clone created ${violations.length} foreign-key violation(s).`);
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    return updatedTables;
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }
}

function cloneCampaignDirectory(
  template: CampaignTemplate,
  sourceCampaignId: string,
  routeId: string | null,
  cloneIndex: number,
): ProvisionedCampaign {
  const sourceDir = campaignDir(sourceCampaignId);
  if (!existsSync(sourceDir)) {
    throw new Error(`Clone source campaign directory does not exist: ${sourceDir}`);
  }
  const targetCampaignId = randomUUID();
  const targetDir = campaignDir(targetCampaignId);
  if (existsSync(targetDir)) {
    throw new Error(`Clone target already exists: ${targetDir}`);
  }

  cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true });

  const configPath = join(targetDir, "config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const routeSuffix = routeId ? ` ${routeId}` : "";
    config.name = `${String(config.name ?? template.label)} [P88 clone ${cloneIndex}${routeSuffix}]`;
    config.createdAt = Date.now();
    config.updatedAt = Date.now();
    writeJson(configPath, config);
  }

  removeCampaignTransientDir(targetDir, "checkpoints");
  removeCampaignTransientDir(targetDir, ".turn-boundaries");
  writeJson(join(targetDir, "chat_history.json"), []);

  const stateDbPath = join(targetDir, "state.db");
  const updatedTables = rewriteCampaignIdInDatabase(stateDbPath, sourceCampaignId, targetCampaignId);
  const record: ProvisionedCampaign = {
    key: template.key,
    label: template.label,
    campaignId: targetCampaignId,
    purpose: template.purpose,
    source: "clone",
    existingCampaignId: template.existingCampaignId,
    sourceCampaignId,
    ...(routeId ? { routeId } : {}),
    cloneIndex,
  };
  appendProvisioningEvent({
    type: "campaign-clone",
    key: template.key,
    routeId,
    cloneIndex,
    sourceCampaignId,
    targetCampaignId,
    updatedTables,
  });
  return record;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: unknown = null;
  const method = init?.method ?? "GET";
  for (let attempt = 1; attempt <= FETCH_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, init);
      if (!response.ok) {
        throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      const retryable = isConnectionFailure(error);
      console.log(`[phase88 fetch ${retryable ? "retry" : "failure"}] ${method} ${path} attempt ${attempt}/${FETCH_RETRY_LIMIT}: ${errorMessage(error)}`);
      if (!retryable || attempt >= FETCH_RETRY_LIMIT) break;
      await delay(FETCH_RETRY_BASE_MS * Math.min(attempt, 5));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function appendProvisioningEvent(event: Record<string, unknown>): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  appendFileSync(
    join(ARTIFACT_DIR, "campaign-provisioning.jsonl"),
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    "utf-8",
  );
}

async function fetchSseComplete<T>(
  path: string,
  body: Record<string, unknown>,
  label: string,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= FETCH_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        return response.json() as Promise<T>;
      }
      if (!response.body) throw new Error(`${label} stream has no body.`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let dataLines: string[] = [];

      const dispatch = (): T | null => {
        if (dataLines.length === 0) {
          currentEvent = "message";
          return null;
        }
        const rawData = dataLines.join("\n");
        const data = rawData ? JSON.parse(rawData) as unknown : null;
        appendProvisioningEvent({ type: "sse", label, event: currentEvent, data });
        if (currentEvent === "complete") return data as T;
        if (currentEvent === "error") {
          const message = typeof data === "object" && data && "error" in data
            ? String((data as { error?: unknown }).error)
            : `${label} stream failed.`;
          throw new Error(message);
        }
        currentEvent = "message";
        dataLines = [];
        return null;
      };

      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let lineBreakIndex = buffer.search(/\r?\n/);
        while (lineBreakIndex >= 0) {
          const line = buffer.slice(0, lineBreakIndex).replace(/\r$/, "");
          buffer = buffer.slice(lineBreakIndex + (buffer[lineBreakIndex] === "\r" ? 2 : 1));
          if (line === "") {
            const completed = dispatch();
            if (completed) return completed;
          } else if (line.startsWith("event:")) {
            currentEvent = line.slice("event:".length).trim() || "message";
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
          }
          lineBreakIndex = buffer.search(/\r?\n/);
        }
        if (done) {
          const completed = dispatch();
          if (completed) return completed;
          break;
        }
      }
      throw new Error(`${label} stream ended without completion.`);
    } catch (error) {
      lastError = error;
      const retryable = isConnectionFailure(error);
      console.log(`[phase88 sse ${retryable ? "retry" : "failure"}] ${label} attempt ${attempt}/${FETCH_RETRY_LIMIT}: ${errorMessage(error)}`);
      if (!retryable || attempt >= FETCH_RETRY_LIMIT) break;
      await delay(FETCH_RETRY_BASE_MS * Math.min(attempt, 5));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function readV2Card(cardPath: string): V2CardInput {
  const raw = JSON.parse(readFileSync(cardPath, "utf-8")) as {
    data?: Record<string, unknown>;
  } & Record<string, unknown>;
  const data = raw.data ?? raw;
  const name = String(data.name ?? "").trim();
  const description = String(data.description ?? "").trim();
  if (!name || !description) {
    throw new Error(`V2 card ${cardPath} must expose data.name and data.description.`);
  }
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => String(tag)).filter(Boolean)
    : [];
  return {
    name,
    description,
    personality: String(data.personality ?? ""),
    scenario: String(data.scenario ?? ""),
    tags,
    mesExample: String(data.mes_example ?? data.mesExample ?? ""),
  };
}

async function generateFreshWorld(campaignId: string): Promise<GenerateWorldResult> {
  return fetchSseComplete<GenerateWorldResult>(
    "/api/worldgen/generate",
    { campaignId },
    `worldgen:${campaignId}`,
  );
}

async function createFreshPlayer(
  campaignId: string,
  player: FreshPlayerSpec,
): Promise<{ playerId: string | null; playerSource: string }> {
  let draftResponse: CharacterDraftResponse;
  let playerSource: string;
  if (player.mode === "import-v2-card") {
    const card = readV2Card(player.cardPath);
    playerSource = `v2-card:${basename(player.cardPath)}`;
    draftResponse = await fetchJson<CharacterDraftResponse>("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        ...card,
        role: "player",
        importMode: player.importMode,
        ...(player.overrideText ? { overrideText: player.overrideText } : {}),
      }),
    });
  } else {
    playerSource = "parse-concept";
    draftResponse = await fetchJson<CharacterDraftResponse>("/api/worldgen/parse-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        role: "player",
        concept: player.concept,
        ...(player.overrideText ? { overrideText: player.overrideText } : {}),
      }),
    });
  }

  if (!draftResponse.draft) {
    throw new Error(`Player draft was not returned for campaign ${campaignId}.`);
  }
  const saved = await fetchJson<CharacterDraftResponse>("/api/worldgen/save-character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, draft: draftResponse.draft }),
  });
  return {
    playerId: typeof saved.playerId === "string" ? saved.playerId : null,
    playerSource,
  };
}

function selectedCampaignTemplates(selectedRoutes: readonly RouteSpec[]): CampaignTemplate[] {
  const selectedKeys = new Set(selectedRoutes.map((route) => route.campaignKey));
  return campaignTemplates.filter((campaign) => selectedKeys.has(campaign.key));
}

function existingCampaignRecord(template: CampaignTemplate): ProvisionedCampaign {
  const campaignId = CAMPAIGN_ID_OVERRIDES.get(template.key) ?? template.existingCampaignId;
  return {
    key: template.key,
    label: template.label,
    campaignId,
    purpose: template.purpose,
    source: "existing",
    existingCampaignId: template.existingCampaignId,
  };
}

function makeProvisioningResult(campaignRecords: ProvisionedCampaign[]): CampaignProvisioningResult {
  const routeCampaigns = new Map<string, ProvisionedCampaign>();
  for (const campaign of campaignRecords) {
    if (campaign.routeId) routeCampaigns.set(campaign.routeId, campaign);
  }
  return { campaignRecords, routeCampaigns };
}

function campaignForRoute(route: RouteSpec, provisioning: CampaignProvisioningResult): ProvisionedCampaign {
  const routeCampaign = provisioning.routeCampaigns.get(route.id);
  if (routeCampaign) return routeCampaign;
  const campaign = provisioning.campaignRecords.find((candidate) => candidate.key === route.campaignKey);
  if (!campaign) throw new Error(`No campaign for route ${route.id}`);
  return campaign;
}

async function provisionFreshCampaign(template: CampaignTemplate): Promise<ProvisionedCampaign> {
  appendProvisioningEvent({
    type: "fresh-campaign-start",
    key: template.key,
    name: template.fresh.name,
    reuseExisting: false,
  });
  const created = await fetchJson<CampaignMetaResponse>("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: template.fresh.name,
      premise: template.fresh.premise,
      ...(template.fresh.worldgenSourceHint ? { worldgenSourceHint: template.fresh.worldgenSourceHint } : {}),
      worldgenResearchEnabled: template.fresh.worldgenResearchEnabled,
    }),
  });
  await loadCampaign(created.id);
  const world = await generateFreshWorld(created.id);
  const player = await createFreshPlayer(created.id, template.fresh.player);
  const record: ProvisionedCampaign = {
    key: template.key,
    label: template.label,
    campaignId: created.id,
    purpose: template.purpose,
    source: "fresh",
    existingCampaignId: template.existingCampaignId,
    playerSource: player.playerSource,
  };
  appendProvisioningEvent({
    type: "fresh-campaign-complete",
    key: template.key,
    campaignId: created.id,
    name: created.name,
    world,
    player,
  });
  return record;
}

async function provisionClonedCampaignsForRun(
  selectedRoutes: readonly RouteSpec[],
  templates: readonly CampaignTemplate[],
): Promise<CampaignProvisioningResult> {
  const records: ProvisionedCampaign[] = [];
  const routesByKey = new Map<string, RouteSpec[]>();
  for (const route of selectedRoutes) {
    const routesForKey = routesByKey.get(route.campaignKey) ?? [];
    routesForKey.push(route);
    routesByKey.set(route.campaignKey, routesForKey);
  }

  const totalKeyCount = Math.max(templates.length, 1);
  const minimumClonesPerKey = CLONE_POOL_SIZE > 0 ? Math.ceil(CLONE_POOL_SIZE / totalKeyCount) : 0;
  for (const template of templates) {
    const sourceCampaignId = CLONE_SOURCE_CAMPAIGNS.get(template.key)
      ?? CAMPAIGN_ID_OVERRIDES.get(template.key)
      ?? template.existingCampaignId;
    const routesForKey = routesByKey.get(template.key) ?? [];
    const cloneCount = Math.max(routesForKey.length, minimumClonesPerKey);
    for (let index = 0; index < cloneCount; index += 1) {
      const routeId = routesForKey[index]?.id ?? null;
      records.push(cloneCampaignDirectory(template, sourceCampaignId, routeId, index + 1));
    }
  }
  writeJson(join(ARTIFACT_DIR, "cloned-campaigns.json"), records);
  return makeProvisioningResult(records);
}

async function provisionCampaignsForRun(selectedRoutes: readonly RouteSpec[]): Promise<CampaignProvisioningResult> {
  const templates = selectedCampaignTemplates(selectedRoutes);
  if (USE_CAMPAIGN_CLONES) {
    return provisionClonedCampaignsForRun(selectedRoutes, templates);
  }

  if (MODE !== "live" || REUSE_EXISTING_CAMPAIGNS) {
    return makeProvisioningResult(templates.map(existingCampaignRecord));
  }

  const records: ProvisionedCampaign[] = [];
  for (const template of templates) {
    records.push(await provisionFreshCampaign(template));
  }
  writeJson(join(ARTIFACT_DIR, "fresh-campaigns.json"), records);
  return makeProvisioningResult(records);
}

async function loadCampaign(campaignId: string): Promise<void> {
  await fetchJson(`/api/campaigns/${campaignId}/load`, { method: "POST" });
}

async function createCheckpoint(campaignId: string, routeId: string): Promise<{ id: string }> {
  return fetchJson(`/api/campaigns/${campaignId}/checkpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `P88 ${routeId} ${RUN_ID.slice(0, 16)}`,
      description: "Phase 88 route isolation checkpoint.",
    }),
  });
}

async function restoreCheckpoint(campaignId: string, checkpointId: string): Promise<void> {
  await fetchJson(`/api/campaigns/${campaignId}/checkpoints/${checkpointId}/load`, {
    method: "POST",
  });
}

async function chatHistory(campaignId: string): Promise<{ messages: ChatMessage[] }> {
  return fetchJson(`/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
}

function campaignStateDbPath(campaignId: string): string {
  if (!/^[\w-]{1,128}$/.test(campaignId)) {
    throw new Error(`Unsafe campaign id for fingerprint: ${campaignId}`);
  }
  return join(CAMPAIGNS_ROOT, campaignId, "state.db");
}

function tableCount(db: Database.Database, tableName: string, campaignId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE campaign_id = ?`).get(campaignId) as
    | { count?: number }
    | undefined;
  return Number(row?.count ?? 0);
}

function readWorldDbFingerprint(campaignId: string): unknown {
  const dbPath = campaignStateDbPath(campaignId);
  if (!existsSync(dbPath)) {
    return { available: false, dbPath };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("query_only = ON");
    const clock = db.prepare(
      [
        "SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes,",
        "current_tick AS currentTick, updated_at AS updatedAt",
        "FROM world_clocks WHERE campaign_id = ?",
      ].join(" "),
    ).get(campaignId) ?? null;
    const lastAuthorityTrace = db.prepare(
      [
        "SELECT operation, source_entity_type AS sourceEntityType, result_world_version AS resultWorldVersion,",
        "world_time_minutes AS worldTimeMinutes, elapsed_world_time_minutes AS elapsedWorldTimeMinutes, created_at AS createdAt",
        "FROM authority_traces WHERE campaign_id = ?",
        "ORDER BY result_world_version DESC LIMIT 1",
      ].join(" "),
    ).get(campaignId) ?? null;
    const pendingSimulation = db.prepare(
      [
        "SELECT status, COUNT(*) AS count",
        "FROM simulation_jobs WHERE campaign_id = ?",
        "GROUP BY status ORDER BY status",
      ].join(" "),
    ).all(campaignId);

    return {
      available: true,
      clock,
      counts: {
        authorityTraces: tableCount(db, "authority_traces", campaignId),
        locationRecentEvents: tableCount(db, "location_recent_events", campaignId),
        simulationJobs: tableCount(db, "simulation_jobs", campaignId),
        simulationProposals: tableCount(db, "simulation_proposals", campaignId),
        actorProcessStates: tableCount(db, "actor_process_states", campaignId),
        actorKnowledgeRecords: tableCount(db, "actor_knowledge_records", campaignId),
      },
      lastAuthorityTrace,
      pendingSimulation,
    };
  } catch (error) {
    return {
      available: false,
      dbPath,
      error: errorMessage(error),
    };
  } finally {
    db?.close();
  }
}

async function loadWorldFingerprint(campaignId: string): Promise<unknown> {
  const world = await fetchJson(`/api/campaigns/${campaignId}/world`);
  return {
    world,
    db: readWorldDbFingerprint(campaignId),
  };
}

function latestAssistantMessage(messages: readonly ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index]?.content ?? "";
  }
  return "";
}

function newMessagesSince(messages: readonly ChatMessage[], beforeCount: number): ChatMessage[] {
  return messages.slice(beforeCount);
}

async function readVisualState(page: Page): Promise<VisualState> {
  const textbox = page.getByRole("textbox", { name: "Scene action" });
  const hasActionInput = (await textbox.count()) > 0;
  const textareaDisabled = hasActionInput ? await textbox.first().isDisabled().catch(() => false) : true;
  const spinner = await page.locator(".animate-spin,[aria-busy='true'],[data-loading='true']").count().then((count) => count > 0);
  const stageText = await page.evaluate(() => {
    const skippedTags = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || skippedTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          const style = getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const parts: string[] = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
    return parts.join(" ");
  }).catch(() => "");
  const effectState = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("*"));
    const visible = elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const overflowCount = visible.filter((element) => element.scrollWidth > element.clientWidth + 2).length;
    const hasColoredText = visible.some((element) => {
      const style = getComputedStyle(element);
      return style.color !== "rgb(255, 255, 255)" && style.color !== "rgb(229, 231, 235)";
    });
    return {
      hasShake: visible.some((element) => /shake|trauma|impact/i.test(element.className.toString())),
      hasFlash: visible.some((element) => /flash|flare|pulse/i.test(element.className.toString())),
      hasBold: visible.some((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10) >= 700),
      hasItalic: visible.some((element) => getComputedStyle(element).fontStyle === "italic"),
      hasColoredText,
      overflowCount,
    };
  }).catch(() => ({
    hasShake: false,
    hasFlash: false,
    hasBold: false,
    hasItalic: false,
    hasColoredText: false,
    overflowCount: 0,
  }));

  return {
    ready: hasActionInput && !textareaDisabled && !spinner,
    hasActionInput,
    textareaDisabled,
    spinner,
    stageText,
    ...effectState,
  };
}

async function waitForReady(page: Page, label: string): Promise<void> {
  let nextLogAt = Date.now() + 30_000;
  let reloaded = false;
  let idleMissingInputSince: number | null = null;
  for (;;) {
    const state = await readVisualState(page);
    if (state.ready) return;
    const idleWithoutPlayableInput = !state.spinner && (!state.hasActionInput || state.textareaDisabled);
    if (idleWithoutPlayableInput) {
      idleMissingInputSince ??= Date.now();
      if (Date.now() - idleMissingInputSince > 90_000) {
        throw new Error(
          `${label} did not reach playable ready state; input=${state.hasActionInput}; disabled=${state.textareaDisabled}; spinner=${state.spinner}`,
        );
      }
    } else {
      idleMissingInputSince = null;
    }
    if (!state.hasActionInput && !reloaded) {
      reloaded = true;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await delay(2_000);
      continue;
    }
    if (Date.now() >= nextLogAt) {
      console.log(`[${label}] waiting for ready state; input=${state.hasActionInput}; disabled=${state.textareaDisabled}; spinner=${state.spinner}`);
      nextLogAt = Date.now() + 30_000;
    }
    await delay(5_000);
  }
}

async function submitAction(page: Page, action: string): Promise<void> {
  const textbox = page.getByRole("textbox", { name: "Scene action" });
  await textbox.waitFor({ state: "visible", timeout: 30_000 });
  await textbox.fill(action);
  if ((await textbox.inputValue()) !== action) {
    await textbox.click();
    await textbox.fill(action);
  }

  const sendButton = page.getByRole("button", { name: "Send action" });
  if (await sendButton.isVisible().catch(() => false)) {
    await sendButton.click();
    return;
  }

  await textbox.press("Enter");
}

async function waitForTurnComplete(
  page: Page,
  campaignId: string,
  beforeCount: number,
  action: string,
  label: string,
): Promise<{ elapsedMs: number; assistantText: string; visual: VisualState }> {
  const started = Date.now();
  let nextLogAt = started + 30_000;
  let submitAttempts = 0;
  let idleWithoutSubmissionSince: number | null = null;
  for (;;) {
    const visual = await readVisualState(page);
    const history = await chatHistory(campaignId);
    const newMessages = newMessagesSince(history.messages, beforeCount);
    const assistantText = latestAssistantMessage(newMessages);
    const userRecorded = newMessages.some((message) => message.role === "user" && message.content.includes(action));
    if (assistantText && visual.ready) {
      return { elapsedMs: Date.now() - started, assistantText, visual };
    }
    const idleWithoutSubmittedTurn = !userRecorded && !assistantText && !visual.spinner;
    if (idleWithoutSubmittedTurn) {
      idleWithoutSubmissionSince ??= Date.now();
      const idleMs = Date.now() - idleWithoutSubmissionSince;
      if (visual.ready && submitAttempts < ACTION_SUBMIT_RETRY_LIMIT) {
        submitAttempts += 1;
        await submitAction(page, action);
        idleWithoutSubmissionSince = Date.now();
        await delay(2_000);
        continue;
      }
      if (!visual.ready && idleMs > 30_000 && submitAttempts < ACTION_SUBMIT_RETRY_LIMIT) {
        submitAttempts += 1;
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await waitForReady(page, `${label} recovery ${submitAttempts}`);
        await submitAction(page, action);
        idleWithoutSubmissionSince = Date.now();
        await delay(2_000);
        continue;
      }
      if (idleMs > 45_000 && submitAttempts >= ACTION_SUBMIT_RETRY_LIMIT) {
        throw new ActionSubmissionLostError(
          `${label} did not reach chat history after ${submitAttempts + 1} submit attempt(s); UI is idle, so this is not model thinking. input=${visual.hasActionInput}; disabled=${visual.textareaDisabled}; spinner=${visual.spinner}`,
        );
      }
    } else {
      idleWithoutSubmissionSince = null;
    }
    if (Date.now() >= nextLogAt) {
      console.log(`[${label}] turn still running ${Math.round((Date.now() - started) / 1000)}s; chatUserRecorded=${userRecorded}; assistant=${Boolean(assistantText)}; ready=${visual.ready}; input=${visual.hasActionInput}; disabled=${visual.textareaDisabled}; spinner=${visual.spinner}`);
      nextLogAt = Date.now() + 30_000;
    }
    await delay(5_000);
  }
}

function routeDir(route: RouteSpec): string {
  return join(ARTIFACT_DIR, "routes", route.campaignKey, route.id);
}

async function screenshot(page: Page, route: RouteSpec, turn: number, suffix: string): Promise<string> {
  const dir = join(routeDir(route), "screenshots");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `turn-${String(turn).padStart(2, "0")}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

function listCampaignLogs(campaignId: string): string[] {
  const dir = [join("backend", "campaigns", campaignId, "logs"), join("campaigns", campaignId, "logs")]
    .find((candidate) => existsSync(candidate));
  if (!dir) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    });
}

function hardFailuresFor(record: TurnRecord, route: RouteSpec): string[] {
  const failures: string[] = [];
  if (!record.assistantText.trim()) failures.push("missing_assistant_text");
  if (expectsWorldMutationForTurn(route, record.turn) && !record.worldChanged) failures.push("world_did_not_change_for_mutating_route");
  if (/\b(?:tool call|backend|schema|action checklist|hidden truth|GM private)\b/i.test(record.assistantText)) {
    failures.push("backend_or_private_surface_leak");
  }
  if (record.visual?.overflowCount && record.visual.overflowCount > 0) {
    failures.push("visual_overflow_detected");
  }
  return failures;
}

function expectsWorldMutationForTurn(route: RouteSpec, turn: number): boolean {
  return route.expectsWorldMutationByTurn?.[turn - 1] ?? route.expectsWorldMutation;
}

function softReviewRubric(route: RouteSpec): string[] {
  return [
    "Does the response add pressure/reaction/new fact instead of only paraphrasing the player?",
    "Does agency stay world-agnostic rather than making every event revolve around the player?",
    "Are NPC/faction changes surfaced through believable routes and provenance?",
    "Is the prose concrete, readable, and free of generic neural-slop phrasing?",
    `Route-specific hard gate: ${route.hardGate}`,
  ];
}

function writeSoftReviewSample(route: RouteSpec, turn: TurnRecord): string {
  const file = join(routeDir(route), "soft-review-samples.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({
    routeId: route.id,
    turn: turn.turn,
    action: turn.action,
    assistantText: turn.assistantText,
    rubric: softReviewRubric(route),
  })}\n`, "utf-8");
  return file;
}

async function runLiveRoute(
  browser: Browser,
  route: RouteSpec,
  profile: ProfileSpec,
  provisioning: CampaignProvisioningResult,
): Promise<TurnRecord[]> {
  const campaign = campaignForRoute(route, provisioning);
  mkdirSync(routeDir(route), { recursive: true });
  await loadCampaign(campaign.campaignId);
  const checkpoint = await createCheckpoint(campaign.campaignId, route.id);
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  const records: TurnRecord[] = [];
  page.on("console", (message) => appendFileSync(join(routeDir(route), "browser-console.jsonl"), `${JSON.stringify({
    type: message.type(),
    text: message.text(),
  })}\n`, "utf-8"));

  try {
    await page.goto(`${FRONTEND_URL}/game`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForReady(page, route.id);
    const turnCount = Math.min(profile.turnsPerRoute, route.actions.length);
    for (let index = 0; index < turnCount; index += 1) {
      const action = route.actions[index] ?? route.actions[route.actions.length - 1]!;
      const beforeWorld = await loadWorldFingerprint(campaign.campaignId);
      const beforeHistory = await chatHistory(campaign.campaignId);
      await screenshot(page, route, index + 1, "before");
      const logsBefore = new Set(listCampaignLogs(campaign.campaignId));
      await submitAction(page, action);
      let result: { elapsedMs: number; assistantText: string; visual: VisualState };
      try {
        result = await waitForTurnComplete(
          page,
          campaign.campaignId,
          beforeHistory.messages.length,
          action,
          `${route.id} turn ${index + 1}`,
        );
      } catch (error) {
        if (!(error instanceof ActionSubmissionLostError)) {
          throw error;
        }
        const failedVisual = await readVisualState(page);
        const failedScreenshot = await screenshot(page, route, index + 1, "submission-lost");
        const failedRecord: TurnRecord = {
          campaignKey: campaign.key,
          campaignId: campaign.campaignId,
          routeId: route.id,
          turn: index + 1,
          action,
          elapsedMs: 0,
          assistantText: "",
          screenshot: failedScreenshot,
          worldBeforeHash: hashValue(beforeWorld),
          worldAfterHash: hashValue(beforeWorld),
          worldChanged: false,
          visual: failedVisual,
          hardFailures: ["action_submission_lost"],
          softReview: {
            status: "not_applicable",
            rubric: [],
            samplePath: null,
          },
        };
        appendFileSync(join(routeDir(route), "turns.jsonl"), `${JSON.stringify(failedRecord)}\n`, "utf-8");
        records.push(failedRecord);
        break;
      }
      const afterWorld = await loadWorldFingerprint(campaign.campaignId);
      const screenshotPath = await screenshot(page, route, index + 1, "after");
      const record: TurnRecord = {
        campaignKey: campaign.key,
        campaignId: campaign.campaignId,
        routeId: route.id,
        turn: index + 1,
        action,
        elapsedMs: result.elapsedMs,
        assistantText: result.assistantText,
        screenshot: screenshotPath,
        worldBeforeHash: hashValue(beforeWorld),
        worldAfterHash: hashValue(afterWorld),
        worldChanged: hashValue(beforeWorld) !== hashValue(afterWorld),
        visual: result.visual,
        hardFailures: [],
        softReview: {
          status: "queued_for_llm_or_human",
          rubric: softReviewRubric(route),
          samplePath: null,
        },
      };
      record.hardFailures = hardFailuresFor(record, route);
      record.softReview.samplePath = writeSoftReviewSample(route, record);
      appendFileSync(join(routeDir(route), "turns.jsonl"), `${JSON.stringify({
        ...record,
        newLogs: listCampaignLogs(campaign.campaignId).filter((log) => !logsBefore.has(log)),
      })}\n`, "utf-8");
      records.push(record);
    }
  } finally {
    await restoreCheckpoint(campaign.campaignId, checkpoint.id).catch((error) => {
      appendFileSync(join(routeDir(route), "restore-errors.jsonl"), `${JSON.stringify({ message: errorMessage(error) })}\n`, "utf-8");
    });
    await page.close();
  }

  return records;
}

function runDeterministicRoute(
  route: RouteSpec,
  profile: ProfileSpec,
  provisioning: CampaignProvisioningResult,
): TurnRecord[] {
  const campaign = campaignForRoute(route, provisioning);
  mkdirSync(routeDir(route), { recursive: true });
  const turnCount = Math.min(profile.turnsPerRoute, route.actions.length);
  const records: TurnRecord[] = [];
  for (let index = 0; index < turnCount; index += 1) {
    const action = route.actions[index] ?? route.actions[route.actions.length - 1]!;
    const expectsWorldMutation = expectsWorldMutationForTurn(route, index + 1);
    const assistantText = [
      `[deterministic harness] ${route.label}.`,
      "This record verifies manifest shape, artifact writing, hard-gate wiring, and soft-review sample generation.",
      "Live model prose is intentionally not judged by deterministic lexical heuristics.",
    ].join(" ");
    const record: TurnRecord = {
      campaignKey: campaign.key,
      campaignId: campaign.campaignId,
      routeId: route.id,
      turn: index + 1,
      action,
      elapsedMs: 0,
      assistantText,
      screenshot: null,
      worldBeforeHash: hashValue({ route: route.id, turn: index, state: "before" }),
      worldAfterHash: hashValue({ route: route.id, turn: index, state: expectsWorldMutation ? "after" : "before" }),
      worldChanged: expectsWorldMutation,
      visual: null,
      hardFailures: [],
      softReview: {
        status: "queued_for_llm_or_human",
        rubric: softReviewRubric(route),
        samplePath: null,
      },
    };
    record.softReview.samplePath = writeSoftReviewSample(route, record);
    appendFileSync(join(routeDir(route), "turns.jsonl"), `${JSON.stringify(record)}\n`, "utf-8");
    records.push(record);
  }
  return records;
}

function writeManifest(
  selectedRoutes: RouteSpec[],
  profile: ProfileSpec,
  campaignRecords: readonly ProvisionedCampaign[],
): void {
  writeJson(join(ARTIFACT_DIR, "manifest.json"), {
    phase: 88,
    mode: MODE,
    profile: PROFILE,
    profileLabel: profile.label,
    campaignProvisioning: {
      liveDefault: USE_CAMPAIGN_CLONES ? "clone" : "fresh",
      reuseExistingCampaigns: REUSE_EXISTING_CAMPAIGNS,
      useCampaignClones: USE_CAMPAIGN_CLONES,
      clonePoolSize: CLONE_POOL_SIZE,
      cloneSources: Object.fromEntries(CLONE_SOURCE_CAMPAIGNS.entries()),
      charsDir: CHARS_DIR,
    },
    campaigns: campaignRecords,
    routeCampaigns: selectedRoutes.map((route) => ({
      routeId: route.id,
      campaignKey: route.campaignKey,
      campaignId: campaignRecords.find((campaign) => campaign.routeId === route.id)?.campaignId
        ?? campaignRecords.find((campaign) => campaign.key === route.campaignKey)?.campaignId
        ?? null,
    })),
    campaignTemplates,
    routes: selectedRoutes,
    softReview: {
      policy: "Code only queues samples and obvious hard leaks. Prose/playfeel quality requires calibrated LLM or human review.",
      calibrationScript: "e2e/88-living-world-judge-calibration.ts",
    },
  });
}

function writeSummary(
  records: TurnRecord[],
  selectedRoutes: RouteSpec[],
  startedAt: string,
  campaignRecords: readonly ProvisionedCampaign[],
): RunSummary {
  const summary: RunSummary = {
    phase: 88,
    mode: MODE,
    profile: PROFILE,
    runId: RUN_ID,
    artifactDir: ARTIFACT_DIR,
    frontendUrl: FRONTEND_URL,
    backendUrl: BACKEND_URL,
    startedAt,
    finishedAt: new Date().toISOString(),
    campaigns: [...campaignRecords],
    routes: selectedRoutes.map((route) => ({
      id: route.id,
      label: route.label,
      campaignKey: route.campaignKey,
      hardGate: route.hardGate,
      expectsWorldMutation: route.expectsWorldMutation,
    })),
    totals: {
      routes: selectedRoutes.length,
      turns: records.length,
      hardFailures: records.reduce((count, record) => count + record.hardFailures.length, 0),
      softReviewSamples: records.filter((record) => record.softReview.status === "queued_for_llm_or_human").length,
    },
    status: records.some((record) => record.hardFailures.length > 0) ? "failed" : "passed",
    notes: [
      "No arbitrary model-turn timeout is enforced by this harness.",
      "Assistant output is preserved in full in turns.jsonl; shortness must be prompted, not clipped.",
      "Soft prose/playfeel quality is queued for calibrated LLM/human review instead of scored by keyword heuristics.",
      "Live clone mode reuses generated campaign baselines by copying campaign databases; route tests should not pay worldgen cost unless worldgen itself is under test.",
    ],
  };
  writeJson(join(ARTIFACT_DIR, "summary.json"), summary);
  mkdirSync(BASE_ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(BASE_ARTIFACT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  return summary;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const profile = profiles[PROFILE];
  if (!profile) {
    throw new Error(`Unknown PHASE88_PROFILE "${PROFILE}". Known profiles: ${Object.keys(profiles).join(", ")}`);
  }
  const selectedRoutes = profile.routeIds.map((routeId) => {
    const route = routes.find((candidate) => candidate.id === routeId);
    if (!route) throw new Error(`Profile ${PROFILE} references missing route ${routeId}`);
    return route;
  });
  const provisioning = await provisionCampaignsForRun(selectedRoutes);
  writeManifest(selectedRoutes, profile, provisioning.campaignRecords);

  let records: TurnRecord[] = [];
  if (MODE === "deterministic") {
    records = selectedRoutes.flatMap((route) => runDeterministicRoute(route, profile, provisioning));
  } else if (MODE === "live") {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const route of selectedRoutes) {
        records.push(...await runLiveRoute(browser, route, profile, provisioning));
      }
    } finally {
      await browser.close();
    }
  } else {
    throw new Error(`Unknown PHASE88_MODE "${MODE}". Use deterministic or live.`);
  }

  const summary = writeSummary(records, selectedRoutes, startedAt, provisioning.campaignRecords);
  if (summary.status !== "passed") {
    throw new Error(`Phase 88 ${MODE}/${PROFILE} hard gate failed; see ${summary.artifactDir}`);
  }
}

main().catch((error) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeJson(join(ARTIFACT_DIR, "error.json"), {
    message: errorMessage(error),
    stack: error instanceof Error ? error.stack : null,
  });
  console.error(error);
  process.exitCode = 1;
});
