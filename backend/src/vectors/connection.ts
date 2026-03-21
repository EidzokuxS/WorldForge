import * as lancedb from "@lancedb/lancedb";
import { getCampaignDir } from "../campaign/paths.js";
import path from "node:path";

let connection: lancedb.Connection | null = null;

export async function openVectorDb(campaignId: string): Promise<lancedb.Connection> {
    if (connection) {
        await closeVectorDb();
    }

    const vectorsDir = path.join(getCampaignDir(campaignId), "vectors");
    connection = await lancedb.connect(vectorsDir);
    return connection;
}

export async function closeVectorDb(): Promise<void> {
    if (connection) {
        connection = null;
    }
}

export function getVectorDb(): lancedb.Connection {
    if (!connection) {
        throw new Error("Vector database is not connected. Load a campaign first.");
    }
    return connection;
}
