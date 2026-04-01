"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LegacyWorldReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");

  useEffect(() => {
    if (campaignId) {
      router.replace(`/campaign/${campaignId}/review`);
    }
  }, [campaignId, router]);

  if (!campaignId) {
    return <p className="text-sm text-muted-foreground">Missing campaign context.</p>;
  }

  return <p className="text-sm text-muted-foreground">Redirecting to campaign review...</p>;
}
