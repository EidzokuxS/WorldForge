# Player profile turn authority

## Outcome

Player-action admission now freezes a digest-correlated projection of the human
player's canonical `CharacterRecord`. Judge and Game Master receive that profile
as protected authority, separately from visible world facts and player intent.

The projection contains background, persona, traits, skills, specialties, and
deduplicated motivations. It does not grant possession, access, relationships,
world state, or NPC knowledge.

## Live defect

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r05`

- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Action 8: Therrin clarified that he meant bridge work.
- Stored `campaign_play_characters.record_json` said he had maintained
  Lowwater's south cable-bridge for fifteen years.
- The admitted turn frame contained only his actor id, handle, and name.
- Game Master therefore authored: `You're not from any crew I've seen on the
  cables.`

## Change

- Added `campaignPlayPlayerProfileAuthoritySchema`.
- Action admission verifies the complete stored profile digest, freezes the
  bounded profile projection, and rejects a changed or mismatched record.
- Judge may use profile history and capability for feasibility or uncertainty,
  but cannot treat it as current mechanical authority.
- Game Master cannot contradict the profile. The profile does not establish
  what another actor knows; an actor may ask or seek proof when their own
  authority does not establish recognition.
- The profile is not copied into `visibleFacts` or the narrator packet.

## Prompt review

`prompt-craft` review kept one authority rule per model surface and separated
profile truth from NPC knowledge. `humanizer` and `deslop` review found no prose
padding worth retaining; the final wording is direct, non-repetitive, and uses
the existing contract vocabulary.

## Verification

- `npm run typecheck --workspace backend`
- `npm test --workspace backend -- src/campaign-play/judge.test.ts src/campaign-play/game-master.test.ts src/campaign-play/turn-runtime.test.ts --testTimeout 30000`
- Result: exit 0; 120 tests passed: Judge 34, Game Master 46, and turn runtime
  40. The longer command-line timeout was diagnostic only and was not added to
  repository configuration.
- Live action 9, after backend restart: Therrin stated his fifteen years of
  fiber-tender work and asked Thera to check the records. Judge, Game Master,
  authority review, and Narrator all accepted on the first attempt. Thera
  treated the history as true while explaining that her gate post did not
  establish prior recognition.

## Residual observation

Thera also invented an unsupported exact tenure of eight years. This is a
presentation attribution issue, not a mechanical or player-agency mutation. It
is retained as playtest evidence rather than expanding this profile-authority
fix into another prompt prohibition.

The bounded ResearchLoopKit search returned only a cross-engine asset identity
guide; it did not bear on player-character narrative authority and was not used.
