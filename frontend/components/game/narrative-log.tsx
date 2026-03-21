"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "./types";

interface NarrativeLogProps {
  messages: ChatMessage[];
  premise: string;
  isStreaming: boolean;
}

export function NarrativeLog({ messages, premise, isStreaming }: NarrativeLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = containerRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <section className="flex-1 overflow-hidden">
      <div ref={containerRef} className="h-full">
        <ScrollArea className="h-full">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:px-12">
            {messages.length === 0 ? (
              <p className="pt-12 font-serif text-lg italic leading-relaxed text-muted-foreground">
                {premise || "Begin your adventure..."}
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

                return (
                  <p
                    key={`${message.role}-${index}`}
                    className="whitespace-pre-wrap font-serif text-base leading-relaxed text-foreground"
                  >
                    {message.content}
                  </p>
                );
              })
            )}

            {isStreaming && (
              <p className="font-serif text-sm italic text-muted-foreground">
                The storyteller is weaving the scene...
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
