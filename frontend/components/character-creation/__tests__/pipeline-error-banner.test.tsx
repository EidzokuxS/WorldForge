import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PipelineErrorBanner } from "../pipeline-error-banner";

describe("PipelineErrorBanner", () => {
  it("renders the stage-specific heading when stage is provided", () => {
    render(
      <PipelineErrorBanner
        error="LLM timed out"
        stage="synthesize"
        attempts={3}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/Draft Synthesis failed/i)).toBeInTheDocument();
  });

  it("renders generic Pipeline failed when stage is undefined", () => {
    render(
      <PipelineErrorBanner
        error="Unknown error"
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/Pipeline failed/i)).toBeInTheDocument();
  });

  it("pluralizes attempts correctly", () => {
    const { rerender } = render(
      <PipelineErrorBanner
        error="x"
        stage="power_assess"
        attempts={3}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/after 3 attempts/i)).toBeInTheDocument();

    rerender(
      <PipelineErrorBanner
        error="x"
        stage="power_assess"
        attempts={1}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/after 1 attempt\b/i)).toBeInTheDocument();
  });

  it("applies role=alert and aria-live=polite on the outer region", () => {
    render(
      <PipelineErrorBanner
        error="x"
        stage="synthesize"
        onRetry={() => {}}
        retrying={false}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
  });

  it("fires onRetry when the Retry button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <PipelineErrorBanner
        error="x"
        stage="synthesize"
        onRetry={onRetry}
        retrying={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry last ingestion/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables the Retry button and shows Retrying... when retrying=true", () => {
    render(
      <PipelineErrorBanner
        error="x"
        stage="synthesize"
        onRetry={() => {}}
        retrying
      />,
    );
    const retryButton = screen.getByRole("button", { name: /retry last ingestion/i }) as HTMLButtonElement;
    expect(retryButton.disabled).toBe(true);
    expect(screen.getByText(/Retrying\.\.\./i)).toBeInTheDocument();
  });

  it("renders Dismiss button only when onDismiss prop is provided", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <PipelineErrorBanner
        error="x"
        stage="synthesize"
        onRetry={() => {}}
        retrying={false}
        onDismiss={onDismiss}
      />,
    );
    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(
      <PipelineErrorBanner
        error="x"
        stage="synthesize"
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });
});
