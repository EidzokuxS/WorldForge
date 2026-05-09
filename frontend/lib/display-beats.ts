import type { ChatMessage } from "@worldforge/shared";
import type { OracleResultData } from "@/components/game/oracle-panel";
import type {
  DisplayBeat,
  MechanicSummary,
  QuickChoice,
  SideRemark,
  StageSignal,
  StageSignalInput,
} from "@/components/game/play-surface/types";
import {
  deriveGameMessageKind,
  isDialogueParagraph,
  splitGameplayParagraphs,
  stripLookupPrefix,
} from "./gameplay-text";

export const CONTINUE_ACTION_PAYLOAD = "Continue scene.";

export type TurnPhase = "idle" | "streaming" | "finalizing";
export type SceneProgress = "opening" | "scene-settling" | null;

export interface DeriveDisplayBeatsInput {
  messages: ChatMessage[];
  turnPhase: TurnPhase;
  sceneProgress: SceneProgress;
  oracleResult: OracleResultData | null;
  travelFeedback: string | null;
  quickActions: QuickChoice[];
  sideRemarks?: SideRemark[];
  stageSignals?: StageSignalInput[];
}

const MAX_NARRATION_BEATS = 5;

const ORACLE_LABELS: Record<OracleResultData["outcome"], MechanicSummary["label"]> = {
  strong_hit: "Clean success",
  weak_hit: "Costly success",
  miss: "Miss",
};

export function getInitialBeatIndex(_beats: DisplayBeat[]): number {
  void _beats;
  return 0;
}

export function deriveDisplayBeats(input: DeriveDisplayBeatsInput): DisplayBeat[] {
  const beats: DisplayBeat[] = [];
  const stageSignals = normalizeStageSignals(input.stageSignals);

  const latestAssistant = [...input.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (latestAssistant) {
    beats.push(...deriveNarrationBeats(latestAssistant, stageSignals));
  }

  if (input.oracleResult) {
    beats.push(createMechanicalBeat(input.oracleResult));
  }

  if (input.travelFeedback) {
    beats.push({
      id: "state-change-travel",
      kind: "state_change",
      text: input.travelFeedback,
    });
  }

  for (const remark of input.sideRemarks ?? []) {
    beats.push({
      id: `side-remark-${beats.length}-${slugify(remark.actorName)}`,
      kind: "side_remark",
      text: remark.text,
      speaker: remark.actorName,
      visualPriority: "secondary",
    });
  }

  if (input.quickActions.length > 0 && input.turnPhase === "idle" && input.sceneProgress === null) {
    beats.push({
      id: "choice-settled-actions",
      kind: "choice",
      text: "Choices",
      choices: input.quickActions.map((choice) => ({ ...choice })),
    });
  }

  const progressText = getProgressText(input.sceneProgress, input.turnPhase);
  if (progressText && beats.length === 0) {
    beats.push({
      id: `progress-${slugify(progressText)}`,
      kind: "progress",
      text: progressText,
    });
  }

  const hasPrimaryBeat = beats.some((beat) => beat.kind !== "side_remark");
  if (isReadyForInput(input) && input.quickActions.length === 0 && !hasPrimaryBeat) {
    beats.push({
      id: "input-handoff",
      kind: "input_handoff",
      text: "Ready",
      unlocksActionDock: true,
    });
  }

  if (beats.length === 0) {
    beats.push({
      id: "progress-reading",
      kind: "progress",
      text: "Reading",
    });
  }

  return beats;
}

function deriveNarrationBeats(
  message: ChatMessage,
  stageSignals: StageSignal[],
): DisplayBeat[] {
  const kind = deriveGameMessageKind(message.role, message.content);
  if (kind !== "narration") {
    return [
      {
        id: "latest-support",
        kind: kind === "progress" ? "progress" : "narration",
        text: stripLookupPrefix(message.content),
        stageSignals: stageSignals.length > 0 ? stageSignals : undefined,
      },
    ];
  }

  return splitGameplayParagraphs(message.content)
    .slice(0, MAX_NARRATION_BEATS)
    .map((paragraph, index) => {
      const dialogue = parseDialogue(paragraph);
      return {
        id: `latest-${index}`,
        kind: dialogue ? "dialogue" : "narration",
        text: dialogue?.text ?? paragraph,
        speaker: dialogue?.speaker,
        visualPriority: "primary",
        stageSignals: index === 0 && stageSignals.length > 0 ? stageSignals : undefined,
      };
    });
}

function createMechanicalBeat(result: OracleResultData): DisplayBeat {
  const label = getMechanicLabel(result);
  return {
    id: `mechanic-${result.outcome}`,
    kind: "mechanical_result",
    text: label,
    mechanic: {
      label,
      outcome: result.outcome,
    },
    rawDetails: {
      chance: result.chance,
      roll: result.roll,
      reasoning: result.reasoning,
    },
  };
}

function getMechanicLabel(result: OracleResultData): MechanicSummary["label"] {
  if (result.outcome !== "miss") {
    return ORACLE_LABELS[result.outcome];
  }

  const missMargin = result.roll - result.chance;
  if (missMargin > 25) return "Bad break";
  if (missMargin > 0 && missMargin <= 10) return "Close call";
  return "Miss";
}

function getProgressText(sceneProgress: SceneProgress, turnPhase: TurnPhase): string | null {
  if (sceneProgress === "opening") return "Reading";
  if (sceneProgress === "scene-settling") return "Settling";
  if (turnPhase === "streaming") return "Thinking";
  if (turnPhase === "finalizing") return "Settling";
  return null;
}

function isReadyForInput(input: DeriveDisplayBeatsInput): boolean {
  return input.turnPhase === "idle" && input.sceneProgress === null;
}

function normalizeStageSignals(signals: StageSignalInput[] | undefined): StageSignal[] {
  return (signals ?? []).map((signal) => ({
    ...signal,
    clearOn: signal.clearOn ?? "next",
  }));
}

function parseDialogue(paragraph: string): { speaker?: string; text: string } | null {
  const namedLine = paragraph.match(/^([^:]{1,48}):\s*["“](.+)["”]$/u);
  if (namedLine) {
    return {
      speaker: namedLine[1].trim(),
      text: namedLine[2].trim(),
    };
  }

  const quoteThenSpeaker = paragraph.match(
    /^["“](.+)["”]\s+([A-Z][\w'-]{1,30})\s+(?:says|asks|whispers|mutters|calls)\.?$/u,
  );
  if (quoteThenSpeaker) {
    return {
      speaker: quoteThenSpeaker[2],
      text: quoteThenSpeaker[1].trim(),
    };
  }

  if (!isDialogueParagraph(paragraph)) {
    return null;
  }

  return {
    speaker: inferSpeaker(paragraph),
    text: paragraph.replace(/^["“]|["”]$/g, "").trim(),
  };
}

function inferSpeaker(paragraph: string): string | undefined {
  const match = paragraph.match(/^["“].+?["”]\s+([A-Z][\w'-]{1,30})\s+(?:says|asks|whispers|mutters|calls)\.?$/u);
  return match?.[1];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
