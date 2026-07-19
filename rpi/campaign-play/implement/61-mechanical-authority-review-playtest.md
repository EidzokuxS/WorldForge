# Mechanical-authority review playtest

## Outcome

Mechanically sensitive Game Master prose now crosses one independent semantic review before Rulebook execution. The review covers dialogue, interaction, events that reference possessions or obligations, and typed route claims. It may accept or reject the authored proposal. It cannot rewrite the proposal, create a command, repair a schema, substitute a provider, or continue the story.

The boundary closes a defect reproduced in the clean support-actor campaign: an earlier repair event said that the player consumed already depleted leather and wax and that Dario paid six copper, while the accepted batch contained neither a possession transition nor an obligation transition. The reviewer now receives the sensitive event summaries, typed resource effects, Judge resource authority, and route claims. A durable possession or obligation claim without its matching typed effect is rejected before Rulebook mutation.

The old route-only review artifact is not retained as a compatibility variant. Current accepted proposals persist `semanticReview.kind=mechanical_authority`; earlier `route_authority` artifacts are outside the hard-cutover contract.

## Reproduced authority gap

- Campaign: `cde67b5c-e6da-49b0-86d1-ffc7ec64786d`.
- Original defect turn: `turn-player-action:b4c09bd573b7508d6ea23101d0ddf016bd69a11c`.
- Player inventory already contained `Wax and leather scraps` at quantity zero.
- Game Master committed time plus one presentation event and no possession or obligation effect.
- Narration nevertheless completed the material repair and described Dario counting out six copper.
- The prose therefore created consumption and payment claims that SQLite did not own.

Focused regression now supplies that exact class of proposal to the reviewer. A rejected verdict terminalizes the Game Master attempt as `mechanical_authority_rejected`; Rulebook receives no batch.

## Live positive control

The retained campaign continued through the rendered `/campaign/:id/play` UI with the configured `zai-coding-plan` / `glm-5.2` provider. The player selected the visible action `Talk to Dario Calvo: ask which chandlers to seek out`.

- Turn: `turn-player-action:d78d6aac7f7fb4b836f68c1f3f2679f8d2aaccea`.
- Judge attempt 1 accepted in `28,677 ms`.
- Game Master attempts 1 and 2 interrupted before mutation because the reviewer returned a valid verdict basis longer than the old 500-character evidence field. The provider log identified the exact schema error; neither attempt reached Rulebook.
- The reviewer evidence field now uses the existing 1,200-character text bound and explicitly asks for one line within that limit. An existing accepted-review test uses a reason longer than 500 characters so this live verification defect cannot silently return.
- Explicit Resume after the code change created Game Master attempt 3. It accepted in `81,625 ms` with one proposal call and one independent reviewer call under the same GLM 5.2 selection.
- Narrator attempt 1 accepted in `71,832 ms`.
- No hidden retry, model switch, provider switch, text fallback, schema repair, backend-authored proposal, or backend-authored narration ran.

The accepted Game Master artifact persists:

- `semanticReview.kind = mechanical_authority`;
- review hash `0ac11defe232b91f779ef3f5214e962e3f30ec49f657ae35ca1fcf0e86271bc3`;
- commands `advance_world_time` and `record_world_event` only;
- two applied Rulebook receipts;
- world version `27 -> 28` and world minute `153 -> 154`;
- no possession command, obligation command, or obligation row.

After settlement the player still carried one toolkit, one oiled cloak, and zero wax-and-leather scraps. Dario gave bounded directions and admitted that he could not name a specific chandler. He did not hand over materials, sell anything, accept payment, pay the player, or turn his promise to ask other couriers into mechanical debt. Reload restored the same place, actors, inventory, narration, four next actions, world version, and runtime state.

Rendered evidence: `output/playtests/campaign-play/diagnostic-clean-cinderwatch-r38/mechanical-review-benign-dialogue.png`, SHA-256 `658231AD0E5ECF3175E6CE4F5EDD8CBEE5F78A3901CB2CAA6D38EC3111791A17`.

SQLite reports `integrity_check = ok`, no foreign-key violations, world version `28`, runtime revision `823`, world hash `e10b4f13768819870fe5d397026dcd7e7a95ec61325f5cd730550f89c524395f`, and runtime hash `960424b260c06d78008bc58fff39d29a151b013bb80dc59e5437762dd832fa47`.

## Play and prose reading

The completed scene is coherent with the previous exchange. Dario distinguishes what he knows from what he does not know, keeps his courier work independent of the player, and supplies a practical next location without inventing a merchant identity. The result is readable but slightly redundant: the consequence card and moment restate most of the same information. One generated suggestion also reads `Examine examine the side vault entrance`; that is a separate action-label presentation defect and is not evidence against the mechanical-authority boundary.

## Validation

- Focused Game Master suite: `39 passed`.
- The initial affected contracts, Game Master, and player-turn runtime run passed `115/115` across three files.
- After deleting the old `route_authority` compatibility variant, contracts and Game Master remained `75/75` and backend typecheck passed. Repeated player-turn runtime runs produced no assertion failure, but between two and five long SQLite integration cases crossed Vitest's fixed five-second test limit while the host was degraded. The same runtime file had already passed `40/40` before that type-only hard cutover; no timeout or test-support change was added to disguise the verification defect.
- Backend typecheck passed.
- `git diff --check` passed apart from existing line-ending warnings.
- Real UI submission, two pre-mutation interruptions, explicit post-fix Resume, terminal prose inspection, screenshot, SQLite ledger inspection, and reload passed.

## Semantic review

`humanizer` and `deslop` review keep the reviewer instruction literal and setting-neutral. It states the authority boundary once, distinguishes presentation events from durable state, and supplies no canned story result. The reviewer cannot rewrite or repair a proposal. The change adds no timeout, retry, fallback, compatibility adapter, keyword parser, backend-authored prose, or provider substitution.

The reviewer is defense in depth, not a replacement for typed economy. A valid paid service still requires explicit debtor, creditor, amount, source-backed possession where payment occurs, Rulebook commands, receipts, and persistence. The next slice generalizes that actor-to-actor obligation authority so an unpaid service becomes debt rather than prose-only payment.

## Limits

This proves one rejected synthetic repair and one accepted benign dialogue in one retained GLM 5.2 campaign. It does not prove universal semantic-review reliability, general economy completeness, long-horizon prose quality, player comprehension, or a pristine lane. The retained turn required explicit recovery from the reviewer evidence-bound defect and therefore remains diagnostic evidence.
