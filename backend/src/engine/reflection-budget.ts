import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { npcs } from "../db/schema.js";

function normalizeParticipantName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function accumulateReflectionBudget(
  campaignId: string,
  participants: string[],
  importance: number,
): Promise<void> {
  if (!Number.isFinite(importance) || importance <= 0 || participants.length === 0) {
    return;
  }

  const participantNames = new Set(
    participants
      .filter((participant): participant is string => typeof participant === "string")
      .map(normalizeParticipantName)
      .filter((participant): participant is string => participant !== null),
  );

  if (participantNames.size === 0) {
    return;
  }

  const db = getDb();
  const campaignNpcs = db
    .select({
      id: npcs.id,
      name: npcs.name,
      unprocessedImportance: npcs.unprocessedImportance,
    })
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId))
    .all();

  for (const npc of campaignNpcs) {
    const normalizedName = normalizeParticipantName(npc.name);
    if (!normalizedName || !participantNames.has(normalizedName)) {
      continue;
    }

    db.update(npcs)
      .set({ unprocessedImportance: npc.unprocessedImportance + importance })
      .where(eq(npcs.id, npc.id))
      .run();
  }
}
