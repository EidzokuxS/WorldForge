function isDialogBearingTurn(value: string): boolean {
  if (/["'“”‘’]/.test(value)) {
    return true;
  }

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  return wordCount >= 3;
}

function flushTurn(
  turns: string[],
  inCharTurn: boolean,
  currentBuffer: string[],
): void {
  if (!inCharTurn || currentBuffer.length === 0) {
    return;
  }

  const joined = currentBuffer.map((line) => line.trim()).join(" ").trim();
  if (joined.length > 0) {
    turns.push(joined);
  }
}

export function extractSampleLinesFromMesExample(raw: string): string[] {
  if (!raw?.trim()) {
    return [];
  }

  const turns: string[] = [];
  let inCharTurn = false;
  let currentBuffer: string[] = [];

  for (const rawLine of raw.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^<START>\s*$/i.test(line)) {
      flushTurn(turns, inCharTurn, currentBuffer);
      inCharTurn = false;
      currentBuffer = [];
      continue;
    }

    if (/^\{\{user\}\}\s*:/i.test(line)) {
      flushTurn(turns, inCharTurn, currentBuffer);
      inCharTurn = false;
      currentBuffer = [];
      continue;
    }

    const charMatch = line.match(/^\{\{char\}\}\s*:\s*(.*)$/i);
    if (charMatch) {
      flushTurn(turns, inCharTurn, currentBuffer);
      inCharTurn = true;
      currentBuffer = [charMatch[1] ?? ""];
      continue;
    }

    if (inCharTurn) {
      currentBuffer.push(line);
    }
  }

  flushTurn(turns, inCharTurn, currentBuffer);

  return turns
    .map((turn) => {
      const original = turn.trim();
      if (!original || /^\[?\(?ooc/i.test(original)) {
        return null;
      }

      const cleaned = original.replace(/\((?:OOC|ooc)[^)]*\)/g, "").trim();
      if (cleaned.length < 20 || /^\*[^*]+\*\s*$/.test(cleaned)) {
        return null;
      }

      return cleaned;
    })
    .filter((turn): turn is string => turn !== null)
    .sort((left, right) => {
      const leftDialog = isDialogBearingTurn(left);
      const rightDialog = isDialogBearingTurn(right);

      if (leftDialog !== rightDialog) {
        return leftDialog ? -1 : 1;
      }

      return right.length - left.length;
    })
    .slice(0, 3);
}
