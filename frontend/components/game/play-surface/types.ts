import type { OracleResultData } from "../oracle-panel";

export type DisplayBeatKind =
  | "narration"
  | "dialogue"
  | "side_remark"
  | "mechanical_result"
  | "state_change"
  | "choice"
  | "progress"
  | "input_handoff";

export type DrawerKind =
  | "log"
  | "world"
  | "inventory"
  | "journal"
  | "character"
  | "inspect"
  | "saves";

export type AddressMode = "freeform" | "ask-gm";

export type PresenceBand = "visible" | "sensed" | "same_area" | "off_screen";

export type StageSignalKind =
  | "flash"
  | "fade"
  | "shake"
  | "whisper"
  | "danger"
  | "glitch"
  | "ambient";

export interface StageSignal {
  id: string;
  kind: StageSignalKind;
  text: string;
  actorId?: string;
  actorName?: string;
  intensity?: "low" | "medium" | "high";
  clearOn: "next" | "turn_boundary";
}

export interface StageSignalInput
  extends Omit<StageSignal, "clearOn"> {
  clearOn?: StageSignal["clearOn"];
}

export interface MechanicSummary {
  label: "Clean success" | "Costly success" | "Miss" | "Bad break" | "Close call";
  outcome: OracleResultData["outcome"];
}

export interface MechanicRawDetails {
  chance: number;
  roll: number;
  reasoning: string;
}

export interface QuickChoice {
  label: string;
  action: string;
}

export interface SideRemark {
  actorId?: string;
  actorName: string;
  text: string;
}

export interface DisplayBeat {
  id: string;
  kind: DisplayBeatKind;
  text: string;
  speaker?: string;
  visualPriority?: "primary" | "secondary";
  mechanic?: MechanicSummary;
  rawDetails?: MechanicRawDetails;
  choices?: QuickChoice[];
  stageSignals?: StageSignal[];
  unlocksActionDock?: boolean;
}
