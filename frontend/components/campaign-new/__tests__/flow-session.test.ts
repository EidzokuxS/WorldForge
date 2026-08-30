import { beforeEach, describe, expect, it } from "vitest";

import {
  isCampaignNewFlowSessionEmpty,
  readCampaignNewFlowSession,
  writeCampaignNewFlowSession,
  type CampaignNewFlowSession,
} from "@/components/campaign-new/flow-session";

const SUGGESTION_ERROR =
  "The generator did not return six valid seed cards. Try again, or write the seed cards yourself.";

const BASE_SESSION: CampaignNewFlowSession = {
  version: 1,
  campaignName: "Arcadia",
  campaignPremise: "A haunted coast.",
  playerIdentityName: "",
  campaignFranchise: "",
  researchEnabled: true,
  selectedWorldbooks: [],
  dnaState: null,
  researchArtifact: null,
  step: 2,
  phase: { kind: "idle" },
};

describe("campaign-new flow session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips a persisted suggestion error", () => {
    writeCampaignNewFlowSession({ ...BASE_SESSION, suggestionError: SUGGESTION_ERROR });

    expect(readCampaignNewFlowSession()).toEqual({
      ...BASE_SESSION,
      suggestionError: SUGGESTION_ERROR,
    });
  });

  it("defaults the optional suggestion error for older version-one sessions", () => {
    writeCampaignNewFlowSession(BASE_SESSION);

    expect(readCampaignNewFlowSession()?.suggestionError).toBeNull();
  });

  it("keeps a failure-only draft visible to the resumed flow", () => {
    const emptySession: CampaignNewFlowSession = {
      ...BASE_SESSION,
      campaignName: "",
      campaignPremise: "",
      step: 1,
    };

    expect(isCampaignNewFlowSessionEmpty(emptySession)).toBe(true);
    expect(isCampaignNewFlowSessionEmpty({ ...emptySession, suggestionError: SUGGESTION_ERROR })).toBe(false);
  });
});
