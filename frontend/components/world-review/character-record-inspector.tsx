"use client";

import type { ReactNode } from "react";
import type {
  CharacterDraft,
  CharacterRecord,
} from "@worldforge/shared";

import { Badge } from "@/components/ui/badge";

interface CharacterRecordInspectorProps {
  draft?: CharacterDraft | null;
  characterRecord?: CharacterRecord | null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Map(
      values
        .map((value) => value?.trim() ?? "")
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value] as const),
    ).values(),
  );
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(
  items: readonly (string | null | undefined)[] | null | undefined,
): boolean {
  if (!items || items.length === 0) return false;
  return items.some((item) => typeof item === "string" && item.trim().length > 0);
}

function hasAnyComplementSection(d: CharacterDraft | CharacterRecord): boolean {
  return (
    hasText(d.identity?.baseFacts?.biography) ||
    hasText(d.identity?.behavioralCore?.selfImage) ||
    hasItems(d.identity?.baseFacts?.socialRole) ||
    hasItems(d.identity?.baseFacts?.hardConstraints) ||
    hasItems(d.socialContext?.socialStatus) ||
    (Array.isArray(d.socialContext?.relationshipRefs) &&
      d.socialContext.relationshipRefs.length > 0) ||
    hasText(d.profile?.species) ||
    hasText(d.profile?.gender) ||
    hasText(d.profile?.ageText) ||
    hasText(d.profile?.appearance) ||
    hasText(d.profile?.backgroundSummary) ||
    hasItems(d.identity?.liveDynamics?.beliefDrift) ||
    hasItems(d.identity?.liveDynamics?.currentStrains) ||
    hasItems(d.identity?.liveDynamics?.earnedChanges) ||
    hasItems(d.motivations?.beliefs) ||
    hasItems(d.motivations?.drives) ||
    hasItems(d.motivations?.frictions) ||
    (Array.isArray(d.capabilities?.skills) && d.capabilities.skills.length > 0) ||
    hasItems(d.capabilities?.specialties) ||
    hasText(d.capabilities?.wealthTier) ||
    hasItems(d.state?.conditions) ||
    hasItems(d.state?.statusFlags) ||
    hasItems(d.loadout?.inventorySeed) ||
    hasItems(d.loadout?.equippedItemRefs) ||
    hasItems(d.loadout?.signatureItems) ||
    hasText(d.loadout?.currencyNotes) ||
    hasText(d.startConditions?.sourcePrompt) ||
    hasText(d.startConditions?.arrivalMode) ||
    hasText(d.startConditions?.startLocationId) ||
    hasText(d.startConditions?.immediateSituation) ||
    hasItems(d.startConditions?.entryPressure) ||
    hasItems(d.startConditions?.companions) ||
    hasText(d.startConditions?.startingVisibility) ||
    hasText(d.startConditions?.resolvedNarrative) ||
    Boolean(d.provenance?.importMode) ||
    hasText(d.provenance?.worldgenOrigin)
  );
}

function relationshipLabel(
  ref: CharacterDraft["socialContext"]["relationshipRefs"][number],
): string {
  const entityName = ref.entityName?.trim() ?? "";
  const entityId = ref.entityId?.trim() ?? "";
  const relationType = ref.type?.trim() ?? "";
  const reason = ref.reason?.trim() ?? "";

  if (entityName && relationType) {
    return `${entityName} (${relationType})`;
  }

  return entityName || entityId || relationType || reason;
}

function Section(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section
      className={`space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4 ${props.className ?? ""}`.trim()}
    >
      <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {props.title}
      </h4>
      {props.children}
    </section>
  );
}

function MetaGrid(props: { items: Array<{ label: string; value: ReactNode }> }) {
  if (props.items.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {props.items.map((item) => (
        <div key={item.label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            {item.label}
          </div>
          <div className="mt-2 text-sm leading-6 text-zinc-100">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function TextBlock(props: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
        {props.label}
      </div>
      <p className="max-w-none text-sm leading-7 text-zinc-100">{props.value}</p>
    </div>
  );
}

function ListBlock(props: { label: string; items: string[] }) {
  if (!hasItems(props.items)) return null;

  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
        {props.label}
      </div>
      <ul className="space-y-2">
        {props.items.map((item) => (
          <li key={item} className="text-sm leading-6 text-zinc-200">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CharacterRecordInspector({
  draft,
  characterRecord,
}: CharacterRecordInspectorProps) {
  const record = characterRecord ?? null;
  const identity = record?.identity ?? draft?.identity;
  const profile = record?.profile ?? draft?.profile;
  const socialContext = record?.socialContext ?? draft?.socialContext;
  const motivations = record?.motivations ?? draft?.motivations;
  const capabilities = record?.capabilities ?? draft?.capabilities;
  const state = record?.state ?? draft?.state;
  const loadout = record?.loadout ?? draft?.loadout;
  const startConditions = record?.startConditions ?? draft?.startConditions;
  const provenance = record?.provenance ?? draft?.provenance;

  if (
    !identity ||
    !profile ||
    !socialContext ||
    !motivations ||
    !capabilities ||
    !state ||
    !loadout ||
    !startConditions ||
    !provenance
  ) {
    return null;
  }

  const complementSource = draft ?? (record as CharacterDraft | null);
  const anyComplement = complementSource
    ? hasAnyComplementSection(complementSource)
    : false;

  const overviewBadges = dedupeStrings([
    identity.canonicalStatus,
    provenance.sourceKind,
    provenance.importMode,
    provenance.worldgenOrigin,
  ]);
  const hasOverviewSection =
    hasText(identity.baseFacts?.biography) || overviewBadges.length > 0;

  const skillLabels = capabilities.skills.map((skill) =>
    skill.tier ? `${skill.tier} ${skill.name}` : skill.name,
  );
  const displaySocialRoles = dedupeStrings(
    (identity.baseFacts?.socialRole ?? []).filter((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized !== "npc" && normalized !== "player";
    }),
  );
  const relationshipLabels = dedupeStrings(
    (socialContext.relationshipRefs ?? []).map(relationshipLabel),
  );
  const selfImage = identity.behavioralCore?.selfImage?.trim() ?? "";
  const personaSummary = profile.personaSummary?.trim() ?? "";
  const hasDistinctSelfImage =
    selfImage.length > 0 &&
    selfImage.toLowerCase() !== personaSummary.toLowerCase();

  const hasIdentitySection =
    hasDistinctSelfImage ||
    hasItems(displaySocialRoles) ||
    hasItems(identity.baseFacts?.hardConstraints) ||
    hasItems(socialContext.socialStatus) ||
    relationshipLabels.length > 0;

  const profileMeta = [
    ...(hasText(profile.species)
      ? [{ label: "Species", value: profile.species }]
      : []),
    ...(hasText(profile.gender)
      ? [{ label: "Gender", value: profile.gender }]
      : []),
    ...(hasText(profile.ageText)
      ? [{ label: "Age", value: profile.ageText }]
      : []),
  ];
  const hasProfileSection =
    profileMeta.length > 0 ||
    hasText(profile.appearance) ||
    hasText(profile.backgroundSummary);

  const hasDynamicsSection =
    hasItems(identity.liveDynamics?.beliefDrift) ||
    hasItems(identity.liveDynamics?.currentStrains) ||
    hasItems(identity.liveDynamics?.earnedChanges) ||
    hasItems(motivations.beliefs) ||
    hasItems(motivations.drives) ||
    hasItems(motivations.frictions);

  const hasCapabilities =
    hasItems(skillLabels) ||
    hasItems(capabilities.specialties) ||
    hasText(capabilities.wealthTier);

  const runtimeMeta = [
    { label: "HP", value: String(state.hp) },
    ...(hasText(state.activityState)
      ? [{ label: "Activity state", value: state.activityState }]
      : []),
  ];
  const hasRuntimeSection =
    hasItems(state.conditions) || hasItems(state.statusFlags);

  const hasLoadoutSection =
    hasItems(loadout.inventorySeed) ||
    hasItems(loadout.equippedItemRefs) ||
    hasItems(loadout.signatureItems) ||
    hasText(loadout.currencyNotes);

  const startingMeta = [
    ...(hasText(startConditions.arrivalMode)
      ? [{ label: "Arrival mode", value: startConditions.arrivalMode }]
      : []),
    ...(hasText(startConditions.startLocationId)
      ? [{ label: "Start location", value: startConditions.startLocationId }]
      : []),
    ...(hasText(startConditions.startingVisibility)
      ? [{ label: "Starting visibility", value: startConditions.startingVisibility }]
      : []),
  ];
  const hasStartingConditionsSection =
    startingMeta.length > 0 ||
    hasText(startConditions.sourcePrompt) ||
    hasText(startConditions.immediateSituation) ||
    hasItems(startConditions.entryPressure) ||
    hasItems(startConditions.companions) ||
    hasText(startConditions.resolvedNarrative);

  const rawPayload = JSON.stringify(
    {
      draft: draft ?? null,
      characterRecord: record,
    },
    null,
    2,
  );

  // Phase 63: section count reduced 10 -> 9 (Provenance removed from Advanced).
  // See .planning/phases/63-personality-interiority-model/63-REVIEWS.md and P63-R5.
  // Supersedes the Phase 62 10-section lock for this inspector contract.
  return (
    <details className="mt-4">
      <summary className="flex cursor-pointer list-none justify-end">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300">
          Advanced
        </span>
      </summary>

      <div className="mt-3 space-y-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4">
        {anyComplement ? (
          <>
            {hasOverviewSection ? (
              <Section title="Overview">
                {overviewBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {overviewBadges.map((badge) => (
                      <Badge
                        key={badge}
                        variant="outline"
                        className="border-white/15 bg-transparent text-zinc-200"
                      >
                        {badge}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {hasText(identity.baseFacts?.biography) ? (
                  <TextBlock
                    label="Biography"
                    value={identity.baseFacts.biography}
                  />
                ) : null}
              </Section>
            ) : null}

            {hasIdentitySection ? (
              <Section title="Identity Core">
                {hasDistinctSelfImage ? (
                  <TextBlock label="Self image" value={selfImage} />
                ) : null}

                <div className="space-y-4">
                  <ListBlock label="Social roles" items={displaySocialRoles} />
                  <ListBlock
                    label="Hard constraints"
                    items={identity.baseFacts?.hardConstraints ?? []}
                  />
                  {hasItems(socialContext.socialStatus) ? (
                    <ListBlock
                      label="Social status"
                      items={socialContext.socialStatus ?? []}
                    />
                  ) : null}
                  {relationshipLabels.length > 0 ? (
                    <ListBlock
                      label="Relationships"
                      items={relationshipLabels}
                    />
                  ) : null}
                </div>
              </Section>
            ) : null}

            {hasProfileSection ? (
              <Section title="Profile">
                <MetaGrid items={profileMeta} />
                {hasText(profile.appearance) ? (
                  <TextBlock label="Appearance" value={profile.appearance} />
                ) : null}
                {hasText(profile.backgroundSummary) ? (
                  <TextBlock
                    label="Background summary"
                    value={profile.backgroundSummary}
                  />
                ) : null}
              </Section>
            ) : null}

            {hasDynamicsSection ? (
              <Section title="Live Dynamics">
                <div className="space-y-4">
                  <ListBlock
                    label="Belief drift"
                    items={identity.liveDynamics?.beliefDrift ?? []}
                  />
                  <ListBlock
                    label="Current strains"
                    items={identity.liveDynamics?.currentStrains ?? []}
                  />
                  <ListBlock
                    label="Earned changes"
                    items={identity.liveDynamics?.earnedChanges ?? []}
                  />
                  <ListBlock label="Beliefs" items={motivations.beliefs ?? []} />
                  <ListBlock label="Drives" items={motivations.drives ?? []} />
                  <ListBlock
                    label="Frictions"
                    items={motivations.frictions ?? []}
                  />
                </div>
              </Section>
            ) : null}

            {hasCapabilities ? (
              <Section title="Capabilities">
                <div className="space-y-4">
                  <ListBlock label="Skills" items={skillLabels} />
                  <ListBlock
                    label="Specialties"
                    items={capabilities.specialties}
                  />
                  {hasText(capabilities.wealthTier) ? (
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                        Wealth
                      </div>
                      <div className="text-sm leading-6 text-zinc-100">
                        {capabilities.wealthTier}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Section>
            ) : null}

            {hasRuntimeSection ? (
              <Section title="Runtime & State">
                <MetaGrid items={runtimeMeta} />

                <div className="space-y-4">
                  <ListBlock label="Conditions" items={state.conditions} />
                  <ListBlock label="Status flags" items={state.statusFlags} />
                </div>
              </Section>
            ) : null}

            {hasLoadoutSection ? (
              <Section title="Loadout">
                <div className="space-y-4">
                  <ListBlock label="Inventory seed" items={loadout.inventorySeed} />
                  <ListBlock
                    label="Equipped refs"
                    items={loadout.equippedItemRefs}
                  />
                  <ListBlock
                    label="Signature items"
                    items={loadout.signatureItems}
                  />
                  {hasText(loadout.currencyNotes) ? (
                    <TextBlock
                      label="Currency notes"
                      value={loadout.currencyNotes}
                    />
                  ) : null}
                </div>
              </Section>
            ) : null}

            {hasStartingConditionsSection ? (
              <Section title="Starting Conditions">
                <MetaGrid items={startingMeta} />
                {hasText(startConditions.sourcePrompt) ? (
                  <TextBlock
                    label="Source prompt"
                    value={startConditions.sourcePrompt}
                  />
                ) : null}
                {hasText(startConditions.immediateSituation) ? (
                  <TextBlock
                    label="Immediate situation"
                    value={startConditions.immediateSituation}
                  />
                ) : null}
                <ListBlock
                  label="Entry pressure"
                  items={startConditions.entryPressure ?? []}
                />
                <ListBlock
                  label="Companions"
                  items={startConditions.companions ?? []}
                />
                {hasText(startConditions.resolvedNarrative) ? (
                  <TextBlock
                    label="Resolved narrative"
                    value={startConditions.resolvedNarrative}
                  />
                ) : null}
              </Section>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-zinc-500">No additional data</p>
        )}

        <details className="rounded-lg border border-white/[0.06] bg-black/20">
          <summary className="cursor-pointer px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Raw JSON
          </summary>
          <pre className="overflow-x-auto border-t border-white/[0.06] px-4 py-4 text-xs leading-6 text-zinc-300">
            {rawPayload}
          </pre>
        </details>
      </div>
    </details>
  );
}
