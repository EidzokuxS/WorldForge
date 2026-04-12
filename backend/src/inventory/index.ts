export {
  INVENTORY_EQUIP_STATES,
  buildAuthoritativeInventoryView,
  isAuthoritativeItemMetadataEqual,
  loadAuthoritativeInventoryView,
  normalizeInventoryItemName,
  toAuthoritativeItemSeed,
  type AuthoritativeInventoryCompatibility,
  type AuthoritativeInventoryView,
  type AuthoritativeItemRow,
  type InventoryEquipState,
} from "./authority.js";
export { ensureCampaignInventoryAuthority } from "./legacy-migration.js";
