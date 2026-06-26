import type {
  CampaignKernel,
  RevampOpeningResult,
} from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateRevampKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";
import { buildRevampOpening } from "./opening-gm.js";

export interface CreateRevampOpeningResult {
  kernel: CampaignKernel;
  opening: RevampOpeningResult;
}

export function createRevampOpening(input: {
  campaignId: string;
  createdAt?: number;
}): CreateRevampOpeningResult {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateRevampKernel(input.campaignId);

  if (currentKernel.phase !== "setup_ready") {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot create A8 opening.`, 409);
  }
  if (!currentKernel.startingSetup) {
    throw new AppError("A8 opening requires starting setup.", 409);
  }
  if (currentKernel.chatSession.turns.length !== 0) {
    throw new AppError("A8 opening requires an empty chat session.", 409);
  }

  const opening = buildRevampOpening({
    worldGraph: currentKernel.worldGraph,
    castRegistry: currentKernel.castRegistry,
    startingSetup: currentKernel.startingSetup,
    worldDna: currentKernel.worldDna,
  });
  const nextKernel: CampaignKernel = {
    ...currentKernel,
    phase: "active",
    chatSession: {
      turns: [
        {
          role: "assistant",
          content: opening.text,
          createdAt: input.createdAt ?? Date.now(),
        },
      ],
    },
    turnIndex: 1,
  };

  writeCampaignKernel(input.campaignId, nextKernel);
  return { kernel: nextKernel, opening };
}
