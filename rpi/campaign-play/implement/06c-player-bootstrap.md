# Task 6C: receipt-bearing player bootstrap

Date: 2026-07-11  
Status: complete; independent mechanical and semantic reviews passed.

## Outcome

`bootstrapCampaignPlayPlayer` is the only Campaign Play character-to-mechanics handoff. It accepts a code-sealed `PreparedCampaignPlayCharacter`, exact accepted provenance, expected mechanical version, expected runtime revision, and creation time. It requires eligible accepted topology in `character_required`, then compiles exactly one internal `create_player_actor` command and executes it through the sealed Rulebook boundary.

One immediate SQLite transaction persists:

- the unique `person/human/player` actor;
- the canonical CharacterRecord JSON, profile digest, source kind, and source digest;
- deterministic command, receipt, and `player_actor_created` causal event;
- mechanical world version/hash advance;
- `character_required -> opening_required` setup phase;
- runtime revision/hash advance and `character_created` runtime event.

The mechanical projection binds the human actor ID to the stored CharacterRecord profile digest. Reload recomputes and proves the same authority and mechanical hashes.

## Profile authority

Character preparation registers a module-private canonical integrity seal and freezes the returned envelope. Bootstrap verifies that seal, campaign/actor identity, player role, canonical record bytes, domain-separated profile digest, and source digest before opening a write transaction. Cloned, forged, or mutated prepared profiles carry no authority.

## Acceptance evidence

- A complete Character Card V2 envelope goes through the explicit donor ingestion boundary, profile preparation, Rulebook bootstrap, SQLite persistence, close/reopen, and stable hash proof.
- A generated prompt follows the same path and produces the same one-actor/one-profile/one-ledger shape.
- Each successful fixture has exactly one human actor, profile, command, receipt, and causal event, plus the state-created and character-created runtime events.
- Stale accepted version, stale accepted hash, forged profile digest, accepted actor-ID collision, and duplicate bootstrap preserve the exact authority object and all human/profile/command/receipt/event/runtime row counts.
- The Task 6B transaction matrix supplies injected SQLite constraint and writer-contention rollback at the shared executor boundary used here.

## Verification

```text
npm --prefix backend test -- src/campaign-play/player-bootstrap.test.ts src/campaign-play/character-service.test.ts src/campaign-play/campaign-play-state-repository.test.ts
3 files, 54 tests passed

npm --prefix backend run typecheck
passed
```

Standalone smoke additions: `0`.

Independent Terra mechanical verification returned `PASS`. Fresh Sol semantic review returned `PASS` with P0/P1/P2 `0/0/0`; it independently reran the 54-test focused suite and backend typecheck.

GitNexus impact was attempted for `campaignPlayCharacterService` and `createCampaignPlayStateRepository`; both Campaign Play targets remain outside the stale index. The focused integration and independent semantic reviews therefore remain the completion authority for this untracked mechanics slice.
