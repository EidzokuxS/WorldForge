# Phase 95 Current-Head Oracle Review Request

Date: 2026-05-24
Repository: `R:\Projects\WorldForge`
Branch: `develop`
Reviewed HEAD: `732c9aeb0c36e345abb33d6ddfb7992cd5737adf`

## Product Goal

WorldForge Phase 95 is not trying to collect a few scripted green runs. The
target is a high-quality, living LLM-driven RPG loop: the player acts
naturally, the world responds coherently, and campaign truth remains stable at
turn 1, turn 60, turn 600+, in clean-start clones, replay/rollback attempts,
partial-turn recovery, UI projection, and long-running play.

LLM narration should stay creative and fun, but gameplay truth must be owned by
backend contracts: refs/capabilities, tool ownership, time, receipts,
persistence, clone/replay/rollback, narration grounding, UI projection,
recovery, vector state, observability, and acceptance evidence.

## What To Review

Please give a current-head architecture gate verdict, not a gameplay acceptance
verdict.

Return one of:

- `ARCHITECTURE GO`: no P0/P1 architecture implementation blockers remain
  before Browser/human-style/soak evidence can resume.
- `CONDITIONAL ARCHITECTURE GO`: the control plane is coherent enough to move
  to Browser/play evidence, but named P2s or external-evidence risks remain.
- `ARCHITECTURE NO-GO`: any P0/P1 blocker remains in the architecture or
  implementation evidence.

Do not call Phase 95 gameplay accepted unless the attached evidence proves the
Browser, human-style fresh/cloned 60-turn, and longer soak/replay gates. It
does not; those gates are expected to remain pending.

## Required Checks

Check the full gameplay cycle:

1. UI action intake
2. turn boundary
3. GM Read
4. GM Tool Loop
5. executor and receipts
6. actor/world runtime
7. due-world work and time
8. narrator packet
9. final narration
10. SSE/API/frontend public projection
11. persistence, clone, replay, rollback, vector
12. observability/evidence policy
13. recovery modes

For every layer and major state class, look for missing or ambiguous:

- source of truth;
- one write owner;
- support-only/model-authored boundary;
- runtime validator;
- accepted receipt/projection;
- recovery mode and executable tests;
- raw backend id leak or UI-label authority;
- hidden/support context leaking into narration truth;
- clone/replay/rollback/vector poisoning;
- observability evidence that can publish raw/private payloads.

## Specific Questions

1. Is the local matrix correct that no P0/P1 implementation blocker remains
   before external evidence gates?
2. Are any state classes still missing a single write owner?
3. Are model/player-facing refs fully safe enough for long campaigns, or is
   shared issuer/resolver incompleteness still P1?
4. Does the final narration path fail closed strongly enough on live and resume
   paths?
5. Is manifest-owned clean-start clone plus fail-closed replay-preserving clone
   a sound Phase 95 boundary?
6. Is the new observability evidence policy enough to let Browser/Oracle/play
   evidence be recorded without raw/private publication risk?
7. What exact evidence should be gathered next before any long-play acceptance
   claim?

## Desired Output

Start with the verdict line. Then list:

- P0/P1 blockers, if any, with file/path evidence;
- P2 risks that can be carried into Browser/play evidence;
- incorrect or overbroad claims in the attached docs;
- the next minimum evidence sequence.

Please distinguish "inspected from attached code/docs" from inference. Treat
old Oracle/agent answers as historical risk inventory, not architecture
authority for this HEAD.
