"use client";

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagEditor({ tags, onChange, placeholder = "Add tag..." }: TagEditorProps) {
  const [input, setInput] = useState("");

  const handleAdd = useCallback(() => {
    const value = input.trim();
    if (!value || tags.includes(value)) return;
    onChange([...tags, value]);
    setInput("");
  }, [input, tags, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 rounded-sm border border-zinc-700 bg-zinc-800 pr-1 font-mono text-[11px] text-zinc-300">
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(i)}
            className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-[22px] w-24 min-w-0 flex-shrink rounded-sm border-dashed px-1.5 font-mono text-[11px] text-zinc-400"
      />
    </div>
  );
}
