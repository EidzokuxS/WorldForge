import { describe, expect, it } from "vitest";

describe("resolveScenePresence", () => {
  it("separates presence, awareness, and knowledge basis for encounter scope instead of broad-location membership", async () => {
    const { resolveScenePresence } = await import("../scene-presence.js");

    const snapshot = resolveScenePresence({
      playerActorId: "player-1",
      broadLocationId: "shibuya-district",
      sceneScopeId: "platform-7",
      actors: [
        {
          actorId: "player-1",
          actorType: "player",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "clear",
        },
        {
          actorId: "yuji",
          actorType: "npc",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "clear",
        },
        {
          actorId: "gojo",
          actorType: "npc",
          broadLocationId: "shibuya-district",
          sceneScopeId: "rooftop-overwatch",
          visibility: "clear",
        },
      ],
    });

    expect(snapshot.presentActorIds).toEqual(["player-1", "yuji"]);
    expect(snapshot.awarenessByObserver.player_1?.yuji).toBe("clear");
    expect(snapshot.awarenessByObserver.player_1?.gojo).toBe("none");
    expect(snapshot.knowledgeBasisByObserver.player_1?.yuji).toBe("perceived_now");
    expect(snapshot.knowledgeBasisByObserver.player_1?.gojo).toBe("none");
  });

  it("keeps hidden but present actors inside presence while only surfacing awareness hints", async () => {
    const { resolveScenePresence } = await import("../scene-presence.js");

    const snapshot = resolveScenePresence({
      playerActorId: "player-1",
      broadLocationId: "shibuya-district",
      sceneScopeId: "platform-7",
      actors: [
        {
          actorId: "player-1",
          actorType: "player",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "clear",
        },
        {
          actorId: "sukuna-vessel",
          actorType: "npc",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "hidden",
          awarenessHint: "A pressure shift crawls across the platform edge.",
        },
      ],
    });

    expect(snapshot.presentActorIds).toContain("sukuna-vessel");
    expect(snapshot.awarenessByObserver.player_1?.sukuna_vessel).toBe("hint");
    expect(snapshot.playerAwarenessHints).toContain(
      "A pressure shift crawls across the platform edge.",
    );
    expect(snapshot.knowledgeBasisByObserver.player_1?.sukuna_vessel).toBe("none");
  });

  it("requires a justified knowledge basis before NPC recognition crosses encounter boundaries", async () => {
    const { resolveScenePresence } = await import("../scene-presence.js");

    const snapshot = resolveScenePresence({
      playerActorId: "player-1",
      broadLocationId: "shibuya-district",
      sceneScopeId: "platform-7",
      actors: [
        {
          actorId: "nanami",
          actorType: "npc",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "clear",
        },
        {
          actorId: "unknown-curse-user",
          actorType: "npc",
          broadLocationId: "shibuya-district",
          sceneScopeId: "platform-7",
          visibility: "hint",
        },
      ],
      priorKnowledge: [
        {
          observerActorId: "nanami",
          subjectActorId: "player-1",
          knowledgeBasis: "prior_relation",
        },
      ],
    });

    expect(snapshot.knowledgeBasisByObserver.nanami?.player_1).toBe("prior_relation");
    expect(snapshot.knowledgeBasisByObserver.nanami?.unknown_curse_user).toBe("none");
  });
});
