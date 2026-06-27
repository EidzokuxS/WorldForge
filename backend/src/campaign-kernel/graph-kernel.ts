import type { CampaignKernel } from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateCampaignKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildCampaignWorldGraph } from "./world-graph-builder.js";

export function composeCampaignKernelWorldGraph(campaignId: string): CampaignKernel {
  assertSafeId(campaignId);
  const currentKernel = readOrCreateCampaignKernel(campaignId);

  if (currentKernel.phase !== "cast_ready") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot compose A6 graph.`, 409);
  }

  if (!currentKernel.castRegistry.playerCharacter) {
    throw new AppError("A6 graph composition requires a player cast member.", 409);
  }

  const nextKernel: CampaignKernel = {
    ...currentKernel,
    worldGraph: buildCampaignWorldGraph({
      baseGraph: currentKernel.worldGraph,
      castRegistry: currentKernel.castRegistry,
    }),
  };

  writeCampaignKernel(campaignId, nextKernel);
  return nextKernel;
}
