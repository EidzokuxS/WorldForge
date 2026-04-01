import type { ReactNode } from "react";

import { AppShell } from "@/components/non-game-shell/app-shell";

export default function NonGameLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
