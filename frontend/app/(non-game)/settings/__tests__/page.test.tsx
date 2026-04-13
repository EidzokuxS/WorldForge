import * as React from "react";
import { act } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDefaultSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

const saveSpy = vi.fn<(next: Settings) => Promise<Settings>>();

let persistedSettings: Settings;

function buildSettings(): Settings {
  return {
    ...createDefaultSettings(),
    providers: [{ id: "provider-1", name: "OpenRouter", baseUrl: "", apiKey: "", defaultModel: "" }],
    judge: { ...createDefaultSettings().judge, providerId: "provider-1" },
    storyteller: { ...createDefaultSettings().storyteller, providerId: "provider-1" },
    generator: { ...createDefaultSettings().generator, providerId: "provider-1" },
    embedder: { ...createDefaultSettings().embedder, providerId: "provider-1" },
  };
}

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/use-settings", () => ({
  useSettings: () => {
    const [settings, setSettings] = React.useState<Settings>(persistedSettings);

    return {
      settings,
      setSettings,
      isLoading: false,
      isSaving: false,
      save: saveSpy,
    };
  },
}));

vi.mock("@/components/settings/providers-tab", () => ({
  ProvidersTab: () => <div>Providers Tab</div>,
}));
vi.mock("@/components/settings/roles-tab", () => ({
  RolesTab: () => <div>Roles Tab</div>,
}));
vi.mock("@/components/settings/images-tab", () => ({
  ImagesTab: () => <div>Images Tab</div>,
}));
vi.mock("@/components/settings/research-tab", () => ({
  ResearchTab: () => <div>Research Tab</div>,
}));

import SettingsPage from "@/app/(non-game)/settings/page";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    persistedSettings = buildSettings();
    saveSpy.mockReset();
    saveSpy.mockImplementation(async (next) => {
      persistedSettings = next;
      return next;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a dedicated Gameplay tab with a debug-only raw reasoning toggle that persists across save and reload", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    const { unmount } = render(<SettingsPage />);

    expect(screen.getByText("Saved")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Gameplay" }));

    expect(screen.getByText("Show raw reasoning")).toBeInTheDocument();
    expect(screen.getByText(/debug-only/i)).toBeInTheDocument();
    expect(screen.getByText(/does not alter canonical narration/i)).toBeInTheDocument();

    const reasoningSwitch = screen.getByRole("switch", {
      name: "Show raw reasoning",
    });
    expect(reasoningSwitch).toHaveAttribute("aria-checked", "false");

    await user.click(reasoningSwitch);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: {
          showRawReasoning: true,
        },
      })
    );

    unmount();

    render(<SettingsPage />);
    await user.click(screen.getByRole("tab", { name: "Gameplay" }));

    expect(
      screen.getByRole("switch", {
        name: "Show raw reasoning",
      })
    ).toHaveAttribute("aria-checked", "true");
  });
});
