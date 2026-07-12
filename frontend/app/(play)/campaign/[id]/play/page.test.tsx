import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

const page = vi.hoisted(() => ({ render: vi.fn(() => null) }));

vi.mock("@/components/campaign-play/CampaignPlayPage", () => ({
  CampaignPlayPage: page.render,
}));

import CampaignPlayRoute from "./page";

describe("Campaign Play route", () => {
  it("binds the campaign path parameter to the Campaign Play controller", async () => {
    const element = await CampaignPlayRoute({ params: Promise.resolve({ id: "campaign-42" }) });
    expect(isValidElement(element)).toBe(true);
    expect(element.props).toEqual({ campaignId: "campaign-42" });
    expect(element.type).toBe(page.render);
  });
});
