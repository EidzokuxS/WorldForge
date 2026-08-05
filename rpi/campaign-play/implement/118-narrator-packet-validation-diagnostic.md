# Narrator packet validation diagnostic

Base commit: `79f4e60d16d0b927c4234af3556629e03b264b88` on `feat/revamp`.

The first compound guard in `assertProposalForPacket` now computes one ordered `failedChecks` collection. When one or more of its eleven existing predicates fail, it emits exactly one `narrator_packet_validation_mismatch` warning with only `campaignId`, `turnId`, stable check names, and scalar/index/enum coordinates, then throws the unchanged `CampaignPlayNarratorError("narration_invalid", null)`. No narration id, operation id, attempt id, packet/proposal, model/provider output, prompt, labels, actor/location names, beat text, or action detail is recorded. Valid proposals remain silent; visible-actor diagnostics are unchanged.

The focused narrator test covers simultaneous count, duplicate, range, required-reply, observation coverage, opening/consequence, and detail-nullability failures, verifies all eleven check names and coordinates, asserts prose/raw-proposal exclusion, and confirms a valid proposal emits no mismatch warning. GitNexus upstream impact for `assertProposalForPacket` was re-run and source-confirmed at MEDIUM (41 impacted symbols, one direct caller, one narration flow); `compile` and all callers remain untouched.
