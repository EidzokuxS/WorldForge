const campaignSourceTails = new Map<string, Promise<void>>();

export async function withCampaignWorldSourceLock<T>(
  campaignId: string,
  operation: () => Promise<T> | T,
): Promise<T> {
  const previous = campaignSourceTails.get(campaignId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  campaignSourceTails.set(campaignId, tail);

  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (campaignSourceTails.get(campaignId) === tail) {
      campaignSourceTails.delete(campaignId);
    }
  }
}
