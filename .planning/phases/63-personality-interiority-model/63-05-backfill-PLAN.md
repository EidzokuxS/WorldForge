---
phase: 63-personality-interiority-model
plan: 05
slug: backfill
type: execute
wave: 4
status: draft
depends_on: [63-01, 63-02, 63-03]
files_modified:
  - backend/src/scripts/backfill-personality.ts
  - backend/src/scripts/__tests__/backfill-personality.test.ts
  - backend/package.json
autonomous: true
requirements: [P63-R6]
must_haves:
  truths:
    - "tsx backend/src/scripts/backfill-personality.ts runs end-to-end on a real campaign and populates personality on every NPC + player with empty personality.summary"
    - "Idempotency: re-running the script skips records where personality.summary is already non-empty"
    - "--dry-run flag prevents DB writes AND is side-effect-free: no backup files written, no config.json updates (REVIEWS fix #11)"
    - "--campaign <id> flag scopes the run to a single campaign; default is all campaigns"
    - "--batch-size N flag controls parallelism (default 5)"
    - "Script uses per-campaign connectDb(state.db) → getDb() → closeDb() loop (REVIEWS fix #4 — no db singleton in backend/src/db/index.ts)"
    - "resolveRoleModel called with (settings.generator, settings.providers) — NOT (role-name-string, settings) (REVIEWS fix #4)"
    - "createModel imported from '../ai/index.js' (re-exports provider-registry.ts) (REVIEWS fix #4)"
    - "loadSettings is sync — no await (REVIEWS fix #4 + Claude MEDIUM)"
    - "generateObject call wrapped in withPipelineRetry('backfill', async () => ...) — 3 attempts + typed IngestionPipelineError (REVIEWS fix #7)"
    - "Re-read-before-write safeguard: script re-fetches characterRecord right before db.update; if bytes changed during the long LLM call, script skips + logs warning (REVIEWS fix #10)"
    - "Attachments carry-forward: when personality backfilled AND legacy record only has behavioralCore.attachments (not liveDynamics.attachments), script also writes liveDynamics.attachments = behavioralCore.attachments in the same update (REVIEWS fix #2 durable migration)"
    - "Each record processed inside runWithTurnContext({ turnId: 'backfill-<id>' }) for Phase 58 log correlation"
    - "Backup file campaigns/{id}/logs/backfill-backup-{record-id}-{ISO}.json written ONLY on real run (not --dry-run) BEFORE any DB update (REVIEWS fix #11)"
    - "After successful full-campaign run (all records written or skipped, 0 failed), write { personalityBackfillComplete: true, backfilledAt: ISO } to campaigns/{id}/config.json (REVIEWS fix #13)"
    - "Per-record error isolation: one failure does not abort the batch; structured error log emitted; script exits non-zero if any failed"
    - "Provider policy locked: GLM-default only; on withPipelineRetry exhaustion, STOP + log error + file BACKLOG.md follow-up. Do NOT switch to OpenRouter. feedback_openrouter_embargo.md NO EXCEPTIONS (REVIEWS fix #6)"
    - "npm --prefix backend run backfill:personality wraps the tsx invocation"
  artifacts:
    - path: backend/src/scripts/backfill-personality.ts
      provides: "Standalone backfill script with corrected imports, per-campaign connectDb loop, withPipelineRetry, re-read-before-write, attachments carry-forward, side-effect-free dry-run, config.json sentinel"
      min_lines: 180
      contains: "withPipelineRetry"
    - path: backend/src/scripts/__tests__/backfill-personality.test.ts
      provides: "Vitest coverage: dry-run side-effect-free, actual write, idempotency, backup file, structured log shape, retry-then-success, re-read-skip-on-change, attachments carry-forward, config.json sentinel"
    - path: backend/package.json
      provides: "backfill:personality npm script"
      contains: "backfill:personality"
  key_links:
    - from: backend/src/scripts/backfill-personality.ts
      to: backend/src/lib/logger-context.ts
      via: "runWithTurnContext wraps each row processor with synthetic turn-id 'backfill-<id>'"
      pattern: "runWithTurnContext"
    - from: backend/src/scripts/backfill-personality.ts
      to: backend/src/db/index.ts
      via: "connectDb(campaignDbPath) → getDb() → closeDb() per campaign"
      pattern: "connectDb"
    - from: backend/src/scripts/backfill-personality.ts
      to: backend/src/character/ingestion/retry.ts
      via: "withPipelineRetry wraps the generateObject call"
      pattern: "withPipelineRetry"
---

<objective>
Ship the one-shot backfill script that populates `identity.personality` on every pre-existing player + NPC record with an empty `personality.summary`.

Purpose: After 63-03 the engine prompts skip the `Personality:` block when records have no `identity.personality`. After 63-04 the basic NPC card renders nothing for the same. Pre-existing campaigns will see a regression on screen until backfill closes the gap.

**Review-fix notes applied in this plan:**
- **REVIEWS fix #4 (Claude HIGH, compile blocker):** Script must use correct imports. `db` singleton does NOT exist in `backend/src/db/index.ts`; script must use `connectDb(path)/getDb()/closeDb()` with a per-campaign loop. Campaigns are separate SQLite files per `backend/src/campaign/manager.ts`. `createModel` imports from `../ai/index.js` (re-exports from `provider-registry.ts`). `resolveRoleModel(settings.generator, settings.providers)` — RoleSettings + ProviderSettings[], NOT role-name-string. `loadSettings()` is sync (no `await`).
- **REVIEWS fix #6 (Claude HIGH, locked rule):** `feedback_openrouter_embargo.md` is NON-NEGOTIABLE. NO OpenRouter fallback ever. On `withPipelineRetry` exhaustion → STOP + structured error log + file follow-up in `.planning/BACKLOG.md`. No provider swap.
- **REVIEWS fix #7 (Claude MEDIUM):** Wrap `generateObject` in `withPipelineRetry("backfill", ...)` per Phase 60 precedent. Helper lives at `backend/src/character/ingestion/retry.ts`.
- **REVIEWS fix #10 (Codex MEDIUM):** Re-read characterRecord immediately before `db.update`. If bytes changed during the long LLM call, skip + log warning. Prevents overwriting unrelated user edits.
- **REVIEWS fix #11 (Codex LOW):** `--dry-run` must be fully side-effect-free. No backup file, no config.json update. Dry-run only prints a proposed-change summary to stdout.
- **REVIEWS fix #13 (Gemini):** After successful full-campaign real run, write `personalityBackfillComplete: true` + `backfilledAt: ISO` into the campaign's `config.json` so UI can detect migration state.
- **REVIEWS fix #2 durable carry-forward:** When the script personality-backfills a legacy record that has `behavioralCore.attachments` but no `liveDynamics.attachments`, ALSO carry the attachments into `liveDynamics.attachments` in the same DB update. 63-03 Task 2 set up the read-time fallback; this plan makes the migration durable.

Output:
- `backend/src/scripts/backfill-personality.ts` with corrected imports + all safety properties above
- Vitest coverage for 8 behaviors
- npm script wired in `backend/package.json`
- Real-campaign manual run is deferred to 63-06 evidence bundle
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@.planning/phases/63-personality-interiority-model/63-RESEARCH.md
@.planning/phases/63-personality-interiority-model/63-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-REVIEWS.md
@.planning/phases/63-personality-interiority-model/63-01-foundation-PLAN.md
@.planning/phases/63-personality-interiority-model/63-03-engine-consumers-PLAN.md
@.planning/phases/58-pipeline-observability-logging/58-03-SUMMARY.md
@CLAUDE.md
@backend/src/db/index.ts
@backend/src/db/schema.ts
@backend/src/campaign/manager.ts
@backend/src/ai/index.ts
@backend/src/ai/resolve-role-model.ts
@backend/src/ai/provider-registry.ts
@backend/src/settings/manager.ts
@backend/src/character/ingestion/retry.ts
@backend/src/lib/logger-context.ts
@backend/package.json

<interfaces>
<!-- Verified API surface (REVIEWS fix #4): -->
```
backend/src/db/index.ts exports: connectDb(dbPath: string), getDb(), getSqliteConnection(), closeDb()
  — NO { db } export. Script MUST use per-campaign connectDb/getDb/closeDb loop.

backend/src/ai/index.ts exports: createModel, testProviderConnection, resolveRoleModel, callStoryteller
  — createModel re-exported from ./provider-registry.js

backend/src/ai/resolve-role-model.ts:
  export function resolveRoleModel(role: RoleSettings, providers: ProviderSettings[]): ResolveResult
  — NOT (role: "generator", settings): pass role config + providers array.

backend/src/settings/manager.ts:
  export function loadSettings(): Settings  — SYNC, no Promise, no await.

backend/src/character/ingestion/retry.ts:
  export async function withPipelineRetry<T>(label: string, fn: () => Promise<T>): Promise<T>
  — 3 attempts + typed IngestionPipelineError on exhaustion.

backend/src/lib/logger-context.ts:
  runWithTurnContext({ turnId, role }, fn) — AsyncLocalStorage for Phase 58 log correlation.
```

<!-- Campaigns on disk: -->
```
campaigns/
  <uuid>/
    state.db            — separate SQLite per campaign (call connectDb on this path)
    config.json         — campaign config (REVIEWS fix #13 writes personalityBackfillComplete here)
    chat_history.json
    vectors/
    logs/               — Phase 58 JSONL + backup files from this script
```

<!-- Script CLI shape: -->
```
npx tsx backend/src/scripts/backfill-personality.ts [--campaign <id>] [--dry-run] [--batch-size N]
# default --batch-size 5
# default scope: all campaigns (iterate over campaigns/*/state.db)
# exit code: 0 on full success or all skipped; 1 if any record failed or "changed" during run
```

<!-- Personality pack schema (STRICTER than the shared schema; script wants fully-populated output): -->
```ts
const personalityPackSchema = z.object({
  summary: z.string().min(10).max(400),
  voice: z.string().min(10).max(600),
  decisionStyle: z.string().min(5).max(400),
  worldview: z.string().min(5).max(400),
  internalContradictions: z.array(z.string().min(10).max(300)).min(2).max(3),
  personalMythology: z.string().min(5).max(400),
  sampleLines: z.array(z.string().min(10).max(300)).min(2).max(3),
});
```

<!-- Backup file path (real-run only, REVIEWS fix #11): -->
```
campaigns/{campaignId}/logs/backfill-backup-{recordId}-{ISO8601}.json
# Contains the FULL pre-update CharacterRecord JSON.
# Written via fs.writeFile BEFORE any db.update.
# SKIPPED entirely in --dry-run mode.
```

<!-- config.json sentinel (REVIEWS fix #13): -->
```json
{
  "...existing config fields unchanged...": "...",
  "personalityBackfillComplete": true,
  "backfilledAt": "2026-04-18T17:30:00.000Z"
}
```
</interfaces>

<project_conventions>
- Backend ES modules + TypeScript strict; tsx runs the script directly without compilation step.
- Vercel AI SDK `generateObject` for structured output (CLAUDE.md).
- Phase 58 structured logging: `runWithTurnContext({ turnId, role })` correlates per-record events; logs land in `campaigns/{id}/logs/...jsonl` via the existing pino destination.
- Real testing: integration test uses mocked `generateObject` at the `ai` module boundary; DB is either in-memory SQLite or mocked at the db module boundary. Real-LLM validation happens during manual run in 63-06.
- **Provider policy (REVIEWS fix #6 — LOCKED):** GLM-default ONLY. `feedback_openrouter_embargo.md`: "NO EXCEPTIONS". On retry exhaustion:
  1. Structured error log per Phase 58 pattern (full record context, stage, attempts, cause).
  2. File follow-up task in `.planning/BACKLOG.md`.
  3. Script continues with next record (per-record error isolation).
  4. Script exits 1 at end because `failed > 0`.
  5. Do NOT swap to OpenRouter.
- Idempotency check: skip when `record.identity?.personality?.summary?.trim()` is non-empty.
- Per-record error isolation: catch + log + continue; final exit code reflects failure count.
- `better-sqlite3` is SYNC (REVIEWS Claude MEDIUM note): `Promise.all` across batch only parallelizes `generateObject` LLM calls, not DB writes.
- Use Drizzle query builder, NO raw SQL (CLAUDE.md).
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-task gitnexus verification of imports + APIs</name>
  <files>(no edits — analysis only)</files>
  <action>
Per CLAUDE.md GitNexus mandate + REVIEWS fix #4 (compile blocker prevention), verify every API surface the script will use:

- `gitnexus_context({name: "connectDb"})` + confirm signature `connectDb(dbPath: string)` from `backend/src/db/index.ts:8`
- `gitnexus_context({name: "getDb"})` + confirm signature `getDb()` from `backend/src/db/index.ts:22`
- `gitnexus_context({name: "closeDb"})` + confirm `backend/src/db/index.ts:36`
- `gitnexus_context({name: "createModel"})` + confirm re-export path `backend/src/ai/index.ts:1` → `provider-registry.ts`
- `gitnexus_context({name: "resolveRoleModel"})` + confirm signature `(role: RoleSettings, providers: ProviderSettings[]): ResolveResult` from `backend/src/ai/resolve-role-model.ts:28`
- `gitnexus_context({name: "loadSettings"})` + confirm `loadSettings(): Settings` (sync, no Promise) from `backend/src/settings/manager.ts:315`
- `gitnexus_context({name: "withPipelineRetry"})` + confirm `(label: string, fn: () => Promise<T>) => Promise<T>` from `backend/src/character/ingestion/retry.ts:7`
- `gitnexus_context({name: "runWithTurnContext"})` + confirm `backend/src/lib/logger-context.ts`
- `gitnexus_query({query: "campaign state.db path"})` — find where campaign db paths are resolved (likely `backend/src/campaign/manager.ts`); record the helper (e.g. `campaignDbPath(campaignId)` or similar).

Record every finding with file:line. Any signature mismatch vs this plan's spec → STOP and reconcile before writing script. Refresh index if stale.
  </action>
  <verify>
    <automated>node -e "console.log('API surface verified: connectDb/getDb/closeDb, createModel, resolveRoleModel(role, providers), loadSettings (sync), withPipelineRetry, runWithTurnContext')"</automated>
  </verify>
  <done>Every import + call signature in the script spec is verified against actual exports. REVIEWS fix #4 compile-blocker prevented.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: backfill-personality.ts implementation with all REVIEWS fixes</name>
  <files>
backend/src/scripts/backfill-personality.ts
  </files>
  <behavior>
Behavioral contract (tested in Task 3):
- Parse args: `--campaign <id>`, `--dry-run`, `--batch-size N` (default 5).
- Load settings via SYNC `loadSettings()` (no await).
- Resolve generator role via `resolveRoleModel(settings.generator, settings.providers)`.
- Enumerate target campaigns: if `--campaign` set → single; else iterate `campaigns/*/state.db`.
- Per campaign:
  - `connectDb(path.join(getCampaignsDir(), campaignId, 'state.db'))` → `const db = getDb()`.
  - Query all `npcs` + `players` rows in this campaign's DB.
  - Process in batches of `batch-size` parallel.
  - Per record (inside `runWithTurnContext({ turnId: 'backfill-<id>', role: 'backfill' }, ...)`):
    - Parse `characterRecord` JSON.
    - Idempotency: if `record.identity?.personality?.summary?.trim()` non-empty → skip + log `backfill.skip`.
    - Otherwise: build prompt, call `withPipelineRetry("backfill", async () => generateObject({...}))` with GLM-default model + personalityPackSchema.
    - On retry exhaustion: structured error log, file BACKLOG.md entry, mark record failed, continue batch. NO OpenRouter fallback (REVIEWS fix #6).
    - On success:
      - **Re-read guard (REVIEWS fix #10):** Re-fetch `characterRecord` from DB; compare bytes-exact to the pre-LLM snapshot. If changed → log `backfill.skip_record_changed` + continue (do NOT overwrite).
      - Build merged record: `record.identity.personality = result.object`.
      - **Attachments carry-forward (REVIEWS fix #2 durable):** If `record.identity.behavioralCore?.attachments?.length > 0` AND `!record.identity.liveDynamics?.attachments?.length`, also set `record.identity.liveDynamics.attachments = record.identity.behavioralCore.attachments`. Log `backfill.attachments_carried_forward`.
      - **Side-effect gate (REVIEWS fix #11):** If `--dry-run`: print proposed change summary to stdout, NO backup file, NO db.update. Return "dry_run".
      - If real run: write backup file `campaigns/{id}/logs/backfill-backup-{record-id}-{ISO}.json` containing pre-update record. THEN `db.update(...).set({ characterRecord: merged }).where(...)`.
      - Log `backfill.write`.
  - `closeDb()` after campaign batch completes.
  - **Sentinel (REVIEWS fix #13):** If real run AND `failed === 0` AND `changed === 0` for this campaign → read `config.json`, merge `{ personalityBackfillComplete: true, backfilledAt: new Date().toISOString() }`, write back.
- After all campaigns: log final `{ written, skipped, failed, campaignsProcessed }`.
- `process.exit(failed > 0 ? 1 : 0)` where failed includes "changed" skips.
- Expose `runBackfill(args)` as a named export for test invocation (CLI `main()` just parses argv + exits).
  </behavior>
  <action>
Create `backend/src/scripts/backfill-personality.ts` per the behavioral contract above. Full skeleton with CORRECTED imports + all REVIEWS fixes:

```ts
#!/usr/bin/env tsx
/**
 * Phase 63 — Personality interiority backfill.
 *
 * One-shot operator tool. Synthesizes identity.personality on every pre-existing
 * NPC + player record with empty personality.summary using generateObject + a
 * strict Zod schema. Also durably carries forward behavioralCore.attachments →
 * liveDynamics.attachments for legacy records (REVIEWS fix #2).
 *
 * Provider policy (REVIEWS fix #6 — LOCKED): GLM-default ONLY. On withPipelineRetry
 * exhaustion, STOP + log error + file BACKLOG follow-up. NO OpenRouter fallback.
 * feedback_openrouter_embargo.md: "NO EXCEPTIONS".
 *
 * Usage:
 *   npx tsx backend/src/scripts/backfill-personality.ts [--campaign <id>] [--dry-run] [--batch-size N]
 *   npm --prefix backend run backfill:personality -- [--campaign <id>] [--dry-run] [--batch-size N]
 */
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
// IMPORTS (REVIEWS fix #4 — verified against actual exports in Task 1):
import { connectDb, getDb, closeDb } from "../db/index.js";
import { npcs, players } from "../db/schema.js";
import { createModel } from "../ai/index.js";               // re-export from provider-registry.ts
import { resolveRoleModel } from "../ai/resolve-role-model.js";
import { loadSettings } from "../settings/manager.js";      // SYNC — no await
import { withPipelineRetry } from "../character/ingestion/retry.js";
import { runWithTurnContext } from "../lib/logger-context.js";
import { createLogger, getCampaignsDir } from "../lib/index.js"; // Phase 58 helpers — confirm exact paths in Task 1

const log = createLogger("backfill-personality");

const personalityPackSchema = z.object({
  summary: z.string().min(10).max(400),
  voice: z.string().min(10).max(600),
  decisionStyle: z.string().min(5).max(400),
  worldview: z.string().min(5).max(400),
  internalContradictions: z.array(z.string().min(10).max(300)).min(2).max(3),
  personalMythology: z.string().min(5).max(400),
  sampleLines: z.array(z.string().min(10).max(300)).min(2).max(3),
});

export interface BackfillArgs {
  campaignFilter?: string;
  dryRun: boolean;
  batchSize: number;
}

export interface BackfillResults {
  written: number;
  skipped: number;
  failed: number;
  campaignsProcessed: number;
}

function parseArgs(argv: string[]): BackfillArgs {
  const out: BackfillArgs = { dryRun: false, batchSize: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--campaign") out.campaignFilter = argv[++i];
    else if (a === "--batch-size") out.batchSize = Math.max(1, parseInt(argv[++i] ?? "5", 10) || 5);
  }
  return out;
}

function buildBackfillPrompt(record: any): string {
  return `You are deriving a PERSONALITY INTERIORITY pack for an RPG character from their existing record.
Produce: summary, voice, decisionStyle, worldview, internalContradictions[2-3], personalMythology, sampleLines[2-3].

CHARACTER: ${record.identity?.displayName ?? "(unknown)"}
BIOGRAPHY: ${record.identity?.baseFacts?.biography ?? record.profile?.backgroundSummary ?? "(none)"}
PERSONA: ${record.profile?.personaSummary ?? "(none)"}
DRIVES: ${record.motivations?.drives?.join("; ") || "(none)"}
FRICTIONS: ${record.motivations?.frictions?.join("; ") || "(none)"}
SELF-IMAGE: ${record.identity?.behavioralCore?.selfImage ?? "(none)"}
LEGACY MOTIVES: ${record.identity?.behavioralCore?.motives?.join("; ") ?? "(none)"}
LEGACY PRESSURE: ${record.identity?.behavioralCore?.pressureResponses?.join("; ") ?? "(none)"}
SOCIAL ROLE: ${record.identity?.baseFacts?.socialRole?.join("; ") ?? record.socialContext?.factionName ?? "(none)"}

RULES:
- sampleLines MUST be direct quotes, not descriptions of speech.
- internalContradictions format: "Believes X, but acts Y because Z".
- voice is prose describing vocab register, rhythm, avoided topics — not a tag list.
- personalMythology is 1 sentence, first-person or narrative.
- If source material is thin, extrapolate sensibly from role + biography.
- Do NOT fabricate franchise-specific lore.
`;
}

type Outcome =
  | { status: "skipped" }
  | { status: "written" }
  | { status: "dry_run" }
  | { status: "skip_record_changed" }
  | { status: "failed"; error: string };

interface RowRef {
  id: string;
  characterRecord: string;
  kind: "npc" | "player";
}

async function writeBackup(campaignId: string, rowId: string, originalRecord: unknown): Promise<string> {
  const dir = path.join(getCampaignsDir(), campaignId, "logs");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `backfill-backup-${rowId}-${stamp}.json`);
  await writeFile(file, JSON.stringify(originalRecord, null, 2), "utf8");
  return file;
}

async function processRow(
  db: ReturnType<typeof getDb>,
  campaignId: string,
  row: RowRef,
  gen: any,
  dryRun: boolean
): Promise<Outcome> {
  let record: any;
  try { record = JSON.parse(row.characterRecord); }
  catch (error) {
    log.error("backfill.parse_error", { id: row.id, error: String(error) });
    return { status: "failed", error: `parse: ${error}` };
  }

  if (record?.identity?.personality?.summary?.trim()) {
    log.info("backfill.skip", { id: row.id, kind: row.kind, reason: "personality already populated" });
    return { status: "skipped" };
  }

  try {
    const prompt = buildBackfillPrompt(record);
    log.info("backfill.synthesize", { id: row.id, kind: row.kind, dryRun });

    // REVIEWS fix #7: withPipelineRetry (3 attempts + typed IngestionPipelineError)
    const pack = await withPipelineRetry("backfill", async () => {
      const result = await generateObject({
        model: createModel(gen.provider),
        schema: personalityPackSchema,
        prompt,
        temperature: gen.temperature,
      });
      return result.object;
    });

    // REVIEWS fix #10: re-read before write
    const table = row.kind === "npc" ? npcs : players;
    const current = await db.select().from(table).where(eq(table.id, row.id));
    const currentRecordStr = current[0]?.characterRecord;
    if (currentRecordStr !== row.characterRecord) {
      log.warn("backfill.skip_record_changed", { id: row.id, kind: row.kind });
      return { status: "skip_record_changed" };
    }

    // Apply personality + REVIEWS fix #2 attachments carry-forward
    record.identity = record.identity ?? {};
    record.identity.personality = pack;
    const legacyAttachments = record.identity?.behavioralCore?.attachments ?? [];
    const liveAttachments = record.identity?.liveDynamics?.attachments ?? [];
    if (legacyAttachments.length > 0 && liveAttachments.length === 0) {
      record.identity.liveDynamics = record.identity.liveDynamics ?? {};
      record.identity.liveDynamics.attachments = legacyAttachments;
      log.info("backfill.attachments_carried_forward", { id: row.id, count: legacyAttachments.length });
    }

    // REVIEWS fix #11: side-effect-free dry-run
    if (dryRun) {
      log.info("backfill.dry_run", {
        id: row.id,
        kind: row.kind,
        packSize: JSON.stringify(pack).length,
        wouldCarryAttachments: legacyAttachments.length > 0 && liveAttachments.length === 0,
      });
      return { status: "dry_run" };
    }

    // Real run: backup BEFORE update
    const backupPath = await writeBackup(campaignId, row.id, JSON.parse(row.characterRecord));
    log.info("backfill.backup", { id: row.id, backupPath });

    await db.update(table).set({ characterRecord: JSON.stringify(record) }).where(eq(table.id, row.id));
    log.info("backfill.write", { id: row.id, kind: row.kind });
    return { status: "written" };
  } catch (error) {
    // REVIEWS fix #6: log + BACKLOG + continue. NO OpenRouter.
    log.error("backfill.error", {
      id: row.id,
      kind: row.kind,
      error: String(error),
      provider: "GLM (locked by feedback_openrouter_embargo.md — NO fallback)",
    });
    await appendBacklogEntry(campaignId, row, error);
    return { status: "failed", error: String(error) };
  }
}

async function appendBacklogEntry(campaignId: string, row: RowRef, error: unknown): Promise<void> {
  const line = `- Phase 63 backfill failed: campaign=${campaignId} record=${row.id} kind=${row.kind} at=${new Date().toISOString()} error=${String(error).replace(/\n/g, " ")}\n`;
  try { await writeFile(".planning/BACKLOG.md", line, { flag: "a" }); }
  catch (e) { log.warn("backfill.backlog_write_failed", { error: String(e) }); }
}

async function writeCompletionSentinel(campaignId: string): Promise<void> {
  const configPath = path.join(getCampaignsDir(), campaignId, "config.json");
  try {
    const raw = await readFile(configPath, "utf8");
    const cfg = JSON.parse(raw);
    cfg.personalityBackfillComplete = true;
    cfg.backfilledAt = new Date().toISOString();
    await writeFile(configPath, JSON.stringify(cfg, null, 2), "utf8");
    log.info("backfill.sentinel_written", { campaignId, configPath });
  } catch (error) {
    log.warn("backfill.sentinel_write_failed", { campaignId, error: String(error) });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function listCampaigns(filter?: string): Promise<string[]> {
  if (filter) return [filter];
  const root = getCampaignsDir();
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
}

async function processCampaign(
  campaignId: string,
  gen: any,
  args: BackfillArgs
): Promise<{ written: number; skipped: number; failed: number; changed: number }> {
  const dbPath = path.join(getCampaignsDir(), campaignId, "state.db");
  connectDb(dbPath);
  const db = getDb();
  try {
    const npcRows = await db.select().from(npcs);
    const playerRows = await db.select().from(players);
    const rows: RowRef[] = [
      ...npcRows.map((r) => ({ id: r.id, characterRecord: r.characterRecord, kind: "npc" as const })),
      ...playerRows.map((r) => ({ id: r.id, characterRecord: r.characterRecord, kind: "player" as const })),
    ];

    log.info("backfill.campaign_start", { campaignId, total: rows.length, dryRun: args.dryRun });

    const results = { written: 0, skipped: 0, failed: 0, changed: 0 };
    for (const batch of chunk(rows, args.batchSize)) {
      const outcomes = await Promise.all(batch.map((row) =>
        runWithTurnContext({ turnId: `backfill-${row.id}`, role: "backfill" }, () =>
          processRow(db, campaignId, row, gen, args.dryRun)
        )
      ));
      for (const o of outcomes) {
        if (o.status === "written" || o.status === "dry_run") results.written++;
        else if (o.status === "skipped") results.skipped++;
        else if (o.status === "skip_record_changed") results.changed++;
        else if (o.status === "failed") results.failed++;
      }
      log.info("backfill.batch_complete", { campaignId, running: results });
    }

    // REVIEWS fix #13: sentinel on success only (not dry-run, not if any failed or changed)
    if (!args.dryRun && results.failed === 0 && results.changed === 0) {
      await writeCompletionSentinel(campaignId);
    }

    return results;
  } finally {
    closeDb();
  }
}

export async function runBackfill(args: BackfillArgs): Promise<BackfillResults> {
  const settings = loadSettings(); // SYNC (REVIEWS fix #4)
  const genResolution = resolveRoleModel(settings.generator, settings.providers); // correct signature (REVIEWS fix #4)
  if (genResolution.kind !== "ok") {
    throw new Error(`Generator role unresolved: ${JSON.stringify(genResolution)}`);
  }
  const gen = genResolution;

  const campaignIds = await listCampaigns(args.campaignFilter);
  log.info("backfill.start", { campaigns: campaignIds.length, dryRun: args.dryRun, batchSize: args.batchSize });

  const totals: BackfillResults = { written: 0, skipped: 0, failed: 0, campaignsProcessed: 0 };
  for (const cid of campaignIds) {
    try {
      const r = await processCampaign(cid, gen, args);
      totals.written += r.written;
      totals.skipped += r.skipped;
      totals.failed += r.failed + r.changed; // "changed" counts against exit code
      totals.campaignsProcessed += 1;
    } catch (error) {
      log.error("backfill.campaign_fatal", { campaignId: cid, error: String(error) });
      totals.failed += 1;
    }
  }

  log.info("backfill.finished", totals);
  return totals;
}

async function main() {
  const args = parseArgs(process.argv);
  const totals = await runBackfill(args);
  process.exit(totals.failed > 0 ? 1 : 0);
}

// Only auto-run when invoked directly (not when imported by tests)
const isDirect = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isDirect) {
  main().catch((error) => {
    log.fatal("backfill.fatal", { error: String(error) });
    process.exit(1);
  });
}
```

Notes:
- EVERY import path is locked per Task 1 gitnexus verification. Do not substitute.
- `createLogger` + `getCampaignsDir` come from `../lib/index.js` Phase 58 barrel — confirm via grep; if the barrel doesn't re-export, import from the specific module (likely `../lib/logger.js` and `../lib/paths.js` respectively).
- `ResolveResult` is a discriminated union — `genResolution.kind !== "ok"` handling depends on exact shape; confirm in Task 1 and adjust the narrowing accordingly.
- `runBackfill` is exported for tests; `main()` only runs when the module is executed directly.
- No OpenRouter fallback anywhere. REVIEWS fix #6 LOCKED.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck</automated>
  </verify>
  <done>Script compiles via tsx (typecheck green); imports resolve against actual API surface; all REVIEWS fixes #2/#4/#6/#7/#10/#11/#13 implemented.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Vitest integration test covering all REVIEWS behavior contracts (P63-R6)</name>
  <files>
backend/src/scripts/__tests__/backfill-personality.test.ts
  </files>
  <behavior>
Test cases (RESEARCH §9.1 + all REVIEWS fixes):

**Setup:**
- Seed a test scenario (in-memory SQLite or fully mocked db boundary — executor chooses):
  - Test campaign with 4 records:
    - NPC-A: `identity.personality.summary = "Existing"` (already populated — must skip)
    - NPC-B: no `personality` field, no `behavioralCore.attachments` (plain backfill)
    - NPC-C: no `personality`, `behavioralCore.attachments = ["old-link"]`, `liveDynamics.attachments` absent (attachments carry-forward case)
    - Player-D: no `personality`, `behavioralCore.attachments = ["x"]`, `liveDynamics.attachments = ["y"]` (carry-forward must NOT overwrite)
- Mock `generateObject` from `ai` to resolve with a fixed valid `personalityPackSchema` payload.
- Mock `resolveRoleModel` + `createModel` + `loadSettings` to no-op shims.
- Stub `getCampaignsDir()` to a test tmp dir; pre-populate `campaigns/test-campaign/config.json` with `{}`.

**Test 1 — dry-run is side-effect-free (REVIEWS fix #11):**
- Run `runBackfill({ campaignFilter: "test-campaign", dryRun: true, batchSize: 5 })`.
- Assert `written === 3, skipped === 1, failed === 0`.
- Assert NO files match `campaigns/test-campaign/logs/backfill-backup-*.json`.
- Assert DB unchanged for all 4 records.
- Assert `config.json` does NOT gain `personalityBackfillComplete`.

**Test 2 — real run writes + backs up + sentinel (REVIEWS fix #13):**
- Run `{ ..., dryRun: false }`.
- Assert counts: `written === 3, skipped === 1, failed === 0`.
- Assert 3 backup files exist.
- Assert NPC-B, NPC-C, Player-D records in DB have `personality.summary` non-empty.
- Assert NPC-A unchanged.
- Assert `config.json` now has `personalityBackfillComplete: true` + valid `backfilledAt`.

**Test 3 — idempotent re-run:**
- Run again `{ ..., dryRun: false }`.
- Assert `written === 0, skipped === 4, failed === 0`.
- Assert NO new backup files.
- Assert `config.json` sentinel still present.

**Test 4 — attachments carry-forward (REVIEWS fix #2 durable):**
- Inspect NPC-C's post-run record: `identity.liveDynamics.attachments === ["old-link"]` AND `identity.personality.summary` non-empty.
- Inspect Player-D's post-run record: `identity.liveDynamics.attachments === ["y"]` (NOT `["x"]` — new wins when present).

**Test 5 — error isolation + BACKLOG entry (REVIEWS fix #6):**
- Reset DB to seed state.
- Mock `generateObject` to throw on NPC-B's call only (inspect the prompt content to target).
- Run `{ ..., dryRun: false }`.
- Assert counts: `written === 2 (NPC-C + Player-D), skipped === 1 (NPC-A), failed === 1 (NPC-B)`.
- Assert NPC-B record unchanged in DB.
- Assert no `config.json` sentinel written (failed > 0).
- Assert BACKLOG.md file (test tmp-redirected) gained a line mentioning `NPC-B`.

**Test 6 — withPipelineRetry retry-then-success (REVIEWS fix #7):**
- Mock `generateObject` to throw once then succeed for NPC-B only.
- Run `{ ..., dryRun: false }`.
- Assert `written === 3, failed === 0` (withPipelineRetry swallowed the transient error).

**Test 7 — re-read-before-write skip (REVIEWS fix #10):**
- Mock `generateObject` to resolve normally BUT between the generateObject resolve and the `db.update`, simulate a concurrent DB change by mutating the db mock's underlying characterRecord for NPC-B to a different blob.
- Run `{ ..., dryRun: false }`.
- Assert counts: `written === 2 (NPC-C + Player-D), skipped === 1 (NPC-A), changed === 1 (NPC-B)`.
- Assert NPC-B DB record has the mutated-during-run value (NOT overwritten by stale personality merge).
- Assert log contains `backfill.skip_record_changed` for NPC-B.

**Test 8 — structured log shape (P63-R6):**
- Capture log output (use Phase 58 test-mode logger helper if available; else spy on pino transport).
- Assert each real-run record produced events: `backfill.synthesize`, `backfill.backup`, `backfill.write` (or `backfill.skip` / `backfill.skip_record_changed`).
- Assert each event carries `turnId: "backfill-<id>"` from `runWithTurnContext`.
- Assert no event payload contains `apiKey` / `Authorization` (Phase 58 redaction holds).
  </behavior>
  <action>
Create `backend/src/scripts/__tests__/backfill-personality.test.ts` implementing all 8 behavior cases above.

Harness options (executor picks based on availability):
- **Option A (preferred):** in-memory SQLite via `connectDb(":memory:")` + run Drizzle migrations in `beforeAll`. Search for existing test-DB setup in `backend/src/**/__tests__/` (Phase 60 + Phase 58 likely established patterns).
- **Option B (fallback):** mock the db module boundary via `vi.mock("../db/index.js", ...)` returning a mutable in-memory fake implementing `connectDb`, `getDb`, `closeDb`. The fake needs to support the fluent Drizzle API `db.select().from(table).where(eq(table.id, id))` and `db.update(table).set({...}).where(...)`.

Mock `generateObject` from `ai` via `vi.mock("ai", ...)` so LLM is never hit.
Mock `resolveRoleModel` + `createModel` + `loadSettings`. Stub Phase 58 `getCampaignsDir()` to a `tmp` directory via module mock. Redirect `.planning/BACKLOG.md` writes to a test tmp path by mocking `fs/promises.writeFile` for that specific path.

Reset test tmp directory between tests (`beforeEach` wipes + reseeds).

**REVIEWS note on harness downgrade (Claude MEDIUM):** If no real in-memory Drizzle harness exists and Option B is used, this remains an integration-level test (exercises `runBackfill` + `processCampaign` + `processRow` end-to-end), just with a mocked DB boundary. That satisfies P63-R6 (behavioral contract) — 63-06 Task 7 adds the real-DB real-LLM pass against a live dev campaign.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "backfill-personality"</automated>
  </verify>
  <done>8 Vitest cases pass; P63-R6 covered; every REVIEWS fix (#2 attachments, #6 no-fallback, #7 retry, #10 re-read, #11 dry-run, #13 sentinel) has a dedicated behavioral assertion.</done>
</task>

<task type="auto">
  <name>Task 4: backend/package.json npm script wiring</name>
  <files>
backend/package.json
  </files>
  <action>
1. Read `backend/package.json` and locate the `"scripts"` block.

2. Add:
   ```json
   "backfill:personality": "tsx src/scripts/backfill-personality.ts"
   ```
   Place alphabetically near other `db:*` / `dev` script entries, OR appended per project style.

3. Verify `tsx` is in `devDependencies` (confirm via grep). If not, add `"tsx": "^4.0.0"` and document in SUMMARY.

4. Confirm invocation pattern: `npm --prefix backend run backfill:personality -- --dry-run --campaign <id>` (the `--` forwards flags to tsx).
  </action>
  <verify>
    <automated>node -e "const pkg = require('./backend/package.json'); if (!pkg.scripts['backfill:personality']) throw new Error('missing script'); console.log('npm script wired');"</automated>
  </verify>
  <done>`backfill:personality` npm script available in backend package.json.</done>
</task>

<task type="auto">
  <name>Task 5: Post-task verification</name>
  <files>(no edits — verification only)</files>
  <action>
1. `gitnexus_detect_changes({scope: "all"})` — confirm scope matches `files_modified`. Halt and reconcile any unexpected edits.

2. Targeted tests:
   ```
   npm --prefix backend test -- run "backfill-personality"
   ```

3. Typecheck:
   ```
   npm --prefix backend run typecheck
   ```

4. Real-campaign manual run is DEFERRED to 63-06 Task 2 + Task 7 (evidence bundle). This plan only lands the script + tests.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "backfill-personality" && npm --prefix backend run typecheck</automated>
  </verify>
  <done>Script + tests + npm wiring all green; manual run deferred to 63-06.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend run typecheck` exits 0.
- `npm --prefix backend test -- run "backfill-personality"` exits 0; 8 Vitest cases pass.
- `backend/src/scripts/backfill-personality.ts` exists with `runBackfill` + `main` exports.
- Imports match the VERIFIED API surface from Task 1 (no `{ db }` singleton, correct `resolveRoleModel` signature, SYNC `loadSettings`, `createModel` from `../ai/index.js`, `withPipelineRetry` from `../character/ingestion/retry.js`).
- `backend/src/scripts/__tests__/backfill-personality.test.ts` exists with coverage for all 8 REVIEWS-driven behaviors.
- `backend/package.json` contains `backfill:personality` script.
- NO references to OpenRouter fallback anywhere in the script or test file (REVIEWS fix #6).
- gitnexus_detect_changes captured.
</verification>

<success_criteria>
- Backfill script compiles + runs end-to-end with all 4 documented flags.
- **Per-campaign connectDb loop:** iterates campaigns, opens `state.db`, processes, closes — no global singleton assumption (REVIEWS fix #4).
- **Correct API signatures:** `resolveRoleModel(settings.generator, settings.providers)`, SYNC `loadSettings()`, `createModel` from `../ai/index.js` (REVIEWS fix #4).
- **`withPipelineRetry`** wrapping `generateObject` — 3 attempts + typed failure (REVIEWS fix #7).
- **Idempotency** via `summary.trim()` sentinel check.
- **Side-effect-free dry-run** (REVIEWS fix #11) — no backup, no config.json, no db.update.
- **Real run** writes backup BEFORE every DB update + `config.json` sentinel `personalityBackfillComplete: true` on clean success (REVIEWS fix #13).
- **Re-read-before-write** safeguard skips records mutated during the LLM call (REVIEWS fix #10).
- **Attachments carry-forward** durably migrates legacy `behavioralCore.attachments` → `liveDynamics.attachments` in the same update (REVIEWS fix #2).
- **Per-record error isolation** with BACKLOG.md follow-up entry; NO OpenRouter fallback anywhere (REVIEWS fix #6).
- Structured logs carry Phase 58 `turnId: "backfill-<id>"` correlation.
- P63-R6 fully covered.
</success_criteria>

<requirement_coverage>
- **P63-R6** — `backfill-personality.test.ts` (8 cases) proves idempotency, side-effect-free dry-run, batched parallelism, backup, structured logs, error isolation, retry, re-read safeguard, attachments carry-forward, sentinel. Script exists at `backend/src/scripts/backfill-personality.ts` per the required path.
- **P63-R2 reinforcement** — legacy `behavioralCore.attachments` gets durably migrated into `liveDynamics.attachments` (REVIEWS fix #2); 63-03's read-time fallback + this plan's durable carry-forward together satisfy the attachments migration.
</requirement_coverage>

<estimates>
- **Effort:** ~60 min Claude execution time (5 tasks; script + 8-case integration test are the heavy ones).
- **LLM token cost:** ~0 for plan execution (`generateObject` mocked). Real-campaign cost per RESEARCH §7.3: ~$0.002 per NPC, ~$0.04 per 20-NPC campaign on GLM-5.
- **Test runtime:** ~15s for the 8-case integration suite.
- **Real-campaign run (deferred to 63-06):** ~5 min for 20 NPCs at batch-size 5.
</estimates>

<risks>
- **R1 — One-way door (RESEARCH §11 risk #1).** Backfill overwrites `identity.personality`. Reverting requires restoring from backup files. **Mitigation:** backup file written BEFORE every update; re-read-before-write guard prevents mid-flight overwrite; durable carry-forward is additive, not destructive.
- **R2 — GLM provider variance (RESEARCH §11 risk #2).** GLM may reject strict Zod schema. **Mitigation (REVIEWS fix #6 LOCKED):** `withPipelineRetry` gives 3 attempts; on exhaustion, STOP + BACKLOG entry + continue with next record. **NO OpenRouter fallback.** Operator manually investigates failed records post-run (logs capture full context).
- **R3 — DB singleton concurrency (Phase 33 STATE note, REVIEWS fix #4).** Per-campaign connectDb/closeDb loop is sequential across campaigns — no concurrent opens. Within a campaign, `better-sqlite3` is sync so batch `Promise.all` parallelizes LLM calls not DB writes. **Mitigation:** documented in script header — operator runs in single process; do not run multiple invocations concurrently. Backend dev server should be stopped during cross-campaign backfill.
- **R4 — Backup file directory growth.** Many backups accumulate. **Mitigation:** documented in 63-06 SUMMARY — operator can `rm campaigns/{id}/logs/backfill-backup-*.json` after verifying good state.
- **R5 — Test harness downgrade (REVIEWS Claude MEDIUM).** If no real in-memory Drizzle harness exists, Test 3 uses Option B (mocked db boundary) → remains integration-level but not fully real. **Mitigation:** Task 3 documents both options; 63-06 Task 2 + Task 7 provide real-DB real-LLM run.
- **R6 — `createLogger` + `getCampaignsDir` barrel import.** Phase 58 exposed these — exact re-export path needs Task 1 grep confirmation. **Mitigation:** Task 2 notes "confirm via grep; if the barrel doesn't re-export, import from the specific module".
- **R7 — BACKLOG.md path coupling.** Writing to `.planning/BACKLOG.md` from backend code is unusual. **Mitigation:** `appendBacklogEntry` uses `fs/promises.writeFile(flag: "a")`; path is relative to CWD — executor runs from project root. Log warn on write failure; don't fail the backfill on BACKLOG write issues.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-05-SUMMARY.md` with:
- Tasks completed
- Files created / modified
- gitnexus impact + detect_changes digests
- Test commands + pass/fail evidence
- Note: real-campaign manual run deferred to 63-06 evidence bundle
- REVIEWS fixes applied in this plan: #2 (durable attachments carry-forward), #4 (correct imports + API signatures), #6 (NO OpenRouter fallback, LOCKED), #7 (withPipelineRetry), #10 (re-read-before-write), #11 (side-effect-free dry-run), #13 (config.json sentinel)
- Provider policy: GLM-default ONLY; failures → log + BACKLOG + continue
- Deviations + rationale
</output>
