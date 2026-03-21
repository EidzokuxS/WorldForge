import { describe, it, expect } from "vitest";
import { parseV2CardFile } from "../v2-card-parser";

/** Helper to create a File from a string (JSON). */
function jsonFile(content: string, name = "card.json"): File {
  return new File([content], name, { type: "application/json" });
}

/** Build a minimal valid PNG buffer with an optional tEXt chunk. */
function buildPngBuffer(charaJson?: string): ArrayBuffer {
  const chunks: Uint8Array[] = [];

  // PNG signature
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR chunk: 13 bytes data (1x1 pixel, 8-bit grayscale)
  const ihdrData = new Uint8Array(13);
  // width=1 (4 bytes big endian)
  ihdrData[3] = 1;
  // height=1 (4 bytes big endian)
  ihdrData[7] = 1;
  // bit depth=8, color type=0 (grayscale)
  ihdrData[8] = 8;
  ihdrData[9] = 0;
  chunks.push(makeChunk("IHDR", ihdrData));

  // tEXt chunk with "chara" keyword + base64 JSON
  if (charaJson !== undefined) {
    const b64 = Buffer.from(charaJson).toString("base64");
    const keyword = new TextEncoder().encode("chara");
    const value = new TextEncoder().encode(b64);
    const data = new Uint8Array(keyword.length + 1 + value.length);
    data.set(keyword, 0);
    data[keyword.length] = 0; // null separator
    data.set(value, keyword.length + 1);
    chunks.push(makeChunk("tEXt", data));
  }

  // IEND chunk
  chunks.push(makeChunk("IEND", new Uint8Array(0)));

  // Concatenate all chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}

/** Make a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC (dummy). */
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  // Length (big-endian)
  view.setUint32(0, data.length);
  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  // Data
  chunk.set(data, 8);
  // CRC (dummy - parser doesn't validate CRC)
  view.setUint32(8 + data.length, 0);
  return chunk;
}

describe("parseV2CardFile — JSON", () => {
  it("extracts V2 card fields (name, description, personality, scenario, tags)", async () => {
    const card = {
      spec: "chara_card_v2",
      data: {
        name: "Hero",
        description: "A brave hero",
        personality: "Bold and daring",
        scenario: "Fighting evil",
        tags: ["warrior", "hero"],
      },
    };
    const result = await parseV2CardFile(jsonFile(JSON.stringify(card)));

    expect(result).toEqual({
      name: "Hero",
      description: "A brave hero",
      personality: "Bold and daring",
      scenario: "Fighting evil",
      tags: ["warrior", "hero"],
    });
  });

  it("handles V3 nested data format (spec_version present)", async () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "3.0",
      data: {
        name: "Mage",
        description: "A powerful mage",
        personality: "Wise",
        scenario: "Academy",
        tags: ["mage"],
      },
    };
    const result = await parseV2CardFile(jsonFile(JSON.stringify(card)));

    expect(result.name).toBe("Mage");
    expect(result.tags).toEqual(["mage"]);
  });

  it("handles root-level format (no spec, data at root)", async () => {
    const card = {
      name: "Rogue",
      description: "A sneaky rogue",
      personality: "Cunning",
      scenario: "Thieves guild",
      tags: ["rogue"],
    };
    const result = await parseV2CardFile(jsonFile(JSON.stringify(card)));

    expect(result.name).toBe("Rogue");
    expect(result.description).toBe("A sneaky rogue");
  });

  it("defaults missing fields to empty string/array", async () => {
    const card = { name: "Minimal" };
    const result = await parseV2CardFile(jsonFile(JSON.stringify(card)));

    expect(result).toEqual({
      name: "Minimal",
      description: "",
      personality: "",
      scenario: "",
      tags: [],
    });
  });

  it("throws on invalid JSON", async () => {
    await expect(
      parseV2CardFile(jsonFile("not valid json {{{"))
    ).rejects.toThrow("Invalid JSON");
  });

  it("throws on missing name field", async () => {
    const card = { description: "No name here" };
    await expect(
      parseV2CardFile(jsonFile(JSON.stringify(card)))
    ).rejects.toThrow("missing name");
  });
});

describe("parseV2CardFile — PNG", () => {
  it("extracts character data from tEXt chunk", async () => {
    const card = {
      spec: "chara_card_v2",
      data: {
        name: "PngHero",
        description: "From PNG",
        personality: "Embedded",
        scenario: "Image",
        tags: ["png"],
      },
    };
    const buffer = buildPngBuffer(JSON.stringify(card));
    const file = new File([buffer], "card.png", { type: "image/png" });

    const result = await parseV2CardFile(file);

    expect(result.name).toBe("PngHero");
    expect(result.description).toBe("From PNG");
    expect(result.tags).toEqual(["png"]);
  });

  it("throws for invalid PNG (bad signature)", async () => {
    const badBuffer = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    const file = new File([badBuffer], "bad.png", { type: "image/png" });

    await expect(parseV2CardFile(file)).rejects.toThrow("Not a valid PNG");
  });

  it("throws when no chara tEXt chunk found", async () => {
    const buffer = buildPngBuffer(); // no tEXt chunk
    const file = new File([buffer], "nochara.png", { type: "image/png" });

    await expect(parseV2CardFile(file)).rejects.toThrow("No character data found");
  });
});
