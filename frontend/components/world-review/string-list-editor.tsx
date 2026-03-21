"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}

export function StringListEditor({
  items,
  onChange,
  placeholder,
}: StringListEditorProps) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const value = input.trim();
    if (!value) return;
    onChange([...items, value]);
    setInput("");
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div
          key={`${item}-${i}`}
          className="flex items-start gap-1 text-sm text-foreground"
        >
          <span className="mt-0.5 text-muted-foreground">-</span>
          <span className="flex-1">{item}</span>
          <button
            type="button"
            onClick={() => handleRemove(i)}
            className="mt-0.5 flex-shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-7 flex-1 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={handleAdd}
          disabled={!input.trim()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
