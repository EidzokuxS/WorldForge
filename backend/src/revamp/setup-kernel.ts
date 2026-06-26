import type { CampaignKernel, RevampStartingSetup } from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateRevampKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildRevampStartingSetup } from "./starting-setup.js";

export function createRevampStartingSetup(input: {
  campaignId: string;
  mode?: RevampStartingSetup["mode"];
  userStart?: string | null;
}): CampaignKernel {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateRevampKernel(input.campaignId);

  if (currentKernel.phase !== "cast_ready") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot create A7 setup.`, 409);
  }

  const startingSetup = buildRevampStartingSetup({
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
