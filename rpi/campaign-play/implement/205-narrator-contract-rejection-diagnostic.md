# Task 205: Narrator contract-rejection diagnostic

## Contract

The Campaign Play Narrator now emits one private `narrator.contract_rejected` event for each failed Narrator invocation. The event is observability-only: it does not alter prompt/schema generation, acceptance, recovery feedback, retry eligibility, deadlines, persistence, mechanics, or the player surface.

The event carries only existing correlation identifiers (`narrationId`, `campaignId`, and `turnId` when the immutable packet parses), `phase` (`generation`, `evidence`, or `semantic`), the bounded `CampaignPlayNarratorError` code, a bounded safe-generation code when available, the existing recovery diagnostic or `null`, and the existing typed `failedChecks` in original order or `[]`. It never carries packet/proposal/candidate prose, provider data, rejected error text, stack/cause, prompt bytes, tool arguments, or arbitrary object keys.

Phase mapping is fixed: safe-generation failures are `generation`; post-generation model-evidence mismatches are `evidence`; compile/proposal/actor-grounding `CampaignPlayNarratorError` failures are `semantic`. The original error object, recovery feedback, specialized diagnostics, and caller behavior remain unchanged. Successful narration emits no event.

## Frozen boundary and impact

Entry and origin were `d0e53c0ab23af807a57815f9efe926ffa7d8bc69`. Frozen r152 remains immutable: action 1 had two provider-return-shaped Narrator attempts with durable `narration_invalid`, no accepted artifact/proper scene, and mechanics/visibility settled once; raw candidate data is unavailable.

An exact-entry GitNexus shadow at `R:\Temp\worldforge-task205-shadow` was analyzed before editing. The nested `createCampaignPlayNarrator.narrate` closure was LOW (no indexed callers due closure resolution). The enclosing `createCampaignPlayNarrator` owner was HIGH (24 impacted symbols, 5 direct callers, 4 Campaign Play processes, 2 modules: Campaign Play and Engine). Main authorized this enclosing-owner mapping because the implementation is confined to the private Narrator diagnostic wrapper and its tests; no other production owner is changed.

## Implementation

`narrate` is wrapped by a private diagnostic boundary that parses only the immutable packet for safe correlation identifiers, catches the existing `CampaignPlayNarratorError`, classifies its phase from the existing cause/model-evidence/recovery fields, and emits exactly one allowlisted event before rethrowing the same error. Existing packet-validation and actor-scope warnings remain in place and are not forwarded as new recovery instructions.

No prompt or visible copy changed; humanizer/deslop review is not applicable. The approved scope is diagnostic-only.

## Validation

Static evidence and the r153 built journey are appended below after execution. Generated r153 session/world evidence is intentionally uncommitted.

## Live r153 evidence

Pending: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r153`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`.

## Acceptance handoff

- Private event contract: focused Narrator tests plus the exact staged diff.
- Phase mapping and privacy: generation/evidence/semantic fixtures assert the allowlist and absence of raw content.
- Behavior preservation: existing recovery feedback, error identity, specialized logs, and retry/acceptance paths remain covered by focused runtime/application tests.
- Built journey: r153 setup, checkpoints, terminal defect or 60-action/reload evidence will be recorded here.
- Unavailable until live run: natural `narrator.contract_rejected` coverage, full 60 bindings, and same-page reload.
