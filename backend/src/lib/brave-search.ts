/**
 * Brave Search API client.
 *
 * Requires BRAVE_SEARCH_API_KEY environment variable or settings config.
 * Free tier: ~1000 queries/month with $5 credits.
 * Docs: https://api.search.brave.com/app/documentation/web-search
 */

import { createLogger } from "./logger.js";

const log = createLogger("brave-search");

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

export interface BraveSearchResult {
  title: string;
  description: string;
  url: string;
}

/**
 * Search via Brave Search API.
 * @param query Search query
 * @param apiKey Brave API key (from settings or env)
 * @param count Max results (default 10, max 20)
 */
export async function braveSearch(
  query: string,
  apiKey: string,
  count = 10,
): Promise<BraveSearchResult[]> {
  if (!apiKey) {
    throw new Error("Brave Search API key is not configured");
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
  });

  const resp = await fetch(`${BRAVE_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Brave Search returned ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    web?: { results?: Array<{ title: string; description: string; url: string }> };
  };

  const results = (data.web?.results ?? []).slice(0, count).map((r) => ({
    title: r.title,
    description: r.description,
    url: r.url,
  }));

  log.info(`Brave: ${results.length} results for "${query}"`);
  return results;
}
