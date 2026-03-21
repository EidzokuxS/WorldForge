"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchCheckpoints,
  createCheckpointApi,
  loadCheckpointApi,
  deleteCheckpointApi,
} from "@/lib/api";
import type { CheckpointMeta } from "@/lib/api-types";
import { getErrorMessage } from "@/lib/settings";

interface CheckpointPanelProps {
  campaignId: string;
  open: boolean;
  onClose: () => void;
}

export function CheckpointPanel({ campaignId, open, onClose }: CheckpointPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<CheckpointMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CheckpointMeta | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCheckpoints(campaignId);
      setCheckpoints(list);
    } catch (error) {
      toast.error("Failed to load checkpoints", {
        description: getErrorMessage(error, "Unknown error."),
      });
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createCheckpointApi(campaignId, saveName.trim() || undefined);
      setSaveName("");
      toast.success("Checkpoint saved");
      await refresh();
    } catch (error) {
      toast.error("Failed to save checkpoint", {
        description: getErrorMessage(error, "Unknown error."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (cp: CheckpointMeta) => {
    try {
      await loadCheckpointApi(campaignId, cp.id);
      toast.success("Checkpoint loaded, refreshing...");
      window.location.reload();
    } catch (error) {
      toast.error("Failed to load checkpoint", {
        description: getErrorMessage(error, "Unknown error."),
      });
    }
  };

  const handleDelete = async (cp: CheckpointMeta) => {
    try {
      await deleteCheckpointApi(campaignId, cp.id);
      setCheckpoints((prev) => prev.filter((c) => c.id !== cp.id));
      toast.success("Checkpoint deleted");
    } catch (error) {
      toast.error("Failed to delete checkpoint", {
        description: getErrorMessage(error, "Unknown error."),
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Checkpoints</DialogTitle>
          </DialogHeader>

          {/* Save section */}
          <div className="flex gap-2">
            <Input
              placeholder="Checkpoint name (optional)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSave()}
              disabled={saving}
            />
            <Button onClick={() => void handleSave()} disabled={saving} size="sm">
              <Save className="mr-1 h-4 w-4" />
              Save
            </Button>
          </div>

          {/* Checkpoint list */}
          <ScrollArea className="max-h-[400px]">
            {loading && checkpoints.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Loading...
              </p>
            )}
            {!loading && checkpoints.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No checkpoints yet. Save your first checkpoint above.
              </p>
            )}
            <div className="space-y-2">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className="rounded-md border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {cp.name}
                        </span>
                        {cp.auto && (
                          <Badge variant="secondary" className="text-[10px]">
                            Auto
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cp.createdAt).toLocaleString()}
                      </p>
                      {cp.description && (
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          {cp.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Load"
                        onClick={() => setConfirmLoad(cp)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => setConfirmDelete(cp)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirm load */}
      <AlertDialog
        open={!!confirmLoad}
        onOpenChange={(v) => !v && setConfirmLoad(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load checkpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              Loading will replace current state. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmLoad) void handleLoad(confirmLoad);
                setConfirmLoad(null);
              }}
            >
              Load
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete checkpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This checkpoint will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) void handleDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
