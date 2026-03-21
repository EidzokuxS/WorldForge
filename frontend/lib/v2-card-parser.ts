/** SillyTavern V2 Character Card — fields we extract */
export interface V2ImportPayload {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  tags: string[];
}

/**
 * Parse a SillyTavern V2 card from a .json or .png file.
 * PNG: extracts tEXt chunk with keyword "chara", base64-decodes to JSON.
 * JSON: parses directly.
 */
export async function parseV2CardFile(file: File): Promise<V2ImportPayload> {
  if (file.name.endsWith(".png")) {
    const buf = await file.arrayBuffer();
    return parseV2Png(buf);
  }
  const text = await file.text();
  return parseV2Json(text);
}

function parseV2Json(text: string): V2ImportPayload {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON — not a valid SillyTavern card file.");
  }
  // Accept both root-level V2 and nested data
  const data = obj.spec === "chara_card_v2" ? obj.data : obj.data ?? obj;
  if (!data?.name) throw new Error("Not a valid SillyTavern V2 card (missing name).");
  return {
    name: data.name,
    description: data.description ?? "",
    personality: data.personality ?? "",
    scenario: data.scenario ?? "",
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
}

function parseV2Png(buffer: ArrayBuffer): V2ImportPayload {
  const view = new DataView(buffer);
  // Validate PNG signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== sig[i]) throw new Error("Not a valid PNG file.");
  }
  // Walk chunks looking for tEXt with keyword "chara"
  let offset = 8;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "tEXt") {
      // Read keyword (null-terminated)
      const dataStart = offset + 8;
      let nullPos = dataStart;
      while (nullPos < dataStart + length && view.getUint8(nullPos) !== 0) nullPos++;
      const keyword = new TextDecoder("latin1").decode(
        new Uint8Array(buffer, dataStart, nullPos - dataStart),
      );
      if (keyword.toLowerCase() === "chara") {
        const b64 = new TextDecoder("latin1").decode(
          new Uint8Array(buffer, nullPos + 1, length - (nullPos - dataStart) - 1),
        );
        return parseV2Json(atob(b64));
      }
    }
    offset += 12 + length; // 4 len + 4 type + data + 4 CRC
  }
  throw new Error("No character data found in PNG.");
}
