# Task 18 game-design review

Review mode: design critique. Reviewed artifact: `18-pristine-acceptance.md` and Task 18 in `PLAN.md`, revised 2026-07-14. Owner: Campaign Play. Intended experience: a non-central player forms and pursues their own intention while a legible world continues independently. Decision: whether the human long-play protocol is fit to begin.

## Contract reconstructed

The game may deny an input and still treat the player fairly. The player needs to understand the immediate situation, act for a self-chosen reason, see an attributable consequence, update a causal model, and find a meaningful next decision while other people continue to act beyond the player's control. Sixty completed actions set the observation horizon; player behavior decides whether the lane succeeds.

The protocol owns human formative evidence through the rendered product. It does not establish population prevalence, broad accessibility, commercial appeal, or final release readiness. Mechanical receipts, protected-state audits, and replay hashes corroborate the experience but cannot substitute for it.

## Evidence and assumptions

- Verified: the five-action first playable completed through the rendered UI with preserved intent, sourced consequences, off-screen agency, clean reload, and readable prose.
- Verified: accepted clean-world artifacts exist for premise-only and DNA-plus-research intake, and the project has a reusable-world snapshot/materialization tool.
- Inference: those accepted worlds remain eligible after current migrations. This must be proved before turn zero without changing their accepted world content.
- Unknown by design: whether interest, comprehension, continuity, and agency survive sixty actions. Task 18 exists to collect that evidence.
- Preference: three distinct starting stances improve discovery, but diversity alone is not a promotion threshold.

## Findings by severity

### GD18-01: Protocol pressure can replace player motivation

- Severity: P1 major. Likelihood: high. Urgency: before play. Confidence: high.
- Location: action selection and promotion observations.
- Evidence: the previous fixed action-type and secrecy quotas rewarded coverage rather than intention; the operator also knows the acceptance thresholds.
- Consequence: a mechanically varied run could pass while no person would naturally play that way.
- Required change: choose only from visible context and signed character intent; observe natural action mix; move boundary probes to a disposable diagnostic clone; never manufacture a missing threshold.
- Owner: main playtest operator. Exit: every action has a pre-input intention and no action cites test coverage as its reason.
- Gate impact: experience/behavior fit.

### GD18-02: Long model calls create operator-fatigue bias

- Severity: P1 major. Likelihood: high. Urgency: before play. Confidence: high.
- Location: sixty-action lane procedure.
- Evidence: the declared thinking model can take several minutes per turn, making a lane a multi-session experience.
- Consequence: skimming, impatient inputs, and memory substitution can be misreported as game defects or hidden as false engagement.
- Required change: cap sittings at ten completed actions, stop earlier on fatigue signals, and record unaided recall plus product-assisted reorientation on return.
- Owner: main playtest operator. Exit: each bundle identifies sitting boundaries and return-state notes.
- Gate impact: evidence quality and operations readiness.

### GD18-03: Character intent is underconstrained

- Severity: P2 moderate. Likelihood: medium. Urgency: before opening. Confidence: high.
- Location: lane setup.
- Evidence: labels such as “curious outsider” permit post-hoc justification of almost any diagnostic action.
- Consequence: apparent agency can be produced by an infinitely flexible tester rather than supported role-play.
- Required change: sign identity, presence, capability, limitation, and conflicting values before opening; revise only after supported character change.
- Owner: main playtest operator. Exit: a frozen character contract exists before turn zero.
- Gate impact: clarity and evidence quality.

### GD18-04: Numeric ratings lacked behavioral meaning

- Severity: P2 moderate. Likelihood: high. Urgency: before checkpoint. Confidence: high.
- Location: checkpoint scorecard.
- Evidence: an unanchored `4/5` can mean “good,” “not broken,” or “worth diagnosing.”
- Consequence: promotion becomes subjective bookkeeping.
- Required change: use shared 1/3/5 anchors and require continuation to mean voluntary play without protocol obligation.
- Owner: main playtest operator. Exit: every rating follows a behavioral explanation and uses the anchors.
- Gate impact: observability and evidence quality.

### GD18-05: Reused accepted worlds need current-build eligibility proof

- Severity: P1 major. Likelihood: medium. Urgency: before materialization. Confidence: high.
- Location: reusable-world preparation.
- Evidence: the accepted world artifacts predate the current Campaign Play schema.
- Consequence: stale play state or a migration mutation could contaminate a supposedly pristine lane.
- Required change: verify source hashes, migrate an isolated copy, prove empty character/play/turn tables, preserve accepted world content hash, and freeze a lane eligibility manifest.
- Owner: Campaign Play implementation. Exit: eligibility evidence passes before turn zero.
- Gate impact: system consistency and recovery.

## Adversarial and boundary cases

Impossible actions, systematic secrecy attacks, ambiguous phrasing, repeated submissions, and recovery injection remain important but do not belong in the pristine history unless they arise naturally. Missing evidence triggers a separately labelled diagnostic clone. A quiet scene is allowed when the player can name its value; three consecutive dead turns otherwise trigger review. Refusing a hook is valid play, not a mandatory coverage item.

## Gate matrix

| Gate | Status | Conditional disposition | Evidence | Confidence | Owner | Exit condition | Waiver status and authority |
|---|---|---|---|---|---|---|---|
| Clarity and ownership | PASS | None | The artifact names the player promise, operator, evidence, and claim limits. | High | Campaign Play | Keep the signed contracts in each bundle. | None |
| Experience/behavior fit | PASS | None | The artifact defines the intention-to-consequence loop and excludes coverage-driven actions. | High | Operator | Retain every pre-input intention. | None |
| System consistency | PASS | None | The artifact specifies the eligibility proof that runtime preparation must execute. | High | Implementation | Close eligibility before turn zero. | None |
| Balance/economy/content interaction | NOT APPLICABLE | NOT_APPLICABLE | Task 18 promotes no numeric balance or monetized economy. | High | Campaign Play | Re-review if scope changes. | None |
| Accessibility and safety | PASS | CLEAR_WITH_CONDITIONS | The artifact requires a text, focus, animation, and reread preflight before action 1 and excludes broader accessibility claims. | Medium | Operator | Record the preflight in the first lane bundle. | None |
| Evidence quality | PASS | None | Behavior precedes ratings; the artifact addresses fatigue, confirmation bias, and claim limits. | High | Operator | Preserve raw notes. | None |
| Production/operations readiness | PASS | None | The artifact defines isolated roots, session boundaries, and lane configuration evidence. | High | Implementation | Freeze lane config and eligibility before play. | None |
| Observability | PASS | None | The bundle records visible results, causal accounts, continuation decisions, receipts, audits, and replay. | High | Operator and auditor | Validate every bundle. | None |
| Rollback/recovery | PASS | None | A contaminating failure freezes the lane; diagnostics use disposable clones. | High | Implementation | Never repair a frozen run in place. | None |
| Privacy/minors | NOT APPLICABLE | NOT_APPLICABLE | One internal expert operator participates; the test collects no personal identifiers or recordings. | High | Campaign Play | Re-review before external recruitment. | None |
| Paid randomized monetization | NOT APPLICABLE | NOT_APPLICABLE | The scoped game has no paid randomized system. | High | Campaign Play | Re-review if scope changes. | None |
| Multiplayer/UGC | NOT APPLICABLE | NOT_APPLICABLE | The lane is a local single-player campaign. | High | Campaign Play | Re-review if scope changes. | None |
| Mod lifecycle | NOT APPLICABLE | NOT_APPLICABLE | Task 18 exposes no mod surface. | High | Campaign Play | Re-review if scope changes. | None |

## Required changes and retest

The protocol now contains the five required changes above. Before the first action, close the three execution conditions: clean-world eligibility, frozen lane configuration, and the expert accessibility preflight. During play, audit the action notes at turns 10, 30, and 60 without revealing protected truth between declared audit points.

Rollback trigger: any eligibility mismatch prevents lane creation; any hard contradiction, protected-fact leak, lost or duplicate input, partial commit, or reload divergence freezes the run as failed evidence rather than repairing it in place.

## Final disposition

`GO` for the Task 18 protocol. The review covers test design, not release readiness. Runtime preparation must still prove clean-world eligibility, freeze the lane configuration, and record the accessibility preflight before action 1.

Humanizer and deslop review: findings use concrete player behavior and causal consequences; no rating or completion count is treated as self-validating evidence.
