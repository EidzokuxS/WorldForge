import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NarrativeLog } from "../narrative-log";
import type { ChatMessage } from "@worldforge/shared";

describe("NarrativeLog", () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    premise: "",
    isStreaming: false,
  };

  it("shows default empty state when no messages and no premise", () => {
    render(<NarrativeLog {...defaultProps} />);
    expect(
      screen.getByText("Begin your adventure when the opening scene is ready.")
    ).toBeInTheDocument();
  });

  it("does not render premise as opening narration and keeps a neutral opening placeholder when no assistant messages exist", () => {
    render(<NarrativeLog {...defaultProps} premise="You awake in a dungeon." />);
    expect(screen.queryByText("You awake in a dungeon.")).not.toBeInTheDocument();
    expect(
      screen.getByText("Begin your adventure when the opening scene is ready.")
    ).toBeInTheDocument();
  });

  it("shows explicit opening progress copy while the runtime generates the first scene", () => {
    render(<NarrativeLog {...defaultProps} sceneProgress="opening" />);
    expect(
      screen.getByText(
        "The opening scene is taking shape. The runtime is grounding your first moment before narration appears."
      )
    ).toBeInTheDocument();
  });

  it("renders assistant narration as a reader surface, player actions as a distinct block, and support messages separately", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: 'The door yields.\n\n*Cold air spills out.*' },
      { role: "user", content: '"Stay behind me."\n\n*I raise the lantern.*' },
      { role: "system", content: "Game paused." },
      { role: "assistant", content: "[Lookup: faction] The wardens keep watch." },
    ];
    const { container } = render(
      <NarrativeLog {...defaultProps} messages={messages} />
    );

    expect(container.querySelector("article")).not.toBeNull();
    expect(screen.getByText('"Stay behind me."')).toBeInTheDocument();
    expect(screen.queryByText('> "Stay behind me."')).not.toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Lookup")).toBeInTheDocument();
    expect(screen.getByText("The wardens keep watch.")).toBeInTheDocument();
    expect(screen.queryByText(/\[Lookup:/)).not.toBeInTheDocument();
  });

  it("renders power_profile lookups as a dedicated compare block instead of a generic lookup label", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: "[Lookup: power_profile] Speed: Hypersonic",
      },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);

    expect(screen.getByText("Power Profile")).toBeInTheDocument();
    expect(screen.queryByText(/^Lookup$/i)).not.toBeInTheDocument();
    expect(screen.getByText("Speed: Hypersonic")).toBeInTheDocument();
  });

  it("renders persisted compare entries through the same Power Profile block", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: "[Lookup: compare] Gojo controls space while Sukuna owns the harsher finishing ceiling.",
      },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);

    expect(screen.getByText("Power Profile")).toBeInTheDocument();
    expect(screen.queryByText(/^Lookup$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("Gojo controls space while Sukuna owns the harsher finishing ceiling."),
    ).toBeInTheDocument();
  });

  it("shows streaming indicator when isStreaming is true", () => {
    render(<NarrativeLog {...defaultProps} isStreaming={true} />);
    expect(
      screen.getByText("The storyteller is weaving the scene...")
    ).toBeInTheDocument();
  });

  it("does not show streaming indicator when isStreaming is false", () => {
    render(<NarrativeLog {...defaultProps} isStreaming={false} />);
    expect(
      screen.queryByText("The storyteller is weaving the scene...")
    ).not.toBeInTheDocument();
  });

  it("renders multiple messages in order", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "I look around" },
      { role: "assistant", content: "You see a dark cave." },
      { role: "user", content: "I enter the cave" },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);
    expect(screen.getByText("I look around")).toBeInTheDocument();
    expect(screen.getByText("You see a dark cave.")).toBeInTheDocument();
    expect(screen.getByText("I enter the cave")).toBeInTheDocument();
  });

  it("keeps streaming, opening, and finalizing statuses outside story prose as compact status blocks", () => {
    render(
      <NarrativeLog
        {...defaultProps}
        turnPhase="finalizing"
        sceneProgress="opening"
        isStreaming={true}
      />
    );

    expect(screen.getByText("The storyteller is weaving the scene...")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The opening scene is taking shape. The runtime is grounding your first moment before narration appears."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The world is still resolving. Retry and undo unlock when the turn is complete."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("Status").length).toBeGreaterThanOrEqual(3);
  });

  it("renders a Raw reasoning disclosure only for assistant narration when enabled and populated", () => {
    const messages: Array<ChatMessage & { debugReasoning?: string | null }> = [
      { role: "assistant", content: "The wardens close in.", debugReasoning: "Model compared the local threat cues before settling on visible prose." },
      { role: "user", content: "I step back.", debugReasoning: "should never render" },
      { role: "assistant", content: "[Lookup: faction] The wardens keep watch.", debugReasoning: "lookup should not render reasoning" },
    ];

    render(
      <NarrativeLog
        {...defaultProps}
        messages={messages}
        showRawReasoning={true}
      />,
    );

    expect(screen.getByText("Raw reasoning")).toBeInTheDocument();
    expect(
      screen.getByText("Model compared the local threat cues before settling on visible prose."),
    ).toBeInTheDocument();
    expect(screen.queryByText("should never render")).not.toBeInTheDocument();
    expect(screen.queryByText("lookup should not render reasoning")).not.toBeInTheDocument();
  });

  it("does not render an empty reasoning disclosure when disabled or absent", () => {
    const messages: Array<ChatMessage & { debugReasoning?: string | null }> = [
      { role: "assistant", content: "The wardens close in.", debugReasoning: "Hidden chain-of-thought." },
      { role: "assistant", content: "Only visible prose remains.", debugReasoning: "   " },
    ];

    const { rerender } = render(
      <NarrativeLog
        {...defaultProps}
        messages={messages}
        showRawReasoning={false}
      />,
    );

    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();

    rerender(
      <NarrativeLog
        {...defaultProps}
        messages={[messages[1]!]}
        showRawReasoning={true}
      />,
    );

    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();
  });
});
