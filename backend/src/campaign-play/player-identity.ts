import {
  normalizeCampaignIdentityName,
  type CampaignPlayerIdentityClaim,
} from "@worldforge/shared";

export type CampaignPlayPlayerIdentityBindingErrorCode =
  | "player_identity_mismatch"
  | "player_identity_conflict";

export class CampaignPlayPlayerIdentityBindingError extends Error {
  constructor(
    readonly code: CampaignPlayPlayerIdentityBindingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CampaignPlayPlayerIdentityBindingError";
  }
}

export function assertCampaignPlayPlayerIdentityBinding(input: {
  playerIdentity?: CampaignPlayerIdentityClaim;
  playerDisplayName: string;
  acceptedActors: ReadonlyArray<{ name: string }>;
}): void {
  if (!input.playerIdentity) return;

  const reservedName = normalizeCampaignIdentityName(input.playerIdentity.displayName);
  if (normalizeCampaignIdentityName(input.playerDisplayName) !== reservedName) {
    throw new CampaignPlayPlayerIdentityBindingError(
      "player_identity_mismatch",
      `Player character name must match the reserved identity "${input.playerIdentity.displayName}".`,
    );
  }

  const conflict = input.acceptedActors.find((actor) =>
    normalizeCampaignIdentityName(actor.name) === reservedName
  );
  if (conflict) {
    throw new CampaignPlayPlayerIdentityBindingError(
      "player_identity_conflict",
      `Player character identity conflicts with existing NPC "${conflict.name}".`,
    );
  }
}
