import type { RuntimeToolName } from "./tool-schemas.js";

export const UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR =
  "unconfirmed_access_claim: backend will not grant possession, access, movement, or a claimed item from an unverified key/permit/authority claim. Resolve as refusal, suspicion, a request for proof, or a scene-local failed attempt.";

const unconfirmedAccessClaimVerbPattern =
  /\b(?:claim|say|insist|pretend|bluff|declare|tell)\b/i;
const emphaticAccessProofClaimPattern =
  /\b(?:definitely|certainly|obviously|of course|already|supposedly)\b/i;
const accessProofPossessionPattern =
  /\b(?:already\s+)?(?:have|has|possess|possesses|hold|holds|own|owns|carry|carries|carrying|got)\b.{0,120}\b(?:key|permit|pass|chit|token|credential|authorization|authority|badge|seal)\b/i;
const accessProofPossessionReversePattern =
  /\b(?:key|permit|pass|chit|token|credential|authorization|authority|badge|seal)\b.{0,120}\b(?:i\s+|they\s+|we\s+|he\s+|she\s+)?(?:already\s+|definitely\s+|certainly\s+|obviously\s+|of course\s+)?(?:have|has|possess|possesses|hold|holds|own|owns|carry|carries|carrying|got)\b/i;
const restrictedAccessAttemptPattern =
  /\b(?:unlock|open|enter|access|bypass|pass through|go through|let .* through|move through|try to unlock|try to open)\b/i;
const socialCredibilityOraclePattern =
  /\b(?:believ|trust|notice|challenge|suspect|accept|buy|call .* bluff|demand proof|ask for proof|react|refuse|alarm|suspicion)\b/i;
const claimedProofExistenceOraclePattern =
  /\b(?:exist|exists|real|actually|possession|possess|possesses|has|have|carry|carries|own|owns|fit|fits|work|works|open|opens|unlock|unlocks)\b.{0,160}\b(?:key|permit|pass|chit|token|credential|authorization|authority|badge|seal)\b/i;
const claimedProofExistenceOracleReversePattern =
  /\b(?:key|permit|pass|chit|token|credential|authorization|authority|badge|seal)\b.{0,160}\b(?:exist|exists|real|actually|possession|possess|possesses|has|have|carry|carries|own|owns|fit|fits|work|works|open|opens|unlock|unlocks)\b/i;
const restrictedAccessTextPattern =
  /\b(?:locked|sealed|restricted|staff-only|staff only|office|checkpoint|door|gate|through|access)\b/i;
const claimedProofTextPattern =
  /\b(?:key|permit|pass|chit|token|credential|authorization|authority|badge|seal|master-access|staff-issue)\b/i;
const durableAccessClaimTextPattern =
  /\b(?:gained entry|gains entry|entered|opens?|opened|unlocks?|unlocked|has .*key|possess(?:es|ed)? .*key|unauthorized access|access to)\b/i;
const accessGrantOutcomePattern =
  /\b(?:gained entry|gains entry|entered|inside|already through|through the|standing in .*office|door .*open|opened the door|door opened|unlocked|access granted|gains access)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectInputText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectInputText).join(" ");
  if (!isRecord(value)) return "";
  return Object.values(value).map(collectInputText).join(" ");
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isUnconfirmedAccessProofClaim(playerAction: string): boolean {
  const claimsAccessProof =
    accessProofPossessionPattern.test(playerAction)
    || accessProofPossessionReversePattern.test(playerAction);

  return claimsAccessProof
    && restrictedAccessAttemptPattern.test(playerAction)
    && (
      unconfirmedAccessClaimVerbPattern.test(playerAction)
      || emphaticAccessProofClaimPattern.test(playerAction)
      || restrictedAccessTextPattern.test(playerAction)
    );
}

export function isClaimedProofOracleExistenceQuestion(text: string): boolean {
  if (socialCredibilityOraclePattern.test(text)) {
    return false;
  }
  return claimedProofExistenceOraclePattern.test(text)
    || claimedProofExistenceOracleReversePattern.test(text);
}

export function isClaimedProofAccessOrExistenceOutcome(text: string): boolean {
  return isClaimedProofOracleExistenceQuestion(text) || accessGrantOutcomePattern.test(text);
}

export function grantsClaimedAccessFromUnconfirmedProof(
  toolName: RuntimeToolName,
  input: unknown,
): boolean {
  const text = collectInputText(input).toLowerCase();

  switch (toolName) {
    case "reveal_location":
    case "move_to":
      return restrictedAccessTextPattern.test(text);
    case "spawn_item":
    case "transfer_item":
      return claimedProofTextPattern.test(text);
    case "log_event": {
      const durable = isRecord(input) && stringField(input, "durability") === "durable";
      return durable && durableAccessClaimTextPattern.test(text);
    }
    default:
      return false;
  }
}

export function buildPlayerActionEpistemicNotes(playerAction: string): string {
  if (!isUnconfirmedAccessProofClaim(playerAction)) {
    return "- none";
  }

  return [
    "- Detected an unconfirmed possession/access proof claim in the raw player action.",
    "- Treat it as a claim, bluff, request, or visible attempt unless legal targets/current state already confirm the proof.",
    "- Do not ask Oracle whether the claimed key, permit, pass, credential, or authority exists, is owned, fits, or works.",
    "- Valid Oracle uncertainty may test social credibility, witness reaction, suspicion/alarm, or a physical attempt that does not create the claimed proof.",
    "- Valid tool planning may record refusal, suspicion, alarm, or a scene-local failed/attempted beat; it must not create the proof, reveal access, or move through access from the claim.",
  ].join("\n");
}
