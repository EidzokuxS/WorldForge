import { describe, expect, it } from "vitest";

import { readCampaignPlayerCard } from "./campaign-player-card";

function makeChunk(type: string, data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) chunk[4 + index] = type.charCodeAt(index);
  chunk.set(data, 8);
  return chunk;
}

function pngCard(cardJson?: string): ArrayBuffer {
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  if (cardJson !== undefined) {
    const encoded = Buffer.from(cardJson, "utf-8").toString("base64");
    const keyword = new TextEncoder().encode("chara");
    const value = new TextEncoder().encode(encoded);
    const data = new Uint8Array(keyword.length + value.length + 1);
    data.set(keyword);
    data[keyword.length] = 0;
    data.set(value, keyword.length + 1);
    chunks.push(makeChunk("tEXt", data));
  }
  chunks.push(makeChunk("IEND", new Uint8Array()));
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const png = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  return png.buffer;
}

const fullCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Iria Vale",
    description: "A patient cartographer.",
    personality: "Observant",
    scenario: "A city rebuilding after the flood.",
    first_mes: "The ink is still wet.",
    mes_example: "Iria: The river changed its mind.",
    creator_notes: "Keep her practical.",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: ["You found the eastern gate."],
    character_book: null,
    tags: ["cartographer"],
    creator: "WorldForge",
    character_version: "1",
    extensions: { palette: "ember" },
  },
};

describe("readCampaignPlayerCard", () => {
  it("preserves the complete JSON character-card envelope", async () => {
    const cardJson = JSON.stringify(fullCard, null, 2);
    const file = new File([cardJson], "iria.json", { type: "application/json" });

    await expect(readCampaignPlayerCard(file)).resolves.toBe(cardJson);
  });

  it("extracts the complete UTF-8 character card from a PNG tEXt chunk", async () => {
    const cardJson = JSON.stringify({
      ...fullCard,
      data: { ...fullCard.data, name: "Ирия Вейл" },
    });
    const file = new File([pngCard(cardJson)], "iria.png", { type: "image/png" });

    await expect(readCampaignPlayerCard(file)).resolves.toBe(cardJson);
  });

  it("rejects cards outside the canonical envelope", async () => {
    const file = new File([JSON.stringify({ name: "Iria" })], "iria.json");

    await expect(readCampaignPlayerCard(file)).rejects.toThrow("supported 2.0 character-card format");
  });

  it("rejects PNG files without embedded character data", async () => {
    const file = new File([pngCard()], "empty.png", { type: "image/png" });

    await expect(readCampaignPlayerCard(file)).rejects.toThrow("does not contain a character card");
  });
});
