# Task 25: restricted-route Game Master contract

Status: implemented and verified in the rendered Campaign Play surface.

A real suggested crossing over a paid but mechanically restricted route reached the Game Master and stopped twice before Rulebook execution. Both GLM 5.2 proposals used `summary` on the two temporary `set_route_state` effects, while the strict proposal contract requires `reason`. The world remained at version 27 through both interruptions; no movement, route mutation, or duplicate spend occurred.

The Game Master prompt now states the exact `set_route_state` fields and explicitly forbids `summary` and `affectedHandles`. The schema, compiler, Rulebook command, and recovery model are unchanged. This is contract alignment, not normalization, fallback, compatibility handling, or backend-authored prose.

Prompt review:

- `humanizer`: keep as written; it is direct operational language with no performative framing or model-facing filler;
- `deslop`: pass; no canned headings, rhetorical padding, fake quotations, choppy fragments, or repeated conclusion.

Verification:

- focused Game Master suite: 31 tests passed;
- backend typecheck passed with `NODE_OPTIONS=--max-old-space-size=4096`; the first ordinary run exhausted the Node heap before reporting types;
- the same interrupted turn `turn-player-action:511d65351d2f5c96b9345024183ba1cb94edaae4` resumed rather than being resubmitted;
- GLM 5.2 Game Master attempt 3 passed the strict native-object contract in 58,157 ms, then Narrator passed in 146,835 ms; no text fallback, provider switch, or hidden retry ran;
- Rulebook receipts applied, in order, `advance_world_time`, temporary `set_route_state(open)`, `move_actor`, `set_route_state(restricted)`, and a nonmechanical arrival event, advancing world version 27 to 31;
- the authoritative route state after execution is `restricted` at world version 31;
- reload preserved Brackish Crossing, Pietr Grenn, five copper owed to Sestra Olo, the arrival consequence, narration, and four new choices;
- SQLite `integrity_check` returned `ok` and `foreign_key_check` returned no rows.

Manual prose verdict: the arrival is spatially coherent, names only visible facts, does not make Pietr act or speak without contact, and offers materially different next actions for work, observation, risk, and travel. The preceding local action, “step out onto the bridge planks,” remains a pacing concern because it added a readable but mechanically empty beat before the actual crossing. One occurrence is recorded as playtest evidence, not promoted into a speculative rule.

The product-use pass also exposed a separate UI defect: at the in-app browser's approximately 1270×720 viewport, the sticky `Your move` panel obscures the lower world-state card. That layout issue is outside this contract patch and is the next direct product repair.

GitNexus impact analysis was attempted with a bounded wait and did not return. Direct inspection shows the edited private prompt builder feeds only `createCampaignPlayGameMaster().plan`; the focused suite and resumed live turn cover that affected path.
