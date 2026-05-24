#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const targetArg = args.find((arg) => !arg.startsWith("--"));
if (!targetArg) {
  console.error("Usage: node scripts/oracle-recheck-output.mjs <oracle-session-id|chatgpt-url> [--port=9333] [--profile=PATH] [--keep-browser]");
  process.exit(2);
}

const port = Number(argValue("--port", "9333"));
const explicitProfile = argValue("--profile");
const keepBrowser = args.includes("--keep-browser");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function oracleSessionDir(sessionId) {
  return path.join(os.homedir(), ".oracle", "sessions", sessionId);
}

function resolveInput(input) {
  if (/^https:\/\/chatgpt\.com\/c\//u.test(input)) {
    return {
      sessionId: null,
      sessionDir: null,
      meta: null,
      conversationUrl: input,
    };
  }

  const sessionDir = oracleSessionDir(input);
  const metaPath = path.join(sessionDir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(`No Oracle session found at ${metaPath}`);
  }
  const meta = readJson(metaPath);
  const conversationUrl =
    meta.browser?.archive?.conversationUrl ||
    meta.browser?.runtime?.tabUrl ||
    meta.artifacts?.find((artifact) => artifact.sourceUrl)?.sourceUrl;
  if (!conversationUrl) {
    throw new Error(`Oracle session ${input} has no saved conversation URL.`);
  }
  return {
    sessionId: input,
    sessionDir,
    meta,
    conversationUrl,
  };
}

function conversationIdFromUrl(url) {
  const match = String(url).match(/\/c\/([^/?#]+)/u);
  return match?.[1] ?? null;
}

function chromeCandidates() {
  const home = os.homedir();
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(home, "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
}

function findChrome() {
  const found = chromeCandidates().find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Could not find Chrome/Edge executable.");
  }
  return found;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function cdpAvailable() {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function waitForCdp() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await cdpAvailable()) return;
    await sleep(500);
  }
  throw new Error(`Chrome DevTools endpoint did not open on port ${port}.`);
}

async function ensureChrome(input) {
  if (await cdpAvailable()) return null;
  const profile =
    explicitProfile ||
    input.meta?.browser?.runtime?.userDataDir ||
    path.join(os.homedir(), ".oracle", "browser-profile");
  const chrome = findChrome();
  const child = spawn(chrome, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-first-run-ui",
    input.conversationUrl,
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  await waitForCdp();
  return child.pid;
}

async function getTargets() {
  return fetchJson(`http://127.0.0.1:${port}/json/list`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      handlers.reject(new Error(JSON.stringify(message.error)));
    } else {
      handlers.resolve(message.result);
    }
  };
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function openTarget(input) {
  const conversationId = conversationIdFromUrl(input.conversationUrl);
  let targets = await getTargets();
  let target = targets.find((entry) => conversationId && entry.url.includes(conversationId)) ||
    targets.find((entry) => entry.url.includes("chatgpt.com"));
  if (!target) {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
    const browser = await connect(version.webSocketDebuggerUrl);
    const created = await browser.send("Target.createTarget", { url: input.conversationUrl });
    browser.close();
    await sleep(3000);
    targets = await getTargets();
    target = targets.find((entry) => entry.id === created.targetId) ||
      targets.find((entry) => conversationId && entry.url.includes(conversationId));
  }
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Could not find a debuggable ChatGPT target.");
  }
  return target;
}

async function navigateToConversation(client, conversationUrl, conversationId) {
  const current = await client.send("Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
  });
  const href = String(current.result.value ?? "");
  if (href.includes(conversationId)) return;
  await client.send("Page.enable").catch(() => {});
  await client.send("Page.navigate", { url: conversationUrl });
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const probe = await client.send("Runtime.evaluate", {
      expression: "({ href: location.href, ready: document.readyState })",
      returnByValue: true,
      awaitPromise: true,
    });
    const value = probe.result.value;
    if (String(value?.href ?? "").includes(conversationId) && value?.ready === "complete") return;
    await sleep(1000);
  }
}

function extractConversationMessages(payload) {
  const mapping = payload?.mapping;
  if (!mapping || typeof mapping !== "object") return [];
  return Object.values(mapping)
    .map((node) => node?.message)
    .filter(Boolean)
    .map((message) => {
      const role = message.author?.role ?? "unknown";
      const parts = message.content?.parts ?? [];
      const text = parts
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") return part.text ?? part.content ?? JSON.stringify(part);
          return "";
        })
        .join("\n")
        .trim();
      return {
        id: message.id ?? null,
        role,
        text,
        createTime: message.create_time ?? null,
      };
    })
    .filter((message) => message.text);
}

async function extractFromPage(client, conversationId) {
  await client.send("Runtime.enable");
  await client.send("Page.enable").catch(() => {});

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = await client.send("Runtime.evaluate", {
      expression: "({ ready: document.readyState, textLength: document.body?.innerText?.length ?? 0, href: location.href })",
      returnByValue: true,
      awaitPromise: true,
    });
    const value = probe.result.value;
    if (value?.textLength > 1500 || attempt > 4) break;
    await sleep(1000);
  }

  const backendExpression = `(async () => {
    const urls = [
      "/backend-api/conversation/${conversationId}",
      "/backend-api/conversation/${conversationId}?offset=0"
    ];
    const results = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, { credentials: "include" });
        const text = await response.text();
        results.push({
          url,
          status: response.status,
          contentType: response.headers.get("content-type"),
          text,
        });
      } catch (error) {
        results.push({ url, error: String(error) });
      }
    }
    return results;
  })()`;
  const backendResult = await client.send("Runtime.evaluate", {
    expression: backendExpression,
    returnByValue: true,
    awaitPromise: true,
  });

  const domExpression = `(() => {
    const messageNodes = [...document.querySelectorAll("[data-message-author-role], [data-turn]")];
    const messages = messageNodes.map((node, index) => ({
      index,
      role: node.getAttribute("data-message-author-role") || node.getAttribute("data-turn") || "",
      text: (node.innerText || node.textContent || "").trim(),
    })).filter((message) => message.text);
    const markdowns = [...document.querySelectorAll(".markdown,[data-message-content],[data-testid*=message],.prose,[class*=markdown]")]
      .map((node, index) => ({ index, text: (node.innerText || node.textContent || "").trim() }))
      .filter((entry) => entry.text);
    return {
      href: location.href,
      title: document.title,
      bodyText: document.body?.innerText ?? "",
      messages,
      markdowns,
    };
  })()`;
  const domResult = await client.send("Runtime.evaluate", {
    expression: domExpression,
    returnByValue: true,
    awaitPromise: true,
  });

  return {
    backend: backendResult.result.value,
    dom: domResult.result.value,
  };
}

function summarize(input, extracted) {
  const backendPayload = extracted.backend
    ?.map((entry) => {
      try {
        return {
          ...entry,
          json: entry.text ? JSON.parse(entry.text) : null,
        };
      } catch {
        return entry;
      }
    }) ?? [];

  const backendOk = backendPayload.find((entry) => entry.status === 200 && entry.json);
  const backendMessages = backendOk ? extractConversationMessages(backendOk.json) : [];
  const backendAssistant = backendMessages.filter((message) => message.role === "assistant").at(-1) ?? null;

  const domMessages = extracted.dom?.messages ?? [];
  const domAssistant = [...domMessages].reverse().find((message) => /assistant/u.test(message.role)) ?? null;
  const markdown = extracted.dom?.markdowns?.at(-1) ?? null;
  const fallbackText = domAssistant?.text || markdown?.text || "";
  const transcript = readSavedTranscript(input);
  const transcriptLooksTiny = Boolean(transcript.exists && transcript.answerTrimmedLength > 0 && transcript.answerTrimmedLength <= 16);
  const status = backendAssistant?.text
    ? "verified_backend_json"
    : fallbackText.length > 8
      ? "verified_dom"
      : backendPayload.some((entry) => String(entry.text ?? "").includes("conversation_inaccessible"))
        ? "auth_or_conversation_inaccessible"
        : "unverified_no_assistant_text";
  const conclusion = status.startsWith("verified_")
    ? "Verified assistant output from a source outside the saved Oracle transcript."
    : transcriptLooksTiny
      ? "Saved transcript is tiny, but the conversation output could not be reverified; treat as UNVERIFIED_OUTPUT, not as proof that the model answered with one token."
      : "Conversation output could not be reverified from backend JSON or DOM.";

  return {
    status,
    conclusion,
    conversationUrl: input.conversationUrl,
    savedTranscript: transcript,
    backendStatuses: backendPayload.map((entry) => ({
      url: entry.url,
      status: entry.status,
      contentType: entry.contentType,
      textStart: String(entry.text ?? "").slice(0, 300),
    })),
    backendMessages,
    assistantText: backendAssistant?.text || fallbackText,
    dom: {
      href: extracted.dom?.href,
      title: extracted.dom?.title,
      bodyLength: extracted.dom?.bodyText?.length ?? 0,
      messageCount: domMessages.length,
      markdownCount: extracted.dom?.markdowns?.length ?? 0,
      bodyStart: String(extracted.dom?.bodyText ?? "").slice(0, 1000),
    },
  };
}

function readSavedTranscript(input) {
  if (!input.sessionDir) {
    return { exists: false, length: 0, textStart: "", answerTrimmedLength: 0, answerText: "" };
  }
  const transcriptPath = path.join(input.sessionDir, "artifacts", "transcript.md");
  if (!fs.existsSync(transcriptPath)) {
    return { exists: false, length: 0, textStart: "", answerTrimmedLength: 0, answerText: "", path: transcriptPath };
  }
  const text = fs.readFileSync(transcriptPath, "utf8");
  const answerMarker = "\n## Answer\n";
  const answerText = text.includes(answerMarker) ? text.slice(text.indexOf(answerMarker) + answerMarker.length).trim() : "";
  return {
    exists: true,
    path: transcriptPath,
    length: text.length,
    trimmedLength: text.trim().length,
    textStart: text.trim().slice(0, 300),
    answerTrimmedLength: answerText.length,
    answerText,
  };
}

function writeArtifacts(input, summary) {
  if (!input.sessionDir) return [];
  const artifactsDir = path.join(input.sessionDir, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const jsonPath = path.join(artifactsDir, `rechecked-output-${stamp}.json`);
  const mdPath = path.join(artifactsDir, `rechecked-output-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(mdPath, [
    "# Oracle Browser Output Recheck",
    "",
    `Status: ${summary.status}`,
    `Conclusion: ${summary.conclusion}`,
    `Conversation: ${summary.conversationUrl}`,
    `Saved transcript: ${summary.savedTranscript.exists ? `${summary.savedTranscript.answerTrimmedLength} answer chars at ${summary.savedTranscript.path}` : "missing"}`,
    "",
    "## Assistant Text",
    "",
    summary.assistantText || "(no assistant text extracted)",
    "",
    "## Backend Statuses",
    "",
    ...summary.backendStatuses.map((entry) => `- ${entry.status} ${entry.url}: ${entry.textStart}`),
    "",
  ].join("\n"), "utf8");
  return [jsonPath, mdPath];
}

const input = resolveInput(targetArg);
const conversationId = conversationIdFromUrl(input.conversationUrl);
if (!conversationId) {
  throw new Error(`Could not parse ChatGPT conversation id from ${input.conversationUrl}`);
}

const launchedPid = await ensureChrome(input);
const target = await openTarget(input);
const client = await connect(target.webSocketDebuggerUrl);
await navigateToConversation(client, input.conversationUrl, conversationId);
const extracted = await extractFromPage(client, conversationId);
client.close();
const summary = summarize(input, extracted);
const artifacts = writeArtifacts(input, summary);

console.log(JSON.stringify({
  ...summary,
  artifacts,
  launchedPid,
}, null, 2));

if (launchedPid && !keepBrowser) {
  try {
    process.kill(launchedPid);
  } catch {
    // Best-effort cleanup; Chrome may already have exited or detached children.
  }
}
