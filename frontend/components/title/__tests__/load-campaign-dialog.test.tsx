import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadCampaignDialog } from "../load-campaign-dialog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const MOCK_CAMPAIGNS = [
  {
    id: "camp-1",
    name: "Dragon Age",
    premise: "A world of dragons and magic",
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 50000,
  },
  {
    id: "camp-2",
    name: "Cyberpunk Run",
    premise: "Neon-lit streets",
    createdAt: Date.now() - 200000,
    updatedAt: Date.now(),
  },
];

describe("LoadCampaignDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(MOCK_CAMPAIGNS);
  });

  it("renders the trigger button", () => {
    render(<LoadCampaignDialog onLoaded={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Load Campaign/i })
    ).toBeInTheDocument();
  });

  it("fetches and displays campaigns when dialog opens", async () => {
    const user = userEvent.setup();
    render(<LoadCampaignDialog onLoaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Load Campaign/i }));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith("/api/campaigns");
    });

    await waitFor(() => {
      expect(screen.getByText("Dragon Age")).toBeInTheDocument();
      expect(screen.getByText("Cyberpunk Run")).toBeInTheDocument();
    });
  });

  it("shows empty state when no campaigns exist", async () => {
    mockApiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<LoadCampaignDialog onLoaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Load Campaign/i }));

    await waitFor(() => {
      expect(
        screen.getByText("No campaigns yet. Create one!")
      ).toBeInTheDocument();
    });
  });

  it("renders campaign premises", async () => {
    const user = userEvent.setup();
    render(<LoadCampaignDialog onLoaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Load Campaign/i }));

    await waitFor(() => {
      expect(
        screen.getByText("A world of dragons and magic")
      ).toBeInTheDocument();
      expect(screen.getByText("Neon-lit streets")).toBeInTheDocument();
    });
  });

  it("shows Load and Delete buttons for each campaign", async () => {
    const user = userEvent.setup();
    render(<LoadCampaignDialog onLoaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Load Campaign/i }));

    await waitFor(() => {
      const loadButtons = screen.getAllByRole("button", { name: /^Load$/i });
      const deleteButtons = screen.getAllByRole("button", {
        name: /^Delete$/i,
      });
      expect(loadButtons).toHaveLength(2);
      expect(deleteButtons).toHaveLength(2);
    });
  });
});
