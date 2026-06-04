import {
  apiResponseProjectionV2Schema,
  type ApiResponseProjectionV2,
  type SettledTurnPacketV2,
} from "./contracts.js";

export interface BuildApiResponseProjectionV2Input {
  packet: SettledTurnPacketV2;
  narrativeText: string;
  tick: number;
  worldVersion: number;
  worldTimeMinutes: number;
}

export function buildApiResponseProjectionV2(
  input: BuildApiResponseProjectionV2Input,
): ApiResponseProjectionV2 {
  return apiResponseProjectionV2Schema.parse({
    version: "api-response-projection.v2",
    packetId: input.packet.packetId,
    campaignId: input.packet.campaignId,
    turnId: input.packet.turnId,
    narrativeEvent: {
      type: "narrative",
      data: {
        text: input.narrativeText,
      },
    },
    doneEvent: {
      type: "done",
      data: {
        tick: input.tick,
        worldVersion: input.worldVersion,
        worldTimeMinutes: input.worldTimeMinutes,
        opening: false,
        turnId: input.packet.turnId,
        packetId: input.packet.packetId,
        runtime: "gameplay-cycle-v2",
      },
    },
  });
}
