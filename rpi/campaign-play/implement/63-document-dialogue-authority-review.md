# Document dialogue authority review

## Outcome

The mechanical-authority reviewer now distinguishes an attributed statement about an untracked scene document from a mechanical possession, obligation, or route-access transition. It still rejects prose-only acquisition, consumption, payment, debt settlement, traversal requirements, checkpoints, and route topology that lack matching typed authority.

The repair changes one semantic-review instruction. It adds no parser, keyword classifier, proposal rewrite, hidden retry, fallback, provider switch, compatibility path, backend-authored dialogue, or Rulebook bypass.

## Reproduced failure

The frozen Black Rain passage campaign stopped on player action 7 after Judge acceptance and before Rulebook mutation.

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`.
- Turn: `turn-player-action:d62236f544f99902ab73fa95b9a0d8bad7b5c77e`.
- Player action: close the examined folders, leave them where they were, disclose the examination to Tomasso Gravelle, and ask whether they were set aside for burning.
- Judge: accepted attempt 1 on `glm-5.2`; deterministic contact with Tomasso, one elapsed minute, no possession authority, no obligation authority, and no route citation.
- Game Master: returned one strict dialogue event naming Tomasso as performer. The independent reviewer rejected it because the reply used document-procedure language such as `passage bonds`, `default stamp`, `standard clearance`, and `contracts are void`.
- Turn state after rejection: `interrupted`, `interrupted_stage=judged`, `resume_eligible=1`, `final_world_version=null`, and empty mutation audit.
- Original SQLite remained `integrity_check=ok` with no foreign-key violations.

The rejection protected state correctly, but treated the classification and disposal of untracked folders as though it changed an actor debt or route-access rule. The action transferred no item, changed no quantity or obligation, completed no bargain, moved no actor, and asserted no traversal path or requirement.

## Repair

The reviewer now applies possession and obligation checks to an actor's custody, quantity, debtor or creditor balance, payment, and completed bargain. It separately defines a route claim as a statement about where traversal goes or what traversal requires. Document classification, validity, filing, disposal procedure, and history remain nonmechanical unless the event actually changes a typed actor resource or traversal authority.

`humanizer` review kept the instruction direct and setting-neutral. `deslop` review found no filler, repeated contrast, or authority drift. `prompt-craft` review kept the patch on the smallest failed decision boundary and preserved the existing negative controls.

## Real diagnostic replay

The original campaign stayed frozen. A stopped-runtime copy was made at the same interrupted turn under `output/playtests/campaign-world-runs/black-rain-passage-action-7-dialogue-review-copy` and resumed through the rendered Play UI against the changed code.

- Game Master attempt 2 used `zai-coding-plan` / `glm-5.2` and accepted in `106,901 ms`.
- The proposal used one actorless scene event for closing the folders and one Tomasso-attributed dialogue event for the reply.
- The independent semantic review accepted with review hash `5c9f90821f3d2da5f33f5d6b3734675261af69f39b834fb944c00ae12f39bb16`.
- Rulebook advanced time by one minute and committed the two events; final world version is `23`.
- Narrator attempt 1 used `glm-5.2` and accepted in `72,820 ms`.
- The copied turn completed with `resume_eligible=0`, SQLite `integrity_check=ok`, and no foreign-key violations.
- Returning the backend to the original campaign restored the rendered interrupted state and its explicit Resume control.

This replay is diagnostic because it used an explicit Resume on a copied interrupted turn. It does not count toward a pristine 60-action lane.

## Prose and play reading

The completed exchange is coherent: Marta replaces the folders, admits what she did, and Tomasso answers without paying, transferring custody, changing a debt, or changing route access. His reply remains attributed dialogue rather than Rulebook truth.

The rendered result still repeats most of the same material across two `What changed` entries and `The moment`. One generated next action says `Wait 10 minutes and watch the burn-slate curl in the coals`, although the committed scene leaves the folders face-down on the brazier ledge. That suggestion precommits a later placement and is a separate action-authority defect for the next fresh lane; it does not invalidate the reviewer repair.

## Validation

- GitNexus impact for `mechanicalAuthorityReviewPrompt`: `LOW`, one direct caller, one Campaign Play process.
- Focused Game Master tests: `44/44` passed.
- Backend typecheck: passed.
- Real copied-turn Resume through the Play UI: passed.
- Original interrupted state restored after diagnostic replay: passed.
- Standalone smoke additions: `0`.
