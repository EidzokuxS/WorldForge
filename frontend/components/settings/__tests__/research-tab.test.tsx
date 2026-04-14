import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchTab } from "../research-tab";
import type { Settings } from "@/lib/types";

function createMockSettings(overrides: Partial<Settings> = {}): Settings {
  const { ui: overrideUi, ...rest } = overrides;

  return {
    providers: [
      {
        id: "prov-1",
        name: "TestProvider",
        baseUrl: "https://api.test.com/v1",
        apiKey: "key-1",
        defaultModel: "test-model",
        isBuiltin: false,
      },
    ],
    judge: { providerId: "prov-1", temperature: 0.3, maxTokens: 2000 },
    storyteller: { providerId: "prov-1", temperature: 0.8, maxTokens: 4000 },
    generator: { providerId: "prov-1", temperature: 0.7, maxTokens: 4000 },
    embedder: { providerId: "prov-1", temperature: 0, maxTokens: 0 },
    images: {
      providerId: "",
      model: "",
      stylePrompt: "",
      enabled: false,
    },
    research: {
      enabled: true,
      maxSearchSteps: 5,
      searchProvider: "duckduckgo",
    },
    ui: overrideUi ?? { showRawReasoning: false },
    ...rest,
  };
}

describe("ResearchTab", () => {
  it("renders research agent card with enable toggle", () => {
    const settings = createMockSettings();
    render(<ResearchTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Research Agent")).toBeInTheDocument();
    expect(screen.getByText("Enable research agent")).toBeInTheDocument();
    expect(screen.getAllByText(/world formation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/character grounding/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/live clarification/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/before world generation/i)).not.toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("renders max search steps input with current value", () => {
    const settings = createMockSettings();
    render(<ResearchTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByLabelText("Max search steps")).toBeInTheDocument();
    expect(screen.getByLabelText("Max search steps")).toHaveValue(5);
  });

  it("renders search provider select", () => {
    const settings = createMockSettings();
    render(<ResearchTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Search Provider")).toBeInTheDocument();
  });
});
