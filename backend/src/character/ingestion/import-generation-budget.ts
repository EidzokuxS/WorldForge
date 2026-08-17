import { createLogger } from "../../lib/index.js";

const log = createLogger("ingestion-generation-budget");
export const IMPORT_GENERATION_OPERATION_BUDGET_MS = 90_000;

type ImportedGenerationStage = "synthesize" | "power_assess";

/**
 * Keep imported generation bounded even when the provider's body consumer
 * ignores AbortSignal. The operation is started once, and its settlement is
 * always observed so a late promise cannot become an unhandled rejection or
 * alter the caller after the timer wins.
 */
export function withImportedGenerationBudget<T>(
  stage: ImportedGenerationStage,
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearBudgetTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const settle = (settlement: () => void) => {
      if (settled) return;
      settled = true;
      clearBudgetTimer();
      settlement();
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearBudgetTimer();
      controller.abort();
      log.warn("imported generation operation budget expired", {
        stage,
        budgetMs: IMPORT_GENERATION_OPERATION_BUDGET_MS,
      });
      reject(new Error(`Imported generation stage "${stage}" exceeded its operation budget`));
    }, IMPORT_GENERATION_OPERATION_BUDGET_MS);

    let operationPromise: Promise<T>;
    try {
      operationPromise = Promise.resolve(operation(controller.signal));
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    operationPromise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}
