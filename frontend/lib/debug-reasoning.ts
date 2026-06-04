export function canExposeRawReasoning(): boolean {
  return process.env.NEXT_PUBLIC_WORLDFORGE_DEBUG_REASONING === "1";
}
