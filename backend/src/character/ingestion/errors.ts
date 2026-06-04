import type { IngestionStage } from "./types.js";

export class IngestionPipelineError extends Error {
  readonly stage: IngestionStage;
  readonly attempts: number;
  readonly cause: unknown;
  constructor(opts: {
    stage: IngestionStage;
    attempts: number;
    cause: unknown;
    message: string;
  }) {
    super(opts.message);
    this.name = "IngestionPipelineError";
    this.stage = opts.stage;
    this.attempts = opts.attempts;
    this.cause = opts.cause;
  }
}
