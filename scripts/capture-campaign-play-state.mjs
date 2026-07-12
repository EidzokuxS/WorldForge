import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function argumentsMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must use --key value pairs.");
    }
    values.set(key.slice(2), value);
  }
  return values;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonLines(filePath, records) {
  fs.writeFileSync(
    filePath,
    records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

function collectInventory(bundleRoot, runId) {
  const entries = [];
  const visit = (relativeDirectory) => {
    const directory = path.join(bundleRoot, relativeDirectory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Evidence cannot contain a symlink: ${relativePath}.`);
      if (entry.isDirectory()) visit(relativePath);
      if (entry.isFile() && relativePath !== "inventory.json") {
        const bytes = fs.readFileSync(path.join(bundleRoot, ...relativePath.split("/")));
        entries.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  };
  visit("");
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { evidenceVersion: 1, runId, entries };
}

class CdpSession {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed.")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const values = argumentsMap(process.argv.slice(2));
const bundleRoot = path.resolve(required(values, "bundle"));
const label = required(values, "label");
const browserUrl = values.get("browser-url") ?? "http://127.0.0.1:9222";
const targetUrl = required(values, "target-url");
const watchActions = Number(values.get("watch-actions") ?? "0");
const timeoutMs = Number(values.get("timeout-ms") ?? "600000");
if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(label)) {
  throw new Error("--label must be lowercase kebab-case.");
}
if (!Number.isSafeInteger(watchActions) || watchActions < 0) {
  throw new Error("--watch-actions must be a nonnegative integer.");
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
  throw new Error("--timeout-ms must be an integer of at least 1000.");
}

const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, "manifest.json"), "utf8"));
const targetsResponse = await fetch(new URL("/json/list", browserUrl));
if (!targetsResponse.ok) throw new Error(`CDP target listing failed with ${targetsResponse.status}.`);
const targets = await targetsResponse.json();
const target = targets.find((candidate) => candidate.type === "page" && candidate.url === targetUrl);
if (!target?.webSocketDebuggerUrl) {
  throw new Error(`No open browser page exactly matches ${targetUrl}.`);
}

const consoleErrors = [];
const requests = new Map();
const responses = [];
const failedRequests = [];
let completedActionRequests = 0;
let observedActionRequests = 0;
let resolveWatchedActions;
const watchedActions = new Promise((resolve) => {
  resolveWatchedActions = resolve;
});
const session = new CdpSession(target.webSocketDebuggerUrl);
await session.open();
try {
  session.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") consoleErrors.push(event);
  });
  session.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") consoleErrors.push(entry);
  });
  session.on("Network.requestWillBeSent", ({ requestId, request }) => {
    const requestUrl = /^https?:/u.test(request.url) ? new URL(request.url) : null;
    const playerActionNumber = request.method === "POST"
      && requestUrl?.pathname.endsWith("/play/turns")
      ? ++observedActionRequests
      : null;
    requests.set(requestId, {
      method: request.method,
      url: request.url,
      requestBodyHash: request.postData ? sha256(request.postData) : null,
      playerActionNumber,
    });
  });
  session.on("Network.responseReceived", ({ requestId, response }) => {
    const request = requests.get(requestId);
    if (!request || !/^https?:/u.test(request.url)) return;
    const record = { requestId, ...request, status: Math.trunc(response.status) };
    responses.push(record);
    const requestUrl = new URL(request.url);
    if (request.method === "POST" && requestUrl.pathname.endsWith("/play/turns")) {
      completedActionRequests += 1;
    }
    if (
      watchActions > 0
      && completedActionRequests >= watchActions
      && request.method === "GET"
      && requestUrl.pathname.endsWith("/play/state")
    ) {
      resolveWatchedActions();
    }
  });
  session.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
    const request = requests.get(requestId);
    failedRequests.push({
      method: request?.method ?? "UNKNOWN",
      url: request?.url ?? "unknown",
      errorText,
      canceled: Boolean(canceled),
    });
  });
  await Promise.all([
    session.call("Page.enable"),
    session.call("Runtime.enable"),
    session.call("Log.enable"),
    session.call("Network.enable"),
  ]);
  if (watchActions > 0) {
    await Promise.race([
      watchedActions,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`Timed out before ${watchActions} player action requests completed.`)),
        timeoutMs,
      )),
    ]);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const evaluated = await session.call("Runtime.evaluate", {
    expression: `(() => ({
      url: location.href,
      title: document.title,
      visibleText: document.body?.innerText ?? "",
      html: document.documentElement?.outerHTML ?? "",
      resources: performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        responseStatus: Number(entry.responseStatus ?? 0),
        duration: entry.duration,
        transferSize: entry.transferSize
      }))
    }))()`,
    returnByValue: true,
  });
  const state = evaluated.result?.value;
  if (!state || state.url !== targetUrl) throw new Error("The captured page changed before evidence collection.");

  const screenshot = await session.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  const screenshotBytes = Buffer.from(screenshot.data, "base64");
  const screenshotPath = path.join(bundleRoot, "screenshots", `${label}.png`);
  fs.writeFileSync(screenshotPath, screenshotBytes);

  const publicState = {
    capturedAt: Date.now(),
    url: state.url,
    title: state.title,
    visibleText: state.visibleText,
    visibleStateHash: sha256(state.visibleText),
    htmlHash: sha256(state.html),
    screenshotHash: sha256(screenshotBytes),
  };
  writeJson(path.join(bundleRoot, "probes", `browser-state-${label}.json`), publicState);

  const networkPath = path.join(bundleRoot, "network-trace.jsonl");
  const existingNetwork = readJsonLines(networkPath);
  const known = new Set(existingNetwork.map((entry) =>
    `${entry.method} ${entry.path} ${entry.status} ${entry.requestBodyHash ?? ""}`));
  const additions = [];
  for (const response of responses) {
    const status = Number(response.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) continue;
    const resourceUrl = new URL(response.url);
    const requestPath = `${resourceUrl.pathname}${resourceUrl.search}`;
    const key = `${response.method} ${requestPath} ${status} ${response.requestBodyHash ?? ""}`;
    if (known.has(key)) continue;
    known.add(key);
    additions.push({
      runId: manifest.runId,
      campaignId: manifest.campaignId,
      sequence: existingNetwork.length + additions.length + 1,
      method: response.method,
      path: requestPath,
      status,
      requestBodyHash: response.requestBodyHash,
      responseBodyHash: null,
      playerActionNumber: response.playerActionNumber,
    });
  }
  writeJsonLines(networkPath, [...existingNetwork, ...additions]);

  const browserConsolePath = path.join(bundleRoot, "browser-console.json");
  const priorConsole = JSON.parse(fs.readFileSync(browserConsolePath, "utf8"));
  writeJson(browserConsolePath, [...priorConsole, ...consoleErrors]);
  const networkErrorsPath = path.join(bundleRoot, "network-errors.json");
  const priorNetworkErrors = JSON.parse(fs.readFileSync(networkErrorsPath, "utf8"));
  writeJson(networkErrorsPath, [
    ...priorNetworkErrors,
    ...additions.filter((entry) => entry.status >= 400),
    ...failedRequests,
  ]);
  writeJson(path.join(bundleRoot, "inventory.json"), collectInventory(bundleRoot, manifest.runId));

  process.stdout.write(`${JSON.stringify({
    bundleRoot,
    label,
    visibleStateHash: publicState.visibleStateHash,
    screenshotHash: publicState.screenshotHash,
    networkEntriesAdded: additions.length,
    consoleErrors: consoleErrors.length,
    failedRequests: failedRequests.length,
    completedActionRequests,
  })}\n`);
} finally {
  session.close();
}
