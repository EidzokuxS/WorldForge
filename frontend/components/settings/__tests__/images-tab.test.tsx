import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImagesTab } from "../images-tab";
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
      providerId: "prov-1",
      model: "sd-xl-turbo",
      stylePrompt: "dark fantasy art",
      enabled: true,
    },
    research: {
      enabled: true,
      maxSearchSteps: 3,
      searchProvider: "duckduckgo",
    },
    ui: overrideUi ?? { showRawReasoning: false },
    ...rest,
  };
}

describe("ImagesTab", () => {
  it("renders enable toggle with current state", () => {
    const settings = createMockSettings();
    render(<ImagesTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Image Generation")).toBeInTheDocument();
    expect(screen.getByText("Enable image generation")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("renders provider select with available providers", () => {
    const settings = createMockSettings();
    render(<ImagesTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    expect(screen.getByText("Model / Checkpoint")).toBeInTheDocument();
  });

  it("renders style prompt textarea with current value", () => {
    const settings = createMockSettings();
    render(<ImagesTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Default style prompt")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(
      "dark fantasy art, matte painting style..."
    );
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("dark fantasy art");
  });

  it("calls setSettings when toggle is clicked", async () => {
    const user = userEvent.setup();
    const setSettings = vi.fn();
    const settings = createMockSettings({
      images: {
        providerId: "prov-1",
        model: "sd-xl-turbo",
        stylePrompt: "",
        enabled: false,
      },
    });
    render(<ImagesTab settings={settings} setSettings={setSettings} />);

    await user.click(screen.getByRole("switch"));
    expect(setSettings).toHaveBeenCalled();
  });
});
