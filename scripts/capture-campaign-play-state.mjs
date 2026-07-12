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
if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(label)) {
  throw new Error("--label must be lowercase kebab-case.");
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
const session = new CdpSession(target.webSocketDebuggerUrl);
await session.open();
try {
  session.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") consoleErrors.push(event);
  });
  session.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") consoleErrors.push(entry);
  });
  await Promise.all([
    session.call("Page.enable"),
    session.call("Runtime.enable"),
    session.call("Log.enable"),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 250));

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
  const known = new Set(existingNetwork.map((entry) => `${entry.method} ${entry.path} ${entry.status}`));
  const additions = [];
  for (const resource of state.resources) {
    const status = Number(resource.responseStatus);
    if (!Number.isInteger(status) || status < 100 || status > 599) continue;
    const resourceUrl = new URL(resource.name);
    const requestPath = `${resourceUrl.pathname}${resourceUrl.search}`;
    const key = `GET ${requestPath} ${status}`;
    if (known.has(key)) continue;
    known.add(key);
    additions.push({
      runId: manifest.runId,
      campaignId: manifest.campaignId,
      sequence: existingNetwork.length + additions.length + 1,
      method: "GET",
      path: requestPath,
      status,
      requestBodyHash: null,
      responseBodyHash: null,
      playerActionNumber: null,
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
  ]);
  writeJson(path.join(bundleRoot, "inventory.json"), collectInventory(bundleRoot, manifest.runId));

  process.stdout.write(`${JSON.stringify({
    bundleRoot,
    label,
    visibleStateHash: publicState.visibleStateHash,
    screenshotHash: publicState.screenshotHash,
    networkEntriesAdded: additions.length,
    consoleErrors: consoleErrors.length,
  })}\n`);
} finally {
  session.close();
}
