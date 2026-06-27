export {
  CAMPAIGN_KERNEL_FILE_NAME,
  advanceCampaignKernelToWorldReady,
  buildCampaignWorldDna,
  getCampaignKernelPath,
  readCampaignKernel,
  writeCampaignKernel,
} from "./dna-adapter.js";

export {
  adaptScaffoldLocationsToWorldGraph,
} from "./locations-adapter.js";

export {
  buildCampaignWorldGraph,
} from "./world-graph-builder.js";

export {
  composeCampaignKernelWorldGraph,
} from "./graph-kernel.js";

export {
  buildCampaignStartingSetup,
} from "./starting-setup.js";

export {
  createCampaignStartingSetup,
} from "./setup-kernel.js";

export {
  buildCampaignOpening,
} from "./opening-gm.js";

export {
  createCampaignOpening,
} from "./opening-kernel.js";
export type {
  CreateCampaignOpeningResult,
} from "./opening-kernel.js";

export {
  buildCampaignGmResponse,
} from "./chat-gm.js";

export {
  createCampaignChatMessage,
} from "./chat-kernel.js";
export type {
  CreateCampaignChatMessageResult,
} from "./chat-kernel.js";

export {
  buildCampaignDebugSnapshot,
} from "./debug-snapshot.js";

export {
  applyCampaignStateHints,
  applyCampaignStateWriter,
} from "./state-writer.js";
export type {
  ApplyCampaignStateWriterResult,
} from "./state-writer.js";

export {
  buildCampaignCastRegistry,
} from "./cast-registry-adapter.js";
export type {
  BuildCampaignCastRegistryInput,
  CampaignDraftCastInput,
  CampaignNpcCastSource,
  CampaignPlayerCastSource,
  CampaignScaffoldNpcCastInput,
} from "./cast-registry-adapter.js";

export {
  readOrCreateCampaignKernel,
  saveCampaignPlayerCharacter,
} from "./cast-kernel.js";
