import { ScrollArea } from "@/components/ui/scroll-area";

export function CharacterPanel() {
  return (
    <aside className="flex w-full flex-col border-l border-border bg-card lg:w-[280px]">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Character
        </h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <p className="text-sm italic text-muted-foreground">
          No character loaded
        </p>
      </ScrollArea>
    </aside>
  );
}
