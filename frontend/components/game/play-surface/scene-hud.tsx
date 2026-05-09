import { Home, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SceneHUDStatus =
  | "Scene loading"
  | "Reading"
  | "Auto"
  | "Thinking"
  | "Settling"
  | "Ready";

export interface SceneHUDProps {
  sceneName?: string | null;
  broadLocationName?: string | null;
  status: SceneHUDStatus;
  mood?: string | null;
  weather?: string | null;
  timeOfDay?: string | null;
  onHome?: () => void;
  onSaves?: () => void;
  onSettings?: () => void;
}

export function SceneHUD({
  sceneName,
  broadLocationName,
  status,
  mood,
  weather,
  timeOfDay,
  onHome,
  onSaves,
  onSettings,
}: SceneHUDProps) {
  const sceneLabel = sceneName?.trim() || "Scene loading";
  const locationLabel = broadLocationName?.trim() || sceneLabel;
  const showLocation = locationLabel !== sceneLabel;
  const cues = [timeOfDay, weather, mood]
    .map((cue) => cue?.trim())
    .filter((cue): cue is string => Boolean(cue));

  return (
    <header
      data-testid="scene-hud"
      className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 py-4 text-zinc-100 sm:px-6 lg:px-8"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="h-11 w-11 shrink-0 border border-white/10 bg-black/45 text-zinc-200 shadow-[0_14px_34px_rgba(0,0,0,0.34)] hover:bg-zinc-900"
          aria-label="Home"
          title="Home"
          onClick={onHome}
        >
          <Home aria-hidden="true" />
        </Button>
        <div className="min-w-0 pt-0.5">
          {showLocation ? (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {locationLabel}
            </p>
          ) : null}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-lg font-semibold leading-tight text-white sm:text-xl">
              {sceneLabel}
            </h2>
            {cues.length > 0 ? (
              <span className="hidden text-xs font-semibold text-zinc-500 sm:inline">
                {cues.join(" / ")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <nav className="flex shrink-0 items-center gap-2" aria-label="Game controls">
        <span
          className={cn(
            "hidden rounded-full border border-white/10 bg-black/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:inline-flex",
            (status === "Thinking" || status === "Settling") && "border-[rgba(224,72,28,0.35)] text-orange-100",
          )}
        >
          {status}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="border border-white/10 bg-zinc-950/72 text-zinc-200 hover:bg-zinc-900"
          aria-label="Saves"
          title="Saves"
          onClick={onSaves}
        >
          <Save aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="border border-white/10 bg-zinc-950/72 text-zinc-200 hover:bg-zinc-900"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
        >
          <Settings aria-hidden="true" />
        </Button>
      </nav>
    </header>
  );
}
