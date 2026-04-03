"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { testConnection } from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
import type { Provider, Settings } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProviderDialog,
  DEFAULT_PROVIDER_DRAFT,
  type ProviderDraft,
} from "@/components/settings/provider-dialog";

const PROVIDER_MODEL_PLACEHOLDERS: Record<string, string> = {
  "builtin-openai": "gpt-4o-mini",
  "builtin-anthropic": "claude-sonnet-4-20250514",
  "builtin-openrouter": "openrouter/auto",
  "builtin-ollama": "llama3.2",
};

function createCustomProviderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `custom-${crypto.randomUUID()}`;
  }

  return `custom-${Date.now()}`;
}

export interface ProvidersTabProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function ProvidersTab({ settings, setSettings }: ProvidersTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(
    DEFAULT_PROVIDER_DRAFT
  );
  const [isEditingProvider, setIsEditingProvider] = useState(false);
  const [visibleProviderKeys, setVisibleProviderKeys] = useState<
    Record<string, boolean>
  >({});
  const [testingProviderIds, setTestingProviderIds] = useState<
    Record<string, boolean>
  >({});

  const updateSettings = (updater: (current: Settings) => Settings) => {
    setSettings((current) => updater(current));
  };

  const openCreateProviderDialog = () => {
    setIsEditingProvider(false);
    setProviderDraft(DEFAULT_PROVIDER_DRAFT);
    setDialogOpen(true);
  };

  const openEditProviderDialog = (provider: Provider) => {
    setIsEditingProvider(true);
    setProviderDraft({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      defaultModel: provider.defaultModel,
      isBuiltin: Boolean(provider.isBuiltin),
    });
    setDialogOpen(true);
  };

  const saveProvider = () => {
    const name = providerDraft.name.trim();
    const baseUrl = providerDraft.baseUrl.trim();
    const apiKey = providerDraft.apiKey.trim();
    const defaultModel = providerDraft.defaultModel.trim();

    if (!name || !baseUrl) {
      toast.error("Name and Base URL are required");
      return;
    }

    updateSettings((current) => {
      if (isEditingProvider && providerDraft.id) {
        return {
          ...current,
          providers: current.providers.map((provider) =>
            provider.id === providerDraft.id
              ? {
                  ...provider,
                  name,
                  baseUrl,
                  apiKey,
                  defaultModel,
                }
              : provider
          ),
        };
      }

      const provider: Provider = {
        id: createCustomProviderId(),
        name,
        baseUrl,
        apiKey,
        defaultModel,
        isBuiltin: false,
      };

      return {
        ...current,
        providers: [...current.providers, provider],
      };
    });

    setDialogOpen(false);
    toast.success(
      isEditingProvider ? "Provider updated" : "Provider created",
      {
        description: name,
      }
    );
  };

  const deleteProvider = (provider: Provider) => {
    if (provider.isBuiltin) {
      return;
    }

    updateSettings((current) => ({
      ...current,
      providers: current.providers.filter((item) => item.id !== provider.id),
    }));
    toast.success("Provider deleted", { description: provider.name });
  };

  const testProviderConnection = async (provider: Provider) => {
    const baseUrl = provider.baseUrl.trim();
    const model = provider.defaultModel.trim();
    if (!baseUrl || !model) {
      toast.error("Base URL and Default Model are required for test.");
      return;
    }

    setTestingProviderIds((current) => ({
      ...current,
      [provider.id]: true,
    }));
    try {
      const result = await testConnection({
        baseUrl,
        apiKey: provider.apiKey.trim(),
        model,
      });

      if (result.success) {
        toast.success(`Connected — ${result.model} (${result.latencyMs}ms)`);
      } else {
        toast.error("Connection failed", {
          description: result.error ?? "Unknown provider error.",
        });
      }
    } catch (error) {
      toast.error("Connection failed", {
        description:
          getErrorMessage(error, "Unknown provider error."),
      });
    } finally {
      setTestingProviderIds((current) => ({
        ...current,
        [provider.id]: false,
      }));
    }
  };

  const updateProviderDefaultModel = (provider: Provider, value: string) => {
    updateSettings((current) => ({
      ...current,
      providers: current.providers.map((item) =>
        item.id === provider.id ? { ...item, defaultModel: value } : item
      ),
    }));
  };

  const updateProviderKeyVisibility = (providerId: string) => {
    setVisibleProviderKeys((current) => ({
      ...current,
      [providerId]: !current[providerId],
    }));
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage AI provider endpoints and API keys.
        </p>
        <Button onClick={openCreateProviderDialog}>
          <Plus className="h-4 w-4" />
          Add Provider
        </Button>
      </div>

      <div className="space-y-[clamp(12px,1vw,20px)]">
        {settings.providers.map((provider) => (
          <div key={provider.id} className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
            <div className="mb-[clamp(12px,1vw,20px)] flex items-start justify-between gap-3">
              <div>
                <div className="text-[clamp(14px,1vw,18px)] font-semibold text-bone">{provider.name}</div>
                <div className="mt-0.5 text-[clamp(11px,0.75vw,13px)] text-muted-foreground">
                  {provider.baseUrl}
                </div>
              </div>
              <Badge variant={provider.isBuiltin ? "secondary" : "outline"}>
                {provider.isBuiltin ? "Built-in" : "Custom"}
              </Badge>
            </div>
            <div className="space-y-[clamp(8px,0.7vw,14px)]">
              <div className="space-y-1">
                <Label htmlFor={`default-model-${provider.id}`}>
                  Default Model
                </Label>
                <Input
                  id={`default-model-${provider.id}`}
                  value={provider.defaultModel}
                  onChange={(event) =>
                    updateProviderDefaultModel(provider, event.target.value)
                  }
                  placeholder={
                    PROVIDER_MODEL_PLACEHOLDERS[provider.id] ?? "gpt-4o-mini"
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`api-key-${provider.id}`}>API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id={`api-key-${provider.id}`}
                    type={visibleProviderKeys[provider.id] ? "text" : "password"}
                    value={provider.apiKey}
                    readOnly
                    placeholder="Not set"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateProviderKeyVisibility(provider.id)}
                    aria-label="Toggle API key visibility"
                  >
                    {visibleProviderKeys[provider.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={testingProviderIds[provider.id]}
                  onClick={() => void testProviderConnection(provider)}
                >
                  {testingProviderIds[provider.id] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                  {testingProviderIds[provider.id]
                    ? "Testing..."
                    : "Test Connection"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => openEditProviderDialog(provider)}
                >
                  Edit
                </Button>

                {!provider.isBuiltin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete provider?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {provider.name}. Any role using it
                          will fallback to an available provider.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => deleteProvider(provider)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={providerDraft}
        onDraftChange={setProviderDraft}
        isEditing={isEditingProvider}
        onSave={saveProvider}
      />
    </>
  );
}
