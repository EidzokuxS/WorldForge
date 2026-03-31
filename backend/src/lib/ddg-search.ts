/**
 * DuckDuckGo search via HTML lite endpoint.
 *
 * Uses html.duckduckgo.com/html/ — the accessibility/lite version of DDG.
 * Unlike duck-duck-scrape (broken by anomaly detection), this endpoint
 * is stable and doesn't require VQD tokens or session cookies.
 */

import { createLogger } from "./logger.js";

const log = createLogger("ddg-search");

/** Minimum ms between DDG requests */
const MIN_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestTime = 0;

export interface DdgSearchResult {
  title: string;
  description: string;
  url: string;
}

const RESULT_REGEX =
  /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search DuckDuckGo via the HTML lite endpoint.
 */
export async function ddgSearch(
  query: string,
  count = 10,
): Promise<DdgSearchResult[]> {
  // Throttle
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_DELAY_MS && lastRequestTime > 0) {
    const wait = MIN_DELAY_MS - elapsed;
    await sleep(wait);
  }

  lastRequestTime = Date.now();

  const params = new URLSearchParams({ q: query });
  const url = `https://html.duckduckgo.com/html/?${params.toString()}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!resp.ok) {
    throw new Error(`DDG returned ${resp.status}`);
  }

  const html = await resp.text();
  const results: DdgSearchResult[] = [];

  let match: RegExpExecArray | null;
  while ((match = RESULT_REGEX.exec(html)) !== null) {
    if (results.length >= count) break;

    const rawUrl = match[1];
    const title = stripHtml(match[2]);
    const description = stripHtml(match[3]);

    // Skip DDG internal links
    if (!rawUrl || rawUrl.includes("duckduckgo.com")) continue;

    // DDG wraps URLs in a redirect — extract actual URL
    let finalUrl = rawUrl;
    try {
      const parsed = new URL(rawUrl, "https://duckduckgo.com");
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) finalUrl = decodeURIComponent(uddg);
    } catch {
      // use as-is
    }

    results.push({ title, description, url: finalUrl });
  }

  log.info(`DDG: ${results.length} results for "${query}"`);
  return results;
}
