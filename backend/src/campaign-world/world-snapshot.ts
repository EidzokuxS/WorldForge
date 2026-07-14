import crypto from "node:crypto";
import { z } from "zod";
import type { CampaignWorldReview } from "@worldforge/shared";
import type { CampaignWorldDraft } from "./world-validator.js";
import { validateCampaignWorldDraft } from "./world-validator.js";
import { calculateCampaignWorldSourceDigest } from "./world-source.js";

const SHA256_CHARACTERS = "0123456789abcdef";
const oneToFiveSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
const oneToTenSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
]);

const sha256Schema = z.string().refine(
  (value) =>
    value.length === 64 &&
    [...value].every((character) => SHA256_CHARACTERS.includes(character)),
  { message: "Expected a lowercase SHA-256 digest." },
);

const acceptedSourceSchema = z.object({
  premise: z.string(),
  dna: z.object({
    geography: z.string().min(1),
    politicalStructure: z.string().min(1),
    centralConflict: z.string().min(1),
    culturalFlavor: z.string().min(1),
    environment: z.string().min(1),
    wildcard: z.string().min(1),
  }).strict().nullable(),
  researchSummary: z.string().min(1).nullable(),
  sourceReferences: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    sourceType: z.string().min(1),
  }).strict()),
}).strict();

const acceptedReviewSchema: z.ZodType<CampaignWorldReview> = z.object({
  campaignId: z.string().min(1),
  status: z.literal("accepted"),
  version: z.number().int().min(1),
  contentHash: sha256Schema,
  sourceDigest: sha256Schema,
  worldSummary: z.string().min(1),
  locations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    kind: z.enum(["macro", "persistent_sublocation"]),
    parentLocationId: z.string().min(1).nullable(),
    tags: z.array(z.string()),
    isStarting: z.boolean(),
  }).strict()),
  routes: z.array(z.object({
    id: z.string().min(1),
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    travelCost: oneToTenSchema,
  }).strict()),
  actors: z.array(z.object({
    id: z.string().min(1),
    kind: z.literal("person"),
    controller: z.literal("agent"),
    role: z.enum(["key", "support", "background"]),
    name: z.string().min(1),
    summary: z.string().min(1),
    traits: z.array(z.string()),
    tags: z.array(z.string()),
  }).strict()),
  goals: z.array(z.object({
    id: z.string().min(1),
    actorId: z.string().min(1),
    objective: z.string().min(1),
    motivation: z.string().min(1),
    horizon: z.enum(["immediate", "ongoing"]),
    priority: oneToFiveSchema,
    status: z.literal("active"),
  }).strict()),
  relations: z.array(z.object({
    id: z.string().min(1),
    sourceActorId: z.string().min(1),
    targetActorId: z.string().min(1),
    relationType: z.enum([
      "alliance",
      "rivalry",
      "authority",
      "dependency",
      "kinship",
      "association",
      "hostility",
    ]),
    summary: z.string().min(1),
    intensity: oneToFiveSchema,
  }).strict()),
  placements: z.array(z.object({
    id: z.string().min(1),
    actorId: z.string().min(1),
    locationId: z.string().min(1),
    placementKind: z.enum(["present", "home"]),
  }).strict()),
  pressures: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    trajectory: z.string().min(1),
    urgency: oneToFiveSchema,
    actorIds: z.array(z.string().min(1)),
    locationIds: z.array(z.string().min(1)),
  }).strict()),
  builtAt: z.number().int(),
  acceptedAt: z.number().int(),
  source: acceptedSourceSchema,
}).strict();

export interface AcceptedCampaignWorldReviewMetadata {
  campaignId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  acceptedAt: number;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareText(left.id, right.id));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function serializeAcceptedCampaignWorldReview(
  review: CampaignWorldReview,
): string {
  return stableJson(acceptedReviewSchema.parse(review));
}

export function parseAcceptedCampaignWorldReview(
  serialized: string,
  expected: AcceptedCampaignWorldReviewMetadata,
): CampaignWorldReview {
  const raw = JSON.parse(serialized) as unknown;
  const review = acceptedReviewSchema.parse(raw);
  if (serializeAcceptedCampaignWorldReview(review) !== serialized) {
    throw new Error("Accepted Campaign World snapshot is not canonical JSON.");
  }
  if (
    review.campaignId !== expected.campaignId ||
    review.version !== expected.acceptedWorldVersion ||
    review.contentHash !== expected.acceptedContentHash ||
    review.acceptedAt !== expected.acceptedAt
  ) {
    throw new Error("Accepted Campaign World snapshot metadata does not match.");
  }
  if (calculateCampaignWorldSourceDigest(review.source) !== review.sourceDigest) {
    throw new Error("Accepted Campaign World snapshot source digest does not match.");
  }

  const draft = validateCampaignWorldDraft({
    worldSummary: review.worldSummary,
    locations: review.locations,
    routes: review.routes,
    actors: review.actors,
    goals: review.goals,
    relations: review.relations,
    placements: review.placements,
    pressures: review.pressures,
  });
  if (
    calculateCampaignWorldContentHash(review.sourceDigest, draft) !==
      expected.acceptedContentHash
  ) {
    throw new Error("Accepted Campaign World snapshot content hash does not match.");
  }
  return review;
}

export function serializeCampaignWorldContent(
  sourceDigest: string,
  draft: CampaignWorldDraft,
): string {
  const content = {
    sourceDigest,
    worldSummary: draft.worldSummary,
    locations: sortById(draft.locations).map((location) => ({
      id: location.id,
      name: location.name,
      description: location.description,
      kind: location.kind,
      parentLocationId: location.parentLocationId,
      tags: [...location.tags].sort(compareText),
      isStarting: location.isStarting,
    })),
    routes: sortById(draft.routes).map((route) => ({
      id: route.id,
      fromLocationId: route.fromLocationId,
      toLocationId: route.toLocationId,
      travelCost: route.travelCost,
    })),
    actors: sortById(draft.actors).map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      controller: actor.controller,
      role: actor.role,
      name: actor.name,
      summary: actor.summary,
      traits: [...actor.traits].sort(compareText),
      tags: [...actor.tags].sort(compareText),
    })),
    goals: sortById(draft.goals).map((goal) => ({
      id: goal.id,
      actorId: goal.actorId,
      objective: goal.objective,
      motivation: goal.motivation,
      horizon: goal.horizon,
      priority: goal.priority,
      status: goal.status,
    })),
    relations: sortById(draft.relations).map((relation) => ({
      id: relation.id,
      sourceActorId: relation.sourceActorId,
      targetActorId: relation.targetActorId,
      relationType: relation.relationType,
      summary: relation.summary,
      intensity: relation.intensity,
    })),
    placements: sortById(draft.placements).map((placement) => ({
      id: placement.id,
      actorId: placement.actorId,
      locationId: placement.locationId,
      placementKind: placement.placementKind,
    })),
    pressures: sortById(draft.pressures).map((pressure) => ({
      id: pressure.id,
      name: pressure.name,
      description: pressure.description,
      trajectory: pressure.trajectory,
      urgency: pressure.urgency,
      actorIds: [...pressure.actorIds].sort(compareText),
      locationIds: [...pressure.locationIds].sort(compareText),
    })),
  };

  return stableJson(content);
}

export function calculateCampaignWorldContentHash(
  sourceDigest: string,
  draft: CampaignWorldDraft,
): string {
  return crypto
    .createHash("sha256")
    .update(serializeCampaignWorldContent(sourceDigest, draft))
    .digest("hex");
}
