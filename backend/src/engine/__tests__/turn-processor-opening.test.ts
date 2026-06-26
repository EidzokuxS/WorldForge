import { describe, expect, it } from "vitest";

import {
  buildOpeningNarrationEvidence,
  collectOpeningDisallowedActorNames,
  collectOpeningImmediateNpcNames,
  selectOpeningEvidenceCandidates,
  type OpeningEvidenceCandidate,
} from "../turn-processor.js";
import type { SceneAssembly } from "../scene-assembly.js";
import type { WorldBrainSceneDirection } from "../world-brain.js";

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

  it("keeps the player label out of opening private actor terms", () => {
    const sceneDirection: WorldBrainSceneDirection = {
      situationSummary: "Tiamat feels the station air tighten around the ticket gates.",
      sceneQuestion: "What does Tiamat do before the crowd notices?",
      focalActorNames: ["Tiamat"],
      backgroundActorNames: ["Hidden Handler"],
      presenceReasons: [
        {
          actorName: "Hidden Handler",
          reason: "watching the crossing from a service balcony",
          perceivable: false,
        },
      ],
      causalBeats: [],
      narrationGuardrails: [],
    };
    const sceneAssembly = {
      presentNpcNames: ["Hidden Handler"],
      awareness: {
        byNpcName: {
          "Hidden Handler": "hidden",
        },
      },
    } as unknown as SceneAssembly;

    const disallowed = collectOpeningDisallowedActorNames({
      sceneAssembly,
      sceneDirection,
      visibleDirection: sceneDirection,
      playerLabel: "Tiamat",
      allowedNpcNames: [],
    });

    expect(disallowed).not.toContain("Tiamat");
    expect(disallowed).toContain("Hidden Handler");
  });

  it("prioritizes a playable start page over duplicate exposition", () => {
    const candidates: OpeningEvidenceCandidate[] = [
      {
        slot: "local_lens",
        sourcePath: "opening.currentScene.name",
        summary: "Tiamat starts at The Copper Tap.",
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
        sourcePath: "opening.playerPerceivableSceneDirection.sceneQuestion",
        summary: "What do you do before the sluice fire catches another seal?",
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
      "opening.entryPressure[0]",
      "opening.currentScene.description[0]",
      "opening.presentNpcNames",
      "opening.playerPerceivableSceneDirection.sceneQuestion",
    ]);
    expect(selected.map((candidate) => candidate.slot)).toContain("scene_texture");
  });

  it("keeps route labels out of opening narration evidence", () => {
    const visibleDirection: WorldBrainSceneDirection = {
      situationSummary: "Rainwater gathers at the ticket gates while the crowd hesitates.",
      sceneQuestion: "What do you do before the crowd closes around you?",
      focalActorNames: ["Tiamat"],
      backgroundActorNames: [],
      presenceReasons: [],
      causalBeats: [
        {
          summary: "Fluorescent lights buzz over a stalled ticket gate.",
          perceivable: true,
        },
      ],
      narrationGuardrails: [],
    };
    const sceneAssembly = {
      openingScene: true,
      openingState: {
        active: true,
        locationId: "loc-shibuya-side-street",
        locationName: "Shibuya Side Street",
        arrivalMode: "on-foot",
        startingVisibility: "noticed",
        immediateSituation: "A commuter wave breaks around the narrow side street.",
        entryPressure: ["sirens cut in and out beyond the station glass"],
        promptLines: [],
        sceneContextLines: [],
      },
      currentScene: {
        id: "loc-shibuya-side-street",
        name: "Shibuya Side Street",
        description: "Rain beads on closed shutters under a flickering station sign.",
        tags: ["urban", "station-edge"],
        kind: "persistent_sublocation",
        connectedPaths: [
          { label: "Tokyo Jujutsu High" },
          { label: "Shibuya Scramble Crossing Rally Point" },
        ],
      },
      presentNpcNames: [],
      sceneDirection: visibleDirection,
      playerPerceivableSceneDirection: visibleDirection,
      awareness: {
        contract: {},
        byNpcName: {},
        clearNpcNames: [],
        hintSignals: [],
      },
      recentContext: [],
      sceneEffects: [],
      playerPerceivableConsequences: [],
    } as unknown as SceneAssembly;

    const evidence = buildOpeningNarrationEvidence({
      campaignId: "campaign-1",
      currentTick: 0,
      playerLabel: "Tiamat",
      sceneAssembly,
      visibleDirection,
      visibleSummary: visibleDirection.situationSummary,
      allowedPresenceActorNames: [],
      forbiddenTerms: [],
    });
    const evidenceText = [
      ...evidence.evidenceLedger.map((entry) => `${entry.summary} ${entry.sourceId}`),
      ...evidence.sourceLinkedSummaries.map((summary) => summary.summary),
    ].join("\n");

    expect(evidenceText).toContain("Tiamat starts at Shibuya Side Street.");
    expect(evidenceText).toContain("What do you do before the crowd closes around you?");
    expect(evidenceText).toContain("Rain beads on closed shutters under a flickering station sign.");
    expect(evidenceText).not.toContain("You are in Shibuya Side Street.");
    expect(evidenceText).not.toContain("inside Shibuya");
    expect(evidenceText).not.toContain("The opening moment starts");
    expect(evidenceText).not.toContain("The next move belongs");
    expect(evidenceText).not.toContain("Tokyo Jujutsu High");
    expect(evidenceText).not.toContain("Shibuya Scramble Crossing Rally Point");
    expect(evidenceText).not.toContain("connectedPaths");
  });

  it("rejects macro current scenes before building opening narration evidence", () => {
    const visibleDirection: WorldBrainSceneDirection = {
      situationSummary: "Rainwater gathers at the ticket gates while the crowd hesitates.",
      sceneQuestion: "What do you do before the crowd closes around you?",
      focalActorNames: ["Tiamat"],
      backgroundActorNames: [],
      presenceReasons: [],
      causalBeats: [],
      narrationGuardrails: [],
    };
    const sceneAssembly = {
      openingScene: true,
      currentScene: {
        id: "loc-shibuya",
        name: "Shibuya District",
        description: "Underground passages and side streets braid beneath the station.",
        tags: ["urban", "station"],
        kind: "macro",
      },
      presentNpcNames: [],
      sceneDirection: visibleDirection,
      playerPerceivableSceneDirection: visibleDirection,
      awareness: {
        contract: {},
        byNpcName: {},
        clearNpcNames: [],
        hintSignals: [],
      },
      recentContext: [],
      sceneEffects: [],
      playerPerceivableConsequences: [],
    } as unknown as SceneAssembly;

    let thrown: unknown;
    try {
      buildOpeningNarrationEvidence({
        campaignId: "campaign-1",
        currentTick: 0,
        playerLabel: "Tiamat",
        sceneAssembly,
        visibleDirection,
        visibleSummary: visibleDirection.situationSummary,
        allowedPresenceActorNames: [],
        forbiddenTerms: [],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(
      'Opening scene cannot narrate from macro location "Shibuya District"',
    );
  });
});
