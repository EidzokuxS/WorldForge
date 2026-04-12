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

  it("renders user messages with > prefix", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "I open the door" },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);
    expect(screen.getByText("> I open the door")).toBeInTheDocument();
  });

  it("renders assistant messages", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: "The door creaks open slowly." },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);
    expect(
      screen.getByText("The door creaks open slowly.")
    ).toBeInTheDocument();
  });

  it("renders system messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "Game paused." },
    ];
    render(<NarrativeLog {...defaultProps} messages={messages} />);
    expect(screen.getByText("Game paused.")).toBeInTheDocument();
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
    expect(screen.getByText("> I look around")).toBeInTheDocument();
    expect(screen.getByText("You see a dark cave.")).toBeInTheDocument();
    expect(screen.getByText("> I enter the cave")).toBeInTheDocument();
  });
});
