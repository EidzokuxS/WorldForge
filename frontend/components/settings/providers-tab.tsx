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
      <section className="wf-set-group">
        <div className="wf-set-group-head">
          <div>
            <h2 className="wf-set-group-h">Providers</h2>
            <p className="wf-set-group-sub">
              Connect model endpoints once, then assign them to engine roles.
            </p>
          </div>
          <Button className="wf-settings-primary-action" onClick={openCreateProviderDialog}>
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>

        <div className="wf-provider-grid" aria-label="Configured providers">
          {settings.providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="wf-provider-summary-card"
              data-status={provider.apiKey ? "connected" : "configured"}
              onClick={() => openEditProviderDialog(provider)}
            >
              <div className="wf-provider-card-head">
                <span className="wf-provider-card-h">{provider.name}</span>
                <span className="wf-provider-card-pill">
                  {provider.isBuiltin ? "built-in" : "custom"}
                </span>
              </div>
              <div className="wf-provider-card-sub">
                {provider.isBuiltin
                  ? `Built-in ${provider.name} endpoint preset.`
                  : "Custom OpenAI-compatible endpoint."}
              </div>
              <div className="wf-provider-card-meta">
                {provider.baseUrl} · {provider.defaultModel || "provider default"}
              </div>
            </button>
          ))}

          <button
            type="button"
            className="wf-provider-summary-card"
            data-kind="add"
            onClick={openCreateProviderDialog}
          >
            <div className="wf-provider-card-head">
              <span className="wf-provider-card-h">+ Custom provider</span>
            </div>
            <div className="wf-provider-card-sub">
              Add an OpenAI-compatible base URL, API key, and model.
            </div>
            <div className="wf-provider-card-meta">base url · api key · model</div>
          </button>
        </div>

        <div className="wf-set-subhead">Provider details</div>

        <div className="wf-settings-list">
          {settings.providers.map((provider) => (
            <div key={provider.id} className="wf-set-card wf-provider-detail-card">
              <div className="wf-set-card-head">
                <div>
                  <div className="wf-set-card-h">{provider.name}</div>
                  <div className="wf-set-card-sub">{provider.baseUrl}</div>
                </div>
                <Badge className="wf-provider-pill" variant={provider.isBuiltin ? "secondary" : "outline"}>
                  {provider.isBuiltin ? "Built-in" : "Custom"}
                </Badge>
              </div>
              <div className="wf-settings-form-stack">
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
                          This will remove {provider.name}. Roles still pointing
                          at it will need to be reassigned explicitly.
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
      </section>

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
