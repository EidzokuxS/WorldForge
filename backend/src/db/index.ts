import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle> | null = null;
let sqliteConnection: Database.Database | null = null;

export function connectDb(dbPath: string) {
  if (sqliteConnection) {
    sqliteConnection.close();
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqliteConnection = sqlite;
  db = drizzle(sqlite, { schema });
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return db;
}

export function getSqliteConnection(): Database.Database {
  if (!sqliteConnection) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return sqliteConnection;
}

export function closeDb() {
  if (sqliteConnection) {
    sqliteConnection.close();
    sqliteConnection = null;
  }
  db = null;
}
