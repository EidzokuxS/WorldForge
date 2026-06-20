import { describe, expect, it } from "vitest";

import {
  collectOpeningImmediateNpcNames,
  selectOpeningEvidenceCandidates,
  type OpeningEvidenceCandidate,
} from "../turn-processor.js";
import type { SceneAssembly } from "../scene-assembly.js";

describe("opening narration evidence selection", () => {
  it("uses clear awareness names as immediate opening NPC handles", () => {
    const assembly = {
      currentScene: {
        id: "scene-1",
        name: "The Copper Tap",
        description: "",
        tags: [],
        kind: "persistent_sublocation",
      },
      presentNpcNames: [],
      awareness: {
        clearNpcNames: ["Old Route Hand Sessik", "Tap-Keeper Brost"],
      },
    } as unknown as SceneAssembly;

    expect(collectOpeningImmediateNpcNames(assembly)).toEqual([
      "Old Route Hand Sessik",
      "Tap-Keeper Brost",
    ]);
  });

  it("keeps macro-location NPCs out of immediate opening handles", () => {
    const assembly = {
      currentScene: {
        id: "scene-1",
        name: "Shibuya",
        description: "",
        tags: ["macro"],
        kind: "macro",
      },
      presentNpcNames: ["Kafka"],
      awareness: {
        clearNpcNames: ["Kafka"],
      },
    } as unknown as SceneAssembly;

    expect(collectOpeningImmediateNpcNames(assembly)).toEqual([]);
  });

  it("prioritizes a playable start page over duplicate exposition", () => {
    const candidates: OpeningEvidenceCandidate[] = [
      {
        slot: "local_lens",
        sourcePath: "opening.currentScene.name",
        summary: "You are at The Copper Tap.",
      },
      {
        slot: "immediate_pressure",
        sourcePath: "opening.immediateSituation",
        summary: "A retired signal-house dispatcher brokers all seal-and-key deals from behind the counter.",
      },
      {
        slot: "immediate_pressure",
        sourcePath: "opening.entryPressure[0]",
        summary: "The bartender burns any seal with an unverified signature in the sluice fire.",
      },
      {
        slot: "sensed_handle",
        sourcePath: "opening.sceneContextLines[0]",
        summary: "Signal Thieves control the tavern, giving them leverage over the local courier trade.",
      },
      {
        slot: "action_handle",
        sourcePath: "opening.currentScene.connectedPaths",
        summary: "From The Copper Tap, the clearest ways out point toward Lowwater Bazaar and Silt Warrens.",
      },
      {
        slot: "scene_texture",
        sourcePath: "opening.currentScene.description[0]",
        summary: "A squat stone tavern sits wedged between two brick sluice gates.",
      },
      {
        slot: "scene_texture",
        sourcePath: "opening.currentScene.description[1]",
        summary: "Off-duty night couriers crowd the bar while a retired signal-house dispatcher brokers deals.",
      },
      {
        slot: "visible_people",
        sourcePath: "opening.presentNpcNames",
        summary: "Old Route Hand Sessik and Tap-Keeper Brost are in view.",
      },
    ];

    const selected = selectOpeningEvidenceCandidates(candidates);

    expect(selected.map((candidate) => candidate.sourcePath)).toEqual([
      "opening.currentScene.name",
      "opening.currentScene.description[0]",
      "opening.entryPressure[0]",
      "opening.presentNpcNames",
      "opening.currentScene.connectedPaths",
    ]);
  });
});
