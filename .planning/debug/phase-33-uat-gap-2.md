---
status: diagnosed
trigger: "Diagnose UAT Gap 2 for Phase 33."
created: 2026-04-01T23:40:07.5071748+03:00
updated: 2026-04-01T23:53:45.0000000+03:00
---

## Current Focus

hypothesis: confirmed — the routed creation flow forked the old wizard UI but bypassed its guarded transition logic and left readiness/persistence/progress concerns split across unrelated components
test: compare routed pages against `useNewCampaignWizard` orchestration, then trace sidebar/review/character/load-card behavior for missing readiness guards
expecting: routed pages will navigate directly instead of using wizard handlers; campaign routes will load on `campaignId` alone; shell/card UI will expose actions without campaign/world readiness checks
next_action: return diagnosis only; no fixes requested

## Symptoms

expected: Creating an original-world campaign through the redesigned creation flow should carry the user from concept to DNA to world generation and then into world review without broken states or dead buttons.
actual: World Review and Character are clickable before a world is chosen/generated; switching tabs wipes New Campaign inputs; clicking anywhere on saved campaign card loads it, not only Load button; Continue sends user to World DNA with no loader and 'DNA suggestions are not ready yet'; leaving and returning resets concept fields; bottom 'Creation Flow' CTA redundantly returns to new campaign; Generate New World seems to fire generate with no visible progress; further testing impossible because base workflow is broken.
errors: "DNA suggestions are not ready yet"
reproduction: Open redesigned campaign creation flow, move between creation tabs/routes, interact with saved campaign cards and continue/generate actions, then observe resets, premature nav enablement, and missing progress indicators.
started: Reported during Phase 33 browser E2E/UAT verification of redesigned creation flows.

## Eliminated

## Evidence

- timestamp: 2026-04-01T23:44:10.0000000+03:00
  checked: .planning/phases/33-browser-e2e-verification-for-redesigned-creation-flows/33-UAT.md
  found: Gap 2 is recorded as a blocker with the same symptom set the user reported, including premature World Review/Character access, concept resets, incorrect card click loading, missing DNA loader, and missing generation progress.
  implication: The investigation target is the redesigned original-world routed flow, not an isolated one-off interaction.

- timestamp: 2026-04-01T23:44:10.0000000+03:00
  checked: frontend/components/campaign-new/flow-provider.tsx
  found: `CampaignNewFlowProvider` creates wizard state from `useNewCampaignWizard(...)` inside a client component and exposes it only via React context; there is no localStorage/session persistence or URL/state serialization for concept/DNA inputs.
  implication: Any provider remount or route-tree unmount will reset the entire new-campaign flow state.

- timestamp: 2026-04-01T23:44:10.0000000+03:00
  checked: frontend/app/(non-game)/campaign/new/page.tsx and frontend/components/campaign-new/concept-workspace.tsx
  found: the concept page `onContinue` only does `router.push('/campaign/new/dna')`, while the concept CTA does not show loading and does not await any DNA suggestion request before navigation.
  implication: Users can be routed into the DNA page before `dnaState` exists, which matches landing on the DNA screen with no loader and the fallback message that suggestions are not ready.

- timestamp: 2026-04-01T23:44:10.0000000+03:00
  checked: frontend/components/campaign-new/dna-workspace.tsx
  found: the DNA page renders a loader only when `w.isSuggesting && !w.dnaState`; otherwise, with no `dnaState`, it renders the empty fallback text `DNA suggestions are not ready yet.`
  implication: If navigation occurs before `isSuggesting` is set or after suggestion work was never started, the user gets a dead-end message instead of guarded progression or visible progress.

- timestamp: 2026-04-01T23:53:45.0000000+03:00
  checked: frontend/components/title/use-new-campaign-wizard.ts, frontend/app/(non-game)/campaign/new/page.tsx, frontend/components/title/new-campaign-dialog.tsx
  found: the wizard already has the correct guarded DNA transition in `handleNextToDna()` (`setPhase({ kind: "suggesting-all" })`, `suggestSeeds(...)`, `setDnaState(...)`), and the modal dialog calls it; the routed concept page does not, and instead only does `router.push("/campaign/new/dna")`.
  implication: The routed rewrite skipped the wizard's orchestration layer, directly causing the "Continue -> DNA suggestions are not ready yet" path with no loader.

- timestamp: 2026-04-01T23:53:45.0000000+03:00
  checked: frontend/components/title/use-new-campaign-wizard.ts, frontend/components/campaign-new/concept-workspace.tsx, frontend/components/campaign-new/dna-workspace.tsx
  found: generation progress is tracked in the hook (`generationProgress`, `creatingCampaign`, `isGenerating`) but the routed concept and DNA workspaces never render that state; their primary buttons stay generic static CTAs.
  implication: Creating/generating a world from the routed flow can start backend work with no visible progress indicator, matching the dead-button/progress complaints.

- timestamp: 2026-04-01T23:53:45.0000000+03:00
  checked: frontend/components/title/use-new-campaign-wizard.ts, frontend/components/non-game-shell/app-sidebar.tsx, frontend/app/(non-game)/campaign/[id]/review/page.tsx, frontend/app/(non-game)/campaign/[id]/character/page.tsx, backend/src/routes/helpers.ts, backend/src/routes/campaigns.ts
  found: after create/generate, the wizard routes to `/campaign/${id}/review` on success or `/campaign/${id}/character` on generation failure; sidebar campaign links are derived from pathname alone; review/character pages only `loadCampaign(campaignId)` + `getWorldData(campaignId)`; backend route guards only ensure the campaign loads/activates, not that generation completed.
  implication: Downstream World Review/Character navigation becomes available for any loaded campaign, including empty or failed-generation campaigns, so users can reach broken states before a valid world exists.

- timestamp: 2026-04-01T23:53:45.0000000+03:00
  checked: frontend/components/title/load-campaign-dialog.tsx
  found: each saved campaign `<Card>` has `onClick={() => handleLoadCampaign(campaign.id)}`, while only the inner Load/Delete buttons call `event.stopPropagation()`.
  implication: Clicking anywhere on the card loads the campaign by design, not by accident in the button handler.

- timestamp: 2026-04-01T23:53:45.0000000+03:00
  checked: frontend/components/non-game-shell/app-shell.tsx
  found: the shell's default sticky action fallback always renders `Open Creation Flow` linking to `/campaign/new`, including on creation routes that do not supply custom `stickyActions`.
  implication: The bottom CTA redundantly routes back to new campaign and can bounce users out of their current step instead of advancing the active flow.

## Resolution

root_cause:
The routed Phase 33 campaign-creation rewrite reused the old `useNewCampaignWizard` state container but did not reuse its transition/guard UI contract. Concept/DNA pages, shell navigation, and saved-campaign cards each wire actions independently, so state remains ephemeral and route-scoped, DNA preloading is bypassed, downstream campaign routes are exposed without generation-readiness checks, and progress state exists only in the hook instead of the routed UI.
fix:
Not implemented; diagnose-only mode.
verification:
Static code tracing across routed creation pages, wizard hook, shell/sidebar navigation, saved-campaign dialog, and backend campaign/worldgen guards aligns each reported UAT symptom to a concrete handler or missing guard.
files_changed: []
