export const DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS = 300_000;

function expandRuntimeLimitEnvNames(envNames: string | readonly string[]): string[] {
  const names = Array.isArray(envNames) ? envNames : [envNames];
  const expanded: string[] = [];

  for (const name of names) {
    expanded.push(name);
    if (name.startsWith("WORLDFORGE_")) {
      expanded.push(`WF_${name.slice("WORLDFORGE_".length)}`);
    } else if (name.startsWith("WF_")) {
      expanded.push(`WORLDFORGE_${name.slice("WF_".length)}`);
    }
  }

  return expanded;
}

export function readRuntimeLimitMs(
  envNames: string | readonly string[],
  defaultValue: number,
): number {
  const names = expandRuntimeLimitEnvNames(envNames);
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") continue;

    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer number of milliseconds, got "${raw}".`);
    }
    return value;
  }

  return defaultValue;
}

export function playerBlockingStageLimit(
  envNames: string | readonly string[],
  defaultValue = DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS,
): number {
  return readRuntimeLimitMs(
    [
      ...(Array.isArray(envNames) ? envNames : [envNames]),
      "WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS",
      "WF_PLAYER_BLOCKING_STAGE_TIMEOUT_MS",
    ],
    defaultValue,
  );
}
