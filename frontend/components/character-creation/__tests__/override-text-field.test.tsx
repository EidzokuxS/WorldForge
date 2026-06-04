import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { OverrideTextField } from "../override-text-field";

describe("OverrideTextField", () => {
  it("renders with an Override Instructions label", () => {
    render(<OverrideTextField value="" onChange={() => {}} />);
    expect(screen.getByText(/override instructions/i)).toBeInTheDocument();
  });

  it("calls onChange with the new value when typed", () => {
    const onChange = vi.fn();
    render(<OverrideTextField value="" onChange={onChange} />);
    const textarea = screen.getByLabelText(/override instructions/i);
    fireEvent.change(textarea, { target: { value: "eyes are red" } });
    expect(onChange).toHaveBeenCalledWith("eyes are red");
  });

  it("enforces maxLength of 2000 on the textarea", () => {
    render(<OverrideTextField value="" onChange={() => {}} />);
    const textarea = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);
  });

  it("shows visible counter reflecting the current value length", () => {
    const { rerender } = render(<OverrideTextField value="" onChange={() => {}} />);
    expect(screen.getByText("0/2000")).toBeInTheDocument();
    rerender(<OverrideTextField value="hi" onChange={() => {}} />);
    expect(screen.getByText("2/2000")).toBeInTheDocument();
  });

  it("disables the textarea when disabled=true", () => {
    render(<OverrideTextField value="" onChange={() => {}} disabled />);
    const textarea = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("placeholder text is generic and free of franchise names", () => {
    render(<OverrideTextField value="" onChange={() => {}} />);
    const textarea = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    expect(textarea.placeholder).not.toMatch(/gandalf|naruto|gojo|skywalker|hogwarts/i);
    expect(textarea.placeholder.length).toBeGreaterThan(10);
  });

  it("renders with fewer rows in compact mode", () => {
    render(<OverrideTextField value="" onChange={() => {}} compact />);
    const textarea = screen.getByLabelText(/override instructions/i) as HTMLTextAreaElement;
    expect(textarea.rows).toBe(2);
  });
});
