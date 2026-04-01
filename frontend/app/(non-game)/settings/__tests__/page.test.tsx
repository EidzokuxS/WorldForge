import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/use-settings", () => ({
  useSettings: () => ({
    settings: {
      providers: [{ id: "provider-1", name: "OpenRouter" }],
      judge: { providerId: "provider-1" },
      storyteller: { providerId: "provider-1" },
      generator: { providerId: "provider-1" },
      embedder: { providerId: "provider-1" },
    },
    setSettings: vi.fn(),
    isLoading: false,
    isSaving: false,
    save: vi.fn(),
  }),
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
  it("renders settings content with visible save state and provider summary", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Changes are saved automatically.")).toBeInTheDocument();
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText(/Active providers: 1/)).toBeInTheDocument();
  });
});
