import { describe, expect, it } from "vitest";

import {
  OBSERVABILITY_ARTIFACT_KINDS,
  OBSERVABILITY_EVIDENCE_OWNER,
  OBSERVABILITY_EVIDENCE_POLICY,
  assertObservabilityEvidencePolicyComplete,
  assertObservabilityPublicationPolicy,
  buildObservabilityEvidencePolicySummary,
  classifyObservabilityArtifactPath,
  observabilityArtifactPolicyFor,
  redactObservabilityPayloadForRemote,
  validateObservabilityPublication,
} from "../observability-evidence-policy.js";

describe("observability evidence policy", () => {
  it("keeps one backend-owned, non-gameplay-authoritative policy entry for every artifact kind", () => {
    expect(() => assertObservabilityEvidencePolicyComplete()).not.toThrow();
    expect(Object.keys(OBSERVABILITY_EVIDENCE_POLICY).sort()).toEqual(
      [...OBSERVABILITY_ARTIFACT_KINDS].sort(),
    );

    for (const kind of OBSERVABILITY_ARTIFACT_KINDS) {
      const entry = observabilityArtifactPolicyFor(kind);
      expect(entry.kind).toBe(kind);
      expect(entry.owner).toBe(OBSERVABILITY_EVIDENCE_OWNER);
      expect(entry.gameplayAuthority).toBe(false);
      expect(entry.retention.days).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("fails closed for raw local-only artifacts before any remote publication", () => {
    const violations = validateObservabilityPublication({
      kind: "sse-events-jsonl",
      target: "remote-private-review",
      redactionLevel: "public-projection",
      manualReview: true,
    });

    expect(violations.map((violation) => violation.code)).toContain(
      "remote_publication_forbidden",
    );
    expect(() => assertObservabilityPublicationPolicy({
      kind: "full-turn-artifacts",
      target: "remote-public",
      redactionLevel: "public-projection",
      manualReview: true,
    })).toThrow(/local-only evidence/iu);
  });

  it("requires summary redaction and manual review for private review bundles", () => {
    expect(validateObservabilityPublication({
      kind: "oracle-architecture-bundle",
      target: "remote-private-review",
      redactionLevel: "secret-redacted",
      manualReview: false,
    }).map((violation) => violation.code)).toEqual([
      "remote_redaction_too_low",
      "manual_review_required",
    ]);

    expect(validateObservabilityPublication({
      kind: "oracle-architecture-bundle",
      target: "remote-private-review",
      redactionLevel: "summary-redacted",
      manualReview: true,
    })).toEqual([]);
  });

  it("allows public evidence only after public projection redaction and review when required", () => {
    expect(validateObservabilityPublication({
      kind: "screenshots",
      target: "remote-public",
      redactionLevel: "summary-redacted",
      manualReview: false,
    }).map((violation) => violation.code)).toEqual([
      "remote_redaction_too_low",
      "manual_review_required",
    ]);

    expect(validateObservabilityPublication({
      kind: "acceptance-report",
      target: "remote-public",
      redactionLevel: "public-projection",
      manualReview: false,
    })).toEqual([]);
  });

  it("redacts secrets, raw payloads, raw handles, and local paths from remote summaries", () => {
    const redacted = redactObservabilityPayloadForRemote({
      apiKey: "SECRET_API_KEY",
      headers: { Authorization: "Bearer live-token-123" },
      campaignId: "campaign_123_raw",
      cloneCampaignId: "clone_456_raw",
      artifactRoot: "R:/Projects/WorldForge/output/playwright/raw",
      rawSse: "event: text-delta\ndata: hidden backend payload",
      nested: {
        prompt: "system prompt should never leave raw",
        safeMetric: 42,
      },
    }) as Record<string, unknown>;

    const text = JSON.stringify(redacted);
    expect(text).not.toContain("SECRET_API_KEY");
    expect(text).not.toContain("live-token-123");
    expect(text).not.toContain("campaign_123_raw");
    expect(text).not.toContain("clone_456_raw");
    expect(text).not.toContain("R:/Projects/WorldForge");
    expect(text).not.toContain("hidden backend payload");
    expect(text).not.toContain("system prompt should never leave raw");
    expect(redacted.apiKey).toBe("[REDACTED_SECRET]");
    expect(redacted.campaignId).toMatch(/^handle:[a-f0-9]{12}$/u);
    expect(redacted.artifactRoot).toMatch(/^path:[a-f0-9]{12}$/u);
    expect((redacted.nested as Record<string, unknown>).safeMetric).toBe(42);
  });

  it("classifies phase evidence files to the policy kinds used by report tooling", () => {
    expect(classifyObservabilityArtifactPath("route/sse-events.jsonl")).toBe("sse-events-jsonl");
    expect(classifyObservabilityArtifactPath("route/turn-artifacts.jsonl")).toBe("full-turn-artifacts");
    expect(classifyObservabilityArtifactPath("route/acceptance-report.md")).toBe("acceptance-report");
    expect(classifyObservabilityArtifactPath("campaigns/c1/logs/turn-12-abcdef12.jsonl")).toBe("turn-log-jsonl");
    expect(classifyObservabilityArtifactPath("route/final-state.png")).toBe("screenshots");
    expect(classifyObservabilityArtifactPath("route/unknown.bin")).toBeNull();
  });

  it("exposes a compact summary for acceptance reports without granting gameplay authority", () => {
    const summary = buildObservabilityEvidencePolicySummary();
    expect(summary.gameplayAuthority).toBe(false);
    expect(summary.rawLocalOnlyKinds).toContain("sse-events-jsonl");
    expect(summary.remotePublicKinds).toContain("acceptance-report");
    expect(summary.remoteReviewKinds).toContain("oracle-architecture-bundle");
    expect(summary.retentionDays["sse-events-jsonl"]).toBe(14);
    expect(summary.retentionDays["acceptance-report"]).toBe(365);
  });
});
