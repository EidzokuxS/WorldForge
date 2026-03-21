import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleConfigCard } from "../role-config-card";
import type { Provider, RoleConfig } from "@/lib/types";

const mockProviders: Provider[] = [
  {
    id: "prov-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    defaultModel: "gpt-4o-mini",
    isBuiltin: true,
  },
  {
    id: "prov-2",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "sk-ant",
    defaultModel: "claude-sonnet",
    isBuiltin: true,
  },
];

const mockConfig: RoleConfig = {
  providerId: "prov-1",
  temperature: 0.7,
  maxTokens: 4000,
};

describe("RoleConfigCard", () => {
  it("renders role title and description", () => {
    render(
      <RoleConfigCard
        roleName="judge"
        title="Judge"
        description="Determines outcomes"
        config={mockConfig}
        providers={mockProviders}
        resolvedProvider={mockProviders[0]}
        isTesting={false}
        onConfigChange={vi.fn()}
        onTestRole={vi.fn()}
      />
    );

    expect(screen.getByText("Judge")).toBeInTheDocument();
    expect(screen.getByText("Determines outcomes")).toBeInTheDocument();
  });

  it("renders provider select and model input", () => {
    render(
      <RoleConfigCard
        roleName="storyteller"
        title="Storyteller"
        description="Narrates the story"
        config={mockConfig}
        providers={mockProviders}
        resolvedProvider={mockProviders[0]}
        isTesting={false}
        onConfigChange={vi.fn()}
        onTestRole={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Model (leave empty for provider default)")
    ).toBeInTheDocument();
  });

  it("renders temperature slider and max tokens when hideAdvanced is false", () => {
    render(
      <RoleConfigCard
        roleName="generator"
        title="Generator"
        description="Generates content"
        config={mockConfig}
        providers={mockProviders}
        resolvedProvider={mockProviders[0]}
        isTesting={false}
        onConfigChange={vi.fn()}
        onTestRole={vi.fn()}
      />
    );

    expect(screen.getByText("Default temperature")).toBeInTheDocument();
    expect(screen.getByText("0.7")).toBeInTheDocument();
    expect(screen.getByLabelText("Max tokens")).toBeInTheDocument();
  });

  it("hides advanced controls when hideAdvanced is true", () => {
    render(
      <RoleConfigCard
        roleName="embedder"
        title="Embedder"
        description="Creates embeddings"
        config={mockConfig}
        providers={mockProviders}
        resolvedProvider={mockProviders[0]}
        isTesting={false}
        hideAdvanced
        onConfigChange={vi.fn()}
        onTestRole={vi.fn()}
      />
    );

    expect(screen.queryByText("Default temperature")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Max tokens")).not.toBeInTheDocument();
  });
});
