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
  return true;
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
