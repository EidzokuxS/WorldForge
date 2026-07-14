import type { CampaignWorldReview } from "@worldforge/shared";

interface OverviewSectionProps {
  world: CampaignWorldReview;
  onOpenLocations: () => void;
  onOpenActors: () => void;
  onOpenConnections: () => void;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="wf-review-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function OverviewSection({
  world,
  onOpenLocations,
  onOpenActors,
  onOpenConnections,
}: OverviewSectionProps) {
  const backgroundPeople = world.actors.filter((actor) => actor.role === "background").length;

  return (
    <div className="wf-world-overview">
      <div className="wf-world-overview-stats" aria-label="World totals">
        <Stat value={world.locations.length} label="Locations" />
        <Stat value={world.routes.length} label="Routes" />
        <Stat value={world.actors.length} label="People" />
        <Stat value={backgroundPeople} label="Background" />
        <Stat value={world.pressures.length} label="Pressures" />
      </div>

      <section className="wf-world-overview-summary">
        <span>World summary</span>
        <p>{world.worldSummary}</p>
      </section>

      <nav className="wf-world-overview-links" aria-label="World review sections">
        <button type="button" className="wf-v4-btn" onClick={onOpenLocations}>Inspect Locations</button>
        <button type="button" className="wf-v4-btn" onClick={onOpenActors}>Inspect Actors</button>
        <button type="button" className="wf-v4-btn" onClick={onOpenConnections}>Inspect Connections</button>
      </nav>

      <section className="wf-world-provenance">
        <h2>Source provenance</h2>
        <dl>
          <div><dt>World DNA</dt><dd>{world.source.dna ? "Included" : "Premise only"}</dd></div>
          <div><dt>Source references</dt><dd>{world.source.sourceReferences.length}</dd></div>
          <div><dt>World version</dt><dd>{world.version}</dd></div>
          <div><dt>Content hash</dt><dd>{world.contentHash.slice(0, 12)}</dd></div>
        </dl>
      </section>
    </div>
  );
}
