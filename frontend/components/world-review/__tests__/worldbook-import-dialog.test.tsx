import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/api", () => ({
  parseWorldBook: vi.fn(),
  importWorldBook: vi.fn(),
}));

import { parseWorldBook } from "@/lib/api";
import { WorldBookImportDialog } from "../worldbook-import-dialog";

const mockedParse = vi.mocked(parseWorldBook);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const defaultProps = {
  campaignId: "c1",
  open: true,
  onOpenChange: vi.fn(),
  onComplete: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldBookImportDialog", () => {
  it("renders dialog title when open", () => {
    render(<WorldBookImportDialog {...defaultProps} />);
    expect(screen.getByText("Import WorldBook")).toBeInTheDocument();
  });

  it("shows file upload area in idle state", () => {
    render(<WorldBookImportDialog {...defaultProps} />);
    expect(screen.getByText(/Drag and drop a SillyTavern WorldBook/)).toBeInTheDocument();
    expect(screen.getByText("Choose File")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<WorldBookImportDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("Import WorldBook")).not.toBeInTheDocument();
  });

  it("has a hidden file input for JSON files", () => {
    render(<WorldBookImportDialog {...defaultProps} />);
    // Dialog content is rendered in a portal on document.body
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.accept).toBe(".json");
    expect(fileInput.className).toContain("hidden");
  });

  it("shows error state on parse failure", async () => {
    mockedParse.mockRejectedValue(new Error("Bad format"));

    render(<WorldBookImportDialog {...defaultProps} />);

    // Dialog content is rendered in a portal on document.body
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['{"entries":[]}'], "worldbook.json", { type: "application/json" });

    await userEvent.upload(fileInput, testFile);

    // Wait for error state
    const errorText = await screen.findByText("Bad format");
    expect(errorText).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });
});
