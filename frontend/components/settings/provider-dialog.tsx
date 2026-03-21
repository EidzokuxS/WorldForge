import { useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProviderDraft = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  isBuiltin: boolean;
};

export const DEFAULT_PROVIDER_DRAFT: ProviderDraft = {
  name: "",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
  isBuiltin: false,
};

export interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ProviderDraft;
  onDraftChange: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  isEditing: boolean;
  onSave: () => void;
}

export function ProviderDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  isEditing,
  onSave,
}: ProviderDialogProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setShowApiKey(false);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription>
            Configure provider name, endpoint and API key.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input
              id="provider-name"
              value={draft.name}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="My Provider"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={draft.baseUrl}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-default-model">Default Model</Label>
            <Input
              id="provider-default-model"
              value={draft.defaultModel}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  defaultModel: event.target.value,
                }))
              }
              placeholder="gpt-4o-mini"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-api-key">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="provider-api-key"
                type={showApiKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
                placeholder="sk-..."
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey((current) => !current)}
                aria-label="Toggle API key visibility"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {draft.isBuiltin && (
            <p className="text-xs text-muted-foreground">
              This is a built-in preset. You can edit it, but cannot delete it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            <Save className="h-4 w-4" />
            Save Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
