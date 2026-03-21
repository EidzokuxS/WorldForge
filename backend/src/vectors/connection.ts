import * as lancedb from "@lancedb/lancedb";
import { getCampaignDir } from "../campaign/index.js";
import path from "node:path";

let connection: lancedb.Connection | null = null;

export async function openVectorDb(campaignId: string): Promise<lancedb.Connection> {
  if (connection) {
    closeVectorDb();
  }

  const vectorsDir = path.join(getCampaignDir(campaignId), "vectors");
  connection = await lancedb.connect(vectorsDir);
  return connection;
}

/** LanceDB connections are file-based and stateless — no close() method exists. Null-assignment releases the reference. */
export function closeVectorDb(): void {
  connection = null;
}

export function getVectorDb(): lancedb.Connection {
  if (!connection) {
    throw new Error("Vector database is not connected. Load a campaign first.");
  }
  return connection;
}
