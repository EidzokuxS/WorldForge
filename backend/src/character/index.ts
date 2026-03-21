export {
  parseCharacterDescription,
  generateCharacter,
  generateCharacterFromArchetype,
  mapV2CardToCharacter,
} from "./generator.js";
export type { ParsedCharacter } from "./generator.js";

export {
  parseNpcDescription,
  mapV2CardToNpc,
  generateNpcFromArchetype,
} from "./npc-generator.js";
export type { GeneratedNpc } from "./npc-generator.js";

export { researchArchetype } from "./archetype-researcher.js";
