interface ReasoningCarrier {
  reasoningText?: string | null;
  response?: {
    body?: unknown;
  } | null;
}

export function normalizeReasoningText(reasoningText: string | null | undefined): string | undefined {
  const trimmed = reasoningText?.trim();
  return trimmed ? trimmed : undefined;
}

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function extractReasoningFromZaiChatBody(body: unknown): string | undefined {
  const parsedBody =
    typeof body === "string"
      ? parseJsonBody(body)
      : body;

  if (!parsedBody || typeof parsedBody !== "object") {
    return undefined;
  }

  const choices = (parsedBody as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return undefined;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }

  return normalizeReasoningText(
    (message as { reasoning_content?: string | null }).reasoning_content,
  );
}

export function extractReasoningText(carrier: ReasoningCarrier): string | undefined {
  return (
    normalizeReasoningText(carrier.reasoningText)
    ?? extractReasoningFromZaiChatBody(carrier.response?.body)
  );
}
