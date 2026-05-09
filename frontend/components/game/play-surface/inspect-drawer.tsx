import { Activity, FileText, Gauge, ListTree, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OracleResultData } from "../oracle-panel";
import type { DisplayBeat } from "./types";

export interface InspectDrawerProps {
  currentBeat: DisplayBeat | null;
  oracleResult: OracleResultData | null;
  status: string;
  showDebug: boolean;
  debugReasoning: string | null;
  stateSummary?: string | null;
  eventSummary?: string | null;
  className?: string;
}

export function InspectDrawer({
  currentBeat,
  oracleResult,
  status,
  showDebug,
  debugReasoning,
  stateSummary,
  eventSummary,
  className,
}: InspectDrawerProps) {
  const hasMechanics = Boolean(currentBeat?.mechanic || currentBeat?.rawDetails || oracleResult);

  return (
    <div data-testid="inspect-drawer" className={cn("space-y-4", className)}>
      <div role="tablist" aria-label="Inspect sections" className="grid grid-cols-2 gap-1 rounded-[8px] bg-zinc-900/80 p-1 sm:grid-cols-5">
        {["Beat", "Oracle", "State", "Events", ...(showDebug ? ["Debug"] : [])].map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={label === "Beat"}
            className="min-h-10 rounded-[8px] px-2 py-1 text-[12px] font-semibold text-zinc-300 data-[active=true]:bg-zinc-800"
            data-active={label === "Beat" ? "true" : "false"}
          >
            {label}
          </button>
        ))}
      </div>

      {hasMechanics ? (
        <InspectSection icon={Gauge} label="Beat">
          <p className="text-[20px] font-semibold leading-tight text-zinc-100">
            {currentBeat?.mechanic?.label ?? currentBeat?.text ?? "Mechanic beat"}
          </p>
          {currentBeat?.text && currentBeat.text !== currentBeat.mechanic?.label ? (
            <p className="mt-2 text-[16px] leading-6 text-zinc-300">{currentBeat.text}</p>
          ) : null}
        </InspectSection>
      ) : (
        <EmptyMechanics />
      )}

      {oracleResult ? (
        <InspectSection icon={ShieldCheck} label="Oracle">
          <dl className="grid gap-3 text-[12px] leading-5 text-zinc-300">
            <InspectRow label="Chance" value={`${oracleResult.chance}%`} />
            <InspectRow label="Roll" value={String(oracleResult.roll)} />
            <InspectRow label="Outcome" value={oracleResult.outcome} />
            <div>
              <dt className="font-semibold text-zinc-500">Reason</dt>
              <dd className="mt-1 text-[16px] leading-6 text-zinc-300">{oracleResult.reasoning}</dd>
            </div>
          </dl>
        </InspectSection>
      ) : currentBeat?.rawDetails ? (
        <InspectSection icon={ShieldCheck} label="Oracle">
          <dl className="grid gap-3 text-[12px] leading-5 text-zinc-300">
            <InspectRow label="Chance" value={`${currentBeat.rawDetails.chance}%`} />
            <InspectRow label="Roll" value={String(currentBeat.rawDetails.roll)} />
            <InspectRow label="Outcome" value={currentBeat.mechanic?.outcome ?? "mechanical_result"} />
            <div>
              <dt className="font-semibold text-zinc-500">Reason</dt>
              <dd className="mt-1 text-[16px] leading-6 text-zinc-300">{currentBeat.rawDetails.reasoning}</dd>
            </div>
          </dl>
        </InspectSection>
      ) : null}

      <InspectSection icon={Activity} label="State">
        <InspectRow label="Status" value={status} />
        <p className="mt-3 text-[16px] leading-6 text-zinc-300">
          {stateSummary ?? "Current scope is the active scene and player turn boundary."}
        </p>
      </InspectSection>

      <InspectSection icon={ListTree} label="Events">
        <p className="text-[16px] leading-6 text-zinc-300">
          {eventSummary ?? "Canonical turn events appear here when the current beat carries inspectable details."}
        </p>
      </InspectSection>

      {showDebug ? (
        <InspectSection icon={FileText} label="Debug">
          {debugReasoning ? (
            <details className="rounded-[8px] border border-blue-500/20 bg-blue-500/5 px-3 py-3">
              <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-300">
                Raw reasoning
              </summary>
              <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-black/35 p-3 font-mono text-[12px] leading-5 text-zinc-200">
                {debugReasoning}
              </pre>
            </details>
          ) : (
            <p className="text-[16px] leading-6 text-zinc-400">
              Debug details are enabled, but no raw reasoning is attached to this beat.
            </p>
          )}
        </InspectSection>
      ) : null}
    </div>
  );
}

function EmptyMechanics() {
  return (
    <p className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-3 text-[16px] leading-6 text-zinc-400">
      No mechanics for the current beat. Raw details appear here only when available.
    </p>
  );
}

function InspectSection({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: typeof Gauge;
  label: string;
}) {
  return (
    <section className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-3">
      <h3 className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InspectRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="font-semibold text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value}</dd>
    </div>
  );
}
