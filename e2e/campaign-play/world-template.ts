import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import Database from "better-sqlite3";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const DATABASE_FILES = new Set(["state.db", "state.db-shm", "state.db-wal"]);

export interface CampaignWorldTemplateManifest {
  templateVersion: 2;
  templateId: string;
  packageId: string;
  packagePath: string;
  manifestPath: string;
  packageSha256: string;
  sourceCampaignId: string;
  sourceCampaignPath: string;
  sourceCommit: string;
  schemaMigrationId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  setupPhase: "character_required";
  worldVersion: number;
  runtimeRevision: number;
  characterCount: 0;
  turnCount: 0;
  sourceFiles: {
    "state.db": string;
    "config.json": string;
  };
  files: {
    "state.db": string;
    "config.json": string;
  };
}

export interface SnapshotCampaignWorldTemplateOptions {
  campaignId: string;
  templateId: string;
  campaignsRoot: string;
  templatesRoot: string;
  sourceCommit?: string;
}

export interface MaterializeCampaignWorldTemplateOptions {
  templateDirectory: string;
  runId: string;
  runsRoot: string;
}

interface PristineWorldState {
  setupPhase: string;
  worldVersion: number;
  runtimeRevision: number;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  schemaMigrationId: string;
  characterCount: number;
  turnCount: number;
}

function assertId(value: string, label: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(`${label} must be a lowercase kebab-case ID.`);
}

function childPath(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escaped its configured root: ${target}`);
  }
  return target;
}

function sha256Bytes(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function schemaMigrationIdentity(sqlite: Database.Database): string {
  const schemaRows = sqlite.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type, name
  `).all();
  let migrationRows: unknown[] = [];
  try {
    migrationRows = sqlite.prepare(`
      SELECT hash, created_at AS createdAt
      FROM __drizzle_migrations
      ORDER BY created_at, hash
    `).all();
  } catch {
    // Small provider-free fixtures do not carry Drizzle's journal. The
    // canonical sqlite_master digest still gives them an explicit identity.
  }
  return `sqlite-schema-${sha256Bytes(JSON.stringify({ schemaRows, migrationRows }))}`;
}

function pristineState(databasePath: string, campaignId: string): PristineWorldState {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const state = sqlite.prepare(`SELECT setup_phase AS setupPhase,
      world_version AS worldVersion, runtime_revision AS runtimeRevision
      FROM campaign_play_states WHERE campaign_id = ?`).get(campaignId) as {
        setupPhase: string;
        worldVersion: number;
        runtimeRevision: number;
      } | undefined;
    const world = sqlite.prepare(`SELECT accepted_world_version AS acceptedWorldVersion,
      accepted_content_hash AS acceptedContentHash
      FROM campaign_worlds WHERE campaign_id = ? AND status = 'accepted'`).get(campaignId) as {
        acceptedWorldVersion: number;
        acceptedContentHash: string;
      } | undefined;
    if (!state || !world) throw new Error("Template source lacks accepted Campaign Play state.");
    const characterCount = (sqlite.prepare(`SELECT count(*) AS value
      FROM campaign_play_characters WHERE campaign_id = ?`).get(campaignId) as { value: number }).value;
    const turnCount = (sqlite.prepare(`SELECT count(*) AS value
      FROM campaign_play_turns WHERE campaign_id = ?`).get(campaignId) as { value: number }).value;
    return {
      ...state,
      ...world,
      schemaMigrationId: schemaMigrationIdentity(sqlite),
      characterCount,
      turnCount,
    };
  } finally {
    sqlite.close();
  }
}

function assertPristine(state: PristineWorldState): asserts state is PristineWorldState & {
  setupPhase: "character_required";
  characterCount: 0;
  turnCount: 0;
} {
  if (
    state.setupPhase !== "character_required"
    || state.characterCount !== 0
    || state.turnCount !== 0
  ) {
    throw new Error(
      `World template requires character_required with zero characters and turns; received ${JSON.stringify(state)}.`,
    );
  }
}

function packageIdentity(manifest: Omit<CampaignWorldTemplateManifest, "packageSha256">): string {
  return JSON.stringify(manifest);
}

function packageHash(manifest: Omit<CampaignWorldTemplateManifest, "packageSha256">): string {
  return sha256Bytes(packageIdentity(manifest));
}

function parseManifest(filePath: string): CampaignWorldTemplateManifest {
  const manifestPath = path.resolve(filePath);
  const value = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CampaignWorldTemplateManifest;
  if (
    value.templateVersion !== 2
    || typeof value.templateId !== "string"
    || typeof value.packageId !== "string"
    || typeof value.packagePath !== "string"
    || typeof value.manifestPath !== "string"
    || typeof value.packageSha256 !== "string"
    || typeof value.sourceCampaignId !== "string"
    || typeof value.sourceCampaignPath !== "string"
    || typeof value.sourceCommit !== "string"
    || typeof value.schemaMigrationId !== "string"
    || value.setupPhase !== "character_required"
    || value.characterCount !== 0
    || value.turnCount !== 0
    || typeof value.sourceFiles?.["state.db"] !== "string"
    || typeof value.sourceFiles?.["config.json"] !== "string"
    || typeof value.files?.["state.db"] !== "string"
    || typeof value.files?.["config.json"] !== "string"
  ) throw new Error("World template manifest is invalid.");
  assertId(value.templateId, "templateId");
  assertId(value.packageId, "packageId");
  if (value.packageId !== value.templateId) {
    throw new Error("World template package identity must equal its template identity.");
  }
  if (
    !path.isAbsolute(value.packagePath)
    || !path.isAbsolute(value.manifestPath)
    || !path.isAbsolute(value.sourceCampaignPath)
  ) {
    throw new Error("World template provenance paths must be absolute and path-qualified.");
  }
  if (path.resolve(value.manifestPath) !== path.join(path.resolve(value.packagePath), "template.json")) {
    throw new Error("World template package path does not own its manifest.");
  }
  const { packageSha256: ignored, ...withoutHash } = value;
  if (value.packageSha256 !== packageHash(withoutHash)) {
    throw new Error("World template package identity hash is invalid.");
  }
  return value;
}

export function readCampaignWorldTemplateManifest(
  manifestPath: string,
): CampaignWorldTemplateManifest {
  return parseManifest(manifestPath);
}

export function verifyCampaignWorldTemplatePackage(
  templateDirectory: string,
): { manifest: CampaignWorldTemplateManifest; manifestSha256: string } {
  const packageDirectory = path.resolve(templateDirectory);
  const manifestPath = path.join(packageDirectory, "template.json");
  const manifest = parseManifest(manifestPath);
  const statePath = path.join(packageDirectory, "state.db");
  const configPath = path.join(packageDirectory, "config.json");
  if (
    sha256(statePath) !== manifest.files["state.db"]
    || sha256(configPath) !== manifest.files["config.json"]
  ) throw new Error("World template file hash mismatch.");
  const state = pristineState(statePath, manifest.sourceCampaignId);
  assertPristine(state);
  if (
    state.acceptedWorldVersion !== manifest.acceptedWorldVersion
    || state.acceptedContentHash !== manifest.acceptedContentHash
    || state.worldVersion !== manifest.worldVersion
    || state.runtimeRevision !== manifest.runtimeRevision
    || state.schemaMigrationId !== manifest.schemaMigrationId
  ) throw new Error("World template state identity does not match its immutable manifest.");
  return { manifest, manifestSha256: sha256(manifestPath) };
}

export async function snapshotCampaignWorldTemplate(
  options: SnapshotCampaignWorldTemplateOptions,
): Promise<{
  templateDirectory: string;
  manifestPath: string;
  manifestSha256: string;
  manifest: CampaignWorldTemplateManifest;
}> {
  assertId(options.templateId, "templateId");
  const campaignDirectory = childPath(options.campaignsRoot, options.campaignId);
  const templateDirectory = childPath(options.templatesRoot, options.templateId);
  if (!fs.existsSync(campaignDirectory)) throw new Error(`Campaign does not exist: ${campaignDirectory}`);
  if (fs.existsSync(templateDirectory)) throw new Error(`Template already exists: ${templateDirectory}`);

  const sourceStatePath = path.join(campaignDirectory, "state.db");
  const sourceConfigPath = path.join(campaignDirectory, "config.json");
  const sourceFiles = {
    "state.db": sha256(sourceStatePath),
    "config.json": sha256(sourceConfigPath),
  };
  const sourceState = pristineState(sourceStatePath, options.campaignId);
  assertPristine(sourceState);
  fs.mkdirSync(options.templatesRoot, { recursive: true });
  fs.cpSync(campaignDirectory, templateDirectory, {
    recursive: true,
    filter: (source) => !DATABASE_FILES.has(path.basename(source)),
  });
  const sourceDatabase = new Database(sourceStatePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    await sourceDatabase.backup(path.join(templateDirectory, "state.db"));
  } finally {
    sourceDatabase.close();
  }

  const copiedState = pristineState(path.join(templateDirectory, "state.db"), options.campaignId);
  assertPristine(copiedState);
  if (copiedState.schemaMigrationId !== sourceState.schemaMigrationId) {
    throw new Error("Materialized template changed its schema or migration identity.");
  }
  const packagePath = path.resolve(templateDirectory);
  const manifestPath = path.join(packagePath, "template.json");
  const withoutHash: Omit<CampaignWorldTemplateManifest, "packageSha256"> = {
    templateVersion: 2,
    templateId: options.templateId,
    packageId: options.templateId,
    packagePath,
    manifestPath,
    sourceCampaignId: options.campaignId,
    sourceCampaignPath: path.resolve(campaignDirectory),
    sourceCommit: options.sourceCommit
      ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    schemaMigrationId: copiedState.schemaMigrationId,
    acceptedWorldVersion: copiedState.acceptedWorldVersion,
    acceptedContentHash: copiedState.acceptedContentHash,
    setupPhase: "character_required",
    worldVersion: copiedState.worldVersion,
    runtimeRevision: copiedState.runtimeRevision,
    characterCount: 0,
    turnCount: 0,
    sourceFiles,
    files: {
      "state.db": sha256(path.join(templateDirectory, "state.db")),
      "config.json": sha256(path.join(templateDirectory, "config.json")),
    },
  };
  const manifest: CampaignWorldTemplateManifest = {
    ...withoutHash,
    packageSha256: packageHash(withoutHash),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const verified = verifyCampaignWorldTemplatePackage(templateDirectory);
  if (
    sha256(sourceStatePath) !== sourceFiles["state.db"]
    || sha256(sourceConfigPath) !== sourceFiles["config.json"]
  ) {
    throw new Error("Canonical template source bytes changed during snapshot.");
  }
  return {
    templateDirectory,
    manifestPath,
    manifestSha256: verified.manifestSha256,
    manifest: verified.manifest,
  };
}

export function materializeCampaignWorldTemplate(
  options: MaterializeCampaignWorldTemplateOptions,
): { campaignsRoot: string; campaignDirectory: string; manifest: CampaignWorldTemplateManifest } {
  assertId(options.runId, "runId");
  const templateDirectory = path.resolve(options.templateDirectory);
  const verifiedBefore = verifyCampaignWorldTemplatePackage(templateDirectory);
  const packageBytesBefore = {
    manifest: verifiedBefore.manifestSha256,
    state: sha256(path.join(templateDirectory, "state.db")),
    config: sha256(path.join(templateDirectory, "config.json")),
  };
  const manifest = verifiedBefore.manifest;
  const runDirectory = childPath(options.runsRoot, options.runId);
  const campaignsRoot = childPath(runDirectory, "campaigns");
  const campaignDirectory = childPath(campaignsRoot, manifest.sourceCampaignId);
  if (fs.existsSync(runDirectory)) throw new Error(`Playtest run already exists: ${runDirectory}`);
  fs.mkdirSync(campaignsRoot, { recursive: true });
  fs.cpSync(templateDirectory, campaignDirectory, { recursive: true });
  const copied = verifyCampaignWorldTemplatePackage(campaignDirectory);
  const copiedState = pristineState(path.join(campaignDirectory, "state.db"), manifest.sourceCampaignId);
  assertPristine(copiedState);
  if (copied.manifest.packageSha256 !== manifest.packageSha256) {
    throw new Error("Materialized world package identity changed during copy.");
  }
  const packageBytesAfter = {
    manifest: verifiedBefore.manifestSha256,
    state: sha256(path.join(templateDirectory, "state.db")),
    config: sha256(path.join(templateDirectory, "config.json")),
  };
  if (JSON.stringify(packageBytesBefore) !== JSON.stringify(packageBytesAfter)) {
    throw new Error("Immutable world template bytes changed during materialization.");
  }
  return { campaignsRoot, campaignDirectory, manifest };
}

function argument(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires one value.`);
  return value;
}

export async function runCampaignWorldTemplateCli(args: readonly string[] = process.argv): Promise<void> {
  const phase = argument(args, "--phase");
  if (phase === "snapshot") {
    const result = await snapshotCampaignWorldTemplate({
      campaignId: argument(args, "--campaign-id") ?? "",
      templateId: argument(args, "--template-id") ?? "",
      campaignsRoot: argument(args, "--campaigns-root") ?? "campaigns",
      templatesRoot: argument(args, "--templates-root") ?? "output/playtests/campaign-world-templates",
    });
    process.stdout.write(`${JSON.stringify({ phase, ...result })}\n`);
    return;
  }
  if (phase === "materialize") {
    const result = materializeCampaignWorldTemplate({
      templateDirectory: argument(args, "--template") ?? "",
      runId: argument(args, "--run-id") ?? "",
      runsRoot: argument(args, "--runs-root") ?? "output/playtests/campaign-world-runs",
    });
    process.stdout.write(`${JSON.stringify({
      phase,
      ...result,
      environment: { GSD_CAMPAIGNS_ROOT: result.campaignsRoot },
    })}\n`);
    return;
  }
  throw new Error("--phase must be snapshot or materialize.");
}
