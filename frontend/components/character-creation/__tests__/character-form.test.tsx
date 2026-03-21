import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterForm } from "../character-form";

function renderForm(overrides: Partial<Parameters<typeof CharacterForm>[0]> = {}) {
  const props = {
    onParse: vi.fn(),
    onGenerate: vi.fn(),
    onImport: vi.fn(),
    parsing: false,
    generating: false,
    importing: false,
    ...overrides,
  };
  return { ...render(<CharacterForm {...props} />), props };
}

describe("CharacterForm", () => {
  it("renders the description textarea and all three action buttons", () => {
    renderForm();

    expect(
      screen.getByPlaceholderText(/grizzled ex-soldier/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Parse Character/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /AI Generate/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Import V2 Card/i })
    ).toBeInTheDocument();
  });

  it("disables Parse button when textarea is empty", () => {
    renderForm();

    const parseBtn = screen.getByRole("button", { name: /Parse Character/i });
    expect(parseBtn).toBeDisabled();
  });

  it("enables Parse button when user types a description", async () => {
    const user = userEvent.setup();
    renderForm();

    const textarea = screen.getByPlaceholderText(/grizzled ex-soldier/i);
    await user.type(textarea, "A brave warrior");

    const parseBtn = screen.getByRole("button", { name: /Parse Character/i });
    expect(parseBtn).toBeEnabled();
  });

  it("calls onParse with trimmed text when Parse button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    const textarea = screen.getByPlaceholderText(/grizzled ex-soldier/i);
    await user.type(textarea, "  A brave warrior  ");
    await user.click(screen.getByRole("button", { name: /Parse Character/i }));

    expect(props.onParse).toHaveBeenCalledWith("A brave warrior");
  });

  it("calls onGenerate when AI Generate button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await user.click(screen.getByRole("button", { name: /AI Generate/i }));
    expect(props.onGenerate).toHaveBeenCalled();
  });

  it("shows loading text when parsing is in progress", () => {
    renderForm({ parsing: true });

    expect(screen.getByText("Parsing...")).toBeInTheDocument();
  });

  it("disables all buttons when busy (generating)", () => {
    renderForm({ generating: true });

    expect(
      screen.getByRole("button", { name: /Generating.../i })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Parse Character/i })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Import V2 Card/i })
    ).toBeDisabled();
  });
});
