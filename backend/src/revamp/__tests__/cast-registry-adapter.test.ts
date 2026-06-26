import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import type { ScaffoldNpc } from "../../worldgen/types.js";
import { buildRevampCastRegistry } from "../cast-registry-adapter.js";

function makeDraft(
  name: string,
  role: CharacterDraft["identity"]["role"] = "npc",
  tier: CharacterDraft["identity"]["tier"] = "supporting",
): CharacterDraft {
  return {
    identity: {
      role,
      tier,
      displayName: name,
      canonicalStatus: "original",
    },
    profile: {
      species: "human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: `${name} keeps their own counsel.`,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "location:lantern-bar",
      currentLocationName: "Lantern Bar",
      relationshipRefs: [],
      socialStatus: [],
      originMode: role === "player" ? "native" : "resident",
    },
    motivations: {
      shortTermGoals: ["Stay alive"],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {
      startLocationId: "location:lantern-bar",
    },
    provenance: {
      sourceKind: role === "player" ? "player-input" : "import",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function makeNpc(name: string, tier: ScaffoldNpc["tier"] = "supporting"): ScaffoldNpc {
  return {
    name,
    persona: `${name} watches the harbor doors.`,
    tags: ["harbor"],
    goals: {
      shortTerm: ["Find the missing package"],
      longTerm: [],
    },
    locationName: "Lantern Bar",
    sceneLocationName: "Lantern Bar Back Room",
    factionName: "Dock Guild",
    tier,
  };
}

describe("revamp cast registry adapter", () => {
  it("builds player, imported, and generated cast buckets", () => {
    const player = makeDraft("Mira Vale", "player", "key");
    const imported = makeDraft("Captain Roan", "npc", "key");
    const generated = makeNpc("Dock Informant");

    const registry = buildRevampCastRegistry({
      playerCharacter: {
        draft: player,
        source: "player_imported",
        placement: { sceneLocationId: "scene:lantern-bar-main-room" },
      },
      importedCast: [
        {
          draft: imported,
          source: "npc_imported",
          campaignRole: "rival",
          placement: { notes: ["imported from character card"] },
        },
      ],
      generatedCast: [{ npc: generated, source: "npc_generated" }],
    });

    expect(registry.playerCharacter).toMatchObject({
      source: "player_imported",
      campaignRole: "player",
      importance: "primary",
      characterDraft: {
        identity: {
          role: "player",
          tier: "key",
          displayName: "Mira Vale",
        },
      },
      placement: {
        locationId: "location:lantern-bar",
        sceneLocationId: "scene:lantern-bar-main-room",
      },
    });
    expect(registry.importedCast).toHaveLength(1);
    expect(registry.importedCast[0]).toMatchObject({
      source: "npc_imported",
      campaignRole: "rival",
      importance: "major",
      characterDraft: {
        identity: {
          role: "npc",
          displayName: "Captain Roan",
        },
      },
    });
    expect(registry.importedCast[0]?.placement.notes).toContain("imported from character card");

    expect(registry.generatedCast).toHaveLength(1);
    expect(registry.generatedCast[0]).toMatchObject({
      source: "npc_generated",
      campaignRole: "minor_npc",
      importance: "minor",
      characterDraft: {
        identity: {
          role: "npc",
          displayName: "Dock Informant",
        },
      },
    });
    expect(registry.generatedCast[0]?.placement.notes).toContain("currentLocationName=Lantern Bar");
    expect(registry.generatedCast[0]?.placement.notes).toContain("sceneLocationName=Lantern Bar Back Room");
  });

  it("fails closed when a cast member name is empty", () => {
    expect(() =>
      buildRevampCastRegistry({
        playerCharacter: { draft: makeDraft(" ", "player", "key") },
      }),
    ).toThrow("Cast member name is required before A5 can run.");
  });

  it("fails closed when cast names duplicate across buckets", () => {
    expect(() =>
      buildRevampCastRegistry({
        playerCharacter: { draft: makeDraft("Mira Vale", "player", "key") },
        importedCast: [{ draft: makeDraft(" mira vale "), source: "npc_imported" }],
      }),
    ).toThrow("Cast member mira vale duplicates Mira Vale before A5 can run.");
  });

  it("maps key generated NPCs to major cast importance", () => {
    const registry = buildRevampCastRegistry({
      generatedCast: [{ npc: makeNpc("Satoru Gojo", "key"), source: "npc_generated" }],
    });

    expect(registry.generatedCast[0]).toMatchObject({
      campaignRole: "major_npc",
      importance: "major",
    });
  });

  it("maps temporary generated NPCs to background cast role", () => {
    const temporaryDraft = makeDraft("Passing Dockworker", "npc", "temporary");
    const registry = buildRevampCastRegistry({
      generatedCast: [{ draft: temporaryDraft, source: "npc_generated" }],
    });

    expect(registry.generatedCast[0]).toMatchObject({
      campaignRole: "background",
      importance: "background",
    });
  });

  it("does not import old route or generator implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/revamp/cast-registry-adapter.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/worldgen/generate");
    expect(source).not.toContain("generateCharacter");
    expect(source).not.toContain("parse-character");
    expect(source).not.toContain("import-v2-card");
    expect(source).not.toContain("scaffold-generator");
  });
});
