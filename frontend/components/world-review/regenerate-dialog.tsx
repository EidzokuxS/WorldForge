"use client";

import { useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RegenerateDialogProps {
  sectionName: string;
  onConfirm: (instruction: string | undefined) => void;
  regenerating: boolean;
}

export function RegenerateDialog({
  sectionName,
  onConfirm,
  regenerating,
}: RegenerateDialogProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  const handleConfirm = useCallback(() => {
    const value = instruction.trim() || undefined;
    onConfirm(value);
    setOpen(false);
    setInstruction("");
  }, [instruction, onConfirm]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setInstruction("");
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={regenerating}>
          {regenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Regenerate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate {sectionName}</DialogTitle>
          <DialogDescription>
            The AI will regenerate this section from scratch. You can optionally
            provide additional instructions to guide the generation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="regen-instruction">
            Additional instruction (optional)
          </Label>
          <Textarea
            id="regen-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make it more mysterious, add a hidden temple..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
