import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterForm, type BusyState } from "../character-form";

type FormProps = Parameters<typeof CharacterForm>[0];

function makeProps(overrides: Partial<FormProps> = {}): FormProps {
  return {
    busy: "idle" as BusyState,
    overrideText: "",
    onOverrideTextChange: vi.fn(),
    onParse: vi.fn(),
    onGenerate: vi.fn(),
    onResearch: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
}

function renderForm(overrides: Partial<FormProps> = {}) {
  const props = makeProps(overrides);
  const utils = render(<CharacterForm {...props} />);
  return { ...utils, props };
}

function ControlledFormHarness({
  initialOverride = "",
  onSpyChange,
  ...rest
}: Partial<FormProps> & { initialOverride?: string; onSpyChange?: (v: string) => void }) {
  const [override, setOverride] = useState(initialOverride);
  return (
    <CharacterForm
      {...makeProps({
        ...rest,
        overrideText: override,
        onOverrideTextChange: (v) => {
          setOverride(v);
          onSpyChange?.(v);
        },
      })}
    />
  );
}

describe("CharacterForm 4-mode surface", () => {
  it("exposes four creation modes", () => {
    renderForm();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("defaults to parse mode in full variant", () => {
    renderForm();
    const parseTab = screen.getByRole("tab", { name: /describe character/i });
    expect(parseTab).toHaveAttribute("aria-selected", "true");
  });

  it("preserves description across mode switches", async () => {
    const user = userEvent.setup();
    renderForm();

    const textarea = screen.getByLabelText(/character description/i) as HTMLTextAreaElement;
    await user.type(textarea, "a grizzled veteran");
    expect(textarea.value).toBe("a grizzled veteran");

    await user.click(screen.getByRole("tab", { name: /research archetype/i }));
    expect(screen.queryByLabelText(/character description/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /describe character from free text/i }));
    const restored = screen.getByLabelText(/character description/i) as HTMLTextAreaElement;
    expect(restored.value).toBe("a grizzled veteran");
  });

  it("preserves override text across mode switches", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<ControlledFormHarness onSpyChange={spy} />);

    const override = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    await user.type(override, "eyes are red not blue");
    expect(override.value).toBe("eyes are red not blue");

    await user.click(screen.getByRole("tab", { name: /generate character from scratch/i }));
    const overrideAfter = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    expect(overrideAfter.value).toBe("eyes are red not blue");
  });

  it("calls onParse with trimmed description from parse mode", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    const textarea = screen.getByLabelText(/character description/i);
    await user.type(textarea, "  a brave warrior  ");
    await user.click(screen.getByRole("button", { name: /parse character/i }));

    expect(props.onParse).toHaveBeenCalledWith("a brave warrior");
  });

  it("calls onGenerate from generate mode button", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await user.click(screen.getByRole("tab", { name: /generate character from scratch/i }));
    await user.click(screen.getByRole("button", { name: /^ai generate$/i }));

    expect(props.onGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls onResearch with trimmed archetype", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await user.click(screen.getByRole("tab", { name: /research archetype/i }));
    const archetypeInput = screen.getByLabelText(/archetype to research/i);
    await user.type(archetypeInput, "  a court mage  ");
    await user.click(screen.getByRole("button", { name: /^research archetype$/i }));

    expect(props.onResearch).toHaveBeenCalledWith("a court mage");
  });

  it("calls onImport with file and importMode", async () => {
    const user = userEvent.setup();
    const { props } = renderForm();

    await user.click(screen.getByRole("tab", { name: /import sillytavern/i }));
    const file = new File(['{"name":"X"}'], "x.json", { type: "application/json" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(props.onImport).toHaveBeenCalledWith(file, "native");
  });

  it("disables action buttons during busy state", () => {
    renderForm({ busy: "parsing" });
    const parseBtn = screen.getByRole("button", { name: /parsing/i });
    expect(parseBtn).toBeDisabled();
  });

  it("disables mode tabs during busy state", () => {
    renderForm({ busy: "generating" });
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toBeDisabled();
    }
  });

  it("shows loading text when parsing is in progress", () => {
    renderForm({ busy: "parsing" });
    expect(screen.getByText(/parsing/i)).toBeInTheDocument();
  });
});

describe("CharacterForm compact variant", () => {
  it("wraps override text inside a collapsible details element", () => {
    renderForm({ compact: true });

    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toMatch(/override instructions/i);
  });

  it("compact variant has no default mode selected", () => {
    renderForm({ compact: true });
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-selected", "false");
    }
  });
});
