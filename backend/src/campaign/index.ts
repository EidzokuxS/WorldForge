export {
  readCampaignConfig,
  listCampaigns,
  createCampaign,
  loadCampaign,
  deleteCampaign,
  markGenerationComplete,
  getActiveCampaign,
  incrementTick,
} from "./manager.js";
export type { CampaignMeta } from "./manager.js";

export {
  getCampaignPremise,
  getChatHistory,
  appendChatMessages,
  popLastMessages,
  replaceChatMessage,
  getLastPlayerAction,
} from "./chat-history.js";

export {
  assertSafeId,
  CAMPAIGNS_DIR,
  getCampaignDir,
  getCampaignConfigPath,
  getChatHistoryPath,
  getCheckpointsDir,
  getCheckpointDir,
} from "./paths.js";

export {
  createCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  pruneAutoCheckpoints,
} from "./checkpoints.js";
export type { CheckpointMeta } from "./checkpoints.js";
