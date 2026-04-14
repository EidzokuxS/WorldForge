"use client";

import type { ReactNode } from "react";
import type { CharacterDraft, CharacterRecord } from "@worldforge/shared";
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

function hasItems<T>(items: T[] | null | undefined): items is T[] {
  return Array.isArray(items) && items.length > 0;
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function Section(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4 ${props.className ?? ""}`.trim()}>
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

function SourceList(props: {
  title: string;
  items: Array<{ kind: string; label: string; excerpt: string }>;
}) {
  if (!hasItems(props.items)) return null;

  return (
    <Section title={props.title}>
      <div className="space-y-3">
        {props.items.map((item, index) => (
          <div
            key={`${item.kind}:${item.label}:${index}`}
            className="space-y-1 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-white/15 bg-transparent text-[10px] uppercase tracking-[0.12em] text-zinc-300"
              >
                {item.kind}
              </Badge>
              <span className="text-sm font-medium text-zinc-100">{item.label}</span>
            </div>
            <p className="text-sm leading-6 text-zinc-300">{item.excerpt}</p>
          </div>
        ))}
      </div>
    </Section>
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
  const grounding = record?.grounding ?? draft?.grounding;
  const sourceBundle = record?.sourceBundle ?? draft?.sourceBundle;
  const continuity = record?.continuity ?? draft?.continuity;

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

  const overviewBadges = dedupeStrings([
    identity.canonicalStatus,
    `${identity.tier} ${identity.role}`,
    provenance.sourceKind,
    socialContext.originMode ?? "",
    continuity?.identityInertia ? `${continuity.identityInertia} continuity` : "",
  ]);

  const skillLabels = capabilities.skills.map((skill) =>
    skill.tier ? `${skill.tier} ${skill.name}` : skill.name,
  );
  const displaySocialRoles = dedupeStrings(
    (identity.baseFacts?.socialRole ?? []).filter((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized !== "npc" && normalized !== "player";
    }),
  );
  const selfImage = identity.behavioralCore?.selfImage?.trim() ?? "";
  const personaSummary = profile.personaSummary?.trim() ?? "";
  const hasDistinctSelfImage =
    selfImage.length > 0 && selfImage.toLowerCase() !== personaSummary.toLowerCase();

  const hasGrounding =
    hasText(grounding?.summary) ||
    hasItems(grounding?.facts) ||
    hasItems(grounding?.abilities) ||
    hasItems(grounding?.signatureMoves) ||
    hasItems(grounding?.strongPoints) ||
    hasItems(grounding?.vulnerabilities) ||
    hasItems(grounding?.uncertaintyNotes);

  const hasPowerProfile =
    hasText(grounding?.powerProfile?.attack) ||
    hasText(grounding?.powerProfile?.speed) ||
    hasText(grounding?.powerProfile?.durability) ||
    hasText(grounding?.powerProfile?.range) ||
    hasItems(grounding?.powerProfile?.strengths) ||
    hasItems(grounding?.powerProfile?.constraints) ||
    hasItems(grounding?.powerProfile?.vulnerabilities) ||
    hasItems(grounding?.powerProfile?.uncertaintyNotes);

  const hasCapabilities =
    hasItems(capabilities.traits) ||
    hasItems(skillLabels) ||
    hasItems(capabilities.specialties) ||
    hasItems(capabilities.flaws) ||
    hasText(capabilities.wealthTier);

  const hasContinuity =
    hasText(continuity?.identityInertia) ||
    hasItems(continuity?.protectedCore) ||
    hasItems(continuity?.mutableSurface) ||
    hasItems(continuity?.changePressureNotes);

  const hasSources =
    hasItems(sourceBundle?.canonSources) ||
    hasItems(sourceBundle?.secondarySources) ||
    hasText(sourceBundle?.synthesis.owner) ||
    hasText(sourceBundle?.synthesis.strategy) ||
    hasItems(sourceBundle?.synthesis.notes);

  const hasIdentitySection =
    hasDistinctSelfImage ||
    hasItems(displaySocialRoles) ||
    hasItems(identity.behavioralCore?.motives) ||
    hasItems(identity.behavioralCore?.pressureResponses) ||
    hasItems(identity.behavioralCore?.taboos) ||
    hasItems(identity.behavioralCore?.attachments) ||
    hasItems(identity.baseFacts?.hardConstraints);

  const hasDynamicsSection =
    hasItems(identity.liveDynamics?.activeGoals) ||
    hasItems(motivations.shortTermGoals) ||
    hasItems(motivations.longTermGoals) ||
    hasItems(identity.liveDynamics?.beliefDrift) ||
    hasItems(motivations.beliefs) ||
    hasItems(identity.liveDynamics?.currentStrains) ||
    hasItems(motivations.frictions) ||
    hasItems(identity.liveDynamics?.earnedChanges);

  const runtimeMeta = [
    { label: "Activity state", value: state.activityState },
    ...(hasText(provenance.sourceKind) ? [{ label: "Source kind", value: provenance.sourceKind }] : []),
    ...(hasText(provenance.importMode) ? [{ label: "Import mode", value: provenance.importMode }] : []),
    ...(hasText(provenance.templateId) ? [{ label: "Template", value: provenance.templateId }] : []),
    ...(hasText(startConditions.startLocationId) ? [{ label: "Start location", value: startConditions.startLocationId }] : []),
    ...(hasText(socialContext.currentLocationName) ? [{ label: "Current location", value: socialContext.currentLocationName }] : []),
    ...(hasText(socialContext.factionName) && socialContext.factionName !== "None"
      ? [{ label: "Faction", value: socialContext.factionName }]
      : []),
  ];

  const hasRuntimeSection =
    runtimeMeta.length > 0 ||
    hasItems(state.conditions) ||
    hasItems(state.statusFlags) ||
    hasItems(loadout.inventorySeed) ||
    hasItems(loadout.equippedItemRefs) ||
    hasItems(loadout.signatureItems) ||
    hasText(startConditions.immediateSituation);

  const rawPayload = JSON.stringify(
    {
      draft: draft ?? null,
      characterRecord: record,
    },
    null,
    2,
  );

  return (
    <details className="mt-4">
      <summary className="flex cursor-pointer list-none justify-end">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300">
          Advanced
        </span>
      </summary>

      <div className="mt-3 space-y-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4">
        <Section title="Overview">
          <div className="flex flex-wrap gap-2">
            {overviewBadges.map((badge) => (
              <Badge key={badge} variant="outline" className="border-white/15 bg-transparent text-zinc-200">
                {badge}
              </Badge>
            ))}
          </div>

          <MetaGrid
            items={[
              { label: "Display name", value: identity.displayName },
              { label: "Current location", value: socialContext.currentLocationName || "Unknown" },
              ...(hasText(socialContext.factionName) && socialContext.factionName !== "None"
                ? [{ label: "Faction", value: socialContext.factionName }]
                : []),
            ]}
          />

          {hasText(profile.personaSummary) ? <TextBlock label="Persona" value={profile.personaSummary} /> : null}
          {hasText(identity.baseFacts?.biography) ? (
            <TextBlock label="Biography" value={identity.baseFacts.biography} />
          ) : null}
        </Section>

        {hasIdentitySection ? (
          <Section title="Identity Core">
            {hasDistinctSelfImage ? (
              <TextBlock label="Self image" value={selfImage} />
            ) : null}

            <div className="space-y-4">
              <ListBlock label="Social roles" items={displaySocialRoles} />
              <ListBlock label="Motives" items={identity.behavioralCore?.motives ?? []} />
              <ListBlock label="Pressure responses" items={identity.behavioralCore?.pressureResponses ?? []} />
              <ListBlock label="Taboos" items={identity.behavioralCore?.taboos ?? []} />
              <ListBlock label="Attachments" items={identity.behavioralCore?.attachments ?? []} />
              <ListBlock label="Hard constraints" items={identity.baseFacts?.hardConstraints ?? []} />
            </div>
          </Section>
        ) : null}

        {hasDynamicsSection ? (
          <Section title="Live Dynamics">
            <div className="space-y-4">
              <ListBlock label="Active goals" items={identity.liveDynamics?.activeGoals ?? motivations.shortTermGoals ?? []} />
              <ListBlock label="Long-term goals" items={motivations.longTermGoals ?? []} />
              <ListBlock label="Belief drift" items={identity.liveDynamics?.beliefDrift ?? motivations.beliefs ?? []} />
              <ListBlock label="Current strains" items={identity.liveDynamics?.currentStrains ?? motivations.frictions ?? []} />
              <ListBlock label="Earned changes" items={identity.liveDynamics?.earnedChanges ?? []} />
            </div>
          </Section>
        ) : null}

        {hasGrounding ? (
          <Section title="Grounding">
            {hasText(grounding?.summary) ? <TextBlock label="Summary" value={grounding.summary} /> : null}
            <div className="space-y-4">
              <ListBlock label="Facts" items={grounding?.facts ?? []} />
              <ListBlock label="Abilities" items={grounding?.abilities ?? []} />
              <ListBlock label="Signature moves" items={grounding?.signatureMoves ?? []} />
              <ListBlock label="Strong points" items={grounding?.strongPoints ?? []} />
              <ListBlock label="Vulnerabilities" items={grounding?.vulnerabilities ?? []} />
              <ListBlock label="Uncertainty" items={grounding?.uncertaintyNotes ?? []} />
            </div>
          </Section>
        ) : null}

        {hasPowerProfile ? (
          <Section title="Power Profile">
            <MetaGrid
              items={[
                ...(hasText(grounding?.powerProfile?.attack)
                  ? [{ label: "Attack", value: grounding!.powerProfile!.attack }]
                  : []),
                ...(hasText(grounding?.powerProfile?.speed)
                  ? [{ label: "Speed", value: grounding!.powerProfile!.speed }]
                  : []),
                ...(hasText(grounding?.powerProfile?.durability)
                  ? [{ label: "Durability", value: grounding!.powerProfile!.durability }]
                  : []),
                ...(hasText(grounding?.powerProfile?.range)
                  ? [{ label: "Range", value: grounding!.powerProfile!.range }]
                  : []),
              ]}
            />
            <div className="space-y-4">
              <ListBlock label="Strengths" items={grounding?.powerProfile?.strengths ?? []} />
              <ListBlock label="Constraints" items={grounding?.powerProfile?.constraints ?? []} />
              <ListBlock label="Vulnerabilities" items={grounding?.powerProfile?.vulnerabilities ?? []} />
              <ListBlock label="Uncertainty" items={grounding?.powerProfile?.uncertaintyNotes ?? []} />
            </div>
          </Section>
        ) : null}

        {hasCapabilities ? (
          <Section title="Capabilities">
            <div className="space-y-4">
              <ListBlock label="Traits" items={capabilities.traits} />
              <ListBlock label="Skills" items={skillLabels} />
              <ListBlock label="Specialties" items={capabilities.specialties} />
              <ListBlock label="Flaws" items={capabilities.flaws} />
              {hasText(capabilities.wealthTier) ? (
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Wealth
                  </div>
                  <div className="text-sm leading-6 text-zinc-100">{capabilities.wealthTier}</div>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {hasContinuity ? (
          <Section title="Continuity">
            <MetaGrid
              items={
                continuity?.identityInertia
                  ? [{ label: "Identity inertia", value: formatLabel(continuity.identityInertia) }]
                  : []
              }
            />
            <div className="space-y-4">
              <ListBlock label="Protected core" items={continuity?.protectedCore ?? []} />
              <ListBlock label="Mutable surface" items={continuity?.mutableSurface ?? []} />
              <ListBlock label="Change pressure" items={continuity?.changePressureNotes ?? []} />
            </div>
          </Section>
        ) : null}

        {hasRuntimeSection ? (
          <Section title="Runtime & Provenance">
            <MetaGrid items={runtimeMeta} />

            <div className="space-y-4">
              <ListBlock label="Conditions" items={state.conditions} />
              <ListBlock label="Status flags" items={state.statusFlags} />
              <ListBlock label="Inventory seed" items={loadout.inventorySeed} />
              <ListBlock label="Equipped refs" items={loadout.equippedItemRefs} />
              <ListBlock label="Signature items" items={loadout.signatureItems} />
            </div>

            {hasText(startConditions.immediateSituation) ? (
              <TextBlock label="Immediate situation" value={startConditions.immediateSituation} />
            ) : null}
          </Section>
        ) : null}

        {hasSources ? (
          <>
            <div className="space-y-4">
              <SourceList title="Canon Sources" items={sourceBundle?.canonSources ?? []} />
              <SourceList title="Secondary Sources" items={sourceBundle?.secondarySources ?? []} />
            </div>

            {(hasText(sourceBundle?.synthesis.owner) ||
              hasText(sourceBundle?.synthesis.strategy) ||
              hasItems(sourceBundle?.synthesis.notes)) ? (
              <Section title="Synthesis">
                <MetaGrid
                  items={[
                    ...(hasText(sourceBundle?.synthesis.owner)
                      ? [{ label: "Owner", value: sourceBundle!.synthesis.owner }]
                      : []),
                    ...(hasText(sourceBundle?.synthesis.strategy)
                      ? [{ label: "Strategy", value: sourceBundle!.synthesis.strategy }]
                      : []),
                  ]}
                />
                <ListBlock label="Notes" items={sourceBundle?.synthesis.notes ?? []} />
              </Section>
            ) : null}
          </>
        ) : null}

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
