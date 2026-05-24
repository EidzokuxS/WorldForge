import { describe, expect, it } from "vitest";
import {
  createTurnWriteScopeLedger,
  findConflictingWriteScope,
  reserveActorWriteScopes,
  writeScopesConflict,
} from "../simulation-write-scope.js";

describe("simulation write scope contracts", () => {
  it("treats broad parent scopes as conflicting with specific child scopes", () => {
    expect(writeScopesConflict("npc:clerk", "npc:clerk:state")).toBe(true);
    expect(writeScopesConflict("location:market:presence", "location:market")).toBe(true);
    expect(writeScopesConflict("player:hero:state", "player:hero")).toBe(true);
    expect(writeScopesConflict("item:receipt:holder", "item:receipt")).toBe(true);
    expect(writeScopesConflict("npc:clerk", "npc:guard")).toBe(false);
    expect(writeScopesConflict("player:hero", "player:rival")).toBe(false);
    expect(writeScopesConflict("item:receipt", "item:coin")).toBe(false);
  });

  it("reserves actor jobs in order and serializes later conflicting jobs", () => {
    expect(
      reserveActorWriteScopes([
        { actorId: "npc-a", route: "required_before_done", writeScopes: ["location:market:presence"] },
        { actorId: "npc-b", route: "required_before_done", writeScopes: ["location:market"] },
      ]),
    ).toEqual([
      {
        actorId: "npc-a",
        route: "required_before_done",
        writeScopes: ["location:market:presence"],
        status: "reserved",
        conflictsWithActorIds: [],
      },
      {
        actorId: "npc-b",
        route: "required_before_done",
        writeScopes: ["location:market"],
        status: "conflict_serialized",
        conflictsWithActorIds: ["npc-a"],
      },
    ]);
  });

  it("finds blocked write scopes with normalized refs", () => {
    expect(findConflictingWriteScope({
      writeScopes: [" NPC:Clerk:State "],
      blockedWriteScopes: ["npc:clerk"],
    })).toEqual({
      writeScope: " NPC:Clerk:State ",
      blockedWriteScope: "npc:clerk",
    });
  });

  it("records turn-owned claims and rejects a later owner touching an earlier scope", () => {
    const ledger = createTurnWriteScopeLedger();

    expect(ledger.claim({
      owner: "gm_tool_loop",
      ownerId: "gm",
      phase: "gm_tool_loop",
      writeScopes: ["npc:clerk:state", "world:dialogue"],
    })).toBeNull();

    const conflict = ledger.claim({
      owner: "actor_reaction",
      ownerId: "npc-clerk",
      phase: "actor_reactions",
      writeScopes: ["npc:clerk"],
    });

    expect(conflict).toMatchObject({
      incoming: {
        owner: "actor_reaction",
        ownerId: "npc-clerk",
        phase: "actor_reactions",
        writeScopes: ["npc:clerk"],
      },
      existing: {
        owner: "gm_tool_loop",
        ownerId: "gm",
        phase: "gm_tool_loop",
        writeScopes: ["npc:clerk:state", "world:dialogue"],
      },
      writeScope: "npc:clerk",
      blockedWriteScope: "npc:clerk:state",
    });
    expect(ledger.blockedWriteScopes()).toEqual(["npc:clerk:state", "world:dialogue"]);
  });

  it("does not drop player or item scopes from turn owner claims", () => {
    const ledger = createTurnWriteScopeLedger();

    expect(ledger.claim({
      owner: "gm_tool_loop",
      ownerId: "gm",
      phase: "gm_tool_loop",
      writeScopes: ["player:hero:state", "item:receipt:holder"],
    })).toBeNull();

    expect(ledger.claim({
      owner: "actor_reaction",
      ownerId: "npc-clerk",
      phase: "actor_reactions",
      writeScopes: ["player:hero", "item:receipt"],
    })).toMatchObject({
      writeScope: "player:hero",
      blockedWriteScope: "player:hero:state",
    });
    expect(ledger.blockedWriteScopes()).toEqual(["player:hero:state", "item:receipt:holder"]);
  });
});
