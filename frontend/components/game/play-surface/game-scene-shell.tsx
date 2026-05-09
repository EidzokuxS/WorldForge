import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GameSceneShellProps {
  backdrop: ReactNode;
  hud: ReactNode;
  stageOverlay?: ReactNode;
  presenceSlot?: ReactNode;
  narrationDock: ReactNode;
  actionDock: ReactNode;
  widgetRail: ReactNode;
  drawerHost: ReactNode;
  leftStageSlot?: ReactNode;
  rightStageSlot?: ReactNode;
  className?: string;
}

export function GameSceneShell({
  backdrop,
  hud,
  stageOverlay,
  presenceSlot,
  narrationDock,
  actionDock,
  widgetRail,
  drawerHost,
  leftStageSlot,
  rightStageSlot,
  className,
}: GameSceneShellProps) {
  return (
    <main
      data-testid="game-scene-shell"
      data-shell-region="game-root"
      className={cn(
        "relative h-dvh min-h-0 overflow-hidden bg-[var(--bg)] text-zinc-100",
        className,
      )}
    >
      {backdrop}
      {stageOverlay}
      {hud}

      <div className="pointer-events-none absolute inset-x-0 top-[5.75rem] bottom-[22rem] z-20 mx-auto hidden w-full max-w-[1880px] grid-cols-[minmax(15rem,20rem)_minmax(34rem,1fr)_minmax(15rem,20rem)] gap-5 px-[clamp(28px,calc((100vw-1680px)/2),360px)] xl:grid">
        <aside
          data-stage-zone="left"
          className="pointer-events-auto flex min-w-0 flex-col justify-end gap-3"
        >
          {leftStageSlot}
        </aside>
        <div data-stage-zone="center" className="min-w-0" aria-hidden="true" />
        <aside
          data-stage-zone="right"
          className="pointer-events-auto flex min-w-0 flex-col justify-end gap-3"
        >
          {rightStageSlot}
        </aside>
      </div>

      {presenceSlot ? (
        <div className="pointer-events-auto absolute inset-x-4 top-[27%] z-25 mx-auto max-w-5xl">
          {presenceSlot}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:px-6 lg:px-8">
        <section
          data-shell-region="reader"
          className="pointer-events-auto w-full max-w-[min(980px,calc(100vw-420px))] max-[1699px]:max-w-[calc(100vw-180px)] max-sm:max-w-full"
        >
          {narrationDock}
        </section>
        <section
          data-shell-region="action-dock"
          className="pointer-events-auto w-full max-w-[min(980px,calc(100vw-420px))] max-[1699px]:max-w-[calc(100vw-180px)] max-sm:max-w-full"
        >
          {actionDock}
        </section>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-50 mx-auto hidden w-full max-w-[1880px] -translate-y-1/2 px-5 sm:block 2xl:px-8">
        <div className="pointer-events-auto ml-auto w-fit">
          {widgetRail}
        </div>
      </div>
      {drawerHost}
    </main>
  );
}
