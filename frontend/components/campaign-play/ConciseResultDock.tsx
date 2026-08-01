"use client";

import type { CampaignPlayNarrationOperation } from "@worldforge/shared";

export interface ConciseResultDockProps {
  operation: CampaignPlayNarrationOperation;
  onRecover: () => void;
  recoveryPending: boolean;
}

export function ConciseResultDock({
  operation,
  onRecover,
  recoveryPending,
}: ConciseResultDockProps) {
  const inProgress = operation.status === "pending" || operation.status === "running";
  return (
    <section
      aria-label="What happened"
      className="campaign-play-concise-result"
      data-narration-status={operation.status}
    >
      <header>
        <p className="campaign-play-kicker">What happened</p>
        {inProgress ? <span>The fuller telling is still taking shape.</span> : null}
      </header>
      <p>{operation.conciseResult.displayText}</p>
      {operation.status === "failed" ? (
        <footer>
          <span>The moment stands as shown.</span>
          <button disabled={recoveryPending} onClick={onRecover} type="button">
            {recoveryPending ? "Restoring" : "Restore the telling"}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

export default ConciseResultDock;
