import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type {
  CampaignWorldBuildEvent,
  CampaignWorldDna,
  CampaignWorldSource,
} from "@worldforge/shared";

import type {
  CampaignWorldStateResponse,
  StartedCampaignWorldBuild,
} from "@/lib/campaign-world-api";
import { WorldBuildWorkspace } from "./world-build-workspace";

const dna: CampaignWorldDna = {
  geography: "Flooded stations",
  politicalStructure: "Signal guild councils",
  centralConflict: "The last dry route is closing",
  culturalFlavor: "Rail noir and signal liturgy",
  environment: "Salt storms",
  wildcard: "The bells answer questions",
};

const source: CampaignWorldSource = {
  campaignId: "campaign-1",
  premise: "A drowned rail kingdom listens for impossible bells.",
  dna: null,
  researchSummary: JSON.stringify({
    interpretationSummary: "The source establishes a coast shaped by rail guilds.",
    tonalNotes: ["Salt air"],
    ambiguityNotes: [],
  }),
  sourceReferences: [{ id: "source-1", label: "Campaign premise", sourceType: "premise" }],
  sourceDigest: "source-digest-1",
};

const startedBuild: StartedCampaignWorldBuild = {
  campaignId: "campaign-1",
  buildId: "build-1",
  sourceDigest: "source-digest-2",
  startedAt: 1000,
};

function unbuiltState(nextSource: CampaignWorldSource = source): CampaignWorldStateResponse {
  return {
    status: "unbuilt",
    source: nextSource,
    currentBuildId: null,
    currentStage: null,
    lastEventSequence: 0,
  };
}

function buildingState(): CampaignWorldStateResponse {
  return {
    status: "building",
    source,
    build: {
      buildId: "build-1",
      status: "running",
      stage: "world_frame",
      lastEventSequence: 4,
      sourceDigest: source.sourceDigest,
      errorCode: null,
    },
    currentBuildId: "build-1",
    currentStage: "world_frame",
    lastEventSequence: 4,
  };
}

function failedState(): CampaignWorldStateResponse {
  return {
    status: "failed",
    source,
    build: {
      buildId: "build-1",
      status: "failed",
      stage: "world_cast",
      lastEventSequence: 5,
      sourceDigest: source.sourceDigest,
      errorCode: "provider_failed",
    },
    currentBuildId: "build-1",
    currentStage: "world_cast",
    lastEventSequence: 5,
  };
}

function acceptedState(): CampaignWorldStateResponse {
  return {
    status: "accepted",
    currentBuildId: "build-1",
    currentStage: "persistence",
    lastEventSequence: 12,
    world: {
      campaignId: "campaign-1",
      status: "accepted",
      version: 1,
      contentHash: "world-hash-1",
      sourceDigest: source.sourceDigest,
      worldSummary: "Guild trains cross a coast where signal bells answer back.",
      locations: [
        {
          id: "location-1",
          name: "Lantern Gate",
          description: "The last dry terminus.",
          kind: "macro",
          parentLocationId: null,
          tags: ["rail"],
          isStarting: true,
        },
      ],
      routes: [],
      actors: [],
      goals: [],
      relations: [],
      placements: [],
      pressures: [],
      builtAt: 9000,
      acceptedAt: 10000,
      source: {
        premise: source.premise,
        dna: null,
        researchSummary: source.researchSummary,
        sourceReferences: source.sourceReferences,
      },
    },
  };
}

function events(): CampaignWorldBuildEvent[] {
  return [
    { sequence: 1, buildId: "build-1", type: "build_started", createdAt: 5000 },
    { sequence: 2, buildId: "build-1", type: "stage_started", stage: "world_frame", createdAt: 6000 },
    { sequence: 3, buildId: "build-1", type: "stage_completed", stage: "world_frame", createdAt: 7000 },
    { sequence: 4, buildId: "build-1", type: "stage_started", stage: "world_cast", createdAt: 8000 },
  ];
}

function renderWorkspace(
  state: CampaignWorldStateResponse,
  options: {
    buildEvents?: CampaignWorldBuildEvent[];
    onSaveDna?: (value: CampaignWorldDna) => Promise<CampaignWorldSource>;
    onStartBuild?: (digest: string) => Promise<StartedCampaignWorldBuild>;
    onBuildStarted?: (build: StartedCampaignWorldBuild) => Promise<void> | void;
  } = {},
) {
  return render(
    <WorldBuildWorkspace
      campaignId="campaign-1"
      campaignName="Bell Coast"
      state={state}
      events={options.buildEvents ?? []}
      onSaveDna={options.onSaveDna ?? vi.fn().mockResolvedValue({ ...source, dna })}
      onStartBuild={options.onStartBuild ?? vi.fn().mockResolvedValue(startedBuild)}
      onBuildStarted={options.onBuildStarted ?? vi.fn()}
    />,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("WorldBuildWorkspace", () => {
  it("shows structured research as readable provenance", () => {
    renderWorkspace(unbuiltState());

    expect(screen.getByText("The source establishes a coast shaped by rail guilds.")).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes('"interpretationSummary"'))).not.toBeInTheDocument();
  });

  it("creates a premise-only world without inventing required DNA", async () => {
    const startBuild = vi.fn().mockResolvedValue(startedBuild);
    renderWorkspace(unbuiltState(), { onStartBuild: startBuild });

    expect(screen.getByText(source.premise)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add World DNA" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => expect(startBuild).toHaveBeenCalledWith("source-digest-1"));
  });

  it("saves edited DNA before starting with the returned source digest", async () => {
    const saveDna = vi.fn().mockResolvedValue({ ...source, dna, sourceDigest: "source-digest-2" });
    const startBuild = vi.fn().mockResolvedValue(startedBuild);
    const buildStarted = vi.fn();
    renderWorkspace(unbuiltState({ ...source, dna }), {
      onSaveDna: saveDna,
      onStartBuild: startBuild,
      onBuildStarted: buildStarted,
    });

    fireEvent.change(screen.getByLabelText("Geography DNA"), {
      target: { value: "Submerged stations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => expect(buildStarted).toHaveBeenCalledWith(startedBuild));
    expect(saveDna).toHaveBeenCalledWith({ ...dna, geography: "Submerged stations" });
    expect(startBuild).toHaveBeenCalledWith("source-digest-2");
    expect(saveDna.mock.invocationCallOrder[0]).toBeLessThan(startBuild.mock.invocationCallOrder[0]!);
  });

  it("advances the visible activity from newer durable events without partial world cards", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    renderWorkspace(buildingState(), { buildEvents: events() });

    expect(screen.getByText("Locations").closest(".wf-gen-stage")).toHaveAttribute("data-state", "done");
    const actorStage = screen.getAllByText("Actors").find((element) => element.classList.contains("wf-gen-stage-h"));
    expect(actorStage?.closest(".wf-gen-stage")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("buildElapsed")).toHaveTextContent("0:05 elapsed");
    expect(screen.getByRole("list", { name: "Persisted build events" }).children).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Current build stage" })).toHaveTextContent("Actors");
    expect(screen.getByText("Placing people and collectives with goals of their own.")).toBeInTheDocument();
    expect(screen.queryByText("Lantern Gate")).not.toBeInTheDocument();
  });

  it("shows the persisted safe failure and starts a separate build attempt", async () => {
    const failureEvents: CampaignWorldBuildEvent[] = [
      ...events(),
      {
        sequence: 5,
        buildId: "build-1",
        type: "build_failed",
        errorCode: "provider_failed",
        message: "The provider stopped before the world was complete.",
        createdAt: 9000,
      },
    ];
    const startBuild = vi.fn().mockResolvedValue({ ...startedBuild, buildId: "build-2" });
    renderWorkspace(failedState(), { buildEvents: failureEvents, onStartBuild: startBuild });

    expect(screen.getByRole("alert")).toHaveTextContent("The provider stopped before the world was complete.");
    expect(screen.getByRole("list", { name: "Persisted build events" })).not.toHaveTextContent("provider_failed");
    fireEvent.click(screen.getByRole("button", { name: "Start build again" }));

    await waitFor(() => expect(startBuild).toHaveBeenCalledWith("source-digest-1"));
  });

  it("keeps an accepted world read-only and links to World Review", () => {
    renderWorkspace(acceptedState());

    expect(screen.getByTestId("worldStatus")).toHaveTextContent("accepted");
    expect(screen.getByText("Guild trains cross a coast where signal bells answer back.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open World Review" })).toHaveAttribute(
      "href",
      "/campaign/campaign-1/review",
    );
    expect(screen.queryByRole("button", { name: "Create world" })).not.toBeInTheDocument();
  });

  it("prevents two immediate clicks from creating two builds", async () => {
    let releaseBuild: ((build: StartedCampaignWorldBuild) => void) | undefined;
    const startBuild = vi.fn().mockImplementation(() => new Promise<StartedCampaignWorldBuild>((resolve) => {
      releaseBuild = resolve;
    }));
    renderWorkspace(unbuiltState(), { onStartBuild: startBuild });
    const button = screen.getByRole("button", { name: "Create world" });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(startBuild).toHaveBeenCalledTimes(1);

    releaseBuild?.(startedBuild);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create world" })).toBeEnabled());
  });
});
