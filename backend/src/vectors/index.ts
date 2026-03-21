export { openVectorDb, closeVectorDb, getVectorDb } from "./connection.js";
export { embedTexts } from "./embeddings.js";
export {
    insertLoreCards,
    insertLoreCardsWithoutVectors,
    searchLoreCards,
    getAllLoreCards,
    deleteCampaignLore,
} from "./lore-cards.js";
export type { LoreCard, LoreCategory, LoreCardRow } from "./lore-cards.js";
