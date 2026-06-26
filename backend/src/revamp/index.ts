export {
  REVAMP_KERNEL_FILE_NAME,
  advanceCampaignKernelToWorldReady,
  buildRevampWorldDna,
  getRevampCampaignKernelPath,
  readCampaignKernel,
  writeCampaignKernel,
} from "./dna-adapter.js";

export {
  adaptScaffoldLocationsToWorldGraph,
} from "./locations-adapter.js";

export {
  buildRevampWorldGraph,
} from "./world-graph-builder.js";

export {
  composeRevampKernelWorldGraph,
} from "./graph-kernel.js";

export {
  buildRevampStartingSetup,
} from "./starting-setup.js";

export {
  createRevampStartingSetup,
} from "./setup-kernel.js";

export {
  buildRevampCastRegistry,
} from "./cast-registry-adapter.js";
export type {
  BuildRevampCastRegistryInput,
  RevampDraftCastInput,
  RevampNpcCastSource,
  RevampPlayerCastSource,
  RevampScaffoldNpcCastInput,
} from "./cast-registry-adapter.js";

export {
  readOrCreateRevampKernel,
  saveRevampPlayerCharacter,
} from "./cast-kernel.js";
