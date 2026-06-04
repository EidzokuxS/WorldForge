export type SimulationActorWriteScope = string;

export interface ActorWriteScopeJob {
  actorId: string;
  route: string;
  writeScopes: readonly SimulationActorWriteScope[];
}

export interface ActorWriteScopeReservation {
  actorId: string;
  route: string;
  writeScopes: SimulationActorWriteScope[];
  status: "reserved" | "conflict_serialized";
  conflictsWithActorIds: string[];
}

export type TurnWriteScopeOwner =
  | "pre_frame_due_world"
  | "gm_tool_loop"
  | "actor_reaction"
  | "pre_narrator_due_world";

export interface TurnWriteScopeClaimInput {
  owner: TurnWriteScopeOwner;
  ownerId: string;
  phase: string;
  writeScopes: readonly SimulationActorWriteScope[];
}

export interface TurnWriteScopeClaim {
  owner: TurnWriteScopeOwner;
  ownerId: string;
  phase: string;
  writeScopes: SimulationActorWriteScope[];
}

export interface TurnWriteScopeConflict {
  incoming: TurnWriteScopeClaim;
  existing: TurnWriteScopeClaim;
  writeScope: SimulationActorWriteScope;
  blockedWriteScope: SimulationActorWriteScope;
}

function splitScope(scope: string): string[] {
  return scope
    .trim()
    .toLowerCase()
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeWriteScope(scope: string): SimulationActorWriteScope {
  return splitScope(scope).join(":");
}

export function writeScopesConflict(
  left: SimulationActorWriteScope,
  right: SimulationActorWriteScope,
): boolean {
  const leftParts = splitScope(left);
  const rightParts = splitScope(right);
  if (leftParts.length === 0 || rightParts.length === 0) {
    return false;
  }
  const length = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === "*" || rightPart === "*") {
      return true;
    }
    if (leftPart !== rightPart) {
      return false;
    }
  }
  if (leftParts.length === rightParts.length) {
    return true;
  }
  if (leftParts.length > 2 && rightParts.length > 2) {
    return false;
  }
  return true;
}

export function findConflictingWriteScope(input: {
  writeScopes: readonly SimulationActorWriteScope[];
  blockedWriteScopes: readonly SimulationActorWriteScope[];
}): { writeScope: SimulationActorWriteScope; blockedWriteScope: SimulationActorWriteScope } | null {
  for (const writeScope of input.writeScopes) {
    for (const blockedWriteScope of input.blockedWriteScopes) {
      if (writeScopesConflict(writeScope, blockedWriteScope)) {
        return { writeScope, blockedWriteScope };
      }
    }
  }
  return null;
}

export function findUncoveredWriteRef(input: {
  stateDeltaRefs: readonly SimulationActorWriteScope[];
  allowedWriteScopes: readonly SimulationActorWriteScope[];
}): { stateDeltaRef: SimulationActorWriteScope } | null {
  for (const stateDeltaRef of input.stateDeltaRefs) {
    const normalized = normalizeWriteScope(stateDeltaRef);
    if (!normalized) continue;
    const aliases = [normalized];
    const parts = splitScope(normalized);
    if ((parts[0] === "npc" || parts[0] === "actor") && parts[1] && parts[2] === "process") {
      aliases.push(`npc:${parts[1]}:state`);
    }
    const covered = input.allowedWriteScopes.some((allowedWriteScope) =>
      aliases.some((alias) => writeScopesConflict(allowedWriteScope, alias)),
    );
    if (!covered) {
      return { stateDeltaRef };
    }
  }
  return null;
}

export function reserveActorWriteScopes(
  jobs: readonly ActorWriteScopeJob[],
): ActorWriteScopeReservation[] {
  const reservations: ActorWriteScopeReservation[] = [];

  for (const job of jobs) {
    const scopes = job.writeScopes
      .map(normalizeWriteScope)
      .filter(Boolean);
    const conflictsWithActorIds = new Set<string>();
    for (const existing of reservations) {
      if (
        existing.writeScopes.some((existingScope) =>
          scopes.some((scope) => writeScopesConflict(existingScope, scope)),
        )
      ) {
        conflictsWithActorIds.add(existing.actorId);
      }
    }
    reservations.push({
      actorId: job.actorId,
      route: job.route,
      writeScopes: scopes,
      status: conflictsWithActorIds.size > 0 ? "conflict_serialized" : "reserved",
      conflictsWithActorIds: [...conflictsWithActorIds],
    });
  }

  return reservations;
}

export class TurnWriteScopeLedger {
  private readonly entries: TurnWriteScopeClaim[] = [];

  claims(): TurnWriteScopeClaim[] {
    return this.entries.map((entry) => ({
      ...entry,
      writeScopes: [...entry.writeScopes],
    }));
  }

  blockedWriteScopes(): SimulationActorWriteScope[] {
    return [...new Set(this.entries.flatMap((entry) => entry.writeScopes))];
  }

  claim(input: TurnWriteScopeClaimInput): TurnWriteScopeConflict | null {
    const incoming: TurnWriteScopeClaim = {
      owner: input.owner,
      ownerId: input.ownerId,
      phase: input.phase,
      writeScopes: input.writeScopes
        .map(normalizeWriteScope)
        .filter(Boolean),
    };
    if (incoming.writeScopes.length === 0) {
      return null;
    }

    for (const existing of this.entries) {
      const conflict = findConflictingWriteScope({
        writeScopes: incoming.writeScopes,
        blockedWriteScopes: existing.writeScopes,
      });
      if (conflict) {
        return {
          incoming,
          existing,
          writeScope: conflict.writeScope,
          blockedWriteScope: conflict.blockedWriteScope,
        };
      }
    }

    this.entries.push(incoming);
    return null;
  }
}

export function createTurnWriteScopeLedger(): TurnWriteScopeLedger {
  return new TurnWriteScopeLedger();
}
