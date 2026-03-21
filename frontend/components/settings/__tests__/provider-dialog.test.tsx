import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProviderDialog,
  DEFAULT_PROVIDER_DRAFT,
  type ProviderDraft,
} from "../provider-dialog";

const filledDraft: ProviderDraft = {
  name: "My Provider",
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-secret-123",
  defaultModel: "gpt-4o",
  isBuiltin: false,
};

describe("ProviderDialog", () => {
  it("renders form fields with draft values when open", () => {
    render(
      <ProviderDialog
        open={true}
        onOpenChange={vi.fn()}
        draft={filledDraft}
        onDraftChange={vi.fn()}
        isEditing={false}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Add Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("My Provider");
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://api.example.com/v1"
    );
    expect(screen.getByLabelText("Default Model")).toHaveValue("gpt-4o");
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
  });

  it("shows Edit Provider title when isEditing is true", () => {
    render(
      <ProviderDialog
        open={true}
        onOpenChange={vi.fn()}
        draft={filledDraft}
        onDraftChange={vi.fn()}
        isEditing={true}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Edit Provider")).toBeInTheDocument();
  });

  it("calls onSave when Save Provider button is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProviderDialog
        open={true}
        onOpenChange={vi.fn()}
        draft={filledDraft}
        onDraftChange={vi.fn()}
        isEditing={false}
        onSave={onSave}
      />
    );

    await user.click(screen.getByText("Save Provider"));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
