import type {
  ActorGoal,
  ActorPlacement,
  ActorRelation,
  CampaignWorldLocation,
  GeneratedWorldActor,
  GeneratedWorldActorRole,
} from "@worldforge/shared";

interface ActorsSectionProps {
  actors: readonly GeneratedWorldActor[];
  goals: readonly ActorGoal[];
  placements: readonly ActorPlacement[];
  relations: readonly ActorRelation[];
  locations: readonly CampaignWorldLocation[];
  selectedActorId: string | null;
  onSelectActor: (actorId: string) => void;
  onSelectLocation: (locationId: string) => void;
}

const ROLE_ORDER: readonly GeneratedWorldActorRole[] = ["key", "support", "background"];

function initials(name: string): string {
  const parts = name.split(" ").map((part) => part.trim()).filter((part) => part.length > 0);
  const value = parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return value || "?";
}

function actorLabel(actor: GeneratedWorldActor): string {
  return `${actor.kind} · ${actor.controller}`;
}

export function ActorsSection({
  actors,
  goals,
  placements,
  relations,
  locations,
  selectedActorId,
  onSelectActor,
  onSelectLocation,
}: ActorsSectionProps) {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const selectedActor = actorById.get(selectedActorId ?? "") ?? actors[0] ?? null;
  const selectedGoals = selectedActor ? goals.filter((goal) => goal.actorId === selectedActor.id) : [];
  const selectedPlacements = selectedActor
    ? placements.filter((placement) => placement.actorId === selectedActor.id)
    : [];
  const selectedRelations = selectedActor
    ? relations.filter((relation) => (
        relation.sourceActorId === selectedActor.id || relation.targetActorId === selectedActor.id
      ))
    : [];

  return (
    <div className="wf-world-actors">
      <div className="wf-world-actor-board">
        {ROLE_ORDER.map((role) => {
          const roleActors = actors.filter((actor) => actor.role === role);
          if (roleActors.length === 0) return null;
          return (
            <section className="wf-world-actor-group" key={role}>
              <header>
                <h2>{role} actors</h2>
                <span>{roleActors.length}</span>
              </header>
              <div className="wf-world-actor-grid">
                {roleActors.map((actor) => {
                  const actorPlacements = placements.filter((placement) => placement.actorId === actor.id);
                  const placementNames = actorPlacements.map((placement) => {
                    const location = locationById.get(placement.locationId);
                    if (!location) throw new Error(`Missing location ${placement.locationId}`);
                    return location.name;
                  });
                  const goalCount = goals.filter((goal) => goal.actorId === actor.id).length;
                  return (
                    <button
                      type="button"
                      className="wf-world-actor-card"
                      data-selected={selectedActor?.id === actor.id}
                      key={actor.id}
                      onClick={() => onSelectActor(actor.id)}
                    >
                      <span className="wf-world-actor-sigil" aria-hidden="true">
                        {actor.kind === "collective" ? "◇" : initials(actor.name)}
                      </span>
                      <span className="wf-world-actor-card-body">
                        <span className="wf-world-actor-kind">{actorLabel(actor)}</span>
                        <strong>{actor.name}</strong>
                        <span>{actor.summary}</span>
                        <small>{placementNames.join(" · ") || "Unplaced"} · {goalCount} active goals</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {selectedActor ? (
        <aside className="wf-world-actor-details" aria-label={`${selectedActor.name} details`}>
          <span>{actorLabel(selectedActor)}</span>
          <h2>{selectedActor.name}</h2>
          <p>{selectedActor.summary}</p>

          <section>
            <h3>Traits</h3>
            <div className="wf-world-review-chips">
              {selectedActor.traits.map((trait) => <span key={trait}>{trait}</span>)}
            </div>
          </section>

          <section>
            <h3>Goals</h3>
            <ul>
              {selectedGoals.map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.objective}</strong>
                  <span>{goal.motivation}</span>
                  <small>{goal.horizon} · priority {goal.priority} of 5</small>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Placements</h3>
            <div className="wf-world-review-links">
              {selectedPlacements.map((placement) => {
                const location = locationById.get(placement.locationId);
                if (!location) throw new Error(`Missing location ${placement.locationId}`);
                return (
                  <button type="button" key={placement.id} onClick={() => onSelectLocation(location.id)}>
                    {placement.placementKind} · {location.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3>Directed relations</h3>
            <ul>
              {selectedRelations.map((relation) => {
                const source = actorById.get(relation.sourceActorId);
                const target = actorById.get(relation.targetActorId);
                if (!source || !target) throw new Error(`Missing actor relation endpoint ${relation.id}`);
                return (
                  <li key={relation.id}>
                    <div>
                      <button type="button" onClick={() => onSelectActor(source.id)}>{source.name}</button>
                      <span>→ {relation.relationType} →</span>
                      <button type="button" onClick={() => onSelectActor(target.id)}>{target.name}</button>
                    </div>
                    <span>{relation.summary}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      ) : (
        <p className="wf-review-empty">This world contains no actors.</p>
      )}
    </div>
  );
}
