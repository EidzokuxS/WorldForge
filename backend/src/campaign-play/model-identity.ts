export function campaignPlayResponseModelMatches(input: {
  providerId: string;
  requestedModel: string;
  responseModel: string | null | undefined;
}): boolean {
  if (input.responseModel === null || input.responseModel === undefined) return false;
  if (input.responseModel === input.requestedModel) return true;
  return input.providerId === "zai-coding-plan" &&
    input.requestedModel === "glm-5.2" &&
    input.responseModel === "glm-5.3";
}
