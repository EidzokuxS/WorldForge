"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type CampaignMeta, formatUtcDate } from "./utils";

interface LoadCampaignDialogProps {
  onLoaded: () => void;
}

export function LoadCampaignDialog({ onLoaded }: LoadCampaignDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignMeta[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns]
  );

  async function refreshCampaigns() {
    setFetchingCampaigns(true);
    try {
      const payload = await apiGet<CampaignMeta[]>("/api/campaigns");
      setCampaigns(payload);
      setCampaignsLoaded(true);
    } catch (error) {
      toast.error("Failed to load campaigns", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setFetchingCampaigns(false);
    }
  }

  useEffect(() => {
    if (open) {
      void refreshCampaigns();
    } else {
      setCampaignsLoaded(false);
    }
  }, [open]);

  async function handleLoadCampaign(id: string) {
    setLoadingCampaignId(id);
    try {
      const loaded = await apiPost<CampaignMeta>(`/api/campaigns/${id}/load`);
      toast.success("Campaign loaded", { description: loaded.name });
      setOpen(false);
      onLoaded();
      router.push("/game");
    } catch (error) {
      toast.error("Failed to load campaign", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setLoadingCampaignId(null);
    }
  }

  async function handleDeleteCampaign(id: string) {
    setDeletingCampaignId(id);
    try {
      await apiDelete<{ status: string }>(`/api/campaigns/${id}`);
      setCampaigns((current) => current.filter((campaign) => campaign.id !== id));
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error("Failed to delete campaign", {
        description: getErrorMessage(error, "Unknown API error."),
      });
    } finally {
      setDeletingCampaignId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full text-base tracking-wide">
          Load Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load Campaign</DialogTitle>
          <DialogDescription>
            Choose a saved campaign to continue.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] pr-4">
          {fetchingCampaigns ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading campaigns...
            </div>
          ) : campaignsLoaded && sortedCampaigns.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No campaigns yet. Create one!
            </div>
          ) : (
            <div className="space-y-3">
              {sortedCampaigns.map((campaign) => (
                <Card
                  key={campaign.id}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                  onClick={() => handleLoadCampaign(campaign.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {campaign.premise}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Updated: {formatUtcDate(campaign.updatedAt)}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={loadingCampaignId === campaign.id}
                          onClick={(event: MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            void handleLoadCampaign(campaign.id);
                          }}
                        >
                          {loadingCampaignId === campaign.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Load
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                event.stopPropagation()
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove {campaign.name} and
                                all related data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                  event.stopPropagation();
                                  void handleDeleteCampaign(campaign.id);
                                }}
                                disabled={deletingCampaignId === campaign.id}
                              >
                                {deletingCampaignId === campaign.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
