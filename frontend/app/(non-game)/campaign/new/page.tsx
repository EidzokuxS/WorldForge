"use client";

import { useRouter } from "next/navigation";

import { ConceptWorkspace } from "@/components/campaign-new/concept-workspace";

export default function CampaignConceptPage() {
  const router = useRouter();

  return (
    <ConceptWorkspace
      onContinue={async () => {
        router.push("/campaign/new/dna");
      }}
    />
  );
}
