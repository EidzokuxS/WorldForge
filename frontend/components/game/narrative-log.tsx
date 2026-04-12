"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Undo2, Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@worldforge/shared";

interface NarrativeLogProps {
  messages: ChatMessage[];
  premise: string;
  isStreaming: boolean;
  turnPhase?: "idle" | "streaming" | "finalizing";
  sceneProgress?: "opening" | "scene-settling" | null;
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
                if (message.role === "user") {
                  return (
                    <div key={`${message.role}-${index}`} className="pl-3">
                      <p className="whitespace-pre-wrap font-serif text-sm italic leading-relaxed text-mystic">
                        {`> ${message.content}`}
                      </p>
                    </div>
                  );
                }

                if (message.role === "system") {
                  return (
                    <p
                      key={`${message.role}-${index}`}
                      className="whitespace-pre-wrap border-l border-border pl-3 text-sm italic leading-relaxed text-muted-foreground"
                    >
                      {message.content}
                    </p>
                  );
                }

                // Assistant message
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
                        <p
                          onClick={() => startEditing(index, message.content)}
                          className="cursor-pointer whitespace-pre-wrap font-serif text-base leading-relaxed text-foreground hover:bg-accent/30 rounded-md transition-colors px-1 -mx-1"
                          title="Click to edit"
                        >
                          {message.content}
                        </p>
                        {wasEdited && (
                          <span className="mt-1 inline-block text-xs italic text-muted-foreground">
                            (edited)
                          </span>
                        )}
                      </>
                    )}

                    {/* Retry/Undo buttons on last assistant message */}
                    {isLastAssistant && canRetryUndo && !isStreaming && !isEditing && (
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

            {turnPhase === "streaming" ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                The storyteller is weaving the scene...
              </p>
            ) : null}
            {sceneProgress === "opening" ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                The opening scene is taking shape. The runtime is grounding your first moment before narration appears.
              </p>
            ) : null}
            {sceneProgress === "scene-settling" ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                The scene is still settling into place before the narration begins.
              </p>
            ) : null}
            {turnPhase === "finalizing" ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                The world is still resolving. Retry and undo unlock when the turn is complete.
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
