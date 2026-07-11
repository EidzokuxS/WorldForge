"use client";

import type { CampaignWorldLocation, CampaignWorldRoute } from "@worldforge/shared";

interface LocationsSectionProps {
  locations: readonly CampaignWorldLocation[];
  routes: readonly CampaignWorldRoute[];
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string) => void;
}

export function LocationsSection({
  locations,
  routes,
  selectedLocationId,
  onSelectLocation,
}: LocationsSectionProps) {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const selectedLocation = locationById.get(selectedLocationId ?? "") ?? locations[0] ?? null;

  return (
    <div className="wf-world-locations">
      <div className="wf-world-location-list" role="list" aria-label="Persisted world locations">
        {locations.map((location, index) => {
          const outgoingRoutes = routes.filter((route) => route.fromLocationId === location.id);
          const parent = location.parentLocationId ? locationById.get(location.parentLocationId) : null;
          if (location.parentLocationId && !parent) throw new Error(`Missing parent location ${location.parentLocationId}`);
          return (
            <div role="listitem" key={location.id}>
              <button
                type="button"
                className="wf-world-location-row"
                data-selected={selectedLocation?.id === location.id}
                onClick={() => onSelectLocation(location.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <small>{location.kind === "macro" ? "major location" : "persistent sublocation"}</small>
                  <strong>{location.name}</strong>
                  <p>{location.description}</p>
                </span>
                <span>
                  {location.isStarting ? <b>Starting</b> : null}
                  <small>{parent ? `under ${parent.name}` : `${outgoingRoutes.length} outgoing routes`}</small>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {selectedLocation ? (
        <aside className="wf-world-location-details" aria-label={`${selectedLocation.name} routes`}>
          <span>{selectedLocation.kind === "macro" ? "Major location" : "Persistent sublocation"}</span>
          <h2>{selectedLocation.name}</h2>
          <p>{selectedLocation.description}</p>
          {selectedLocation.parentLocationId ? (
            <button type="button" onClick={() => onSelectLocation(selectedLocation.parentLocationId!)}>
              Parent · {locationById.get(selectedLocation.parentLocationId)?.name}
            </button>
          ) : null}
          <h3>Directed routes</h3>
          <ul>
            {routes
              .filter((route) => route.fromLocationId === selectedLocation.id)
              .map((route) => {
                const destination = locationById.get(route.toLocationId);
                if (!destination) throw new Error(`Missing route destination ${route.toLocationId}`);
                return (
                  <li key={route.id}>
                    <button
                      type="button"
                      aria-label={`Route to ${destination.name}, travel cost ${route.travelCost}`}
                      onClick={() => onSelectLocation(destination.id)}
                    >
                      <span>→ {destination.name}</span>
                      <small>travel cost {route.travelCost}</small>
                    </button>
                  </li>
                );
              })}
          </ul>
        </aside>
      ) : (
        <p className="wf-review-empty">This world contains no locations.</p>
      )}
    </div>
  );
}
