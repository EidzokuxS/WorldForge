export {
  parseCharacterDescription,
  generateCharacter,
  generateCharacterFromArchetype,
} from "./generator.js";
export type { ParsedCharacter } from "./generator.js";

export {
  parseNpcDescription,
  generateNpcFromArchetype,
} from "./npc-generator.js";
export type { GeneratedNpc } from "./npc-generator.js";

export { researchArchetype } from "./archetype-researcher.js";
