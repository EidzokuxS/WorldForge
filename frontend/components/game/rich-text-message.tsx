"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";
import {
  isDialogueParagraph,
  preserveSoftBreaks,
  splitGameplayParagraphs,
} from "@/lib/gameplay-text";

interface RichTextMessageProps {
  content: string;
  variant?: "narration" | "player";
  className?: string;
}

export function RichTextMessage({
  content,
  variant = "narration",
  className,
}: RichTextMessageProps) {
  const paragraphs = splitGameplayParagraphs(content);

  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className={clsx("space-y-4", className)}>
      {paragraphs.map((paragraph, index) => {
        const isDialogue = isDialogueParagraph(paragraph);

        return (
          <p
            key={`${variant}-${index}`}
            className={clsx(
              "text-bone leading-8",
              variant === "narration"
                ? "font-serif text-[1.05rem]"
                : "font-sans text-sm leading-7 text-foreground",
              isDialogue && "text-white"
            )}
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              unwrapDisallowed
              allowedElements={["em", "strong", "br"]}
              components={{
                em: ({ children }) => (
                  <em className="rounded-sm bg-white/5 px-0.5 not-italic text-white/92">
                    {children}
                  </em>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-white">{children}</strong>
                ),
              }}
            >
              {preserveSoftBreaks(paragraph)}
            </Markdown>
          </p>
        );
      })}
    </div>
  );
}
