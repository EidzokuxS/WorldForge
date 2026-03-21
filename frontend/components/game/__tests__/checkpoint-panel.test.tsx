import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/api", () => ({
  fetchCheckpoints: vi.fn(),
  createCheckpointApi: vi.fn(),
  loadCheckpointApi: vi.fn(),
  deleteCheckpointApi: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  fetchCheckpoints,
  createCheckpointApi,
} from "@/lib/api";
import { CheckpointPanel } from "../checkpoint-panel";

const mockedFetch = vi.mocked(fetchCheckpoints);
const mockedCreate = vi.mocked(createCheckpointApi);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const sampleCheckpoints = [
  { id: "cp-1", name: "Before the boss", description: "", createdAt: Date.now(), auto: false },
  { id: "cp-2", name: "Auto save", description: "Turn 5", createdAt: Date.now() - 60000, auto: true },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckpointPanel", () => {
  it("renders dialog title when open", async () => {
    mockedFetch.mockResolvedValue(sampleCheckpoints);

    render(<CheckpointPanel campaignId="c1" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Checkpoints")).toBeInTheDocument();
    });
  });

  it("shows checkpoint list after loading", async () => {
    mockedFetch.mockResolvedValue(sampleCheckpoints);

    render(<CheckpointPanel campaignId="c1" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Before the boss")).toBeInTheDocument();
    });
    expect(screen.getByText("Auto save")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
  });

  it("shows empty state when no checkpoints exist", async () => {
    mockedFetch.mockResolvedValue([]);

    render(<CheckpointPanel campaignId="c1" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No checkpoints yet/)).toBeInTheDocument();
    });
  });

  it("renders save input and Save button", async () => {
    mockedFetch.mockResolvedValue([]);

    render(<CheckpointPanel campaignId="c1" open={true} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("Checkpoint name (optional)")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("creates checkpoint on Save click", async () => {
    mockedFetch.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(undefined as never);

    render(<CheckpointPanel campaignId="c1" open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No checkpoints yet/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Checkpoint name (optional)");
    await userEvent.type(input, "My save");

    const saveBtn = screen.getByText("Save");
    await userEvent.click(saveBtn);

    expect(mockedCreate).toHaveBeenCalledWith("c1", "My save");
  });
});
