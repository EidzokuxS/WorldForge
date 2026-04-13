"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Undo2, Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@worldforge/shared";
import {
  deriveGameMessageKind,
  stripLookupPrefix,
  type GameMessageKind,
} from "@/lib/gameplay-text";
import { RichTextMessage } from "./rich-text-message";
import { SpecialMessageBlock } from "./special-message-block";

interface NarrativeLogProps {
  messages: Array<ChatMessage & { debugReasoning?: string | null }>;
  premise: string;
  isStreaming: boolean;
  turnPhase?: "idle" | "streaming" | "finalizing";
  sceneProgress?: "opening" | "scene-settling" | null;
  showRawReasoning?: boolean;
  onRetry?: () => void;
  onUndo?: () => void;
  onEdit?: (index: number, content: string) => void;
  canRetryUndo?: boolean;
}

export function NarrativeLog({
  messages,
  premise: _premise,
  isStreaming,
  turnPhase = isStreaming ? "streaming" : "idle",
  sceneProgress = null,
  showRawReasoning = false,
  onRetry,
  onUndo,
  onEdit,
  canRetryUndo,
}: NarrativeLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editedIndices, setEditedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    const viewport = containerRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isStreaming]);

  const startEditing = (index: number, content: string) => {
    if (isStreaming) return;
    setEditingIndex(index);
    setEditText(content);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditText("");
  };

  const saveEdit = () => {
    if (editingIndex === null || !onEdit) return;
    onEdit(editingIndex, editText);
    setEditedIndices((prev) => new Set(prev).add(editingIndex));
    cancelEditing();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      cancelEditing();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEdit();
    }
  };

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const progressMessages = [
    (isStreaming || turnPhase === "streaming") &&
      "The storyteller is weaving the scene...",
    sceneProgress === "opening" &&
      "The opening scene is taking shape. The runtime is grounding your first moment before narration appears.",
    sceneProgress === "scene-settling" &&
      "The scene is still settling into place before the narration begins.",
    turnPhase === "finalizing" &&
      "The world is still resolving. Retry and undo unlock when the turn is complete.",
  ].filter((message): message is string => Boolean(message));

  const renderSupportMessage = (kind: GameMessageKind, content: string) => {
    const normalizedContent =
      kind === "lookup" || kind === "compare"
        ? stripLookupPrefix(content)
        : content;

    if (
      kind === "lookup" ||
      kind === "compare" ||
      kind === "system" ||
      kind === "mechanical" ||
      kind === "progress"
    ) {
      return <SpecialMessageBlock kind={kind} content={normalizedContent} />;
    }

    return (
      <article className="mx-auto w-full max-w-2xl rounded-[1.75rem] border border-white/8 bg-white/[0.03] px-6 py-6 shadow-[0_28px_60px_-32px_rgba(0,0,0,0.85)]">
        <RichTextMessage content={content} variant="narration" />
      </article>
    );
  };

  return (
    <section className="flex-1 overflow-hidden">
      <div ref={containerRef} className="h-full">
        <ScrollArea className="h-full">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:px-12">
            {messages.length === 0 ? (
              <p className="pt-12 font-serif text-lg italic leading-relaxed text-muted-foreground">
                Begin your adventure when the opening scene is ready.
              </p>
            ) : (
              messages.map((message, index) => {
                const kind = deriveGameMessageKind(message.role, message.content);
                const isAssistant = message.role === "assistant";
                const reasoningText =
                  typeof message.debugReasoning === "string"
                    ? message.debugReasoning.trim()
                    : "";
                const showReasoningDisclosure =
                  isAssistant
                  && kind === "narration"
                  && showRawReasoning
                  && reasoningText.length > 0;

                if (message.role === "user") {
                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className="flex justify-end"
                    >
                      <div className="max-w-[85%] rounded-[1.5rem] rounded-tr-md border border-white/10 bg-white/[0.045] px-5 py-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.8)]">
                        <RichTextMessage
                          content={message.content}
                          variant="player"
                        />
                      </div>
                    </div>
                  );
                }

                if (message.role === "system") {
                  return (
                    <div key={`${message.role}-${index}`}>
                      <SpecialMessageBlock kind="system" content={message.content} />
                    </div>
                  );
                }

                const isLastAssistant = index === lastAssistantIndex;
                const isEditing = editingIndex === index;
                const wasEdited = editedIndices.has(index);

                return (
                  <div key={`${message.role}-${index}`} className="group relative">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="w-full resize-none rounded-md border border-border bg-background p-3 font-serif text-base leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          style={{ minHeight: "120px" }}
                          rows={Math.max(4, editText.split("\n").length)}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEdit}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                          <span className="text-xs text-muted-foreground">
                            Ctrl+Enter to save, Esc to cancel
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          onClick={() => startEditing(index, message.content)}
                          className="cursor-pointer rounded-2xl transition-colors hover:bg-accent/20"
                          title="Click to edit"
                        >
                          {renderSupportMessage(kind, message.content)}
                        </div>
                        {wasEdited && (
                          <span className="mt-1 inline-block text-xs italic text-muted-foreground">
                            (edited)
                          </span>
                        )}
                        {showReasoningDisclosure ? (
                          <details className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
                              Raw reasoning
                            </summary>
                            <div className="border-t border-white/10 px-4 py-3">
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/35 p-3 font-mono text-xs leading-6 text-zinc-200">
                                {reasoningText}
                              </pre>
                            </div>
                          </details>
                        ) : null}
                      </>
                    )}

                    {/* Retry/Undo buttons on last assistant message */}
                    {isAssistant &&
                      isLastAssistant &&
                      canRetryUndo &&
                      !isStreaming &&
                      !isEditing && (
                      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {onRetry && (
                          <button
                            onClick={onRetry}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Retry"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </button>
                        )}
                        {onUndo && (
                          <button
                            onClick={onUndo}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Undo"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Undo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {progressMessages.map((message, index) => (
              <SpecialMessageBlock
                key={`progress-${index}`}
                kind="progress"
                content={message}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
