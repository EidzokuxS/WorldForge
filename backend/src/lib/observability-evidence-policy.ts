import { createHash } from "node:crypto";
import { z } from "zod";

export const OBSERVABILITY_EVIDENCE_POLICY_VERSION = "phase95-observability-evidence-v1";
export const OBSERVABILITY_EVIDENCE_OWNER = "backend-observability-harness";

export const OBSERVABILITY_ARTIFACT_KINDS = [
  "turns-jsonl",
  "trace-jsonl",
  "sse-events-jsonl",
  "full-turn-artifacts",
  "world-diffs-jsonl",
  "job-proposal-ledger",
  "latency-context-trace",
  "prompt-dump-jsonl",
  "turn-log-jsonl",
  "workshop-trace-payload",
  "screenshots",
  "acceptance-report",
  "living-world-assertions",
  "soft-review-packet",
  "soft-review-notes",
  "oracle-architecture-bundle",
  "oracle-review-verdict",
  "browser-smoke-report",
  "gitnexus-change-report",
  "human-playtest-notes",
  "remote-trace-summary",
] as const;

export type ObservabilityArtifactKind = (typeof OBSERVABILITY_ARTIFACT_KINDS)[number];

export const OBSERVABILITY_PUBLICATION_TARGETS = [
  "local-private",
  "local-shared",
  "remote-private-review",
  "remote-public",
] as const;

export type ObservabilityPublicationTarget =
  (typeof OBSERVABILITY_PUBLICATION_TARGETS)[number];

export const OBSERVABILITY_REDACTION_LEVELS = [
  "raw",
  "secret-redacted",
  "summary-redacted",
  "public-projection",
] as const;

export type ObservabilityRedactionLevel =
  (typeof OBSERVABILITY_REDACTION_LEVELS)[number];

export const OBSERVABILITY_REMOTE_PUBLICATION_MODES = [
  "forbidden",
  "private-review-only",
  "public-summary-allowed",
] as const;

export type ObservabilityRemotePublicationMode =
  (typeof OBSERVABILITY_REMOTE_PUBLICATION_MODES)[number];

export const OBSERVABILITY_SENSITIVITY_CLASSES = [
  "raw-model-io",
  "private-gameplay-payload",
  "player-visible-evidence",
  "redacted-summary",
  "public-process-evidence",
] as const;

export type ObservabilitySensitivityClass =
  (typeof OBSERVABILITY_SENSITIVITY_CLASSES)[number];

export interface ObservabilityRetentionPolicy {
  scope: "local-raw" | "local-redacted" | "review-bundle" | "public-evidence";
  days: number;
}

export interface ObservabilityEvidencePolicyEntry {
  kind: ObservabilityArtifactKind;
  owner: typeof OBSERVABILITY_EVIDENCE_OWNER;
  gameplayAuthority: false;
  sensitivity: ObservabilitySensitivityClass;
  retention: ObservabilityRetentionPolicy;
  remotePublication: ObservabilityRemotePublicationMode;
  minimumRemoteRedaction: ObservabilityRedactionLevel;
  requiresManualReview: boolean;
  reason: string;
}

const artifactKindSchema = z.enum(OBSERVABILITY_ARTIFACT_KINDS);
const retentionPolicySchema = z.object({
  scope: z.enum(["local-raw", "local-redacted", "review-bundle", "public-evidence"]),
  days: z.number().int().positive(),
}).strip();

export const observabilityEvidencePolicyEntrySchema = z.object({
  kind: artifactKindSchema,
  owner: z.literal(OBSERVABILITY_EVIDENCE_OWNER),
  gameplayAuthority: z.literal(false),
  sensitivity: z.enum(OBSERVABILITY_SENSITIVITY_CLASSES),
  retention: retentionPolicySchema,
  remotePublication: z.enum(OBSERVABILITY_REMOTE_PUBLICATION_MODES),
  minimumRemoteRedaction: z.enum(OBSERVABILITY_REDACTION_LEVELS),
  requiresManualReview: z.boolean(),
  reason: z.string().min(1),
}).strip() satisfies z.ZodType<ObservabilityEvidencePolicyEntry>;

const rawLocal = (
  kind: ObservabilityArtifactKind,
  reason: string,
): ObservabilityEvidencePolicyEntry => ({
  kind,
  owner: OBSERVABILITY_EVIDENCE_OWNER,
  gameplayAuthority: false,
  sensitivity: kind === "sse-events-jsonl" || kind === "full-turn-artifacts" || kind === "prompt-dump-jsonl"
    ? "raw-model-io"
    : "private-gameplay-payload",
  retention: { scope: "local-raw", days: 14 },
  remotePublication: "forbidden",
  minimumRemoteRedaction: "public-projection",
  requiresManualReview: true,
  reason,
});

const localRedacted = (
  kind: ObservabilityArtifactKind,
  reason: string,
): ObservabilityEvidencePolicyEntry => ({
  kind,
  owner: OBSERVABILITY_EVIDENCE_OWNER,
  gameplayAuthority: false,
  sensitivity: "private-gameplay-payload",
  retention: { scope: "local-redacted", days: 30 },
  remotePublication: "private-review-only",
  minimumRemoteRedaction: "summary-redacted",
  requiresManualReview: true,
  reason,
});

const publicEvidence = (
  kind: ObservabilityArtifactKind,
  reason: string,
  requiresManualReview = false,
): ObservabilityEvidencePolicyEntry => ({
  kind,
  owner: OBSERVABILITY_EVIDENCE_OWNER,
  gameplayAuthority: false,
  sensitivity: requiresManualReview ? "player-visible-evidence" : "public-process-evidence",
  retention: { scope: "public-evidence", days: 365 },
  remotePublication: "public-summary-allowed",
  minimumRemoteRedaction: "public-projection",
  requiresManualReview,
  reason,
});

const reviewBundle = (
  kind: ObservabilityArtifactKind,
  reason: string,
): ObservabilityEvidencePolicyEntry => ({
  kind,
  owner: OBSERVABILITY_EVIDENCE_OWNER,
  gameplayAuthority: false,
  sensitivity: "redacted-summary",
  retention: { scope: "review-bundle", days: 90 },
  remotePublication: "private-review-only",
  minimumRemoteRedaction: "summary-redacted",
  requiresManualReview: true,
  reason,
});

export const OBSERVABILITY_EVIDENCE_POLICY: Readonly<Record<
  ObservabilityArtifactKind,
  ObservabilityEvidencePolicyEntry
>> = {
  "turns-jsonl": localRedacted("turns-jsonl", "Contains player actions and campaign handles; useful for local acceptance reconstruction."),
  "trace-jsonl": localRedacted("trace-jsonl", "Contains internal stage telemetry and should be summarized before review publication."),
  "sse-events-jsonl": rawLocal("sse-events-jsonl", "Raw SSE can contain model deltas, backend handles, and transient private context."),
  "full-turn-artifacts": rawLocal("full-turn-artifacts", "Full turn artifacts contain raw snapshots and full assistant text."),
  "world-diffs-jsonl": localRedacted("world-diffs-jsonl", "World hashes and timing are useful evidence but still correlate to private campaign ids."),
  "job-proposal-ledger": localRedacted("job-proposal-ledger", "Proposal ids and due ledgers are backend-owned evidence, not public references."),
  "latency-context-trace": rawLocal("latency-context-trace", "Stage traces may embed raw event payloads and timing context."),
  "prompt-dump-jsonl": rawLocal("prompt-dump-jsonl", "Full prompts are explicitly local-only and require dumpFullPrompts opt-in."),
  "turn-log-jsonl": rawLocal("turn-log-jsonl", "Per-turn logs may include tool payloads, ids, prompts, and error detail."),
  "workshop-trace-payload": rawLocal("workshop-trace-payload", "Workshop payloads are internal debugging records, not acceptance-public evidence."),
  screenshots: publicEvidence("screenshots", "Screenshots are player-visible evidence but can reveal private campaign prose.", true),
  "acceptance-report": publicEvidence("acceptance-report", "Acceptance reports are the publishable summary surface after redaction."),
  "living-world-assertions": publicEvidence("living-world-assertions", "Assertion summaries are publishable when reduced to public metrics and diagnostics."),
  "soft-review-packet": reviewBundle("soft-review-packet", "Review packets can quote scenario prose and must stay private-review scoped."),
  "soft-review-notes": reviewBundle("soft-review-notes", "Human notes can mention private campaign details and need manual review."),
  "oracle-architecture-bundle": reviewBundle("oracle-architecture-bundle", "Oracle bundles are deliberate private review packets, not public artifacts."),
  "oracle-review-verdict": publicEvidence("oracle-review-verdict", "Oracle verdict summaries are publishable when stripped of bundled raw payloads."),
  "browser-smoke-report": publicEvidence("browser-smoke-report", "Browser smoke summaries are process evidence after screenshot/manual review."),
  "gitnexus-change-report": publicEvidence("gitnexus-change-report", "GitNexus scope summaries are process evidence, not gameplay authority."),
  "human-playtest-notes": reviewBundle("human-playtest-notes", "Human-style playtest notes often include campaign prose and need review scoping."),
  "remote-trace-summary": publicEvidence("remote-trace-summary", "Remote traces must be summaries, never raw payload publication."),
};

const redactionRank: Record<ObservabilityRedactionLevel, number> = {
  raw: 0,
  "secret-redacted": 1,
  "summary-redacted": 2,
  "public-projection": 3,
};

export interface ObservabilityPublicationCandidate {
  kind: ObservabilityArtifactKind;
  target: ObservabilityPublicationTarget;
  redactionLevel: ObservabilityRedactionLevel;
  manualReview: boolean;
}

export interface ObservabilityPolicyViolation {
  code:
    | "unknown_artifact_kind"
    | "remote_publication_forbidden"
    | "remote_publication_not_public"
    | "remote_redaction_too_low"
    | "manual_review_required";
  message: string;
}

export interface ObservabilityPolicySummary {
  version: typeof OBSERVABILITY_EVIDENCE_POLICY_VERSION;
  owner: typeof OBSERVABILITY_EVIDENCE_OWNER;
  gameplayAuthority: false;
  rawLocalOnlyKinds: ObservabilityArtifactKind[];
  remoteReviewKinds: ObservabilityArtifactKind[];
  remotePublicKinds: ObservabilityArtifactKind[];
  retentionDays: Record<ObservabilityArtifactKind, number>;
}

export function observabilityArtifactPolicyFor(
  kind: ObservabilityArtifactKind,
): ObservabilityEvidencePolicyEntry {
  return OBSERVABILITY_EVIDENCE_POLICY[kind];
}

export function assertObservabilityEvidencePolicyComplete(): void {
  const keys = Object.keys(OBSERVABILITY_EVIDENCE_POLICY);
  const expected = new Set<string>(OBSERVABILITY_ARTIFACT_KINDS);
  const actual = new Set(keys);
  const missing = OBSERVABILITY_ARTIFACT_KINDS.filter((kind) => !actual.has(kind));
  const extra = keys.filter((kind) => !expected.has(kind));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Observability policy kind mismatch: missing=${missing.join(",")}; extra=${extra.join(",")}.`);
  }
  for (const kind of OBSERVABILITY_ARTIFACT_KINDS) {
    observabilityEvidencePolicyEntrySchema.parse(OBSERVABILITY_EVIDENCE_POLICY[kind]);
  }
}

export function buildObservabilityEvidencePolicySummary(): ObservabilityPolicySummary {
  assertObservabilityEvidencePolicyComplete();
  const rawLocalOnlyKinds: ObservabilityArtifactKind[] = [];
  const remoteReviewKinds: ObservabilityArtifactKind[] = [];
  const remotePublicKinds: ObservabilityArtifactKind[] = [];
  const retentionDays = {} as Record<ObservabilityArtifactKind, number>;

  for (const kind of OBSERVABILITY_ARTIFACT_KINDS) {
    const entry = OBSERVABILITY_EVIDENCE_POLICY[kind];
    retentionDays[kind] = entry.retention.days;
    if (entry.remotePublication === "forbidden") {
      rawLocalOnlyKinds.push(kind);
    } else if (entry.remotePublication === "private-review-only") {
      remoteReviewKinds.push(kind);
    } else {
      remotePublicKinds.push(kind);
    }
  }

  return {
    version: OBSERVABILITY_EVIDENCE_POLICY_VERSION,
    owner: OBSERVABILITY_EVIDENCE_OWNER,
    gameplayAuthority: false,
    rawLocalOnlyKinds,
    remoteReviewKinds,
    remotePublicKinds,
    retentionDays,
  };
}

export function validateObservabilityPublication(
  candidate: ObservabilityPublicationCandidate,
): ObservabilityPolicyViolation[] {
  const entry = OBSERVABILITY_EVIDENCE_POLICY[candidate.kind];
  if (!entry) {
    return [{
      code: "unknown_artifact_kind",
      message: `Unknown observability artifact kind: ${candidate.kind}.`,
    }];
  }
  if (candidate.target === "local-private" || candidate.target === "local-shared") {
    return [];
  }

  const violations: ObservabilityPolicyViolation[] = [];
  if (entry.remotePublication === "forbidden") {
    violations.push({
      code: "remote_publication_forbidden",
      message: `${candidate.kind} is local-only evidence and must not be published remotely.`,
    });
  }
  if (candidate.target === "remote-public" && entry.remotePublication !== "public-summary-allowed") {
    violations.push({
      code: "remote_publication_not_public",
      message: `${candidate.kind} can only be shared in private review bundles, not public evidence.`,
    });
  }
  if (redactionRank[candidate.redactionLevel] < redactionRank[entry.minimumRemoteRedaction]) {
    violations.push({
      code: "remote_redaction_too_low",
      message: `${candidate.kind} requires at least ${entry.minimumRemoteRedaction} before remote publication.`,
    });
  }
  if (entry.requiresManualReview && !candidate.manualReview) {
    violations.push({
      code: "manual_review_required",
      message: `${candidate.kind} requires manual review before remote publication.`,
    });
  }
  return violations;
}

export function assertObservabilityPublicationPolicy(
  candidate: ObservabilityPublicationCandidate,
): void {
  const violations = validateObservabilityPublication(candidate);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join(" "));
  }
}

export function classifyObservabilityArtifactPath(filePath: string): ObservabilityArtifactKind | null {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const leaf = normalized.split("/").pop() ?? normalized;
  if (leaf === "turns.jsonl") return "turns-jsonl";
  if (leaf === "trace.jsonl") return "trace-jsonl";
  if (leaf === "sse-events.jsonl") return "sse-events-jsonl";
  if (leaf === "turn-artifacts.jsonl") return "full-turn-artifacts";
  if (leaf === "world-diffs.jsonl") return "world-diffs-jsonl";
  if (leaf === "job-proposal-ledger.json") return "job-proposal-ledger";
  if (leaf === "latency-context-trace.jsonl") return "latency-context-trace";
  if (leaf === "acceptance-report.json" || leaf === "acceptance-report.md") return "acceptance-report";
  if (leaf === "living-world-assertions.json") return "living-world-assertions";
  if (leaf === "soft-review-packet.md") return "soft-review-packet";
  if (leaf === "soft-review-notes.md") return "soft-review-notes";
  if (leaf.endsWith(".png")) return "screenshots";
  if (normalized.includes("/logs/") && /^turn-\d+-[a-f0-9]+\.jsonl$/u.test(leaf)) return "turn-log-jsonl";
  if (normalized.includes("prompt") && leaf.endsWith(".jsonl")) return "prompt-dump-jsonl";
  return null;
}

const SECRET_KEY_RE = /(?:api[_-]?key|authorization|bearer|token|password|secret|braveapikey|zaiapikey)/iu;
const RAW_PAYLOAD_KEY_RE = /^(?:raw|rawsse|rawssebody|sseevents|fullturnartifact|fullturnartifacts|messages|systemprompt|prompt|promptdump)$/iu;
const HANDLE_KEY_RE = /(?:^|_)(?:campaignid|turnid|sourcecampaignid|clonecampaignid|checkpointid|entityid|locationid|factionid|actorid|proposalid)$/iu;
const PATH_KEY_RE = /(?:path|root|filepath|artifactroot|inputroot|evidencepaths|notepath|screenshotpath)$/iu;
const SECRET_VALUE_RE = /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9_-]{8,}|zai-[A-Za-z0-9_-]{8,})\b/gu;

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function redactStringValue(value: string): string {
  return value.replace(SECRET_VALUE_RE, "[REDACTED_SECRET]");
}

function redactRemoteValue(value: unknown, key: string | null, depth: number): unknown {
  if (depth > 8) return "[REDACTED_MAX_DEPTH]";
  if (value === null || value === undefined) return value;

  if (key && SECRET_KEY_RE.test(key)) return "[REDACTED_SECRET]";
  if (key && RAW_PAYLOAD_KEY_RE.test(key)) return "[REDACTED_RAW_PAYLOAD]";

  if (typeof value === "string") {
    const redacted = redactStringValue(value);
    if (key && HANDLE_KEY_RE.test(key)) return `handle:${shortHash(redacted)}`;
    if (key && PATH_KEY_RE.test(key)) return `path:${shortHash(redacted)}`;
    return redacted;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactRemoteValue(entry, key, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactRemoteValue(childValue, childKey, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redactObservabilityPayloadForRemote<T>(payload: T): unknown {
  return redactRemoteValue(payload, null, 0);
}

assertObservabilityEvidencePolicyComplete();
