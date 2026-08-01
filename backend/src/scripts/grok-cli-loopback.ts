import { createGrokCliRunner, GROK_CLI_MODEL_ID, startGrokCliLoopback } from "../ai/grok-cli-loopback.js";

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const executable = readOption("--grok-bin");
if (!executable) {
  throw new Error("--grok-bin is required; credentials remain owned by the Grok CLI");
}

const cwd = readOption("--cwd") ?? process.cwd();
const port = readOption("--port") === undefined ? 0 : Number(readOption("--port"));
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("--port must be an integer from 0 to 65535");
}

const requestTimeoutMs = positiveInteger(
  readOption("--request-timeout-ms"),
  "--request-timeout-ms",
  90_000,
);

const loopback = await startGrokCliLoopback({
  runner: createGrokCliRunner({ executable, cwd }),
  port,
  requestTimeoutMs,
});

await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify({
  status: "listening",
  host: "127.0.0.1",
  port: loopback.port,
  model: GROK_CLI_MODEL_ID,
  requestTimeoutMs,
})}\n`, (error) => error ? reject(error) : resolve());
});

const shutdown = async () => {
  await loopback.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
