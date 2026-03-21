import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ResolvedRole } from "../ai/resolve-role-model.js";

const BATCH_SIZE = 50;

export async function embedTexts(
    texts: string[],
    provider: ResolvedRole["provider"]
): Promise<number[][]> {
    if (texts.length === 0) return [];

    if (!provider.model || provider.model.trim() === "") {
        throw new Error("Embedder model not configured");
    }

    const openai = createOpenAI({
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
    });

    const model = openai.textEmbeddingModel(provider.model);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const result = await embedMany({ model, values: batch });
        allEmbeddings.push(...result.embeddings);
    }

    return allEmbeddings;
}
