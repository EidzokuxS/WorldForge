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
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 pr-1 text-xs">
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
        className="h-7 w-28 min-w-0 flex-shrink text-xs"
      />
    </div>
  );
}
