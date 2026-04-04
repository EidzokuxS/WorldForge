"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { apiDelete, apiGet, loadCampaign } from "@/lib/api";
import { type CampaignMeta, formatUtcDate } from "@/components/title/utils";
import { getErrorMessage } from "@worldforge/shared";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  return formatUtcDate(timestamp);
}

export default function LauncherPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns],
  );

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiGet<CampaignMeta[]>("/api/campaigns");
      setCampaigns(payload);
    } catch (error) {
      toast.error("Failed to load campaigns", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      const loaded = await loadCampaign(id);
      toast.success("Campaign loaded", { description: loaded.name });
      router.push("/game");
    } catch (error) {
      toast.error("Failed to load campaign", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await apiDelete<{ status: string }>(`/api/campaigns/${id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error("Failed to delete campaign", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Action buttons */}
      <div className="flex shrink-0 gap-[clamp(8px,0.7vw,16px)]" style={{ marginBottom: "clamp(24px, 2vw, 40px)" }}>
        <Button asChild>
          <Link href="/campaign/new">New Campaign</Link>
        </Button>
        <Button variant="outline" onClick={() => void fetchCampaigns()}>
          Load Campaign
        </Button>
      </div>

      {/* Section label */}
      <div
        className="shrink-0 font-semibold uppercase tracking-[0.08em] text-zinc-600"
        style={{
          fontSize: "clamp(11px, 0.7vw, 14px)",
          marginBottom: "clamp(8px, 0.6vw, 14px)",
        }}
      >
        Recent Campaigns
      </div>

      {/* Campaign list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns...
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-sm text-zinc-500">
            No campaigns yet. Create one!
          </div>
        ) : (
          sorted.map((campaign) => (
            <div
              key={campaign.id}
              className="group flex cursor-pointer items-center justify-between border-b border-white/[0.06] transition-colors last:border-b-0 hover:bg-white/[0.04]"
              style={{ padding: "clamp(12px, 1vw, 20px) clamp(10px, 0.8vw, 16px)" }}
              onClick={() => void handleLoad(campaign.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleLoad(campaign.id);
              }}
            >
              {/* Info */}
              <div className="flex min-w-0 flex-col" style={{ gap: "clamp(2px, 0.2vw, 5px)" }}>
                <span
                  className="font-medium text-zinc-100"
                  style={{ fontSize: "clamp(14px, 1vw, 18px)" }}
                >
                  {campaign.name}
                </span>
                <span
                  className="truncate text-zinc-600"
                  style={{ fontSize: "clamp(12px, 0.85vw, 16px)" }}
                >
                  {campaign.premise}
                </span>
              </div>

              {/* Right side: actions + meta */}
              <div className="flex shrink-0 items-center gap-4">
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={loadingId === campaign.id}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      void handleLoad(campaign.id);
                    }}
                  >
                    {loadingId === campaign.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Load
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-400"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      >
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove {campaign.name} and all related data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={deletingId === campaign.id}
                          onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            void handleDelete(campaign.id);
                          }}
                        >
                          {deletingId === campaign.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <span
                  className="whitespace-nowrap text-zinc-600"
                  style={{ fontSize: "clamp(12px, 0.85vw, 16px)" }}
                >
                  {formatRelativeTime(campaign.updatedAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
