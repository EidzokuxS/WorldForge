"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ConceptWorkspace } from "@/components/campaign-new/concept-workspace";
import { useCampaignNewFlow } from "@/components/campaign-new/flow-provider";

const DNA_ROUTE = "/campaign/new/dna";

export default function CampaignConceptPage() {
  const router = useRouter();
  const flow = useCampaignNewFlow();
  const [continuing, setContinuing] = React.useState(false);

  return (
    <ConceptWorkspace
      onContinue={async () => {
        if (continuing) {
          return;
        }

        setContinuing(true);
        try {
          await flow.handleNextToDna();
          router.push(DNA_ROUTE);
        } finally {
          setContinuing(false);
        }
      }}
    />
  );
}
