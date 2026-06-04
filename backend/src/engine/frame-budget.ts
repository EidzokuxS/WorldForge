export type ContextFrameType =
  | "SceneFrame"
  | "OracleFrame"
  | "ActorFrame"
  | "FactionCommandFrame"
  | "NarratorPacket"
  | "ReviewerPacket";

export interface FrameBudgetSpec {
  frameType: ContextFrameType;
  targetTokens: number;
  warningTokens: number;
  failTokens: number;
  maxSelectedItems: number;
  maxSourceLinkedSummaries: number;
}

export const FRAME_BUDGET_SPECS: Record<ContextFrameType, FrameBudgetSpec> = {
  SceneFrame: {
    frameType: "SceneFrame",
    targetTokens: 1_800,
    warningTokens: 2_400,
    failTokens: 3_200,
    maxSelectedItems: 40,
    maxSourceLinkedSummaries: 12,
  },
  OracleFrame: {
    frameType: "OracleFrame",
    targetTokens: 900,
    warningTokens: 1_200,
    failTokens: 1_600,
    maxSelectedItems: 18,
    maxSourceLinkedSummaries: 6,
  },
  ActorFrame: {
    frameType: "ActorFrame",
    targetTokens: 1_400,
    warningTokens: 1_900,
    failTokens: 2_600,
    maxSelectedItems: 30,
    maxSourceLinkedSummaries: 10,
  },
  FactionCommandFrame: {
    frameType: "FactionCommandFrame",
    targetTokens: 1_300,
    warningTokens: 1_800,
    failTokens: 2_400,
    maxSelectedItems: 28,
    maxSourceLinkedSummaries: 10,
  },
  NarratorPacket: {
    frameType: "NarratorPacket",
    targetTokens: 1_600,
    warningTokens: 2_200,
    failTokens: 2_900,
    maxSelectedItems: 34,
    maxSourceLinkedSummaries: 10,
  },
  ReviewerPacket: {
    frameType: "ReviewerPacket",
    targetTokens: 1_100,
    warningTokens: 1_500,
    failTokens: 2_000,
    maxSelectedItems: 22,
    maxSourceLinkedSummaries: 8,
  },
};

export function getFrameBudgetSpec(frameType: ContextFrameType): FrameBudgetSpec {
  return FRAME_BUDGET_SPECS[frameType];
}
