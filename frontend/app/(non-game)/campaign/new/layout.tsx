import type { ReactNode } from "react";

import { CampaignNewFlowProvider } from "@/components/campaign-new/flow-provider";

export default function CampaignNewLayout({ children }: { children: ReactNode }) {
  return <CampaignNewFlowProvider>{children}</CampaignNewFlowProvider>;
}
