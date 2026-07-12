import { CampaignPlayPage } from "@/components/campaign-play/CampaignPlayPage";

export default async function CampaignPlayRoute(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await props.params;
  return <CampaignPlayPage campaignId={campaignId} />;
}
