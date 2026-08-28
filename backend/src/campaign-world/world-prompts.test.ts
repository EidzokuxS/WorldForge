import { describe, expect, it } from "vitest";
import type { CampaignWorldSource } from "@worldforge/shared";
import type {
  WorldCastPacket,
  WorldCastSkeletonPacket,
  WorldFramePacket,
} from "./contracts.js";
import {
  buildWorldCastPrompt,
  buildWorldCastDetailPrompt,
  buildWorldCastDetailBatchPrompt,
  buildWorldCastSkeletonPrompt,
  buildWorldConnectionsPrompt,
  buildWorldConnectionsTransportPrompt,
  buildWorldFrameAndCastSkeletonPrompt,
  buildWorldFramePrompt,
} from "./world-prompts.js";

const detailAdditionalGoalsContractFragments = [
  "For additionalGoals, return either [] or one or two complete rows.",
  "Each row contains exactly objective, motivation, horizon, and priority in that order;",
  '"additionalGoals":[]',
  '"additionalGoals":[{"objective":"Secure the bell ledger before the next tide.","motivation":"The ledger reveals which route can still carry supplies.","horizon":"immediate","priority":3}]',
  "Never omit priority or return a partial row.",
  "Before returning, check that every nested row has all four keys exactly once",
];

const source: CampaignWorldSource = {
  campaignId: "campaign-a",
  premise: "A drowned rail kingdom listens for impossible bells.",
  dna: null,
  researchSummary: null,
  sourceReferences: [],
  sourceDigest: "source-digest",
};

const frame: WorldFramePacket = {
  worldSummary: "The last dry route crosses a drowned kingdom.",
  locations: [
    { locationRef: "location:signal-region", name: "Signal Region", description: "A rail region.", kind: "macro", parentLocationRef: null, tags: ["rail"], isStarting: true },
    { locationRef: "location:signal-yard", name: "Signal Yard", description: "A dry junction.", kind: "persistent_sublocation", parentLocationRef: "location:signal-region", tags: ["rail"], isStarting: false },
  ],
  routes: [{ fromLocationRef: "location:signal-yard", toLocationRef: "location:signal-yard", travelCost: 1 }],
};

const cast: WorldCastPacket = {
  actors: [],
  goals: [],
  placements: [],
};

const skeleton: WorldCastSkeletonPacket = {
  actors: [{
    name: "Mara Venn",
    role: "key",
    summary: "A signal keeper who must choose which route ledger to trust.",
    presentLocationIndex: 0,
    homeLocationIndex: null,
    objective: "Map the next route change before the bell tide turns.",
  }],
};

const batchSkeleton: WorldCastSkeletonPacket = {
  actors: [
    {
      name: "Mara Venn",
      role: "key",
      summary: "A signal keeper who must choose which route ledger to trust.",
      presentLocationIndex: 0,
      homeLocationIndex: null,
      objective: "Map the next route change before the bell tide turns.",
    },
    {
      name: "Ivo Rusk",
      role: "support",
      summary: "A ferry pilot hiding a debt to the drowned rail court.",
      presentLocationIndex: 0,
      homeLocationIndex: null,
      objective: "Deliver the sealed timetable before the next bell tide.",
    },
  ],
};

describe("Campaign World prompts", () => {
  it("keeps canonical identity and current want in the skeleton while moving detail to the keyed detail actor", () => {
    const skeletonPrompt = buildWorldCastSkeletonPrompt(source, frame);
    expect(skeletonPrompt).toContain(
      "Return exactly these eight top-level actor slots, in this order: keyActorOne, keyActorTwo, startingSupport, supportActor, remoteBackground, backgroundActor, otherActorOne, otherActorTwo, with no extra keys.",
    );
    expect(skeletonPrompt).toContain("Every slot is one object. keyActorOne and keyActorTwo use role key; startingSupport and supportActor use role support; remoteBackground and backgroundActor use role background; otherActorOne and otherActorTwo use role key, support, or background.");
    expect(skeletonPrompt).toContain("The startingSupport and remoteBackground anchor objects contain exactly these five keys in this order: name, role, summary, homeLocationIndex, objective.");
    expect(skeletonPrompt).toContain("The other six actor objects contain exactly these six keys in this order: name, role, summary, presentLocationIndex, homeLocationIndex, objective.");
    expect(skeletonPrompt).toContain("Code assigns startingSupport's present scene to the first persistent scene under the accepted starting macro and remoteBackground's present scene to the first persistent scene outside that macro.");
    expect(skeletonPrompt).toContain("Do not emit, copy, infer, calculate, or mention a presentLocationIndex for either anchor.");
    expect(skeletonPrompt).not.toContain("startingSupport.presentLocationIndex must equal STARTING_SUPPORT_SLOT.index");
    expect(skeletonPrompt).not.toContain("remoteBackground.presentLocationIndex must equal REMOTE_BACKGROUND_SLOT.index");
    expect(skeletonPrompt).not.toContain("omit presentLocationIndex");
    expect(skeletonPrompt).toContain("Use homeLocationIndex -1 when no home scene is needed");
    expect(skeletonPrompt).toContain("STARTING_SUPPORT_SLOT");
    expect(skeletonPrompt).toContain("REMOTE_BACKGROUND_SLOT");
    expect(skeletonPrompt).not.toContain("Fixed groups omit role because code assigns key, support, or background");
    expect(skeletonPrompt).toContain(
      "All names, summaries, and objectives remain model-authored canonical fields",
    );
    expect(skeletonPrompt).toContain("Create exactly eight mechanically active, future-relevant named people");
    expect(skeletonPrompt).not.toContain("keyActors");
    expect(skeletonPrompt).not.toContain("supportActors");
    expect(skeletonPrompt).not.toContain("backgroundActors");
    expect(skeletonPrompt).not.toContain("otherActors");
    expect(skeletonPrompt).toContain(
      "Named or unnamed incidental people and exchanges that create no future reliance or consequence are atmosphere, not actor rows.",
    );
    expect(skeletonPrompt).toContain(
      "Never mention slot indices, array positions, parentMacroIndex, macro numbers, schema fields, or transport mechanics",
    );
    expect(skeletonPrompt).toContain(
      "every objective concrete enough to drive a playable choice",
    );
    expect(skeletonPrompt).toContain(
      "Do not return traits, tags, motivation, horizon, priority, additional goals, or any other detail-stage field.",
    );
    expect(skeletonPrompt).not.toContain(
      "Each actors[] object contains exactly name, role, summary, traits",
    );

    const detailPrompt = buildWorldCastDetailPrompt(source, frame, skeleton);
    expect(detailPrompt).toContain(
      "Fill exactly the detail fields traits, motivation, horizon, priority, tags, and zero to two additional goals.",
    );
    expect(detailPrompt).toContain(
      "Traits, motivation, horizon, and priority must coherently expand the exact skeleton summary and objective without rewriting either one.",
    );
    expect(detailPrompt).toContain(
      "Traits and tags are arrays of at most 20 one-line strings each.",
    );
    expect(detailPrompt).toContain(
      "Keep every trait and tag at 80 characters or fewer.",
    );
    expect(detailPrompt).toContain(
      "Use concise independent labels rather than sentence paragraphs",
    );
    expect(detailPrompt).toContain(
      "Each actors[] object contains exactly actorIndex, traits, motivation, horizon, priority, tags, and additionalGoals.",
    );
    expect(detailPrompt).toContain("actorIndex must be copied from the accepted skeleton index and must be an integer from 0 through 0");
    for (const fragment of detailAdditionalGoalsContractFragments) {
      expect(detailPrompt).toContain(fragment);
    }
    expect(detailPrompt).not.toContain(
      "The skeleton owns each person's name, role, summary, traits, placement, and core objective/motivation/horizon/priority",
    );
  });

  it("shows each detail batch its full context and only assigned canonical actor fields", () => {
    const detailBatchPrompt = buildWorldCastDetailBatchPrompt(source, frame, batchSkeleton, [0]);

    expect(detailBatchPrompt).toContain(source.premise);
    expect(detailBatchPrompt).toContain("WORLD_FRAME");
    expect(detailBatchPrompt).toContain("ASSIGNED_ACTORS");
    expect(detailBatchPrompt).not.toContain(
      `WORLD_CAST_SKELETON\n${JSON.stringify(batchSkeleton)}\nEND_WORLD_CAST_SKELETON`,
    );
    expect(detailBatchPrompt).not.toContain(
      'DETAIL_ACTOR_SLOTS\n[{"detailSlotIndex":0,"actorIndex":0}]\nEND_DETAIL_ACTOR_SLOTS',
    );

    const assignedActorsJson = detailBatchPrompt.match(
      /ASSIGNED_ACTORS\r?\n([\s\S]*?)\r?\nEND_ASSIGNED_ACTORS/,
    )?.[1];
    expect(assignedActorsJson).toBeDefined();
    if (assignedActorsJson === undefined) throw new Error("Assigned actor context is missing.");
    expect(JSON.parse(assignedActorsJson)).toEqual([{
      detailSlotIndex: 0,
      actorIndex: 0,
      name: "Mara Venn",
      role: "key",
      summary: "A signal keeper who must choose which route ledger to trust.",
      presentLocationIndex: 0,
      homeLocationIndex: null,
      objective: "Map the next route change before the bell tide turns.",
    }]);
    expect(detailBatchPrompt).not.toContain("Ivo Rusk");
    expect(detailBatchPrompt).not.toContain("A ferry pilot hiding a debt to the drowned rail court.");
    expect(detailBatchPrompt).not.toContain("Deliver the sealed timetable before the next bell tide.");
    expect(detailBatchPrompt).toContain("Treat those assigned canonical fields as read-only");
    expect(detailBatchPrompt).toContain("Every local detailSlotIndex must appear exactly once.");
    expect(detailBatchPrompt).toContain(
      "Fill exactly the detail fields traits, motivation, horizon, priority, tags, and additionalGoals.",
    );
    expect(detailBatchPrompt).toContain("For each actor, return 2-4 short traits and 2-4 short tags");
    expect(detailBatchPrompt).toContain("each trait and tag must be <=48 characters");
    expect(detailBatchPrompt).toContain("motivation as one concise sentence <=160 characters");
    expect(detailBatchPrompt).toContain("Return additionalGoals: [] for every actor by default");
    expect(detailBatchPrompt).toContain("At most one actor in this batch may receive one additional goal");
    expect(detailBatchPrompt).toContain("objective and motivation are each one concise sentence <=140 characters");
    expect(detailBatchPrompt).toContain("Every actor retains the required core goal from the accepted skeleton");
    expect(detailBatchPrompt).toContain("Every additional goal contains exactly objective, motivation, horizon, and priority");
    expect(detailBatchPrompt).toContain(
      "Each actors[] object contains exactly detailSlotIndex, traits, motivation, horizon, priority, tags, and additionalGoals.",
    );
    expect(detailBatchPrompt).toContain(
      "Never emit actorIndex, actorRef, locationRef, presentLocationIndex, homeLocationIndex, name, role, summary, placements, kind, controller, or any extra key.",
    );
  });

  it("grounds indexed connections in exact skeleton identity, want, and placements", () => {
    const prompt = buildWorldConnectionsTransportPrompt(source, frame, skeleton);
    expect(prompt).toContain(
      "each actor's exact name, role, summary, objective, presentLocationIndex, and homeLocationIndex to choose meaningful relation endpoints and pressure anchors.",
    );
    expect(prompt).toContain("actor indices are integers from 0 through 0");
    expect(prompt).toContain("persistent location indices are integers from 0 through 0");
    expect(prompt).toContain("RELATION_SLOTS");
    expect(prompt).toContain("ALLOWED_ACTOR_INDICES");
    expect(prompt).toContain('"relationSlotIndex"');
    expect(prompt).toContain('"targetActorIndex"');
    expect(prompt).toContain(
      "return exactly one relation row for every integer in RELATION_SLOTS, exactly once",
    );
    expect(prompt).toContain(
      "must differ from relationSlotIndex",
    );
    expect(prompt).toContain("Never calculate or derive the target from the source index");
    expect(prompt).toContain(
      "Each relations[] object contains exactly relationSlotIndex, targetActorIndex, relationType, and intensity.",
    );
    expect(prompt).toContain(
      "Code builds each persisted relation summary from those accepted actor names and relationType; do not return summary, rationale, actor names, or any other relation prose.",
    );
    expect(prompt).not.toContain("targetOffset");
    expect(prompt).not.toContain("Keep each relation summary to one sentence <=120 characters");
    expect(prompt).toContain("Keep each pressure name <=64 characters");
    expect(prompt).toContain("description to one sentence <=160 characters");
    expect(prompt).toContain("trajectory to one sentence <=120 characters");
    expect(prompt).toContain("Create 3 or 4 distinct pressures grounded in the source");
    expect(prompt).toContain("using only the concrete actor and location anchors each pressure needs");
    expect(prompt).not.toContain(
      "each actor's name, role, summary, traits, core objective, motivation, horizon, priority, presentLocationIndex, and homeLocationIndex",
    );
  });

  it("defines macro regions as grouping only and routes as concrete-scene travel", () => {
    const prompt = buildWorldFramePrompt(source);

    expect(prompt).toContain("A macro region groups and selects scenes. It is not a place anyone can occupy or visit.");
    expect(prompt).toContain("Every locationRef value must be a full identifier in the exact form location:<lowercase-kebab-case>");
    expect(prompt).toContain("Every non-null parentLocationRef, fromLocationRef, and toLocationRef must repeat one of those full location:<lowercase-kebab-case> identifiers exactly.");
    expect(prompt).toContain("Every persistent sublocation is one concrete, directly perceivable scene");
    expect(prompt).toContain("Its description is shown verbatim to the player whenever that scene is current.");
    expect(prompt).toContain("The campaign source may explicitly state a secret, concealed discovery, private motive, disputed hidden cause, future event, or another actor's private knowledge.");
    expect(prompt).toContain("Do not copy, paraphrase, confirm, or imply that protected truth in any location description.");
    expect(prompt).toContain("Describe only its publicly perceivable surface; later cast goals, relations, and pressures own the protected claim.");
    expect(prompt).toContain("Every route connects persistent sublocations directly, never macro regions.");
    expect(prompt).toContain("The directed graph of persistent sublocations must be strongly connected");
  });

  it("uses structural indexed rows only in the tool-mode frame contract", () => {
    const prompt = buildWorldFramePrompt(source, true);

    expect(prompt).toContain(
      "Code assigns stable location references from array order, so never return locationKey or any other free-form reference.",
    );
    expect(prompt).toContain(
      "Return exactly three macroLocations, then exactly six persistentLocations.",
    );
    expect(prompt).toContain(
      "The persistentLocations array is indexed 0 through 5.",
    );
    expect(prompt).toContain(
      "Use this fixed allocation: rows 0 and 1 use parentMacroIndex 0, rows 2 and 3 use parentMacroIndex 1, and rows 4 and 5 use parentMacroIndex 2.",
    );
    expect(prompt).toContain(
      "Do not return a seventh persistentLocations row.",
    );
    expect(prompt).toContain(
      "startingMacroIndex selects one macroLocations row.",
    );
    expect(prompt).toContain(
      "Each persistentLocations row uses parentMacroIndex to index macroLocations.",
    );
    expect(prompt).toContain(
      "Each macro region has exactly two direct persistent sublocations, using the fixed parentMacroIndex allocation above.",
    );
    expect(prompt).toContain(
      "Each route uses required fromPersistentIndex and toPersistentIndex values that index persistentLocations; the two indices must differ.",
    );
    expect(prompt).toContain(
      "Do not return kind, isStarting, parentLocationRef, fromLocationRef, or toLocationRef in tool mode.",
    );
    expect(prompt).toContain("Return every required key once and no extra keys.");
    expect(prompt).toContain("Keep worldSummary to 300 characters or fewer");
    expect(prompt).toContain("Create 8 to 10 directed routes");
    expect(prompt).toContain("a directed cycle that visits all six persistent scenes");
    expect(prompt).toContain("at least two cross-links between scenes in different macro regions");
    expect(prompt).not.toContain("six or seven persistentLocations");
    expect(prompt).not.toContain("at least two persistentLocations");
    expect(prompt).not.toContain("at least two direct persistent sublocations");
    expect(prompt).not.toContain("Every locationRef value must be a full identifier");
  });

  it("combines the frame and cast skeleton in one strict tool prompt", () => {
    const prompt = buildWorldFrameAndCastSkeletonPrompt(source);

    expect(prompt).toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");
    expect(prompt).toContain(
      "return the compact starting cast skeleton under exactly these eight top-level actor slots, in this order: keyActorOne, keyActorTwo, startingSupport, supportActor, remoteBackground, backgroundActor, otherActorOne, otherActorTwo",
    );
    expect(prompt).toContain(
      "Named or unnamed incidental people and exchanges may remain atmospheric when they create no future reliance or consequence; they do not need actor rows.",
    );
    expect(prompt).toContain("Create exactly eight mechanically active, future-relevant named people.");
    expect(prompt).toContain(
      "Every mechanically active actor must have a unique full name across all eight slots.",
    );
    expect(prompt).toContain(
      "Compare names after case/whitespace normalization: ignore letter case, trim surrounding whitespace, and collapse repeated spaces.",
    );
    expect(prompt).toContain(
      "Names must identify distinct people, not repeated aliases.",
    );
    expect(prompt).toContain(
      "Return exactly one object in each slot. keyActorOne and keyActorTwo use role key; startingSupport and supportActor use role support; remoteBackground and backgroundActor use role background; otherActorOne and otherActorTwo use role key, support, or background.",
    );
    expect(prompt).toContain(
      "The startingSupport and remoteBackground anchor objects contain exactly these five keys in this order: name, role, summary, homeLocationIndex, objective.",
    );
    expect(prompt).toContain(
      "The other six actor objects contain exactly these six keys in this order: name, role, summary, presentLocationIndex, homeLocationIndex, objective.",
    );
    expect(prompt).toContain(
      "Code assigns the present scene for startingSupport to the first persistent scene under the accepted starting macro and assigns the present scene for remoteBackground to the first persistent scene outside that macro.",
    );
    expect(prompt).toContain(
      "Do not emit, copy, infer, calculate, or mention a presentLocationIndex for either anchor.",
    );
    expect(prompt).not.toContain("Use this exact anchor table");
    expect(prompt).not.toContain("Copy these exact integers directly");
    expect(prompt).not.toContain("startingSupport.presentLocationIndex =");
    expect(prompt).not.toContain("remoteBackground.presentLocationIndex =");
    expect(prompt).toContain("never return locationKey or any other free-form reference");
    for (const forbidden of ["keyActors", "supportActors", "backgroundActors", "otherActors"]) {
      expect(prompt).not.toContain(forbidden);
    }
    const skeletonParagraph = prompt.slice(
      prompt.indexOf("WORLD_CAST_SKELETON_IN_SAME_PACKET"),
      prompt.indexOf("END_WORLD_CAST_SKELETON_IN_SAME_PACKET"),
    );
    expect(skeletonParagraph).toContain(
      "The startingSupport and remoteBackground anchor objects contain exactly these five keys in this order: name, role, summary, homeLocationIndex, objective.",
    );
    expect(skeletonParagraph).toContain(
      "The other six actor objects contain exactly these six keys in this order: name, role, summary, presentLocationIndex, homeLocationIndex, objective.",
    );
    expect(skeletonParagraph).toContain(
      "Do not emit, copy, infer, calculate, or mention a presentLocationIndex for either anchor.",
    );
    expect(skeletonParagraph).not.toContain("Use this exact anchor table");
    expect(skeletonParagraph).not.toContain("Copy these exact integers directly");
  });

  it("allows cast placements only at exact concrete scenes", () => {
    const prompt = buildWorldCastPrompt(source, frame);

    expect(prompt).toContain("[\"location:signal-yard\"]");
    expect(prompt).not.toContain("[\"location:signal-region\",\"location:signal-yard\"]");
    expect(prompt).toContain("Present and home placements must name exact persistent sublocations, never macro regions.");
    expect(prompt).toContain("A present placement means the person is directly perceivable and identifiable by name whenever the player shares that exact scene.");
    expect(prompt).toContain("place them in a different persistent sublocation instead of the same scene");
    expect(prompt).toContain("At least one support person must have a present placement whose locationRef is copied from STARTING_MACRO_SCENE_REFS.");
    expect(prompt).toContain("the support person must be present in a persistent sublocation under the sole starting macro");
    expect(prompt).toContain("Set every goal priority to an integer from 1 (lowest) through 5 (highest).");
  });

  it("pins the strict cast object fields and forbids extra keys", () => {
    const prompt = buildWorldCastPrompt(source, frame);

    expect(prompt).toContain(
      "Return exactly the top-level keys actors, goals, and placements, with no extra keys.",
    );
    expect(prompt).toContain(
      "Each actors[] object contains exactly actorRef, kind, controller, role, name, summary, traits, and tags.",
    );
    expect(prompt).toContain(
      "Each goals[] object contains exactly actorRef, objective, motivation, horizon, priority, and status.",
    );
    expect(prompt).toContain(
      "Each placements[] object contains exactly actorRef, locationRef, and placementKind.",
    );
    expect(prompt).toContain(
      "Keep all descriptive detail in those existing fields; do not invent fields or add keys.",
    );
  });

  it("treats a structured reservation and abbreviated premise reference as player-owned", () => {
    const claimedSource: CampaignWorldSource = {
      ...source,
      premise: "Brina arrives at the drowned rail kingdom before the bells ring.",
      playerIdentity: { displayName: "Brina Hael" },
    };
    const prompt = buildWorldCastPrompt(claimedSource, frame);

    expect(prompt).toContain('"displayName":"Brina Hael"');
    expect(prompt).toContain("When the premise mentions or abbreviates this reserved name");
    expect(prompt).toContain("Do not create that person, an alias of that person, or a stand-in");
    expect(buildWorldCastPrompt(source, frame)).not.toContain("PLAYER_IDENTITY_RESERVATION");
  });

  it("requires pressures to anchor exact concrete scenes", () => {
    const prompt = buildWorldConnectionsPrompt(source, frame, cast);

    expect(prompt).toContain("Every pressure must name at least one person anchor and one exact persistent-sublocation anchor.");
    expect(prompt).toContain("A macro region cannot anchor a pressure.");
    expect(prompt).toContain("At least one pressure must copy one value from ELIGIBLE_STARTING_SUPPORT_SCENE_REFS into pressures[].locationRefs[].");
    expect(prompt).toContain("the pressure must anchor the same persistent scene where a support person from the cast is present under the sole starting macro");
    expect(prompt).toContain("[\"location:signal-yard\"]");
  });

  it("pins the strict connections object fields and relation enum", () => {
    const prompt = buildWorldConnectionsPrompt(source, frame, cast);

    expect(prompt).toContain("Return every required key exactly once and no extra keys.");
    expect(prompt).toContain(
      "Each relations[] object contains exactly sourceActorRef, targetActorRef, relationType, summary, and intensity.",
    );
    expect(prompt).toContain(
      "Each pressures[] object contains exactly name, description, trajectory, urgency, actorRefs, and locationRefs.",
    );
    expect(prompt).toContain(
      "Each relation must connect two different people; sourceActorRef and targetActorRef must be different allowed actor refs, never equal.",
    );
    expect(prompt).toContain(
      "relationType must be exactly one of alliance, rivalry, authority, dependency, kinship, association, or hostility.",
    );
  });
});
