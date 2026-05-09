import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@worldforge/shared";
import { CONTINUE_ACTION_PAYLOAD, deriveDisplayBeats, getInitialBeatIndex } from "../display-beats";

const assistantMessage = (content: string): ChatMessage => ({
  role: "assistant",
  content,
});

describe("deriveDisplayBeats", () => {
  it("splits the latest settled assistant narration into readable narration and dialogue beats", () => {
    const beats = deriveDisplayBeats({
      messages: [
        assistantMessage(
          [
            "Rain turns the platform lights into long red cuts.",
            '"Stay close," Nobara says.',
            "The train doors grind open.",
            "A cold pressure moves under the tracks.",
            "You have a moment before it surfaces.",
            "The crowd holds its breath.",
          ].join("\n\n"),
        ),
      ],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: null,
      quickActions: [],
    });

    expect(beats).toHaveLength(5);
    expect(beats.map((beat) => beat.kind)).toEqual([
      "narration",
      "dialogue",
      "narration",
      "narration",
      "narration",
    ]);
    expect(beats[0].text).toContain("Rain turns");
    expect(beats[1].speaker).toBe("Nobara");
  });

  it("creates player-facing progress beats without raw SSE event names", () => {
    const beats = deriveDisplayBeats({
      messages: [],
      turnPhase: "finalizing",
      sceneProgress: "scene-settling",
      oracleResult: null,
      travelFeedback: null,
      quickActions: [],
    });

    expect(beats).toEqual([
      expect.objectContaining({
        kind: "progress",
        text: "Settling",
      }),
    ]);
    expect(JSON.stringify(beats)).not.toContain("scene-settling");
    expect(JSON.stringify(beats)).not.toContain("finalizing_turn");
  });

  it("keeps oracle math in raw details while showing a fiction-facing mechanic label", () => {
    const beats = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: {
        chance: 65,
        roll: 42,
        outcome: "strong_hit",
        reasoning: "The player has leverage from cover and timing.",
      },
      travelFeedback: null,
      quickActions: [],
    });

    expect(beats[0]).toMatchObject({
      kind: "mechanical_result",
      text: "Clean success",
      mechanic: {
        label: "Clean success",
        outcome: "strong_hit",
      },
      rawDetails: {
        chance: 65,
        roll: 42,
        reasoning: "The player has leverage from cover and timing.",
      },
    });
    expect(beats[0].text).not.toContain("65");
    expect(beats[0].text).not.toContain("42");
    expect(beats[0].text).not.toContain("leverage");
  });

  it("uses costly success and miss labels for weaker oracle outcomes", () => {
    const weak = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: { chance: 50, roll: 49, outcome: "weak_hit", reasoning: "Barely works." },
      travelFeedback: null,
      quickActions: [],
    });
    const miss = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: { chance: 50, roll: 65, outcome: "miss", reasoning: "Too late." },
      travelFeedback: null,
      quickActions: [],
    });

    expect(weak[0].text).toBe("Costly success");
    expect(miss[0].text).toBe("Miss");
  });

  it("uses close call and bad break labels for miss margins without exposing oracle math", () => {
    const closeCall = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: { chance: 65, roll: 68, outcome: "miss", reasoning: "Only just fails." },
      travelFeedback: null,
      quickActions: [],
    });
    const badBreak = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: { chance: 65, roll: 98, outcome: "miss", reasoning: "Everything cuts against the player." },
      travelFeedback: null,
      quickActions: [],
    });

    expect(closeCall[0].text).toBe("Close call");
    expect(badBreak[0].text).toBe("Bad break");
    expect(JSON.stringify(closeCall[0].mechanic)).not.toContain("65");
    expect(JSON.stringify(badBreak[0].mechanic)).not.toContain("98");
  });

  it("creates travel state-change beats only from travel feedback", () => {
    const beats = deriveDisplayBeats({
      messages: [{ role: "user", content: "go to the archive" }],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: "You arrive at the Old Archive.",
      quickActions: [],
    });

    expect(beats).toContainEqual(
      expect.objectContaining({
        kind: "state_change",
        text: "You arrive at the Old Archive.",
      }),
    );

    const noFeedback = deriveDisplayBeats({
      messages: [{ role: "user", content: "go to the archive" }],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: null,
      quickActions: [],
    });

    expect(noFeedback.some((beat) => beat.kind === "state_change")).toBe(false);
  });

  it("creates choice beats only from settled quick actions", () => {
    const beats = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: null,
      quickActions: [{ label: "Question Nobara", action: "Ask Nobara what she saw." }],
    });

    expect(beats).toContainEqual(
      expect.objectContaining({
        kind: "choice",
        choices: [{ label: "Question Nobara", action: "Ask Nobara what she saw." }],
      }),
    );
  });

  it("adds compact side remarks and input handoff only when the turn is ready", () => {
    const beats = deriveDisplayBeats({
      messages: [],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: null,
      quickActions: [],
      sideRemarks: [{ actorName: "Nobara", text: "She taps a nail against her hammer." }],
    });

    expect(beats).toEqual([
      expect.objectContaining({
        kind: "side_remark",
        visualPriority: "secondary",
        speaker: "Nobara",
      }),
      expect.objectContaining({
        kind: "input_handoff",
        unlocksActionDock: true,
      }),
    ]);
  });

  it("attaches stage signals to the active beat as presentation records", () => {
    const beats = deriveDisplayBeats({
      messages: [assistantMessage("The lights flicker once.")],
      turnPhase: "idle",
      sceneProgress: null,
      oracleResult: null,
      travelFeedback: null,
      quickActions: [],
      stageSignals: [{ id: "sig-1", kind: "flash", text: "Neon flare" }],
    });

    expect(beats[0].stageSignals).toEqual([
      expect.objectContaining({
        id: "sig-1",
        clearOn: "next",
      }),
    ]);
  });

  it("exports a single Continue route compatibility payload and starts at the latest beat", () => {
    expect(CONTINUE_ACTION_PAYLOAD).toBe("Continue scene.");
    expect(getInitialBeatIndex([{ id: "a", kind: "narration", text: "A" }])).toBe(0);
    expect(getInitialBeatIndex([])).toBe(0);
  });
});

describe("DisplayBeat adapter boundary", () => {
  it("does not import backend transport helpers", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/display-beats.ts", "utf8"),
    );

    expect(source).not.toContain("chatAction");
    expect(source).not.toContain("parseTurnSSE");
    expect(source).not.toContain("getWorldData");
  });
});
