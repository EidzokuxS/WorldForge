import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./index.js";
import { locationEdges, locations } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseLegacyConnectedTo(
  raw: string,
  locationId: string,
): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn(
        `[Phase 43] Ignoring non-array connected_to payload for location ${locationId}.`,
      );
      return [];
    }
    return [...new Set(parsed.filter((item): item is string => typeof item === "string"))];
  } catch (error) {
    console.warn(
      `[Phase 43] Ignoring malformed connected_to payload for location ${locationId}.`,
      error,
    );
    return [];
  }
}

function syncLocationCompatibilityBackfill() {
  const db = getDb();
  const locationRows = db
    .select({
      id: locations.id,
      campaignId: locations.campaignId,
      kind: locations.kind,
      persistence: locations.persistence,
      connectedTo: locations.connectedTo,
    })
    .from(locations)
    .all();

  if (locationRows.length === 0) {
    return;
  }

  const validLocationIds = new Set(locationRows.map((row) => row.id));
  const existingEdgeKeys = new Set(
    db
      .select({
        campaignId: locationEdges.campaignId,
        fromLocationId: locationEdges.fromLocationId,
        toLocationId: locationEdges.toLocationId,
      })
      .from(locationEdges)
      .all()
      .map(
        (row) => `${row.campaignId}:${row.fromLocationId}:${row.toLocationId}`,
      ),
  );

  db.transaction((tx) => {
    for (const row of locationRows) {
      tx.update(locations)
        .set({
          kind: row.kind ?? "macro",
          persistence: row.persistence ?? "persistent",
        })
        .where(eq(locations.id, row.id))
        .run();

      for (const targetId of parseLegacyConnectedTo(row.connectedTo, row.id)) {
        if (!validLocationIds.has(targetId)) {
          console.warn(
            `[Phase 43] Skipping legacy connected_to edge from ${row.id} to missing location ${targetId}.`,
          );
          continue;
        }

        const edgeKey = `${row.campaignId}:${row.id}:${targetId}`;
        if (existingEdgeKeys.has(edgeKey)) {
          continue;
        }

        tx.insert(locationEdges)
          .values({
            id: crypto.randomUUID(),
            campaignId: row.campaignId,
            fromLocationId: row.id,
            toLocationId: targetId,
            travelCost: 1,
            discovered: true,
          })
          .run();
        existingEdgeKeys.add(edgeKey);
      }
    }

    const normalizedEdges = tx
      .select({
        fromLocationId: locationEdges.fromLocationId,
        toLocationId: locationEdges.toLocationId,
      })
      .from(locationEdges)
      .all();
    const connectedToByLocation = new Map<string, string[]>();

    for (const edge of normalizedEdges) {
      const next = connectedToByLocation.get(edge.fromLocationId) ?? [];
      next.push(edge.toLocationId);
      connectedToByLocation.set(edge.fromLocationId, next);
    }

    for (const row of locationRows) {
      const connectedTo = [
        ...new Set(connectedToByLocation.get(row.id) ?? []),
      ];
      tx.update(locations)
        .set({ connectedTo: JSON.stringify(connectedTo) })
        .where(eq(locations.id, row.id))
        .run();
    }
  });
}

export function runMigrations() {
  migrate(getDb(), {
    migrationsFolder: path.resolve(__dirname, "../../drizzle"),
  });
  syncLocationCompatibilityBackfill();
}
