"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { apiDelete, apiGet, getActiveCampaign, getWorldData, loadCampaign, type WorldData } from "@/lib/api";
import { type CampaignMeta, formatUtcDate } from "@/components/title/utils";
import { getErrorMessage } from "@worldforge/shared";
import { clearCampaignNewFlowSession } from "@/components/campaign-new/flow-session";

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
  const [activeCampaign, setActiveCampaign] = useState<CampaignMeta | null>(null);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
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
      const [payload, active] = await Promise.all([
        apiGet<CampaignMeta[]>("/api/campaigns"),
        getActiveCampaign().catch(() => null),
      ]);
      setCampaigns(payload);
      setActiveCampaign(active);
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

  const latestCampaign = sorted[0];
  const heroCampaign = activeCampaign ?? latestCampaign ?? null;

  useEffect(() => {
    let cancelled = false;

    if (!heroCampaign) {
      setWorldData(null);
      return;
    }

    void getWorldData(heroCampaign.id)
      .then((world) => {
        if (!cancelled) {
          setWorldData(world);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorldData(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [heroCampaign]);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      const loaded = await loadCampaign(id);
      setActiveCampaign(loaded);
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

  const heroState = createHeroState(heroCampaign, worldData, sorted.length);
  const titleParts = heroState.title ? splitTitle(heroState.title, heroState.variant) : null;

  return (
    <div className="wf-home-screen">
      <section className="wf-home-hero">
        <div className="wf-home-hero-inner wf-v4-enter">
          <div className="wf-home-kicker">
            <p className="wf-kicker wf-kicker-ember">
              {heroState.kicker}
            </p>
          </div>

          <h1 className="wf-display wf-serif-em wf-home-title" aria-label={heroState.title ?? undefined}>
            {titleParts ? (
              <>
                {titleParts.head}
                {titleParts.emphasis ? (
                  <>
                    {" "}
                    <em>{titleParts.emphasis}</em>
                  </>
                ) : null}
                {titleParts.tail ? (
                  <>
                    <br />
                    {titleParts.tail}
                  </>
                ) : null}
              </>
            ) : (
              <>
                Forge a <em>world.</em>
              </>
            )}
          </h1>

          <p className="wf-prose wf-home-lede">
            {heroState.lede}
          </p>

          <div className="wf-home-actions">
            {heroCampaign ? (
              <button
                type="button"
                className="wf-v4-btn wf-v4-btn-primary"
                disabled={loadingId === heroCampaign.id}
                onClick={() => void handleLoad(heroCampaign.id)}
              >
                {loadingId === heroCampaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Continue session
              </button>
            ) : null}
            {heroCampaign ? (
              <Link
                href={`/campaign/${heroCampaign.id}/review`}
                className="wf-v4-btn"
              >
                Walk the world
              </Link>
            ) : null}
            <Link
              href="/campaign/new"
              className="wf-v4-btn"
              onClick={clearCampaignNewFlowSession}
            >
              <Plus className="h-4 w-4" />
              New campaign
            </Link>
            <button type="button" className="wf-v4-btn" onClick={() => void fetchCampaigns()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          <div className="wf-home-stats">
            {heroState.pins.map((pin, index) => (
              <InfoTile key={`${pin.label}-${index}`} label={pin.label} value={pin.value} hot={pin.hot} />
            ))}
          </div>
        </div>
      </section>

      <section id="campaigns" className="wf-home-library">
        <div className="mb-7 flex items-center justify-between gap-4">
          <p className="wf-kicker">Campaign library</p>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
            {loading ? "Loading" : `${sorted.length} saved`}
          </span>
        </div>

        {loading ? (
          <div className="wf-v4-card flex min-h-[168px] items-center gap-3 px-7 text-[var(--fg-2)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns...
          </div>
        ) : sorted.length === 0 ? (
          <div className="wf-v4-card min-h-[168px] px-7 py-8">
            <h2 className="font-serif text-3xl font-semibold text-[var(--fg)]">
              No campaigns yet.
            </h2>
            <p className="wf-prose mt-3 max-w-[52ch]">
              Start with a new campaign; this list will become your campaign library once the first world exists.
            </p>
          </div>
        ) : (
          <div className="wf-home-library-list">
            {sorted.slice(0, 8).map((campaign, index) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                active={index === 0}
                loading={loadingId === campaign.id}
                deleting={deletingId === campaign.id}
                onLoad={() => void handleLoad(campaign.id)}
                onDelete={() => void handleDelete(campaign.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function createHeroState(
  campaign: CampaignMeta | null,
  world: WorldData | null,
  campaignCount: number,
): {
  kicker: string;
  title: string | null;
  variant: "scene" | "campaign";
  lede: string;
  pins: Array<{ value: string; label: string; hot?: boolean }>;
} {
  if (!campaign) {
    return {
      kicker: "Forge a new world",
      title: null,
      variant: "campaign",
      lede: "Name a campaign, shape its World DNA, review the generated world, choose a character, then enter the live GM surface.",
      pins: [
        { value: String(campaignCount), label: "saved campaigns" },
        { value: "New world", label: "next action", hot: true },
        { value: "Local disk", label: "storage" },
      ],
    };
  }

  const currentScene = world?.currentScene ?? null;
  const player = world?.player ?? null;
  const sceneLocation = findSceneLocation(world);
  const sceneTitle = currentScene?.name ?? sceneLocation?.name ?? null;
  const locationName = currentScene?.broadLocationName ?? sceneLocation?.name ?? null;
  const hasScene = Boolean(sceneTitle);

  return {
    kicker: hasScene ? "Current scene" : "Current campaign",
    title: sceneTitle ?? campaign.name,
    variant: hasScene ? "scene" : "campaign",
    lede: sceneLocation?.description ?? campaign.premise,
    pins: [
      {
        value: player?.name ? `${player.name} is present` : "Player ready",
        label: player?.name ? "dialogue beat open" : "player state",
        hot: Boolean(player?.name),
      },
      {
        value: locationName ?? "World loaded",
        label: locationName ? "current location" : "world state",
      },
      {
        value: "Last save",
        label: formatRelativeTime(campaign.updatedAt),
      },
    ],
  };
}

function findSceneLocation(world: WorldData | null) {
  if (!world) {
    return null;
  }

  const scene = world.currentScene;
  const ids = [
    scene?.id,
    world.player?.sceneScopeId,
    world.player?.currentLocationId,
    scene?.broadLocationId,
  ].filter((id): id is string => Boolean(id));

  for (const id of ids) {
    const found = world.locations.find((location) => location.id === id);
    if (found) {
      return found;
    }
  }

  return world.locations.find((location) => location.isStarting) ?? world.locations[0] ?? null;
}

function splitTitle(title: string, variant: "scene" | "campaign" = "campaign"): { head: string; emphasis: string; tail: string } {
  if (variant === "scene") {
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      return {
        head: words[0] ?? "",
        emphasis: words[1] ?? "",
        tail: words.slice(2).join(" "),
      };
    }
    if (words.length === 2) {
      return { head: words[0] ?? "", emphasis: words[1] ?? "", tail: "" };
    }
  }

  const dashSplit = title.match(/^(.*?)\s+-\s+(.+)$/);
  if (dashSplit?.[1] && dashSplit?.[2]) {
    return { head: dashSplit[1], emphasis: dashSplit[2], tail: "" };
  }

  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return { head: title, emphasis: "", tail: "" };
  }
  if (words.length >= 4) {
    return { head: words.slice(0, -2).join(" "), emphasis: words.slice(-2).join(" "), tail: "" };
  }
  const tail = words.pop() ?? "";
  return { head: words.join(" "), emphasis: tail, tail: "" };
}

function InfoTile({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="wf-home-pin" data-state={hot ? "hot" : undefined}>
      <div className="font-prose text-[15px] font-semibold leading-tight text-[var(--fg)]">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
        {label}
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  active,
  loading,
  deleting,
  onLoad,
  onDelete,
}: {
  campaign: CampaignMeta;
  active: boolean;
  loading: boolean;
  deleting: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={[
        "wf-home-campaign-row group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 px-6 py-5",
        active ? "wf-v4-card-hot" : "wf-v4-card",
      ].join(" ")}
      data-current={active ? "true" : undefined}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="wf-serif-em truncate font-serif text-[clamp(23px,1.5vw,34px)] font-semibold leading-tight text-[var(--fg)]">
            {campaign.name}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-3)]">
            {formatRelativeTime(campaign.updatedAt)}
          </span>
        </div>
        <p className="wf-prose mt-3 line-clamp-2 max-w-[88ch] text-[15px] leading-6 text-[var(--fg-2)]">
          {campaign.premise}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="wf-v4-btn h-9 min-h-9 px-3"
          disabled={loading}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onLoad();
          }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Load
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--r-s)] border border-white/10 text-red-400 transition hover:border-red-500/50 hover:bg-red-500/[0.08]"
              aria-label={`Delete ${campaign.name}`}
              title="Delete campaign"
              onClick={(event: MouseEvent<HTMLButtonElement>) => event.stopPropagation()}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
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
                disabled={deleting}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
