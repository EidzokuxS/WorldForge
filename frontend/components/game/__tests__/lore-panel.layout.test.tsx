import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  getLoreCards: vi.fn().mockResolvedValue([]),
  searchLore: vi.fn().mockResolvedValue([]),
}));

import { LorePanel } from "@/components/game/lore-panel";

describe("Phase 59: LorePanel outer layout contract", () => {
  it("renders an aside with flex + flex-col + overflow-hidden in the empty-state branch", () => {
    const { container } = render(<LorePanel campaignId={null} />);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.className).toMatch(/\bflex\b/);
    expect(aside!.className).toMatch(/\bflex-col\b/);
    expect(aside!.className).toMatch(/\bw-full\b/);
    expect(aside!.className).toMatch(/\boverflow-hidden\b/);
    expect(aside!.className).not.toMatch(/lg:w-\[250px\]/);
  });

  it("exposes a canonical ScrollArea viewport via data-slot", () => {
    const { container } = render(<LorePanel campaignId={null} />);
    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    expect(viewport).not.toBeNull();
  });
});
