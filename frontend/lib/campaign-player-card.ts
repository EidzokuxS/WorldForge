import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const CHARACTER_CARD_SPEC = "chara_card_v2";
const CHARACTER_CARD_VERSION = "2.0";

function decodeBase64Utf8(value: string): string {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("The PNG character data is not valid base64.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The PNG character data is not valid UTF-8.");
  }
}

function validateCharacterCardJson(cardJson: string): string {
  if (new TextEncoder().encode(cardJson).byteLength > CAMPAIGN_PLAY_LIMITS.cardBytes) {
    throw new Error("The character card exceeds the supported size.");
  }

  let value: unknown;
  try {
    value = JSON.parse(cardJson);
  } catch {
    throw new Error("The character card does not contain valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The character card must contain one JSON object.");
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.spec !== CHARACTER_CARD_SPEC || envelope.spec_version !== CHARACTER_CARD_VERSION) {
    throw new Error("The character card must use the supported 2.0 character-card format.");
  }
  if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data)) {
    throw new Error("The character card is missing its data object.");
  }
  return cardJson;
}

function extractCharacterCardFromPng(buffer: ArrayBuffer): string {
  if (buffer.byteLength < PNG_SIGNATURE.length) {
    throw new Error("The selected file is not a valid PNG image.");
  }
  const view = new DataView(buffer);
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (view.getUint8(index) !== PNG_SIGNATURE[index]) {
      throw new Error("The selected file is not a valid PNG image.");
    }
  }

  let offset: number = PNG_SIGNATURE.length;
  while (offset + 12 <= buffer.byteLength) {
    const length = view.getUint32(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.byteLength) {
      throw new Error("The PNG character card is truncated.");
    }
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "tEXt") {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      let separator = dataStart;
      while (separator < dataEnd && view.getUint8(separator) !== 0) separator += 1;
      if (separator < dataEnd) {
        const keyword = new TextDecoder("latin1").decode(
          new Uint8Array(buffer, dataStart, separator - dataStart),
        );
        if (keyword === "chara") {
          const encodedCard = new TextDecoder("latin1").decode(
            new Uint8Array(buffer, separator + 1, dataEnd - separator - 1),
          );
          return decodeBase64Utf8(encodedCard);
        }
      }
    }
    offset = chunkEnd;
  }
  throw new Error("The PNG does not contain a character card.");
}

export async function readCampaignPlayerCard(file: File): Promise<string> {
  const cardJson = file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
    ? extractCharacterCardFromPng(await file.arrayBuffer())
    : await file.text();
  return validateCharacterCardJson(cardJson);
}
