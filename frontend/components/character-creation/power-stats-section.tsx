"use client";

import type { PowerStats } from "@worldforge/shared";
import { formatTierRank } from "@worldforge/shared";

import { Badge } from "@/components/ui/badge";

/**
 * Phase 61 — shared Power Stats renderer extracted from
 * `character-record-inspector.tsx`. Rendered at the top of both the player
 * CharacterCard and each NPC card so that VS Battles tier+rank, hax, and
 * vulnerabilities are visible without opening the Advanced disclosure.
 *
 * Read-only. No edit controls — hand-editing power stats is out of scope for
 * Phase 61 (see research §Common Pitfalls #1).
 *
 * Per feedback_no_fallbacks_v2.md: when `powerStats` is undefined we return
 * null. The caller decides whether to render a "no data" line (legacy record)
 * or an error banner (pipeline failed). The atom never emits placeholder text.
 */
const SEVERITY_STYLES = {
  minor: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  major: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
} as const;

export function PowerStatsSection({ powerStats }: { powerStats: PowerStats | undefined }) {
  if (!powerStats) return null;

  const axes = [
    { label: "Attack Potency", value: formatTierRank(powerStats.attackPotency) },
    { label: "Speed", value: formatTierRank(powerStats.speed) },
    { label: "Durability", value: formatTierRank(powerStats.durability) },
    { label: "Intelligence", value: formatTierRank(powerStats.intelligence) },
  ];

  return (
    <div
      aria-label="Power stats"
      className="flex flex-col gap-[clamp(10px,0.8vw,16px)]"
    >
      <span className="font-mono text-[clamp(11px,0.8vw,13px)] uppercase tracking-[0.1em] text-zinc-500">
        Power Stats
      </span>

      <div className="overflow-hidden rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Axis
              </th>
              <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Rating
              </th>
            </tr>
          </thead>
          <tbody>
            {axes.map((axis) => (
              <tr key={axis.label} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2 text-zinc-300">{axis.label}</td>
                <td className="px-4 py-2 font-medium text-zinc-100">{axis.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {powerStats.hax.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Hax Abilities
          </span>
          {powerStats.hax.map((ability, index) => (
            <div
              key={`${ability.name}-${index}`}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{ability.name}</span>
                <span className="text-xs text-zinc-400">{ability.type}</span>
                {ability.bypassTier ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                  >
                    Bypasses {ability.bypassTier}
                  </Badge>
                ) : null}
              </div>
              {ability.limitations.length > 0 ? (
                <div className="mt-1.5 text-xs italic text-zinc-400">
                  {ability.limitations.join("; ")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {powerStats.vulnerabilities.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Vulnerabilities
          </span>
          {powerStats.vulnerabilities.map((vuln, index) => (
            <div
              key={`vuln-${index}`}
              className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"
            >
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] uppercase ${SEVERITY_STYLES[vuln.severity]}`}
              >
                {vuln.severity}
              </Badge>
              <span className="text-sm text-zinc-200">{vuln.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
