import { createHash } from "node:crypto";

export const PUBLIC_DTO_HANDLE_KIND_VALUES = [
  "actor",
  "event",
  "faction",
  "item",
  "place",
  "relationship",
  "route",
  "template",
  "entity",
] as const;

export type PublicDtoHandleKind = (typeof PUBLIC_DTO_HANDLE_KIND_VALUES)[number];

export function toPublicDtoHandle(input: {
  campaignId: string;
  kind: PublicDtoHandleKind;
  sourceId: string | number | null | undefined;
}): string | null {
  const sourceId = input.sourceId == null ? "" : String(input.sourceId).trim();
  if (!sourceId) {
    return null;
  }

  const digest = createHash("sha256")
    .update(`phase95-public-dto:v1:${input.campaignId}:${input.kind}:${sourceId}`)
    .digest("hex")
    .slice(0, 32);
  return `pdto_${input.kind}_${digest}`;
}

export function requirePublicDtoHandle(input: {
  campaignId: string;
  kind: PublicDtoHandleKind;
  sourceId: string | number;
}): string {
  const handle = toPublicDtoHandle(input);
  if (!handle) {
    throw new Error(`Unable to issue public DTO handle for ${input.kind}.`);
  }
  return handle;
}

export function isPublicDtoHandleForKind(
  value: string,
  kind: PublicDtoHandleKind,
): boolean {
  return new RegExp(`^pdto_${kind}_[a-f0-9]{32}$`).test(value);
}

export function resolvePublicDtoHandle<T extends { id: string }>(input: {
  campaignId: string;
  kind: PublicDtoHandleKind;
  handle: string;
  rows: readonly T[];
}): T | null {
  if (!isPublicDtoHandleForKind(input.handle, input.kind)) {
    return null;
  }

  return input.rows.find((row) => (
    toPublicDtoHandle({
      campaignId: input.campaignId,
      kind: input.kind,
      sourceId: row.id,
    }) === input.handle
  )) ?? null;
}
