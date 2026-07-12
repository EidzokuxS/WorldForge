import type { CampaignPlayConsequence, CampaignPlayConsequenceCue } from "@worldforge/shared";

const CONSEQUENCE_CUE_LABELS = {
  your_action: "Your action",
  direct_perception: "You notice",
  visible_aftermath: "Visible aftermath",
  route_change: "Route changed",
  witness_report: "Reported to you",
} satisfies Record<CampaignPlayConsequenceCue, string>;

export interface ConsequenceCardProps {
  consequence: CampaignPlayConsequence;
}

export function ConsequenceCard({ consequence }: ConsequenceCardProps) {
  return (
    <article className="campaign-play-consequence">
      <header>
        <span>{CONSEQUENCE_CUE_LABELS[consequence.causalCue]}</span>
        <time>{consequence.worldTimeLabel}</time>
      </header>
      <p>{consequence.whatChanged}</p>
      <small>{consequence.whereOrRoute}</small>
    </article>
  );
}

export default ConsequenceCard;
