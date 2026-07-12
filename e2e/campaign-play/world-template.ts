import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import Database from "better-sqlite3";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const DATABASE_FILES = new Set(["state.db", "state.db-shm", "state.db-wal"]);

export interface CampaignWorldTemplateManifest {
  templateVersion: 1;
  templateId: string;
  sourceCampaignId: string;
  sourceCommit: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  setupPhase: "character_required";
  worldVersion: number;
  runtimeRevision: number;
  characterCount: 0;
  turnCount: 0;
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

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
    return { ...state, ...world, characterCount, turnCount };
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

function parseManifest(filePath: string): CampaignWorldTemplateManifest {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as CampaignWorldTemplateManifest;
  if (
    value.templateVersion !== 1
    || typeof value.templateId !== "string"
    || typeof value.sourceCampaignId !== "string"
    || typeof value.sourceCommit !== "string"
    || value.setupPhase !== "character_required"
    || value.characterCount !== 0
    || value.turnCount !== 0
    || typeof value.files?.["state.db"] !== "string"
    || typeof value.files?.["config.json"] !== "string"
  ) throw new Error("World template manifest is invalid.");
  assertId(value.templateId, "templateId");
  return value;
}

export async function snapshotCampaignWorldTemplate(
  options: SnapshotCampaignWorldTemplateOptions,
): Promise<{ templateDirectory: string; manifest: CampaignWorldTemplateManifest }> {
  assertId(options.templateId, "templateId");
  const campaignDirectory = childPath(options.campaignsRoot, options.campaignId);
  const templateDirectory = childPath(options.templatesRoot, options.templateId);
  if (!fs.existsSync(campaignDirectory)) throw new Error(`Campaign does not exist: ${campaignDirectory}`);
  if (fs.existsSync(templateDirectory)) throw new Error(`Template already exists: ${templateDirectory}`);

  const sourceState = pristineState(path.join(campaignDirectory, "state.db"), options.campaignId);
  assertPristine(sourceState);
  fs.mkdirSync(options.templatesRoot, { recursive: true });
  fs.cpSync(campaignDirectory, templateDirectory, {
    recursive: true,
    filter: (source) => !DATABASE_FILES.has(path.basename(source)),
  });
  const sourceDatabase = new Database(path.join(campaignDirectory, "state.db"), {
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
  const manifest: CampaignWorldTemplateManifest = {
    templateVersion: 1,
    templateId: options.templateId,
    sourceCampaignId: options.campaignId,
    sourceCommit: options.sourceCommit
      ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    acceptedWorldVersion: copiedState.acceptedWorldVersion,
    acceptedContentHash: copiedState.acceptedContentHash,
    setupPhase: "character_required",
    worldVersion: copiedState.worldVersion,
    runtimeRevision: copiedState.runtimeRevision,
    characterCount: 0,
    turnCount: 0,
    files: {
      "state.db": sha256(path.join(templateDirectory, "state.db")),
      "config.json": sha256(path.join(templateDirectory, "config.json")),
    },
  };
  fs.writeFileSync(
    path.join(templateDirectory, "template.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { templateDirectory, manifest };
}

export function materializeCampaignWorldTemplate(
  options: MaterializeCampaignWorldTemplateOptions,
): { campaignsRoot: string; campaignDirectory: string; manifest: CampaignWorldTemplateManifest } {
  assertId(options.runId, "runId");
  const templateDirectory = path.resolve(options.templateDirectory);
  const manifest = parseManifest(path.join(templateDirectory, "template.json"));
  const sourceDatabase = path.join(templateDirectory, "state.db");
  const sourceConfig = path.join(templateDirectory, "config.json");
  if (
    sha256(sourceDatabase) !== manifest.files["state.db"]
    || sha256(sourceConfig) !== manifest.files["config.json"]
  ) throw new Error("World template file hash mismatch.");
  const sourceState = pristineState(sourceDatabase, manifest.sourceCampaignId);
  assertPristine(sourceState);

  const runDirectory = childPath(options.runsRoot, options.runId);
  const campaignsRoot = childPath(runDirectory, "campaigns");
  const campaignDirectory = childPath(campaignsRoot, manifest.sourceCampaignId);
  if (fs.existsSync(runDirectory)) throw new Error(`Playtest run already exists: ${runDirectory}`);
  fs.mkdirSync(campaignsRoot, { recursive: true });
  fs.cpSync(templateDirectory, campaignDirectory, { recursive: true });
  const copiedState = pristineState(path.join(campaignDirectory, "state.db"), manifest.sourceCampaignId);
  assertPristine(copiedState);
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
