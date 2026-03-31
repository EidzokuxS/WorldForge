import path from "node:path";
import { CAMPAIGNS_DIR } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";

export const WORLDBOOK_LIBRARY_DIRNAME = "_worldbook-library";

export function assertSafeWorldbookLibraryId(id: string): void {
  if (!/^[a-f0-9]{64}$/.test(id)) {
    throw new AppError("Invalid worldbook library ID.", 400);
  }
}

export function getWorldbookLibraryDir(): string {
  return path.join(CAMPAIGNS_DIR, WORLDBOOK_LIBRARY_DIRNAME);
}

export function getWorldbookLibraryIndexPath(): string {
  return path.join(getWorldbookLibraryDir(), "index.json");
}

export function getWorldbookLibraryRecordsDir(): string {
  return path.join(getWorldbookLibraryDir(), "records");
}

export function getWorldbookLibraryRecordPath(id: string): string {
  assertSafeWorldbookLibraryId(id);
  return path.join(getWorldbookLibraryRecordsDir(), `${id}.json`);
}
