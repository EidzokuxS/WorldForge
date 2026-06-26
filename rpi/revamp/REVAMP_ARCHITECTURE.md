# WorldForge Revamp Architecture

## Objective

Rebuild the playable path from `Create Campaign` to sustained longplay around one explicit spine:

```text
Campaign Kernel
```

The old implementation is a reference source. The revamp path owns new contracts, new proof gates, and new player-visible behavior.

## Campaign Kernel

The kernel stores the campaign truth and calls modules in order.

```ts
type CampaignPhase =
  | "draft"
  | "world_ready"
  | "cast_ready"
  | "setup_ready"
  | "active";

interface CampaignKernel {
  campaignId: string;
  phase: CampaignPhase;

  premise: string;
  worldDna: WorldDNA;
  worldGraph: WorldGraph;
  castRegistry: CastRegistry;
  startingSetup: StartingSetup;

  chatSession: ChatSession;
  turnIndex: number;
}
```

Phase meaning:

```text
draft        -> idea exists
world_ready  -> DNA and world exist
cast_ready   -> player hero and imported cast exist
setup_ready  -> starting situation exists
active       -> play has started
```

## Main Pipeline

```text
New Campaign
-> Premise
-> World DNA
-> World Build
-> Cast Registry
-> WorldGraph
-> Starting Setup
-> GM Opening
-> Chat Loop
```

This is the primary rail. Modules return data to the kernel; the kernel saves the result and advances phase.

## World DNA

DNA remains the first strong world layer.

```ts
interface WorldDNA {
  geography: string;
  politicalStructure: string;
  centralConflict: string;
  culturalFlavor: string;
  environment: string;
  wildcard: string;
}
```

DNA responsibilities:

- set world flavor
- set constraints
- set conflict type
- set location style
- set power style

Example:

```text
politicalStructure = merchant oligarchy
```

This feeds the PowerMap through debts, trade houses, licenses, contraband, patrons, and clients.

## World Build

The world module produces the playable world substrate.

```ts
interface WorldBuild {
  refinedPremise: string;
  locations: LocationNode[];
  sceneLocations: SceneLocationNode[];
  powerMap: PowerMap;
  hooks: HookNode[];
}
```

World Build outputs:

- refined premise
- locations
- scene locations
- power map
- world hooks

Faction becomes a private case of `PowerNode`.

```text
PowerNode examples:
person
family
guild
gang
church
corporation
clan
city council
secret circle
```

## Cast Registry

Cast Registry is the single campaign cast list.

```ts
interface CastRegistry {
  playerCharacter: CastMember;
  importedCast: CastMember[];
  generatedCast: CastMember[];
}

interface CastMember {
  id: string;
  source: CastSource;
  characterDraft: CharacterDraft;
  campaignRole: CampaignRole;
  placement: CastPlacement;
  importance: "primary" | "major" | "minor" | "background";
}

type CastSource =
  | "player_created"
  | "player_imported"
  | "npc_imported"
  | "npc_generated";

type CampaignRole =
  | "player"
  | "companion"
  | "major_npc"
  | "minor_npc"
  | "rival"
  | "enemy"
  | "romance"
  | "background";
```

Priority order:

```text
1. player hero card
2. user's starting description
3. imported characters
4. World DNA
5. generated world
6. GM improvisation
```

## WorldGraph

WorldGraph is the central causality map.

```ts
interface WorldGraph {
  nodes: WorldNode[];
  edges: WorldEdge[];
}

type WorldNode =
  | LocationNode
  | SceneLocationNode
  | CharacterNode
  | PowerNode
  | PressureNode
  | SecretNode
  | ItemNode
  | HookNode;

type WorldEdgeType =
  | "located_at"
  | "route_to"
  | "knows"
  | "fears"
  | "owes"
  | "protects"
  | "controls"
  | "wants_from"
  | "hides"
  | "involved_in"
  | "threatens"
  | "trusts";

interface WorldEdge {
  id: string;
  fromId: string;
  toId: string;
  type: WorldEdgeType;
  data: Record<string, unknown>;
}
```

Example:

```text
Player located_at LanternBar_MainRoom
Mira located_at LanternBar_Backroom
LanternBar_MainRoom route_to LanternBar_Backroom
Mira fears CaptainRoan
CaptainRoan controls HarborPatrol
MissingPackage hides OldCustomsHouse
```

This is the world core.

## Starting Setup

SetupGM creates the first playable situation from an active graph slice.

```ts
interface StartingSetup {
  mode: "gm_invented" | "user_guided";
  anchorSceneId: string;
  playerCharacterId: string;
  presentCastIds: string[];
  nearbyCastIds: string[];
  activePressureIds: string[];
  visibleHooks: string[];
  hiddenTruthIds: string[];
  openingSituation: string;
  openingQuestion: string;
}
```

`user_guided` means the user freely described the start and GM wrapped that description into a playable setup.

## GM Opening

OpeningGM uses:

- player character
- starting setup
- active scene
- present cast
- visible hooks
- active pressure
- DNA tone

Output:

```ts
interface OpeningResult {
  text: string;
  suggestedActions: string[];
}
```

The opening is the first GM answer.

## Chat Loop

The first gameplay loop is intentionally simple.

```text
User Message
-> Chat Context Builder
-> GM Response
-> Append Turn
```

Context:

```ts
interface GmContext {
  playerCharacter: CastMember;
  currentScene: SceneLocationNode;
  presentCast: CastMember[];
  relevantGraphSlice: WorldGraph;
  recentTurns: ChatTurn[];
  tone: WorldDNA;
}
```

Response:

```ts
interface GmResponse {
  text: string;
  softStateHints: SoftStateHint[];
}
```

`softStateHints` feed StateWriter later.

## StateWriter

StateWriter enters after the chat loop proves playability.

```text
GM Response
-> StateWriter
-> proposed changes
-> apply to WorldGraph
```

Change types:

```ts
type StateWriterChange =
  | "MoveCharacter"
  | "RevealSecret"
  | "ChangeRelationship"
  | "AdvancePressure"
  | "AddItem"
  | "RemoveItem"
  | "CreateHook"
  | "ResolveHook";
```

## Module List

```text
CampaignKernel
DnaBuilder
WorldBuilder
CastRegistry
GraphBuilder
SetupGM
OpeningGM
ChatGM
StateWriter
DebugView
```

Kernel calls modules. Modules return results. Kernel persists results.

## Development Order

```text
A0 REVAMP_ARCHITECTURE.md
A1 Campaign Kernel contract
A2 Revamp New Campaign entrypoint
A3 DNA adapter from current worldgen
A4 Locations adapter from current worldgen
A5a Cast Registry adapter
A5b Revamp import/create character wiring
A6 WorldGraph builder
A7 Starting Setup GM
A8 GM Opening
A9 Simple Chat Loop
A10 Debug View
A11 StateWriter
A12 Pressure/World progression
```

## Reference Imports

Use the current system as reference for:

- DNA cards
- premise refinement
- location generation
- scene locations
- CharacterDraft
- character import/create
- NPC drafts
- lore/research context

Translate the faction step into:

```text
PowerMap / PowerNode
```

## First Proof

A2 succeeds when:

```text
Create Campaign
-> revamp campaign shell
-> kernel draft is visible
-> old full worldgen does not run on this path
```

The proof can be a focused automated test or a live local playtest with recorded output. The proof must show the new route and the old route boundary.
