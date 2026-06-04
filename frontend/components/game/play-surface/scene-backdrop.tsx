import { cn } from "@/lib/utils";

export interface SceneBackdropProps {
  sceneName?: string | null;
  broadLocationName?: string | null;
  description?: string | null;
  tags?: string[];
  mood?: string | null;
  weather?: string | null;
  timeOfDay?: string | null;
  backgroundUrl?: string | null;
}

export function SceneBackdrop({
  sceneName,
  broadLocationName,
  description,
  tags = [],
  mood,
  weather,
  timeOfDay,
  backgroundUrl,
}: SceneBackdropProps) {
  const title = sceneName?.trim() || broadLocationName?.trim() || "Scene loading";
  const location = broadLocationName?.trim() || title;
  const cues = [timeOfDay, weather, mood, ...tags.slice(0, 3)]
    .map((cue) => cue?.trim())
    .filter((cue): cue is string => Boolean(cue));
  const accessibleSummary = [
    title === location ? title : `${title} at ${location}`,
    description?.trim() || null,
    cues.length > 0 ? `Cues: ${cues.join(", ")}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <section
      data-testid="scene-backdrop"
      className="absolute inset-0 isolate overflow-hidden bg-[#050506] text-zinc-100"
      aria-label={accessibleSummary.join(". ")}
    >
      {backgroundUrl ? (
        <div
          data-testid="scene-backdrop-image"
          className="absolute inset-0 bg-cover bg-center opacity-35 saturate-75"
          style={{ backgroundImage: `url("${backgroundUrl}")` }}
        />
      ) : null}
      <div
        data-testid="scene-environment-layer"
        className={cn(
          "absolute inset-0 bg-[radial-gradient(circle_at_50%_58%,rgba(224,72,28,0.16),rgba(40,20,18,0.22)_22%,rgba(9,9,11,0.82)_56%,rgba(5,5,6,1)_82%)]",
          weather?.toLowerCase().includes("rain") && "after:absolute after:inset-0 after:bg-[linear-gradient(110deg,transparent_0%,rgba(125,211,252,0.12)_42%,transparent_45%)] after:bg-[length:22px_120px]",
          mood?.toLowerCase().includes("tense") && "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_72%_42%,rgba(230,62,0,0.14),transparent_32%)]",
        )}
      />
      <div
        className="absolute inset-x-[22%] top-[31%] h-[45%] rounded-t-[50%] border border-white/[0.045] border-b-transparent bg-[linear-gradient(180deg,rgba(224,72,28,0.035),transparent_72%)]"
        aria-hidden="true"
      />
      <div
        className="absolute left-[25%] top-[48%] h-[30%] w-[4.8%] rounded-t-full border border-white/[0.035] bg-black/20 blur-[0.2px]"
        aria-hidden="true"
      />
      <div
        className="absolute right-[25%] top-[48%] h-[30%] w-[4.8%] rounded-t-full border border-white/[0.035] bg-black/20 blur-[0.2px]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:12.5%_100%]"
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black via-black/58 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black via-black/72 to-transparent" />
      <div
        data-testid="scene-floor-plane"
        className="absolute inset-x-0 bottom-0 h-[30%] rounded-[50%] border-t border-white/10 bg-[linear-gradient(180deg,rgba(53,28,24,0.38),rgba(9,9,11,0.08))]"
      />
      <div
        data-testid="scene-depth-grid"
        className="absolute inset-x-[8%] top-[18%] h-[62%] border-x border-white/[0.025] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.026),transparent)] opacity-70"
        aria-hidden="true"
      />
    </section>
  );
}
