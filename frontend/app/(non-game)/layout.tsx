import type { ReactNode } from "react";

import { AppShell } from "@/components/non-game-shell/app-shell";
import { CampaignStatusProvider } from "@/components/non-game-shell/campaign-status-provider";

export default function NonGameLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CampaignStatusProvider>
      <AppShell>{children}</AppShell>
    </CampaignStatusProvider>
  );
}
