import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const CAMPAIGN_ID =
  process.env.CAMPAIGN_ID ?? "0ed6bb3c-a528-4067-8f29-86ebdd8d0637";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR
  ?? join("output", "playwright", "phase-84-rp-prompts", RUN_ID);
const ACTION_SUBMIT_RETRY_LIMIT = 2;
const BASELINE_CHECKPOINT_ID = process.env.BASELINE_CHECKPOINT_ID?.trim() || null;

type ChatMessage = { role: "user" | "assistant" | string; content: string };

interface TurnRecord {
  branch: string;
  turn: number;
  action: string;
  elapsedMs: number;
  assistantText: string;
  screenshot: string;
  hardFailures: string[];
  gateInvariantFailures: string[];
  subjectiveScore: number;
}

interface BranchPlan {
  name: string;
  actions: string[];
}

const branches: BranchPlan[] = [
  {
    name: "social-direct",
    actions: [
      "I stop by the nearest visible worker and ask what changed since the dead telegraph tower started answering.",
      "I promise to carry one small warning if they can give me a name and a route.",
    ],
  },
  {
    name: "exploration-staging",
    actions: [
      "I look for a service passage or temporary night-market stall that could help me bypass the main street.",
      "If there is a minor clerk or porter nearby, I ask them quietly who controls this passage.",
    ],
  },
  {
    name: "false-claim-boundary",
    actions: [
      "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
      "I back off and ask what proof I would need before anyone lets me through.",
    ],
  },
];
const branchFilter = (process.env.BRANCH_FILTER ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const selectedBranches = branchFilter.length > 0
  ? branches.filter((branch) => branchFilter.includes(branch.name))
  : branches;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, init);
      if (!response.ok) {
        throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      console.log(`[fetch retry] ${init?.method ?? "GET"} ${path} attempt ${attempt}/5 failed: ${error instanceof Error ? error.message : String(error)}`);
      await delay(1_500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadCampaign(): Promise<void> {
  await fetchJson(`/api/campaigns/${CAMPAIGN_ID}/load`, { method: "POST" });
}

async function createCheckpoint(): Promise<{ id: string }> {
  return fetchJson(`/api/campaigns/${CAMPAIGN_ID}/checkpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Phase 84 branchy RP baseline ${RUN_ID}`,
      description: "Baseline checkpoint for branchy RP prompt playtest.",
    }),
  });
}

async function restoreCheckpoint(checkpointId: string): Promise<void> {
  await loadCampaign();
  await fetchJson(`/api/campaigns/${CAMPAIGN_ID}/checkpoints/${checkpointId}/load`, {
    method: "POST",
  });
}

async function chatHistory(): Promise<{ messages: ChatMessage[] }> {
  return fetchJson(`/api/chat/history?campaignId=${encodeURIComponent(CAMPAIGN_ID)}`);
}

async function loadWorld(): Promise<unknown> {
  return fetchJson(`/api/campaigns/${CAMPAIGN_ID}/world`);
}

function flattenText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(flattenText).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${flattenText(entry)}`)
      .join("\n");
  }
  return "";
}

function falseClaimWorldInvariantFailures(world: unknown): string[] {
  const text = flattenText(world);
  const failures: string[] = [];
  if (/\bSignal-House Master Key\b/i.test(text)) {
    failures.push("world state contains spawned Signal-House Master Key");
  }
  if (/\bSealed Signal-House Office\b/i.test(text)) {
    failures.push("world state contains revealed Sealed Signal-House Office");
  }
  if (/\b(?:master-access|staff-issue|signal-house-master)\b/i.test(text)) {
    failures.push("world state contains access-proof/master-access tag");
  }
  return failures;
}

async function assertFalseClaimBaselineClean(label: string): Promise<void> {
  const [world, history] = await Promise.all([loadWorld(), chatHistory()]);
  const failures = falseClaimWorldInvariantFailures(world);
  const historyText = history.messages.map((message) => message.content).join("\n");
  if (/master key to every signal-house door/i.test(historyText)) {
    failures.push("chat history already contains the false-claim branch action");
  }
  if (/Signal-House Master Key|Sealed Signal-House Office/i.test(historyText)) {
    failures.push("chat history already contains prior false-claim access/key result");
  }
  if (failures.length > 0) {
    throw new Error(`[${label}] dirty false-claim baseline: ${failures.join("; ")}`);
  }
}

async function latestAssistantMessage(beforeCount: number): Promise<string> {
  const history = await chatHistory();
  return latestAssistantMessageFrom(history.messages.slice(beforeCount));
}

function latestAssistantMessageFrom(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.content.trim().length > 0) {
      return message.content.trim();
    }
  }
  return "";
}

function sawSubmittedAction(messages: ChatMessage[], action: string): boolean {
  const trimmedAction = action.trim();
  return messages.some(
    (message) => message.role === "user" && message.content.trim() === trimmedAction,
  );
}

async function newMessagesSince(beforeCount: number): Promise<ChatMessage[]> {
  const history = await chatHistory();
  return history.messages.slice(beforeCount);
}

async function readTurnUiState(page: Page): Promise<{
  ready: boolean;
  textareaDisabled: boolean;
  spinner: boolean;
  stage: string;
}> {
  return page.evaluate(() => {
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement | null;
    const spinner = document.querySelector(".animate-spin");
    const bodyText = document.body.textContent ?? "";
    const stageMatch = bodyText.match(/(forecast|gm|oracle|checklist|tool|narrat|settling|thinking)[\w -]*/i);
    return {
      ready: Boolean(textarea && !textarea.disabled && !spinner),
      textareaDisabled: Boolean(textarea?.disabled),
      spinner: Boolean(spinner),
      stage: stageMatch?.[0] ?? "thinking",
    };
  });
}

async function waitForTurnComplete(
  page: Page,
  label: string,
  beforeCount: number,
  action: string,
): Promise<{ elapsedMs: number; assistantText: string }> {
  const started = Date.now();
  let nextLogAt = started + 30_000;
  let submitAttempts = 1;

  for (;;) {
    const state = await readTurnUiState(page);
    const newMessages = await newMessagesSince(beforeCount);
    const assistantText = latestAssistantMessageFrom(newMessages);
    const submittedActionSeen = sawSubmittedAction(newMessages, action);

    if (assistantText.length > 0 && state.ready) {
      return { elapsedMs: Date.now() - started, assistantText };
    }

    if (state.ready) {
      if (!submittedActionSeen && submitAttempts <= ACTION_SUBMIT_RETRY_LIMIT) {
        submitAttempts += 1;
        console.log(
          `[${label}] UI is ready but no new turn reached chat history; retrying submit ${submitAttempts}/${ACTION_SUBMIT_RETRY_LIMIT + 1}`,
        );
        await delay(2_000);
        await submitAction(page, action);
        continue;
      }

      return { elapsedMs: Date.now() - started, assistantText };
    }

    if (Date.now() >= nextLogAt) {
      console.log(
        `[${label}] still running ${Math.round((Date.now() - started) / 1000)}s; stage=${state.stage}; disabled=${state.textareaDisabled}; spinner=${state.spinner}; submitted=${submittedActionSeen}; assistant=${assistantText.length > 0}`,
      );
      nextLogAt = Date.now() + 30_000;
    }

    await delay(5_000);
  }
}

async function waitForControlsReady(page: Page, label: string): Promise<void> {
  const started = Date.now();
  let nextLogAt = started + 30_000;

  for (;;) {
    const state = await readTurnUiState(page);
    if (state.ready) {
      return;
    }

    if (Date.now() >= nextLogAt) {
      console.log(
        `[${label}] waiting for controls ${Math.round((Date.now() - started) / 1000)}s; stage=${state.stage}; disabled=${state.textareaDisabled}; spinner=${state.spinner}`,
      );
      nextLogAt = Date.now() + 30_000;
    }

    await delay(5_000);
  }
}

async function submitAction(page: Page, action: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Scene action" });
  await textarea.fill(action);
  await textarea.press("Enter");
}

function hardFailures(action: string, text: string): string[] {
  const failures: string[] = [];
  if (text.length < 80) failures.push("assistant narrative under 80 chars");
  if (/Committed [a-z_]+ (?:result|action) [0-9a-f-]{24,}/i.test(text)) {
    failures.push("generic committed backend result leaked");
  }
  if (/\[(?:RP BEAT DIRECTIVE|NARRATOR PACKET|FINAL NARRATION TASK|SYSTEM RULES)\]/i.test(text)) {
    failures.push("hidden prompt section leaked");
  }
  if (/Player action request:/i.test(text)) {
    failures.push("player action request metadata leaked");
  }
  if (
    /\bclaim\b.+\b(?:have|possess|hold|own)\b.+\b(?:key|seal|permit|pass|chit)\b/i.test(action) &&
    /\b(?:key|seal|permit|pass|chit)\b[^.]{0,120}\b(?:slides|turns|in (?:Mira's|the player's|her|his) hand|in (?:Mira's|the player's|her|his) pocket|against the plate|from (?:Mira's|the player's|her|his) pocket|Mira turns it)\b/i.test(text)
  ) {
    failures.push("unverified claimed prop became narrated possession");
  }
  if (
    /\bclaim\b.+\b(?:key|seal|permit|pass|chit|authority|authorization)\b/i.test(action) &&
    /\b(?:she['’]?s through|Mira is already through|already through|already standing[^.]{0,80}(?:office|room)|gained entry|gains entry|is inside|inside (?:a|the) [^.]{0,60}(?:office|room)|door[^.]{0,80}(?:swings|opens|gives|is open|opened)|opened the door|the door is open|latch[^.]{0,80}(?:click|gives|turns)|lock[^.]{0,80}(?:turns|opens)|letting out a breath)\b/i.test(text) &&
    !/\b(?:does not|doesn't|never|no|not|fails?|stays closed|refuses)\b[^.]{0,80}\b(?:open|turn|click|unlock|through|entry)\b/i.test(text)
  ) {
    failures.push("unconfirmed access claim resulted in access or movement");
  }
  if (
    /\bclaim\b.+\b(?:key|seal|permit|pass|chit|authority|authorization)\b/i.test(action) &&
    /\b(?:door gives|door swings|lock catches|pins grind|unlock(?:s|ed)?|opens?)\b/i.test(text) &&
    /\b(?:lockpick|pick|seal-breaking|breaking tool|hidden tool|credential|training|technique|specialty)\b/i.test(text)
  ) {
    failures.push("unconfirmed access claim succeeded through invented alternate method");
  }
  return failures;
}

function gateInvariantFailures(branch: string, action: string, text: string, world: unknown): string[] {
  if (branch !== "false-claim-boundary") {
    return [];
  }
  const failures = falseClaimWorldInvariantFailures(world);
  if (
    /\bclaim\b.+\b(?:key|seal|permit|pass|chit|authority|authorization)\b/i.test(action) &&
    /\b(?:Signal-House Master Key|Sealed Signal-House Office|master key is in (?:her|Mira's) pocket|door is open|opened the door|already through|already standing)\b/i.test(text)
  ) {
    failures.push("false-claim branch text/state confirms claimed key or sealed-office access");
  }
  return failures;
}

function subjectiveScore(text: string): number {
  let score = 5;
  if (text.length < 220) score -= 1;
  if (!/[.!?]["')\]]?$/.test(text.trim())) score -= 1;
  if (!/(says|asks|answers|looks|moves|waits|turns|keeps|lowers|raises|points|opens|closes|gestures|voice|hand|door|street|counter|light|rain|bell|route|name)/i.test(text)) {
    score -= 1;
  }
  if (/(you feel|you decide|you say|you agree|you remember that you already)/i.test(text)) {
    score -= 1;
  }
  return Math.max(0, score);
}

async function screenshot(page: Page, branch: string, turn: number): Promise<string> {
  const file = join(ARTIFACT_DIR, `${branch}-turn-${turn}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function runBranch(page: Page, branch: BranchPlan, checkpointId: string): Promise<TurnRecord[]> {
  await restoreCheckpoint(checkpointId);
  if (branch.name === "false-claim-boundary") {
    await assertFalseClaimBaselineClean(`${branch.name} restored baseline`);
  }
  await page.goto(`${FRONTEND_URL}/game`, { waitUntil: "networkidle", timeout: 60_000 });
  await delay(2_000);

  const records: TurnRecord[] = [];
  for (let index = 0; index < branch.actions.length; index += 1) {
    const action = branch.actions[index]!;
    const label = `${branch.name} turn ${index + 1}`;
    await waitForControlsReady(page, label);
    const before = await chatHistory();

    console.log(`[${label}] ${action}`);
    await submitAction(page, action);
    const completion = await waitForTurnComplete(
      page,
      label,
      before.messages.length,
      action,
    );
    await delay(2_000);

    const assistantText =
      completion.assistantText || await latestAssistantMessage(before.messages.length);
    const world = await loadWorld();
    const shot = await screenshot(page, branch.name, index + 1);
    const failures = hardFailures(action, assistantText);
    const invariantFailures = gateInvariantFailures(branch.name, action, assistantText, world);
    const score = subjectiveScore(assistantText);
    const record: TurnRecord = {
      branch: branch.name,
      turn: index + 1,
      action,
      elapsedMs: completion.elapsedMs,
      assistantText,
      screenshot: shot,
      hardFailures: failures,
      gateInvariantFailures: invariantFailures,
      subjectiveScore: score,
    };

    appendFileSync(join(ARTIFACT_DIR, "turns.jsonl"), `${JSON.stringify(record)}\n`);
    console.log(
      `[${label}] done in ${Math.round(completion.elapsedMs / 1000)}s; score=${score}; failures=${failures.length}; gateFailures=${invariantFailures.length}; narrative=${assistantText.slice(0, 160).replace(/\s+/g, " ")}...`,
    );
    records.push(record);
  }

  return records;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, "turns.jsonl"), "");

  await loadCampaign();
  if (BASELINE_CHECKPOINT_ID) {
    console.log(`[setup] restoring supplied baseline checkpoint ${BASELINE_CHECKPOINT_ID}`);
    await restoreCheckpoint(BASELINE_CHECKPOINT_ID);
  }
  if (selectedBranches.some((branch) => branch.name === "false-claim-boundary")) {
    await assertFalseClaimBaselineClean("pre-checkpoint");
  }
  const checkpoint = await createCheckpoint();
  console.log(`[setup] campaign=${CAMPAIGN_ID}; checkpoint=${checkpoint.id}; artifacts=${ARTIFACT_DIR}`);
  if (selectedBranches.length === 0) {
    throw new Error(`No playtest branches matched BRANCH_FILTER=${branchFilter.join(",")}`);
  }

  const browser: Browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/chat/action")) {
      browserErrors.push(`requestfailed: ${request.failure()?.errorText ?? "unknown"} ${request.url()}`);
    }
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/chat/action") && response.status() >= 400) {
      const body = await response.text().catch(() => "");
      browserErrors.push(`response: ${response.status()} ${response.url()} ${body.slice(0, 240)}`);
    }
  });

  try {
    const allRecords: TurnRecord[] = [];
    for (const branch of selectedBranches) {
      allRecords.push(...await runBranch(page, branch, checkpoint.id));
    }

    const hardFailureCount = allRecords.reduce(
      (count, record) => count + record.hardFailures.length,
      0,
    );
    const gateInvariantFailureCount = allRecords.reduce(
      (count, record) => count + record.gateInvariantFailures.length,
      0,
    );
    const averageScore =
      allRecords.reduce((sum, record) => sum + record.subjectiveScore, 0) / allRecords.length;
    const summary = {
      campaignId: CAMPAIGN_ID,
      checkpointId: checkpoint.id,
      artifactDir: ARTIFACT_DIR,
      branchCount: selectedBranches.length,
      turnCount: allRecords.length,
      hardFailureCount,
      gateInvariantFailureCount,
      averageScore,
      browserErrors,
      passed: hardFailureCount === 0 && gateInvariantFailureCount === 0 && averageScore >= 4,
      records: allRecords.map((record) => ({
        branch: record.branch,
        turn: record.turn,
        elapsedMs: record.elapsedMs,
        subjectiveScore: record.subjectiveScore,
        hardFailures: record.hardFailures,
        gateInvariantFailures: record.gateInvariantFailures,
        screenshot: record.screenshot,
        assistantPreview: record.assistantText.slice(0, 240),
      })),
    };

    writeFileSync(join(ARTIFACT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`[summary] ${JSON.stringify(summary, null, 2)}`);
    if (!summary.passed) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
