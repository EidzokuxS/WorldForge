import type { WorldScaffold } from "./types.js";

export type ScaffoldPreflightSeverity = "critical" | "warning";

export interface ScaffoldPreflightIssue {
  severity: ScaffoldPreflightSeverity;
  code: string;
  entityName?: string;
  message: string;
}

export interface ScaffoldPreflightResult {
  ok: boolean;
  issues: ScaffoldPreflightIssue[];
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function addIssue(
  issues: ScaffoldPreflightIssue[],
  issue: ScaffoldPreflightIssue,
): void {
  issues.push(issue);
}

function collectDuplicateNames(
  values: readonly { name: string }[],
  entityType: string,
  issues: ScaffoldPreflightIssue[],
): void {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = normalizedName(value.name);
    if (!key) {
      addIssue(issues, {
        severity: "critical",
        code: `${entityType}_name_empty`,
        message: `${entityType} has an empty name.`,
      });
      continue;
    }
    const previous = seen.get(key);
    if (previous) {
      addIssue(issues, {
        severity: "critical",
        code: `${entityType}_name_duplicate`,
        entityName: value.name,
        message: `Duplicate ${entityType} name "${value.name}" conflicts with "${previous}".`,
      });
      continue;
    }
    seen.set(key, value.name);
  }
}

function validateLocationTopology(
  scaffold: WorldScaffold,
  issues: ScaffoldPreflightIssue[],
): void {
  const locationsByName = new Map(
    scaffold.locations.map((location) => [normalizedName(location.name), location]),
  );
  if (scaffold.locations.length === 0) {
    addIssue(issues, {
      severity: "critical",
      code: "locations_empty",
      message: "World scaffold must contain at least one location.",
    });
    return;
  }

  const startingLocations = scaffold.locations.filter((location) => location.isStarting);
  if (startingLocations.length === 0) {
    addIssue(issues, {
      severity: "critical",
      code: "starting_location_missing",
      message: "World scaffold must mark one playable starting location.",
    });
  }
  if (startingLocations.length > 1) {
    addIssue(issues, {
      severity: "critical",
      code: "starting_location_ambiguous",
      message: `World scaffold marks multiple starting locations: ${startingLocations.map((location) => location.name).join(", ")}.`,
    });
  }

  const adjacency = new Map<string, Set<string>>();
  for (const location of scaffold.locations) {
    adjacency.set(normalizedName(location.name), new Set());
  }

  for (const location of scaffold.locations) {
    const from = normalizedName(location.name);
    if (location.kind === "persistent_sublocation") {
      const parentName = location.parentLocationName?.trim();
      if (!parentName) {
        addIssue(issues, {
          severity: "critical",
          code: "sublocation_parent_missing",
          entityName: location.name,
          message: `Persistent sublocation "${location.name}" must name a parent macro location.`,
        });
      } else {
        const parent = locationsByName.get(normalizedName(parentName));
        if (!parent || parent.kind === "persistent_sublocation") {
          addIssue(issues, {
            severity: "critical",
            code: "sublocation_parent_invalid",
            entityName: location.name,
            message: `Persistent sublocation "${location.name}" references invalid parent "${parentName}".`,
          });
        } else {
          const parentKey = normalizedName(parent.name);
          adjacency.get(from)?.add(parentKey);
          adjacency.get(parentKey)?.add(from);
        }
      }
    } else if (location.parentLocationName?.trim()) {
      addIssue(issues, {
        severity: "critical",
        code: "macro_parent_invalid",
        entityName: location.name,
        message: `Macro location "${location.name}" must not carry parentLocationName.`,
      });
    }

    for (const targetName of location.connectedTo) {
      const targetKey = normalizedName(targetName);
      if (!targetKey) continue;
      if (targetKey === from) {
        addIssue(issues, {
          severity: "warning",
          code: "location_self_connection",
          entityName: location.name,
          message: `Location "${location.name}" includes itself in connectedTo; saver will ignore it.`,
        });
        continue;
      }
      const target = locationsByName.get(targetKey);
      if (!target) {
        addIssue(issues, {
          severity: "critical",
          code: "location_connection_missing",
          entityName: location.name,
          message: `Location "${location.name}" connects to unknown location "${targetName}".`,
        });
        continue;
      }
      const resolvedTarget = normalizedName(target.name);
      adjacency.get(from)?.add(resolvedTarget);
      adjacency.get(resolvedTarget)?.add(from);
    }
  }

  const start = normalizedName(startingLocations[0]?.name ?? scaffold.locations[0]!.name);
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  const disconnected = scaffold.locations
    .filter((location) => !visited.has(normalizedName(location.name)))
    .map((location) => location.name);
  if (disconnected.length > 0) {
    addIssue(issues, {
      severity: "critical",
      code: "location_graph_disconnected",
      message: `Location graph is disconnected from the start: ${disconnected.join(", ")}.`,
    });
  }
}

function validateCrossReferences(
  scaffold: WorldScaffold,
  issues: ScaffoldPreflightIssue[],
): void {
  const locationsByName = new Map(
    scaffold.locations.map((location) => [normalizedName(location.name), location]),
  );
  const factionsByName = new Map(
    scaffold.factions.map((faction) => [normalizedName(faction.name), faction]),
  );

  for (const faction of scaffold.factions) {
    for (const territoryName of faction.territoryNames) {
      if (!locationsByName.has(normalizedName(territoryName))) {
        addIssue(issues, {
          severity: "critical",
          code: "faction_territory_missing",
          entityName: faction.name,
          message: `Faction "${faction.name}" references unknown territory "${territoryName}".`,
        });
      }
    }
  }

  for (const npc of scaffold.npcs) {
    const broadLocation = locationsByName.get(normalizedName(npc.locationName));
    if (!broadLocation) {
      addIssue(issues, {
        severity: "critical",
        code: "npc_location_missing",
        entityName: npc.name,
        message: `NPC "${npc.name}" references unknown location "${npc.locationName}".`,
      });
    }

    if (npc.sceneLocationName?.trim()) {
      const sceneLocation = locationsByName.get(normalizedName(npc.sceneLocationName));
      if (!sceneLocation) {
        addIssue(issues, {
          severity: "critical",
          code: "npc_scene_location_missing",
          entityName: npc.name,
          message: `NPC "${npc.name}" references unknown sceneLocationName "${npc.sceneLocationName}".`,
        });
      } else if (
        broadLocation
        && sceneLocation.kind === "persistent_sublocation"
        && normalizedName(sceneLocation.parentLocationName ?? "") !== normalizedName(broadLocation.name)
      ) {
        addIssue(issues, {
          severity: "critical",
          code: "npc_scene_parent_mismatch",
          entityName: npc.name,
          message: `NPC "${npc.name}" sceneLocationName "${sceneLocation.name}" is not inside locationName "${broadLocation.name}".`,
        });
      } else if (
        broadLocation
        && sceneLocation.kind !== "persistent_sublocation"
        && normalizedName(sceneLocation.name) !== normalizedName(broadLocation.name)
      ) {
        addIssue(issues, {
          severity: "critical",
          code: "npc_scene_macro_mismatch",
          entityName: npc.name,
          message: `NPC "${npc.name}" macro scene "${sceneLocation.name}" conflicts with locationName "${broadLocation.name}".`,
        });
      }
    }

    if (npc.factionName && !factionsByName.has(normalizedName(npc.factionName))) {
      addIssue(issues, {
        severity: "critical",
        code: "npc_faction_missing",
        entityName: npc.name,
        message: `NPC "${npc.name}" references unknown faction "${npc.factionName}".`,
      });
    }
  }

  if (scaffold.npcs.length === 0) {
    addIssue(issues, {
      severity: "warning",
      code: "npcs_empty",
      message: "World scaffold contains no NPCs; this can be valid but often leaves the opening low on interaction.",
    });
  }
}

export function validateScaffoldForPlayableWorld(
  scaffold: WorldScaffold,
): ScaffoldPreflightResult {
  const issues: ScaffoldPreflightIssue[] = [];
  collectDuplicateNames(scaffold.locations, "location", issues);
  collectDuplicateNames(scaffold.factions, "faction", issues);
  collectDuplicateNames(scaffold.npcs, "npc", issues);
  validateLocationTopology(scaffold, issues);
  validateCrossReferences(scaffold, issues);
  return {
    ok: issues.every((issue) => issue.severity !== "critical"),
    issues,
  };
}

export function assertScaffoldPlayable(scaffold: WorldScaffold): void {
  const result = validateScaffoldForPlayableWorld(scaffold);
  if (result.ok) return;
  const details = result.issues
    .filter((issue) => issue.severity === "critical")
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("; ");
  throw new Error(`World scaffold playable preflight failed: ${details}`);
}
