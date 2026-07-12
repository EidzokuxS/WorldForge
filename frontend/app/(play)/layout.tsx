import type { ReactNode } from "react";

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#09090b] text-[#f2eee8]" data-campaign-play-layout>
      {children}
    </main>
  );
}
