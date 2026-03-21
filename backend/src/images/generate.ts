import type { Provider, Settings } from "@worldforge/shared";
import { NONE_PROVIDER_ID } from "@worldforge/shared";
import { AppError } from "../lib/index.js";

export interface GenerateImageOptions {
  prompt: string;
  provider: Provider;
  model: string;
  size?: string;
}

interface ImageResponseData {
  b64_json?: string;
  url?: string;
}

interface ImageApiResponse {
  data?: ImageResponseData[];
  error?: { message?: string };
}

/**
 * Provider-agnostic image generation via OpenAI-compatible /v1/images/generations endpoint.
 * Works with OpenAI, OpenRouter, fal, GLM, or any compatible API.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<Buffer> {
  const { prompt, provider, model, size = "1024x1024" } = opts;

  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/images/generations`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    let message = `Image generation failed with status ${response.status}`;
    try {
      const body = (await response.json()) as ImageApiResponse;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new AppError(message, response.status as 400 | 500);
  }

  const body = (await response.json()) as ImageApiResponse;
  const b64 = body.data?.[0]?.b64_json;

  if (!b64) {
    throw new AppError("Image API returned no image data", 502);
  }

  return Buffer.from(b64, "base64");
}

/**
 * Check if image generation is enabled and configured.
 */
export function isImageGenerationEnabled(settings: Settings): boolean {
  return settings.images.enabled && settings.images.providerId !== NONE_PROVIDER_ID;
}

/**
 * Resolve image provider and model from settings.
 * Returns null if image generation is disabled or provider not found.
 */
export function resolveImageProvider(
  settings: Settings
): { provider: Provider; model: string } | null {
  if (!isImageGenerationEnabled(settings)) {
    return null;
  }

  const provider = settings.providers.find(
    (p) => p.id === settings.images.providerId
  );

  if (!provider) {
    return null;
  }

  return {
    provider,
    model: settings.images.model || provider.defaultModel,
  };
}
