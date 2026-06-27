import type { CampaignKernel, CampaignStartingSetup } from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateCampaignKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildCampaignStartingSetup } from "./starting-setup.js";

export function createCampaignStartingSetup(input: {
  campaignId: string;
  mode?: CampaignStartingSetup["mode"];
  userStart?: string | null;
}): CampaignKernel {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateCampaignKernel(input.campaignId);

  if (currentKernel.phase !== "cast_ready") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot create A7 setup.`, 409);
  }

  const startingSetup = buildCampaignStartingSetup({
    worldGraph: currentKernel.worldGraph,
    castRegistry: currentKernel.castRegistry,
    mode: input.mode,
    userStart: input.userStart,
  });

  const nextKernel: CampaignKernel = {
    ...currentKernel,
    phase: "setup_ready",
    startingSetup,
    runtimeState: {
      currentSceneId: startingSetup.anchorSceneId,
    },
  };

  writeCampaignKernel(input.campaignId, nextKernel);
  return nextKernel;
}
