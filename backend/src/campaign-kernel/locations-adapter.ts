import type {
  CampaignWorldEdge,
  CampaignWorldGraph,
  CampaignWorldNode,
} from "@worldforge/shared";
import type { ScaffoldLocation } from "../worldgen/types.js";
import { AppError } from "../lib/index.js";

type LocationInput = Pick<
  ScaffoldLocation,
  "name" | "description" | "tags" | "isStarting" | "connectedTo" | "kind" | "parentLocationName"
>;

type LocationRecord = {
  input: LocationInput;
  key: string;
  id: string;
  type: CampaignWorldNode["type"];
};

function hashText(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeLocationName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new AppError("Location name is required before A4 can run.", 400);
  }
  return normalized;
}

function locationKey(name: string): string {
  return normalizeLocationName(name).toLocaleLowerCase("en-US");
}

function slugForName(name: string): string {
  const readable = normalizeLocationName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = hashText(name);
  return readable ? `${readable}-${hash}` : hash;
}

function locationNodeType(location: LocationInput): CampaignWorldNode["type"] {
  return location.kind === "persistent_sublocation" ? "SceneLocation" : "Location";
}

function locationNodeId(location: LocationInput): string {
  const prefix = locationNodeType(location) === "SceneLocation" ? "scene" : "location";
  return `${prefix}:${slugForName(location.name)}`;
}

function normalizeTags(tags: readonly string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function createLocationRecords(locations: readonly LocationInput[]): LocationRecord[] {
  const byKey = new Map<string, LocationRecord>();
  const records: LocationRecord[] = [];

  for (const location of locations) {
    const name = normalizeLocationName(location.name);
    const description = location.description.trim();
    if (!description) {
      throw new AppError(`Location ${name} requires a description before A4 can run.`, 400);
    }

    const key = locationKey(name);
    if (byKey.has(key)) {
      throw new AppError(`Location ${name} is duplicated before A4 can run.`, 400);
    }

    const record: LocationRecord = {
      input: {
        ...location,
        name,
        description,
        tags: normalizeTags(location.tags),
        connectedTo: location.connectedTo.map((target) => normalizeLocationName(target)),
        parentLocationName: location.parentLocationName?.trim() || null,
      },
      key,
      id: locationNodeId(location),
      type: locationNodeType(location),
    };
    byKey.set(key, record);
    records.push(record);
  }

  return records;
}

function requireLocationRecord(
  byKey: ReadonlyMap<string, LocationRecord>,
  sourceName: string,
  targetName: string,
  relation: "route" | "parent",
): LocationRecord {
  const target = byKey.get(locationKey(targetName));
  if (!target) {
    const detail = relation === "route" ? "route target" : "parent location";
    throw new AppError(`Location ${sourceName} references missing ${detail} ${targetName}.`, 400);
  }
  return target;
}

function locationRecordToNode(record: LocationRecord): CampaignWorldNode {
  return {
    id: record.id,
    type: record.type,
    name: record.input.name,
    data: {
      description: record.input.description,
      tags: record.input.tags,
      isStarting: record.input.isStarting,
      kind: record.input.kind ?? "macro",
      parentLocationName: record.input.parentLocationName ?? null,
    },
  };
}

function pushEdge(edges: CampaignWorldEdge[], edge: CampaignWorldEdge): void {
  if (!edges.some((existing) => existing.id === edge.id)) {
    edges.push(edge);
  }
}

export function adaptScaffoldLocationsToWorldGraph(
  locations: readonly LocationInput[],
): CampaignWorldGraph {
  const records = createLocationRecords(locations);
  const byKey = new Map(records.map((record) => [record.key, record]));
  const nodes = records.map(locationRecordToNode);
  const edges: CampaignWorldEdge[] = [];

  for (const record of records) {
    if (record.input.parentLocationName) {
      const parent = requireLocationRecord(
        byKey,
        record.input.name,
        record.input.parentLocationName,
        "parent",
      );
      pushEdge(edges, {
        id: `edge:located_at:${record.id}:${parent.id}`,
        fromId: record.id,
        toId: parent.id,
        type: "located_at",
        data: {},
      });
    }

    for (const targetName of record.input.connectedTo) {
      const target = requireLocationRecord(byKey, record.input.name, targetName, "route");
      pushEdge(edges, {
        id: `edge:route_to:${record.id}:${target.id}`,
        fromId: record.id,
        toId: target.id,
        type: "route_to",
        data: {
          sourceName: record.input.name,
          targetName: target.input.name,
        },
      });
    }
  }

  return { nodes, edges };
}
