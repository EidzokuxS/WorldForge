import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/use-settings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/settings/providers-tab", () => ({
  ProvidersTab: () => <div data-testid="providers-tab" />,
}));
vi.mock("@/components/settings/roles-tab", () => ({
  RolesTab: () => <div data-testid="roles-tab" />,
}));
vi.mock("@/components/settings/images-tab", () => ({
  ImagesTab: () => <div data-testid="images-tab" />,
}));
vi.mock("@/components/settings/research-tab", () => ({
  ResearchTab: () => <div data-testid="research-tab" />,
}));

import { useSettings } from "@/lib/use-settings";
import SettingsPage from "../page";

const mockedUseSettings = vi.mocked(useSettings);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fakeSettings = {
  providers: [
    { id: "p1", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-test" },
  ],
  judge: { providerId: "p1", model: "gpt-4" },
  storyteller: { providerId: "p1", model: "gpt-4" },
  generator: { providerId: "p1", model: "gpt-4" },
  embedder: { providerId: "p1", model: "text-embedding" },
  fallback: { providerId: "p1", model: "gpt-3.5" },
  images: {},
  research: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows loading state while settings are loading", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: true,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("renders settings page with heading after loading", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Configure providers, role models, and image generation defaults.",
      ),
    ).toBeInTheDocument();
  });

  it("renders all four tab triggers", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
  });

  it("renders back to title link", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Back to Title")).toBeInTheDocument();
  });

  it("shows 'Saving changes...' when isSaving is true", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: true,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Saving changes...")).toBeInTheDocument();
  });

  it("shows auto-save message when not saving", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText("Changes are saved automatically.")).toBeInTheDocument();
  });

  it("renders footer with provider stats", () => {
    mockedUseSettings.mockReturnValue({
      settings: fakeSettings as never,
      setSettings: vi.fn(),
      isLoading: false,
      isSaving: false,
      save: vi.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByText(/Active providers: 1/)).toBeInTheDocument();
  });
});
