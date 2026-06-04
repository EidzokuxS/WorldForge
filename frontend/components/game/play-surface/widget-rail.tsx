import {
  Backpack,
  BookOpen,
  Compass,
  FileClock,
  ScrollText,
  SearchCode,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DrawerKind } from "./types";

interface WidgetRailProps {
  activeDrawer: DrawerKind | null;
  onOpenDrawer: (drawer: DrawerKind) => void;
  className?: string;
}

const WIDGETS: Array<{
  kind: DrawerKind;
  label: string;
  icon: typeof ScrollText;
}> = [
  { kind: "log", label: "Log", icon: ScrollText },
  { kind: "world", label: "World", icon: Compass },
  { kind: "inventory", label: "Inventory", icon: Backpack },
  { kind: "journal", label: "Journal", icon: BookOpen },
  { kind: "character", label: "Character", icon: UserRound },
  { kind: "inspect", label: "Inspect", icon: SearchCode },
  { kind: "saves", label: "Saves", icon: FileClock },
];

export function WidgetRail({
  activeDrawer,
  onOpenDrawer,
  className,
}: WidgetRailProps) {
  return (
    <nav
      data-testid="widget-rail"
      aria-label="Game tools"
      className={cn(
        "grid grid-cols-7 gap-1 rounded-[8px] border border-white/10 bg-zinc-950/85 p-1 shadow-[0_18px_46px_rgba(0,0,0,0.42)] sm:grid-cols-1 sm:gap-2 sm:p-2",
        className,
      )}
    >
      {WIDGETS.map(({ kind, label, icon: Icon }) => {
        const isActive = activeDrawer === kind;

        return (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="icon"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            data-active={isActive ? "true" : "false"}
            onClick={() => onOpenDrawer(kind)}
            className={cn(
              "h-11 w-11 rounded-[8px] border border-transparent bg-transparent text-zinc-300 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-100",
              isActive && "border-[#E63E00]/55 bg-[#E63E00]/10 text-[#E63E00] shadow-[0_0_20px_rgba(230,62,0,0.18)]",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </Button>
        );
      })}
    </nav>
  );
}
