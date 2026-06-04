import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DrawerKind } from "./types";

export type DrawerSlots = Record<DrawerKind, ReactNode>;

interface DrawerHostProps {
  activeDrawer: DrawerKind | null;
  onClose: () => void;
  slots: DrawerSlots;
  selectedActorName?: string | null;
  playerName?: string | null;
  className?: string;
}

const DRAWER_LABELS: Record<DrawerKind, string> = {
  log: "Log",
  world: "World",
  inventory: "Inventory",
  journal: "Journal",
  character: "Character",
  inspect: "Inspect",
  saves: "Saves",
};

export function DrawerHost({
  activeDrawer,
  onClose,
  slots,
  selectedActorName,
  playerName,
  className,
}: DrawerHostProps) {
  const label = activeDrawer ? DRAWER_LABELS[activeDrawer] : "";
  const activeContent = activeDrawer ? slots[activeDrawer] : null;
  const actorScope =
    activeDrawer === "character"
      ? selectedActorName ?? playerName ?? null
      : null;

  return (
    <Dialog open={activeDrawer !== null} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      {activeDrawer ? (
        <DialogContent
          data-testid="drawer-host"
          data-active-drawer={activeDrawer}
          showCloseButton={false}
          className={cn(
            "fixed inset-y-auto bottom-0 left-0 top-auto flex max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-[8px] border-white/10 bg-zinc-950/96 p-0 text-zinc-100 shadow-[0_-18px_60px_rgba(0,0,0,0.55)] duration-200 sm:inset-y-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[min(520px,calc(100vw-2rem))] sm:rounded-[8px]",
            className,
          )}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="text-[20px] font-semibold leading-tight text-zinc-100">
                {label}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Secondary game information drawer.
              </DialogDescription>
              {actorScope ? (
                <p className="mt-1 truncate text-[12px] font-semibold leading-tight text-zinc-500">
                  Viewing {actorScope}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close drawer"
              title="Close drawer"
              onClick={onClose}
              className="h-11 w-11 shrink-0 rounded-[8px] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea
            data-testid="drawer-scroll-area"
            className="flex-1 overflow-hidden"
          >
            <div className="px-4 py-4">
              {activeContent}
            </div>
          </ScrollArea>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
