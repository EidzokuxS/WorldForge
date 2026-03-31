import type { IpResearchContext } from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { interpretPremiseDivergence } from "./premise-divergence.js";

/**
 * Deprecated compatibility shim.
 *
 * Live worldgen now consumes PremiseDivergence directly and keeps IpResearchContext
 * immutable. Legacy callers may still import this helper, so keep the signature
 * but delegate interpretation to the structured divergence path without mutating
 * canonical names, key facts, or legacy cached fields.
 */
export async function applyPremiseCharacterOverrides(
  ipContext: IpResearchContext | null | undefined,
  premise: string,
  role: ResolvedRole,
): Promise<IpResearchContext | null> {
  if (!ipContext) return null;

  await interpretPremiseDivergence(ipContext, premise, role);
  return ipContext;
}
