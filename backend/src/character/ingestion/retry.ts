import { IngestionPipelineError } from "./errors.js";
import type { IngestionStage } from "./types.js";
import { createLogger } from "../../lib/index.js";

const log = createLogger("ingestion-retry");

export async function withPipelineRetry<T>(
  stage: IngestionStage,
  fn: () => Promise<T>,
  opts: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log.warn(
        `ingestion stage "${stage}" attempt ${attempt}/${maxAttempts} failed`,
        err,
      );
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new IngestionPipelineError({
    stage,
    attempts: maxAttempts,
    cause: lastError,
    message: `Ingestion stage "${stage}" failed after ${maxAttempts} attempts: ${message}`,
  });
}
