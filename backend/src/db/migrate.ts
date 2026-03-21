import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations() {
  migrate(getDb(), {
    migrationsFolder: path.resolve(__dirname, "../../drizzle"),
  });
}
