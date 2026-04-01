import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import NonGameLayout from "@/app/(non-game)/layout";

describe("NonGameLayout", () => {
  it("composes the shared shell and keeps a dedicated child slot for downstream pages", () => {
    render(
      <NonGameLayout>
        <div>Launchpad child</div>
      </NonGameLayout>,
    );

    expect(screen.getByText("Campaign Launchpad")).toBeInTheDocument();
    expect(screen.getByText("Launchpad")).toBeInTheDocument();
    expect(screen.getAllByText("New Campaign")).toHaveLength(2);

    const main = screen.getByRole("main");
    expect(within(main).getByText("Launchpad child")).toBeInTheDocument();
  });
});
