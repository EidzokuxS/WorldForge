import type {
  ActorRelation,
  CampaignWorldLocation,
  WorldActor,
  WorldPressure,
} from "@worldforge/shared";

interface ConnectionsSectionProps {
  actors: readonly WorldActor[];
  locations: readonly CampaignWorldLocation[];
  relations: readonly ActorRelation[];
  pressures: readonly WorldPressure[];
  onSelectActor: (actorId: string) => void;
  onSelectLocation: (locationId: string) => void;
}

function pressureLevel(urgency: WorldPressure["urgency"]): "high" | "medium" | "low" {
  if (urgency >= 4) return "high";
  if (urgency === 3) return "medium";
  return "low";
}

export function ConnectionsSection({
  actors,
  locations,
  relations,
  pressures,
  onSelectActor,
  onSelectLocation,
}: ConnectionsSectionProps) {
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const locationById = new Map(locations.map((location) => [location.id, location]));

  return (
    <div className="wf-world-connections">
      <section>
        <header className="wf-world-review-section-head">
          <h2>Relations</h2>
          <span>{relations.length}</span>
        </header>
        <div className="wf-world-relation-list">
          {relations.map((relation) => {
            const source = actorById.get(relation.sourceActorId);
            const target = actorById.get(relation.targetActorId);
            if (!source || !target) throw new Error(`Missing actor relation endpoint ${relation.id}`);
            return (
              <article key={relation.id} className="wf-world-relation-row">
                <div className="wf-world-relation-path">
                  <button type="button" onClick={() => onSelectActor(source.id)}>{source.name}</button>
                  <span>→ {relation.relationType} →</span>
                  <button type="button" onClick={() => onSelectActor(target.id)}>{target.name}</button>
                </div>
                <p>{relation.summary}</p>
                <div className="wf-world-intensity">
                  <span>Intensity {relation.intensity} of 5</span>
                  <span aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((tick) => (
                      <i key={tick} data-filled={tick <= relation.intensity} />
                    ))}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <header className="wf-world-review-section-head">
          <h2>World pressures</h2>
          <span>{pressures.length}</span>
        </header>
        <div className="wf-world-pressure-grid">
          {pressures.map((pressure) => (
            <article key={pressure.id} className="wf-world-pressure" data-urgency={pressureLevel(pressure.urgency)}>
              <span>{pressureLevel(pressure.urgency)} urgency · {pressure.urgency} of 5</span>
              <h3>{pressure.name}</h3>
              <p>{pressure.description}</p>
              <blockquote>{pressure.trajectory}</blockquote>
              <div className="wf-world-review-links">
                {pressure.actorIds.map((actorId) => {
                  const actor = actorById.get(actorId);
                  if (!actor) throw new Error(`Missing pressure actor ${actorId}`);
                  return <button type="button" key={actorId} onClick={() => onSelectActor(actorId)}>{actor.name}</button>;
                })}
                {pressure.locationIds.map((locationId) => {
                  const location = locationById.get(locationId);
                  if (!location) throw new Error(`Missing pressure location ${locationId}`);
                  return <button type="button" key={locationId} onClick={() => onSelectLocation(locationId)}>{location.name}</button>;
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
