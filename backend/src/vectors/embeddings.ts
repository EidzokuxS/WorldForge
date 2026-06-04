import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { createLogger, withRole } from "../lib/index.js";

const log = createLogger("embeddings");
const BATCH_SIZE = 50;

export async function embedTexts(
    texts: string[],
    provider: ResolvedRole["provider"]
): Promise<number[][]> {
    if (texts.length === 0) return [];

    if (!provider.model || provider.model.trim() === "") {
        throw new Error("Embedder model not configured");
    }

    return withRole("embedder", async () => {
        const callStart = Date.now();
        const openai = createOpenAI({
            baseURL: provider.baseUrl,
            apiKey: provider.apiKey,
        });

        const model = openai.textEmbeddingModel(provider.model);
        const allEmbeddings: number[][] = [];
        const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);
            try {
                const result = await embedMany({ model, values: batch });
                allEmbeddings.push(...result.embeddings);
            } catch (error) {
                const batchRange = `${i + 1}-${Math.min(i + BATCH_SIZE, texts.length)}`;
                const msg = error instanceof Error ? error.message : String(error);
                log.error(`Embedding batch ${batchRange}/${texts.length} failed: ${msg}`);
                log.event("embedder.call", {
                    batchCount: totalBatches,
                    totalTexts: texts.length,
                    model: provider.model,
                    success: false,
                    error: msg,
                    durationMs: Date.now() - callStart,
                });
                throw new Error(
                    `Embedding failed on batch ${batchRange} of ${texts.length} texts: ${msg}`
                );
            }
        }

        log.event("embedder.call", {
            batchCount: totalBatches,
            totalTexts: texts.length,
            model: provider.model,
            success: true,
            durationMs: Date.now() - callStart,
        });

        return allEmbeddings;
    });
}
