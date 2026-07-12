import type {
  CampaignPlayVisibleActor,
  CampaignPlayVisibleLocation,
  CampaignPlayVisiblePressure,
  CampaignPlayVisibleRoute,
} from "@worldforge/shared";
import type { CSSProperties } from "react";

export interface SceneCardProps {
  location: CampaignPlayVisibleLocation;
  actors: CampaignPlayVisibleActor[];
  routes: CampaignPlayVisibleRoute[];
  pressures: CampaignPlayVisiblePressure[];
}

const ROUTE_STATE_LABELS: Record<CampaignPlayVisibleRoute["state"], string> = {
  open: "Open",
  restricted: "Restricted",
  blocked: "Blocked",
};

const ACTOR_ACCENT_COLORS: Readonly<Record<string, string>> = {
  amber: "var(--gold)",
  cobalt: "var(--cold-1)",
  emerald: "var(--good)",
  rose: "var(--ember-1)",
  slate: "var(--fg-2)",
  violet: "var(--campaign-play-violet)",
};

function actorAccentStyle(accent: string): CSSProperties {
  const color = ACTOR_ACCENT_COLORS[accent];
  if (color === undefined) throw new Error(`Unsupported Campaign Play actor accent: ${accent}`);
  return { "--campaign-play-actor-accent": color } as CSSProperties;
}

export function SceneCard({ location, actors, routes, pressures }: SceneCardProps) {
  return (
    <section className="campaign-play-scene" aria-labelledby="campaign-play-location">
      <div className="campaign-play-scene-copy">
        <p className="campaign-play-kicker">Current place</p>
        <h1 id="campaign-play-location">{location.name}</h1>
        <p className="campaign-play-location-description">{location.description}</p>
      </div>

      {actors.length > 0 ? (
        <section className="campaign-play-presence" aria-labelledby="campaign-play-presence-heading">
          <h2 id="campaign-play-presence-heading">Present here</h2>
          <ul>
            {actors.map((actor) => (
              <li key={actor.handle} style={actorAccentStyle(actor.accent)}>
                <span aria-hidden="true">{actor.monogram}</span>
                <span><strong>{actor.name}</strong><small>{actor.descriptor}</small></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="campaign-play-scene-details">
        {routes.length > 0 ? (
          <section className="campaign-play-routes" aria-labelledby="campaign-play-routes-heading">
            <h2 id="campaign-play-routes-heading">Ways onward</h2>
            <ul>
              {routes.map((route) => (
                <li key={route.handle} data-route-state={route.state}>
                  <span>
                    <strong>{route.destinationName}</strong>
                    <small>{route.travelTimeLabel}</small>
                  </span>
                  <span>{ROUTE_STATE_LABELS[route.state]}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pressures.length > 0 ? (
          <section className="campaign-play-pressures" aria-labelledby="campaign-play-pressures-heading">
            <h2 id="campaign-play-pressures-heading">In the air</h2>
            <ul>
              {pressures.map((pressure) => (
                <li key={pressure.handle}>
                  <strong>{pressure.label}</strong>
                  <p>{pressure.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default SceneCard;
