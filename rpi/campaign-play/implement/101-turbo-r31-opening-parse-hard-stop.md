# Task 18 Lane A r31: Opening native-object parse hard stop

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r31` materialized the unchanged frozen Lowwater Ledger template at accepted/world/runtime `1/1/1`, `character_required`, with zero characters and turns. The rendered Character page imported the canonical Character Card V2 for Brina Hael once through the native-resident UI path. Synthesis and power assessment accepted their first `glm-5-turbo` native-object attempts in `62076 ms` and `59341 ms`.

Human review replaced campaign-tailored draft details with the same ordinary carrier profile used in r28 through r30: no faction role, office, secret, power, or prior conflict connection; two practical motives and drives; five ordinary traits; and three ordinary possessions. One player PUT produced one character and four typed bootstrap commands, receipts, and events, advancing world version `1` to `5`. The player then selected `lower-wards / Local / Already here / Looking for work` and submitted Begin exactly once.

Opening turn `turn-opening:4f6aea5e511f098d069fce5ea27b58d4f70fe1b9` had one Planner stage and one model attempt. It ran for `541573 ms` with finish reason `other`. The live `safeGenerateObject` event reported that native JSON produced no parseable object. Text fallback was disabled by the strict-object contract, so the attempt ended without an artifact. SQLite records requested and actual provider `zai-coding-plan`, model `glm-5-turbo`, and strategy `strict_object`; the stage is `interrupted`, schema outcome `invalid`, error `model_contract_invalid`, with no artifact or artifact hash.

The Opening turn is interrupted at `admitted`, with empty mutation audit, no final world version, public packet, result, commands, receipts, world events, actor jobs, proposals, narration, plans, schedules, or Opening mutation. Setup remains `opening_required` at world version `5`. Runtime events are contiguous `1..59` with matching revision steps; sequences `2..59` remain on world version `5`. SQLite integrity is `ok`, and foreign-key check is empty.

The real Play page renders `The opening stopped before it finished.` and an unused `Resume` control. Screenshot `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r31.session/screenshots/opening-hard-stop.png` has SHA-256 `44269194d35505d36876c9af144ed5daeacc743fa3f8e411b11d67b04d459bd0`.

Task 18 treats any model, schema, or semantic invalidity as a hard stop. Therefore r31 is frozen before a completed Opening despite the runtime recovery contract marking the turn resumable. This third consecutive native-object parse failure is provider/model evidence, not permission to enable text fallback, resume the same turn, change prompts, edit SQLite, or expand the harness. The next Lane A attempt materializes the same frozen zero-character template under a new run ID and keeps the provider/model configuration unchanged.

An independent Terra High read-only review reached the same classification from the exact r31 database: the run fails Lane A at Opening, and `resume_eligible=1` does not override the plan's model-contract hard-stop rule.

Humanizer and deslop review kept the note chronological, separated the live provider error from durable SQLite facts, and made no product or long-play claim from the failed Opening.
