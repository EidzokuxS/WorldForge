export {
  generateImage,
  isImageGenerationEnabled,
  resolveImageProvider,
} from "./generate.js";

export type { GenerateImageOptions } from "./generate.js";

export {
  buildPortraitPrompt,
  buildLocationPrompt,
  buildScenePrompt,
} from "./prompt-builder.js";

export type {
  PortraitPromptOptions,
  LocationPromptOptions,
  ScenePromptOptions,
} from "./prompt-builder.js";

export {
  getImagesDir,
  ensureImageDir,
  getCachedImage,
  cacheImage,
  imageExists,
} from "./cache.js";

export type { ImageType } from "./cache.js";
