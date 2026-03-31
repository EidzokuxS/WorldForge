import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), "logs");

function ensureLogDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function timestamp(): string {
  const now = new Date();
  const offset = 3 * 60; // GMT+3 in minutes
  const local = new Date(now.getTime() + offset * 60_000);
  const iso = local.toISOString().replace("Z", "+03:00");
  return iso;
}

function formatMessage(level: string, tag: string, message: string, data?: unknown): string {
  const base = `[${timestamp()}] [${level}] [${tag}] ${message}`;
  if (data !== undefined) {
    const serialized =
      data instanceof Error
        ? `${data.message}\n${data.stack ?? ""}`
        : JSON.stringify(data, null, 2);
    return `${base}\n${serialized}\n`;
  }
  return `${base}\n`;
}

function writeLog(level: string, tag: string, message: string, data?: unknown): void {
  const line = formatMessage(level, tag, message, data);

  // Always console
  if (level === "ERROR") {
    console.error(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  // Also write to file
  try {
    ensureLogDir();
    const now = new Date();
    const today = new Date(now.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
    appendFileSync(join(LOG_DIR, `${today}.log`), line);
  } catch {
    // don't crash on log failure
  }
}

export function createLogger(tag: string) {
  return {
    info: (message: string, data?: unknown) => writeLog("INFO", tag, message, data),
    warn: (message: string, data?: unknown) => writeLog("WARN", tag, message, data),
    error: (message: string, data?: unknown) => writeLog("ERROR", tag, message, data),
  };
}
