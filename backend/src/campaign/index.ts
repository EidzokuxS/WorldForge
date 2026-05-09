export {
  readCampaignConfig,
  listCampaigns,
  createCampaign,
  loadCampaign,
  deleteCampaign,
  markGenerationComplete,
  saveIpContext,
  loadIpContext,
  savePremiseDivergence,
  loadPremiseDivergence,
  saveWorldgenResearchFrame,
  loadWorldgenResearchFrame,
  saveWorldgenResearchArtifact,
  loadWorldgenResearchArtifact,
  getActiveCampaign,
  advanceCampaignTick,
  incrementTick,
  listPersonaTemplates,
  getPersonaTemplate,
  savePersonaTemplates,
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
  getCampaignsDir,
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
