/** Build a formatted sections block from V2/V3 card fields. */
export function buildV2CardSections(card: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  v2Tags: string[];
}): string {
  return [
    `CHARACTER NAME: ${card.name}`,
    `CHARACTER DESCRIPTION:\n${card.description}`,
    card.personality ? `PERSONALITY:\n${card.personality}` : "",
    card.scenario ? `SCENARIO CONTEXT:\n${card.scenario}` : "",
    card.v2Tags.length > 0 ? `SOURCE TAGS: ${card.v2Tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
