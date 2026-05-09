import type {
  ScaffoldLocation,
  ScaffoldNpc,
  WorldScaffold,
} from "../../types.js";

type DenseLocationKind = "macro" | "persistent_sublocation";

export type DenseScaffoldLocation = ScaffoldLocation & {
  kind: DenseLocationKind;
  parentLocationName: string | null;
};

export type DenseScaffoldNpc = ScaffoldNpc & {
  sceneLocationName: string | null;
};

export type DenseLocationWorldScaffold = Omit<
  WorldScaffold,
  "locations" | "npcs"
> & {
  locations: DenseScaffoldLocation[];
  npcs: DenseScaffoldNpc[];
};

export const DENSE_LOCATION_EXPECTED = {
  macro: "Dense Transit Ward",
  sublocations: [
    {
      name: "Station Concourse",
      parentLocationName: "Dense Transit Ward",
      kind: "persistent_sublocation",
    },
    {
      name: "Rooftop Service Corridor",
      parentLocationName: "Dense Transit Ward",
      kind: "persistent_sublocation",
    },
    {
      name: "Underground Platform",
      parentLocationName: "Dense Transit Ward",
      kind: "persistent_sublocation",
    },
  ],
  npcScenes: {
    "Transit Warden": {
      broadLocationName: "Dense Transit Ward",
      sceneLocationName: "Station Concourse",
    },
    "Signal Runner": {
      broadLocationName: "Dense Transit Ward",
      sceneLocationName: "Rooftop Service Corridor",
    },
    "Platform Medic": {
      broadLocationName: "Dense Transit Ward",
      sceneLocationName: "Underground Platform",
    },
    "Courier Analyst": {
      broadLocationName: "Dense Transit Ward",
      sceneLocationName: "Station Concourse",
    },
  },
  startingSceneLocationName: "Station Concourse",
} as const;

export function makeDenseLocationScaffold(): DenseLocationWorldScaffold {
  return {
    refinedPremise:
      "A neutral dense transit district under pressure from local emergencies, with explicit physical sublocations and actor placement.",
    locations: [
      {
        name: "Dense Transit Ward",
        description:
          "A busy transit ward containing several distinct persistent scene spaces.",
        tags: ["dense_urban", "transit_hub", "macro_location"],
        isStarting: false,
        connectedTo: ["Market Approach"],
        kind: "macro",
        parentLocationName: null,
      },
      {
        name: "Station Concourse",
        description:
          "The public concourse where travelers, staff, and responders cross paths.",
        tags: ["public", "indoors", "persistent_sublocation"],
        isStarting: true,
        connectedTo: [
          "Dense Transit Ward",
          "Rooftop Service Corridor",
          "Underground Platform",
        ],
        kind: "persistent_sublocation",
        parentLocationName: "Dense Transit Ward",
      },
      {
        name: "Rooftop Service Corridor",
        description:
          "A narrow maintenance route above the main platforms with limited access.",
        tags: ["restricted", "elevated", "persistent_sublocation"],
        isStarting: false,
        connectedTo: ["Dense Transit Ward", "Station Concourse"],
        kind: "persistent_sublocation",
        parentLocationName: "Dense Transit Ward",
      },
      {
        name: "Underground Platform",
        description:
          "A lower platform where stalled trains create a separate crowd pocket.",
        tags: ["underground", "crowded", "persistent_sublocation"],
        isStarting: false,
        connectedTo: ["Dense Transit Ward", "Station Concourse"],
        kind: "persistent_sublocation",
        parentLocationName: "Dense Transit Ward",
      },
      {
        name: "Market Approach",
        description:
          "A neighboring street market outside the transit ward boundary.",
        tags: ["street", "market", "macro_location"],
        isStarting: false,
        connectedTo: ["Dense Transit Ward"],
        kind: "macro",
        parentLocationName: null,
      },
    ],
    factions: [
      {
        name: "Transit Response Office",
        tags: ["civic", "logistics"],
        goals: [
          "Keep public routes clear",
          "Coordinate aid across separated transit spaces",
        ],
        assets: ["maps", "radios", "medical kits"],
        territoryNames: ["Dense Transit Ward"],
      },
    ],
    npcs: [
      {
        name: "Transit Warden",
        persona:
          "Calm coordinator tracking movement between the ward's distinct scene spaces.",
        tags: ["coordinator", "local_authority"],
        goals: {
          shortTerm: ["Keep the concourse orderly"],
          longTerm: ["Restore safe movement through the ward"],
        },
        locationName: "Dense Transit Ward",
        sceneLocationName: "Station Concourse",
        factionName: "Transit Response Office",
        tier: "supporting",
      },
      {
        name: "Signal Runner",
        persona:
          "Fast messenger moving along maintenance paths above the public floors.",
        tags: ["messenger", "observant"],
        goals: {
          shortTerm: ["Relay rooftop access updates"],
          longTerm: ["Maintain alternate routes for responders"],
        },
        locationName: "Dense Transit Ward",
        sceneLocationName: "Rooftop Service Corridor",
        factionName: "Transit Response Office",
        tier: "supporting",
      },
      {
        name: "Platform Medic",
        persona:
          "Field medic triaging people trapped near the lower platform gates.",
        tags: ["medic", "practical"],
        goals: {
          shortTerm: ["Treat injuries on the platform"],
          longTerm: ["Move patients toward safer exits"],
        },
        locationName: "Dense Transit Ward",
        sceneLocationName: "Underground Platform",
        factionName: "Transit Response Office",
        tier: "supporting",
      },
      {
        name: "Courier Analyst",
        persona:
          "Information broker comparing reports from the separate transit spaces.",
        tags: ["analyst", "civilian"],
        goals: {
          shortTerm: ["Verify conflicting location reports"],
          longTerm: ["Build a reliable map of the incident"],
        },
        locationName: "Dense Transit Ward",
        sceneLocationName: "Station Concourse",
        factionName: null,
        tier: "supporting",
      },
    ],
    loreCards: [
      {
        term: "Dense Transit Ward",
        definition:
          "A macro location containing persistent sublocations that must stay distinct for scene presence.",
        category: "location",
      },
      {
        term: "Ward Access Incident",
        definition:
          "A local emergency that separates actors across concourse, rooftop, and platform spaces.",
        category: "event",
      },
    ],
  };
}
