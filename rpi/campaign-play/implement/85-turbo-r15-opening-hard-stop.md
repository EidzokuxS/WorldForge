# Turbo r15 Opening hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r15` materialized the frozen zero-turn Lowwater Ledger template on commit `b9f450d9`. Template hashes, eligibility, and empty character/play/turn tables were frozen before the rendered character flow.

The UI generated Lira Keth from one draft request and accepted the unedited character. She was an ordinary lower-ward lamp fitter with practical tools, no office, faction role, special powers, or secret political ties. The human player selected `lower-wards / Local / Already here / Looking for work` and submitted Begin once.

Opening Planner attempt 1 ended after `246,655 ms` with `NoObjectGeneratedError: could not parse the response`. The model ledger correctly recorded `interrupted/model_contract_invalid`, `schema_outcome=invalid`, and Z.AI Coding Plan `glm-5-turbo`. No Opening artifact, world mutation, narration, hidden retry, text fallback, provider switch, or model switch occurred.

The rendered Play UI remained at `opening_active`, `worldVersion=6`, `runtimeRevision=29`, with the same interrupted Opening turn and one Resume control. SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows. The terminal screenshot is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r15.session/screenshots/opening-hard-stop.png`, SHA-256 `6d1449d0ae0d757f76854653276c423af1bef1819233eeab3a92333aa8c87574`.

## Disposition

The live result confirms that unavailable native structured output is no longer mislabeled as a transport failure. Task 18's pristine boundary still makes this contract result a lane hard stop, so Resume is not used. r15 stays frozen, and the next attempt materializes the unchanged zero-turn template under a new run id.

Humanizer review kept the report in direct playtest language. Deslop review preserved the exact error classification, model, hashes, and no-recovery boundary.
