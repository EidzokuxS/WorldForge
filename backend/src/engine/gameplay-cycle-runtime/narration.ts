import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertCleanNarrationResult,
  assertCleanNarratorPromptInput,
  cleanNarrationCandidateSchema,
  type CleanNarrationCandidate,
  type CleanNarrationLanguage,
  type CleanNarrationResult,
  type CleanNarratorPromptInput,
  type CleanNarratorView,
} from "./contracts.js";

export interface CleanNarrationValidationIssue {
  code:
    | "audit_misuse"
    | "backend_ref"
    | "claim_not_supported"
    | "empty_text"
    | "fact_not_supported"
    | "language_mismatch"
    | "linkage_mismatch"
    | "old_runtime_marker"
    | "private_term"
    | "schema_invalid"
    | "text_mismatch";
  path: string;
  message: string;
}

export interface CleanNarrationCandidateRequest {
  system: string;
  prompt: string;
  promptInput: CleanNarratorPromptInput;
}

export type CleanNarrationCandidateGenerator =
  (request: CleanNarrationCandidateRequest) => Promise<unknown>;

export type CleanNarrationRunResult = CleanNarrationResult & {
  validationIssues: CleanNarrationValidationIssue[];
};

export class CleanNarrationGenerationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "CleanNarrationGenerationError";
  }
}

export class CleanNarrationValidationError extends Error {
  readonly issues: CleanNarrationValidationIssue[];

  constructor(message: string, issues: CleanNarrationValidationIssue[]) {
    super(message);
    this.name = "CleanNarrationValidationError";
    this.issues = issues;
  }
}

const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BACKEND_REF = /\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|receipt|route|scene|turn|world|loc|player):[^\s",.]+/i;
const BACKEND_DASH_ID = /\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|receipt|route|scene|turn|world|loc|player|stage4-receipt)-[a-z0-9][a-z0-9-]*\b/i;
const OLD_RUNTIME_MARKER = /\b(?:narrator_attempt|clean_narrator_attempt|settled_turn_packet|receipt_ledger|gameplay_cycle_v2|turn_saga|tool_payload|privateResult|chance|roll|reasoning)\b/i;

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function expectedLanguage(view: CleanNarratorView): CleanNarrationLanguage {
  const action = view.playerAction;
  const hasCyrillic = /[\u0400-\u04ff]/u.test(action);
  const hasLatin = /[A-Za-z]/u.test(action);
  if (hasCyrillic && hasLatin) return "mixed";
  if (hasCyrillic) return "ru";
  return "en";
}

function zodIssue(issue: { path: PropertyKey[]; message: string }): CleanNarrationValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

function leakageIssues(input: {
  view: CleanNarratorView;
  candidate: CleanNarrationCandidate;
}): CleanNarrationValidationIssue[] {
  const text = input.candidate.sentences.map((sentence) => sentence.text).join("\n")
    + "\n"
    + input.candidate.finalText;
  const issues: CleanNarrationValidationIssue[] = [];
  const privateTerms = uniqueStrings([
    ...input.view.privateGuardSidecar.forbiddenActorLabels,
    ...input.view.privateGuardSidecar.forbiddenPrivateTerms,
  ]);

  for (const term of privateTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      issues.push({
        code: "private_term",
        path: "finalText",
        message: "Narration candidate leaked a private guard term.",
      });
      break;
    }
  }

  if (UUID_LIKE.test(text) || BACKEND_REF.test(text) || BACKEND_DASH_ID.test(text)) {
    issues.push({
      code: "backend_ref",
      path: "finalText",
      message: "Narration candidate exposed backend-looking refs.",
    });
  }
  if (OLD_RUNTIME_MARKER.test(text)) {
    issues.push({
      code: "old_runtime_marker",
      path: "finalText",
      message: "Narration candidate exposed old runtime or hidden adapter markers.",
    });
  }

  return issues;
}

export function buildCleanNarratorPromptInput(view: CleanNarratorView): CleanNarratorPromptInput {
  return assertCleanNarratorPromptInput({
    version: "gameplay-runtime.clean-narrator-prompt-input.v1",
    packetId: view.packetId,
    turnId: view.turnId,
    responseLanguage: view.responseLanguage,
    language: expectedLanguage(view),
    languageSource: "derived_from_player_action_without_prompting_raw_action",
    preserveLabelsVerbatim: view.preserveLabelsVerbatim,
    acceptedEvidence: view.acceptedEvidence,
    stepAuditForGrounding: view.stepAuditForGrounding,
    guard: view.guard,
  });
}

export function buildCleanNarrationSystemPrompt(): string {
  return [
    "You are WorldForge Stage 6 Narration.",
    "Return only JSON matching gameplay-runtime.clean-narration-candidate.v1.",
    "World-truth source: acceptedEvidence[].backendFacts.",
    "raw player action is intentionally omitted; write the settled result described by accepted evidence.",
    "Stage authority: narration phrases accepted evidence into player-facing prose.",
    "Sentence contract: accepted_evidence sentences cite evidenceRefs, backendFactRefs, and claimKinds from acceptedEvidence.",
    "Audit contract: audit_notice sentences cite auditStepIds from stepAuditForGrounding and carry empty evidenceRefs, backendFactRefs, and claimKinds.",
    "finalText must be exactly the sentence texts joined with one space.",
    "For route_status, express the cited route_status backend fact.",
    "For player_location_change, express the accepted player location change and accepted elapsed travel time.",
    "For oracle_outcome, express the selected visible outcome meaning.",
    "For standalone elapsed_time, express the accepted elapsed time fact.",
    "For dialogue_response, express that the visible speaker responded and include the accepted quote or summary as utterance evidence.",
    "For support_actor_materialization, express the accepted visible temporary support actor or role now present in the current scene.",
    "For player_local_condition, express the accepted Player current-scene posture or readiness condition operation.",
    "For item_state, express the accepted item custody, location, or equip-state operation.",
    "For minor_poi_handle, express the accepted visible current-scene place handle label and kind as a target handle.",
    "For local_observation, express the accepted current visible observation result; for bounded_visibility_negative, express that current visible entries showed no matching visible result.",
    "For device_surface_observation, express the accepted modeled public device surface facets or the bounded current visible device-surface result.",
    "For clarification_request, ask the accepted clarification question.",
    "Use promptInput.language for response language. Preserve accepted labels exactly as written.",
  ].join("\n");
}

export function buildCleanNarrationPrompt(input: CleanNarratorPromptInput): string {
  return [
    "Write concise player-facing narration from this prompt-safe CleanNarratorView projection.",
    "Use the schema fields exactly as defined.",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}

export function validateCleanNarrationCandidate(input: {
  view: CleanNarratorView;
  candidate: unknown;
}): { status: "accepted"; candidate: CleanNarrationCandidate; issues: [] } | {
  status: "rejected";
  issues: CleanNarrationValidationIssue[];
} {
  const parsed = cleanNarrationCandidateSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: parsed.error.issues.map(zodIssue),
    };
  }

  const candidate = parsed.data;
  const issues: CleanNarrationValidationIssue[] = [];
  if (candidate.packetId !== input.view.packetId) {
    issues.push({
      code: "linkage_mismatch",
      path: "packetId",
      message: "Narration candidate packetId must match the narrator view.",
    });
  }
  if (candidate.turnId !== input.view.turnId) {
    issues.push({
      code: "linkage_mismatch",
      path: "turnId",
      message: "Narration candidate turnId must match the narrator view.",
    });
  }
  if (candidate.language !== expectedLanguage(input.view)) {
    issues.push({
      code: "language_mismatch",
      path: "language",
      message: "Narration candidate language must match the player action language.",
    });
  }

  const joined = normalizeText(candidate.sentences.map((sentence) => sentence.text).join(" "));
  if (normalizeText(candidate.finalText) !== joined) {
    issues.push({
      code: "text_mismatch",
      path: "finalText",
      message: "finalText must equal the normalized sentence texts joined with one space.",
    });
  }

  const evidenceByRef = new Map(input.view.acceptedEvidence.map((evidence) => [evidence.ref, evidence]));
  const auditByStepId = new Map(input.view.stepAuditForGrounding.map((step) => [step.stepId, step]));

  candidate.sentences.forEach((sentence, index) => {
    if (sentence.kind === "accepted_evidence") {
      if (
        sentence.evidenceRefs.length === 0
        || sentence.backendFactRefs.length === 0
        || sentence.claimKinds.length === 0
        || sentence.auditStepIds.length > 0
      ) {
        issues.push({
          code: "fact_not_supported",
          path: `sentences.${index}`,
          message: "accepted_evidence sentences must cite evidence refs, backend facts, and claim kinds only.",
        });
      }

      const citedEvidence = sentence.evidenceRefs.map((ref) => evidenceByRef.get(ref));
      if (citedEvidence.some((evidence) => !evidence)) {
        issues.push({
          code: "fact_not_supported",
          path: `sentences.${index}.evidenceRefs`,
          message: "Narration sentence cited evidence not present in CleanNarratorView.",
        });
      }
      const factRefs = new Set(citedEvidence.flatMap((evidence) =>
        evidence?.backendFacts.map((fact) => fact.factRef) ?? []
      ));
      for (const factRef of sentence.backendFactRefs) {
        if (!factRefs.has(factRef)) {
          issues.push({
            code: "fact_not_supported",
            path: `sentences.${index}.backendFactRefs`,
            message: `Narration sentence cited unsupported backend fact ${factRef}.`,
          });
        }
      }
      const claimKinds = new Set(citedEvidence.flatMap((evidence) => evidence?.claimKinds ?? []));
      for (const claimKind of sentence.claimKinds) {
        if (!claimKinds.has(claimKind)) {
          issues.push({
            code: "claim_not_supported",
            path: `sentences.${index}.claimKinds`,
            message: `Narration sentence declared unsupported claim kind ${claimKind}.`,
          });
        }
      }
    } else {
      if (
        sentence.auditStepIds.length === 0
        || sentence.evidenceRefs.length > 0
        || sentence.backendFactRefs.length > 0
        || sentence.claimKinds.length > 0
      ) {
        issues.push({
          code: "audit_misuse",
          path: `sentences.${index}`,
          message: "audit_notice sentences must cite only failed/skipped audit step ids and no world claim fields.",
        });
      }
      for (const stepId of sentence.auditStepIds) {
        if (!auditByStepId.has(stepId)) {
          issues.push({
            code: "audit_misuse",
            path: `sentences.${index}.auditStepIds`,
            message: `Narration sentence cited unavailable audit step ${stepId}.`,
          });
        }
      }
    }
  });

  if (normalizeText(candidate.finalText).length === 0) {
    issues.push({
      code: "empty_text",
      path: "finalText",
      message: "Narration candidate finalText cannot be empty.",
    });
  }
  issues.push(...leakageIssues({ view: input.view, candidate }));

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", candidate, issues: [] };
}

function projectionLanguage(view: CleanNarratorView): "ru" | "en" {
  return /[\u0400-\u04ff]/u.test(view.playerAction) ? "ru" : "en";
}

function needsDeterministicAuthorityProjection(view: CleanNarratorView): boolean {
  const onlySceneFrameSnapshotEvidence = view.acceptedEvidence.length > 0
    && view.acceptedEvidence.every((evidence) => evidence.authority === "scene_frame_snapshot");
  const hasPlayerLocationChange = view.acceptedEvidence.some((evidence) =>
    evidence.claimKinds.includes("player_location_change")
  );
  return view.acceptedEvidence.some((evidence) =>
    evidence.claimKinds.includes("item_state")
    || evidence.claimKinds.includes("clarification_request")
    || evidence.claimKinds.includes("minor_poi_handle")
    || evidence.claimKinds.includes("local_observation")
    || evidence.claimKinds.includes("player_local_condition")
    || evidence.claimKinds.includes("route_status")
    || (
      evidence.claimKinds.includes("elapsed_time")
      && !hasPlayerLocationChange
    )
    || evidence.authority === "route_options_receipt"
    || (
      onlySceneFrameSnapshotEvidence
      && (
        evidence.claimKinds.includes("visible_target")
        || evidence.claimKinds.includes("movement_option")
      )
    )
    || evidence.claimKinds.includes("device_surface_observation")
  );
}

export function renderCleanAuthorityProjection(view: CleanNarratorView): string {
  const language = projectionLanguage(view);
  const clarification = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("clarification_request")
  );
  if (clarification) {
    const question = (clarification.backendFacts[0]?.text ?? clarification.text)
      .replace(/^Clarification request:\s*/u, "")
      .replace(/^Clarification needed:\s*/u, "")
      .trim();
    return language === "ru"
      ? `Уточните: ${question}`
      : `Please clarify: ${question}`;
  }

  const movement = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("player_location_change")
  );
  const movementFact = movement?.backendFacts.find((entry) =>
    entry.text.startsWith("Player location changed to ")
  );
  if (movementFact) {
    const location = movementFact.text
      .replace(/^Player location changed to /u, "")
      .replace(/\.$/u, "");
    return language === "ru"
      ? `Вы перемещаетесь в ${location}.`
      : `You move to ${location}.`;
  }

  const oracle = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("oracle_outcome")
  );
  if (oracle) {
    return oracle.backendFacts[0]?.text ?? oracle.text;
  }

  const route = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("route_status")
  );
  if (route) {
    const routeText = route.backendFacts[0]?.text ?? route.text;
    return language === "ru"
      ? `Проверка маршрута подтверждает: ${routeText}`
      : `The settled route check confirms: ${routeText}`;
  }

  const routeOptions = view.acceptedEvidence.find((evidence) =>
    evidence.authority === "route_options_receipt"
  );
  if (routeOptions) {
    return routeOptions.backendFacts.map((entry) => entry.text).join(" ");
  }

  const onlySceneFrameSnapshotEvidence = view.acceptedEvidence.length > 0
    && view.acceptedEvidence.every((evidence) => evidence.authority === "scene_frame_snapshot");
  const hasSceneFrameRouteOrTarget = onlySceneFrameSnapshotEvidence
    && view.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("visible_target")
      || evidence.claimKinds.includes("movement_option")
    );
  const sceneFrameSnapshotFacts = hasSceneFrameRouteOrTarget
    ? view.acceptedEvidence
      .filter((evidence) => evidence.authority === "scene_frame_snapshot")
      .flatMap((evidence) => evidence.backendFacts.map((entry) => entry.text))
    : [];
  if (sceneFrameSnapshotFacts.length > 0) {
    return sceneFrameSnapshotFacts.join(" ");
  }

  const deviceSurfaceObservation = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("device_surface_observation")
  );
  if (deviceSurfaceObservation) {
    return deviceSurfaceObservation.backendFacts.map((entry) => entry.text).join(" ");
  }

  const localObservation = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("local_observation")
  );
  if (localObservation) {
    const narratableFacts = localObservation.backendFacts.filter((entry) =>
      !entry.text.startsWith("Checked current ")
    );
    return (narratableFacts.length > 0 ? narratableFacts : localObservation.backendFacts)
      .map((entry) => entry.text)
      .join(" ");
  }

  const observation = view.acceptedEvidence.find((evidence) =>
    evidence.authority === "scene_observation_receipt"
  );
  if (observation) {
    return observation.backendFacts.map((entry) => entry.text).join(" ");
  }

  const elapsed = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("elapsed_time")
  );
  if (elapsed) {
    return elapsed.backendFacts[0]?.text ?? elapsed.text;
  }

  const itemState = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("item_state")
  );
  const dialogue = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("dialogue_response")
  );
  if (itemState && dialogue) {
    const itemStateText = itemState.backendFacts.map((entry) => entry.text).join(" ");
    const quoteFact = dialogue.backendFacts.find((entry) =>
      entry.text.includes(" says: ") || entry.text.includes("dialogue response")
    );
    const dialogueText = quoteFact?.text ?? dialogue.text;
    return [itemStateText, dialogueText].filter((text) => normalizeText(text).length > 0).join(" ");
  }
  if (itemState) {
    return itemState.backendFacts.map((entry) => entry.text).join(" ");
  }

  const minorPoiHandle = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("minor_poi_handle")
  );
  if (minorPoiHandle) {
    return minorPoiHandle.backendFacts.map((entry) => entry.text).join(" ");
  }

  if (dialogue) {
    const quoteFact = dialogue.backendFacts.find((entry) =>
      entry.text.includes(" says: ") || entry.text.includes("dialogue response")
    );
    return quoteFact?.text ?? dialogue.text;
  }

  const supportActor = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("support_actor_materialization")
  );
  if (supportActor) {
    return supportActor.backendFacts.map((entry) => entry.text).join(" ");
  }

  const playerLocalCondition = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("player_local_condition")
  );
  if (playerLocalCondition) {
    return playerLocalCondition.backendFacts.map((entry) => entry.text).join(" ");
  }

  const sceneBeat = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("scene_beat")
  );
  if (sceneBeat) {
    return sceneBeat.backendFacts[0]?.text ?? sceneBeat.text;
  }

  const failed = view.stepAuditForGrounding[0];
  if (failed) {
    return language === "ru"
      ? `Это действие не подтверждено итоговыми данными: ${failed.publicReason}`
      : `This action is not confirmed by the settled evidence: ${failed.publicReason}`;
  }

  const firstFact = view.acceptedEvidence[0]?.backendFacts[0]?.text;
  if (firstFact) return firstFact;
  return language === "ru"
    ? "Ход зафиксирован, но итоговые данные не дают отдельного видимого факта для описания."
    : "The turn is settled, but there is no separate accepted visible fact to narrate.";
}

async function generateCleanNarrationCandidate(input: {
  provider: ProviderConfig;
  request: CleanNarrationCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanNarrationCandidateSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.2,
    maxOutputTokens: 900,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

export async function runCleanNarration(input: {
  narratorView: CleanNarratorView;
  provider: ProviderConfig;
  generateCandidate?: CleanNarrationCandidateGenerator;
}): Promise<CleanNarrationRunResult> {
  const promptInput = buildCleanNarratorPromptInput(input.narratorView);
  const system = buildCleanNarrationSystemPrompt();
  const prompt = buildCleanNarrationPrompt(promptInput);
  if (needsDeterministicAuthorityProjection(input.narratorView)) {
    return {
      ...assertCleanNarrationResult({
        version: "gameplay-runtime.clean-narration-result.v1",
        packetId: input.narratorView.packetId,
        turnId: input.narratorView.turnId,
        text: renderCleanAuthorityProjection(input.narratorView),
        source: "deterministic_authority_projection",
      }),
      validationIssues: [],
    };
  }
  const generateCandidate =
    input.generateCandidate
    ?? ((request: CleanNarrationCandidateRequest) => generateCleanNarrationCandidate({
      provider: input.provider,
      request,
    }));

  let candidate: unknown;
  try {
    candidate = await generateCandidate({ system, prompt, promptInput });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CleanNarrationGenerationError(
      `Clean Narration generation failed before validation: ${message.slice(0, 300)}`,
      error,
    );
  }

  const validation = validateCleanNarrationCandidate({
    view: input.narratorView,
    candidate,
  });
  if (validation.status === "accepted") {
    return {
      ...assertCleanNarrationResult({
        version: "gameplay-runtime.clean-narration-result.v1",
        packetId: input.narratorView.packetId,
        turnId: input.narratorView.turnId,
        text: validation.candidate.finalText,
        source: "model",
      }),
      validationIssues: [],
    };
  }

  throw new CleanNarrationValidationError(
    "Clean Narration validation failed.",
    validation.issues,
  );
}
