import { Hono } from "hono";
import type {
  WorldgenResearchArtifactV2,
} from "@worldforge/shared";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import {
  listWorldgenOperations,
  beginWorldgenOperation,
  rollSeed,
  rollWorldSeeds,
  suggestSingleSeed,
  suggestWorldSeeds,
} from "../worldgen/index.js";
import { parseBody, resolveGenerator } from "./helpers.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("worldgen-route");
import {
  rollSeedSchema,
  suggestSeedSchema,
  suggestSeedsSchema,
  parseWorldBookSchema,
} from "./schemas.js";
import {
  parseWorldBook,
  classifyEntries,
} from "../worldgen/worldbook-importer.js";
import {
  composeSelectedWorldbooks,
  listWorldbookLibrary,
  importWorldbookToLibrary,
} from "../worldbook-library/index.js";
import { worldbookLibraryImportSchema } from "./schemas.js";
import { researchWorldgenArtifact } from "../worldgen/ip-researcher.js";

const app = new Hono();

app.get("/debug/progress", (c) => {
  return c.json(listWorldgenOperations());
});

app.post("/roll-seeds", async (c) => {
  try {
    return c.json(rollWorldSeeds());
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to roll world seeds.") },
      getErrorStatus(error)
    );
  }
});

app.post("/roll-seed", async (c) => {
  try {
    const result = await parseBody(c, rollSeedSchema);
    if ("response" in result) return result.response;

    const { category } = result.data;
    return c.json({ category, value: rollSeed(category) });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to roll seed.") },
      getErrorStatus(error)
    );
  }
});

app.post("/suggest-seeds", async (c) => {
  let debugOperation:
    | ReturnType<typeof beginWorldgenOperation>
    | null = null;
  try {
    const result = await parseBody(c, suggestSeedsSchema);
    if ("response" in result) return result.response;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    debugOperation = beginWorldgenOperation({
      kind: "suggest-seeds",
      label: "Preparing World DNA suggestions...",
      franchise: result.data.franchise?.trim() || undefined,
      premise: result.data.premise,
    });
    debugOperation.startHeartbeat(10000);

    // Reusable Library selections compose the source context before DNA generation.
    // Automatic source research produces the saved research artifact.
    let ipContext = null;
    let researchArtifact: WorldgenResearchArtifactV2 | null = null;
    if (result.data.selectedWorldbooks?.length) {
      debugOperation.setLabel("Composing selected worldbooks...");
      const composed = await composeSelectedWorldbooks(result.data.selectedWorldbooks, result.data.premise);
      ipContext = composed.ipContext;
      log.info("suggest-seeds: composed worldbooks", {
        hasSourceGroups: !!ipContext.sourceGroups,
        sourceGroupCount: ipContext.sourceGroups?.length ?? 0,
        totalKeyFacts: ipContext.keyFacts.length,
      });
    } else if (result.data.research !== false) {
      const franchiseName = result.data.franchise?.trim();
      if (franchiseName) {
        debugOperation.setLabel(`Researching source artifact for ${franchiseName}...`);
      } else {
        debugOperation.setLabel("Interpreting source artifact from premise...");
      }
      researchArtifact = await researchWorldgenArtifact(
        { premise: result.data.premise, name: result.data.name ?? "", knownIP: franchiseName, research: settings.research },
        gen.resolved,
        settings.research.maxSearchSteps,
      );
    }

    const explicitPremise = result.data.premise?.trim() ?? "";
    const premise = explicitPremise ||
      researchArtifact?.rawPremise.trim() ||
      (ipContext ? `A world based on the ${ipContext.franchise} setting` : "");
    if (!premise) {
      return c.json(
        { error: "Premise is required when no world knowledge context is available." },
        400,
      );
    }
    debugOperation.setLabel("Generating World DNA suggestions...");
    const { seeds, premiseDivergence } = await suggestWorldSeeds({
      premise,
      role: gen.resolved,
      ipContext,
      researchArtifact,
    });

    debugOperation.finish("completed");

    return c.json({
      ...seeds,
      _ipContext: ipContext,
      _researchArtifact: researchArtifact,
      _premiseDivergence: premiseDivergence,
    });
  } catch (error) {
    debugOperation?.finish("failed", error);
    return c.json(
      { error: getErrorMessage(error, "Failed to generate seed suggestions.") },
      getErrorStatus(error)
    );
  }
});

app.post("/suggest-seed", async (c) => {
  try {
    const result = await parseBody(c, suggestSeedSchema);
    if ("response" in result) return result.response;

    const { premise, category } = result.data;
    const gen = resolveGenerator(loadSettings());
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const researchArtifact = result.data.researchArtifact ?? null;
    const value = await suggestSingleSeed({
      premise,
      category,
      role: gen.resolved,
      ipContext: researchArtifact ? undefined : result.data.ipContext ?? undefined,
      premiseDivergence: researchArtifact
        ? undefined
        : result.data.premiseDivergence ?? undefined,
      researchArtifact: researchArtifact ?? undefined,
    });
    return c.json({ category, value });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to suggest seed.") },
      getErrorStatus(error)
    );
  }
});

// ───── WorldBook Import ─────

app.get("/worldbook-library", (c) => {
  try {
    return c.json({ items: listWorldbookLibrary() });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to list reusable worldbooks.") },
      getErrorStatus(error),
    );
  }
});

app.post("/worldbook-library/import", async (c) => {
  try {
    const result = await parseBody(c, worldbookLibraryImportSchema);
    if ("response" in result) return result.response;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const parsedEntries = parseWorldBook(result.data.worldbook);
    const imported = await importWorldbookToLibrary({
      displayName: result.data.displayName,
      originalFileName: result.data.originalFileName,
      parsedEntries,
      classify: () => classifyEntries(parsedEntries, gen.resolved),
    });

    return c.json(imported);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to import reusable worldbook.") },
      getErrorStatus(error),
    );
  }
});

app.post("/parse-worldbook", async (c) => {
  try {
    const result = await parseBody(c, parseWorldBookSchema);
    if ("response" in result) return result.response;

    const { worldbook } = result.data;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const parsed = parseWorldBook(worldbook);
    const classified = await classifyEntries(parsed, gen.resolved);

    return c.json({ entries: classified });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to parse WorldBook.") },
      getErrorStatus(error),
    );
  }
});

export default app;
