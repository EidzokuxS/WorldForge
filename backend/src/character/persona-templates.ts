import type {
  CharacterDraft,
  CharacterDraftPatch,
  PersonaTemplate,
  PersonaTemplateSummary,
} from "@worldforge/shared";

function mergeDefined<T extends object>(
  base: T,
  patch?: Partial<T>,
): T {
  if (!patch) {
    return { ...base };
  }

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  };
}

function mergeIdentity(
  base: CharacterDraft["identity"],
  patch?: CharacterDraftPatch["identity"],
): CharacterDraft["identity"] {
  if (!patch) {
    return { ...base };
  }

  const {
    baseFacts,
    behavioralCore,
    liveDynamics,
    ...identityPatch
  } = patch;

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(identityPatch).filter(([, value]) => value !== undefined),
    ),
    baseFacts: mergeDefined(base.baseFacts ?? {
      biography: "",
      socialRole: [],
      hardConstraints: [],
    }, baseFacts),
    behavioralCore: mergeDefined(base.behavioralCore ?? {
      motives: [],
      pressureResponses: [],
      taboos: [],
      attachments: [],
      selfImage: "",
    }, behavioralCore),
    liveDynamics: mergeDefined(base.liveDynamics ?? {
      activeGoals: [],
      beliefDrift: [],
      currentStrains: [],
      earnedChanges: [],
    }, liveDynamics),
  };
}

function mergeSourceBundle(
  base: CharacterDraft["sourceBundle"],
  patch?: CharacterDraftPatch["sourceBundle"],
): CharacterDraft["sourceBundle"] {
  if (!base && !patch) {
    return undefined;
  }

  return {
    canonSources: patch?.canonSources ?? base?.canonSources ?? [],
    secondarySources: patch?.secondarySources ?? base?.secondarySources ?? [],
    synthesis: mergeDefined(base?.synthesis ?? {
      owner: "WorldForge",
      strategy: "",
      notes: [],
    }, patch?.synthesis),
  };
}

function mergeContinuity(
  base: CharacterDraft["continuity"],
  patch?: CharacterDraftPatch["continuity"],
): CharacterDraft["continuity"] {
  if (!base && !patch) {
    return undefined;
  }

  return mergeDefined(base ?? {
    identityInertia: "flexible",
    protectedCore: [],
    mutableSurface: [],
    changePressureNotes: [],
  }, patch);
}

export function applyPersonaTemplatePatch(
  draft: CharacterDraft,
  patch: CharacterDraftPatch,
  templateId: string | null = null,
): CharacterDraft {
  return {
    ...draft,
    identity: mergeIdentity(draft.identity, patch.identity),
    profile: mergeDefined(draft.profile, patch.profile),
    socialContext: mergeDefined(draft.socialContext, patch.socialContext),
    motivations: mergeDefined(draft.motivations, patch.motivations),
    capabilities: mergeDefined(draft.capabilities, patch.capabilities),
    state: mergeDefined(draft.state, patch.state),
    loadout: mergeDefined(draft.loadout, patch.loadout),
    startConditions: mergeDefined(draft.startConditions, patch.startConditions),
    sourceBundle: mergeSourceBundle(draft.sourceBundle, patch.sourceBundle),
    continuity: mergeContinuity(draft.continuity, patch.continuity),
    provenance: {
      ...draft.provenance,
      ...(patch.provenance ?? {}),
      templateId:
        templateId ?? patch.provenance?.templateId ?? draft.provenance.templateId,
    },
  };
}

export function applyPersonaTemplate(
  draft: CharacterDraft,
  template: PersonaTemplate,
): CharacterDraft {
  return applyPersonaTemplatePatch(draft, template.patch, template.id);
}

export function createPersonaTemplateSummary(
  template: PersonaTemplate,
): PersonaTemplateSummary {
  return {
    id: template.id,
    campaignId: template.campaignId,
    name: template.name,
    description: template.description,
    roleScope: template.roleScope,
    tags: [...template.tags],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
