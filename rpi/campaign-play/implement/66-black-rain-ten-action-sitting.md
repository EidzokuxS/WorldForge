# Black Rain ten-action sitting

## Decision

Decide whether the current Campaign Play slice can enter the formal pristine sixty-action lane without another causality repair. The working hypothesis was that an ordinary outsider could enter an accepted world, follow a locally visible thread for ten actions, encounter independent NPC behavior and incomplete information, and return after reload without the prose outrunning authoritative state.

The run supports proceeding. It does not prove long-horizon world autonomy, population-level player comprehension, or broad narrative quality. Two presentation defects remain advisory: the two result cards repeat almost the same prose, and one observation describes warm fragments "under your fingertips" although the player asked only to examine them.

## Evidence contract

- **Build and environment:** `feat/revamp`, run `black-rain-passage-pristine-60-r19`, Z.AI Coding Plan `glm-5.2`, normal rendered Campaign Play UI on ports `3000/3001`.
- **World source:** immutable template `black-rain-passage-54df81f3-20260719`, accepted content hash `54df81f36c0f88bed68aff192b5c635e43f749a3bf97e346aafd990a2f397656`.
- **Participant:** one technical evaluator acting as a cautious ordinary player. This is a formative diagnostic, not a representative player sample.
- **Character:** Marta Riva, `kind=person`, `controller=human`, `role=player`; an unaffiliated weather sketcher and corrosion observer with no special authority or central destiny.
- **Method:** manual UI play. Each action was selected for a concrete in-world reason before submission. Behavior and visible consequences were recorded before the quality verdict.
- **Expected observations:** the opening starts a local situation without making Marta its cause; examination yields bounded evidence; contact does not force disclosure; waiting advances time and lets the scene continue; possession changes remain typed and durable; reload preserves the accepted result.
- **Severe-failure rule:** stop and repair if a turn invents mechanical possession, route access, actor presence, payment, world knowledge, or player intent; silently retries or changes model; corrupts persistence; or collapses local actors into exposition for the player.
- **Decision rule:** proceed when all ten actions complete without repair or resume, authoritative state agrees with the rendered consequence after reload, and no severe failure occurs. Record prose repetition, pacing, weak off-screen activity, or minor unchosen physical detail as a focused later finding unless it changes causality.

## Session

Opening placed Marta with Pia Servadio at Vesper Quay Beacon Terrace. Pia was already scraping a corroded beacon bracket as part of her own work. The scene exposed loose debris, damage, travel routes, and a local safety boundary without making Marta responsible for the city's pressures.

The ten player actions were:

1. Examine fresh scrape marks on the bracket.
2. Seal one already-loose corrosion flake in the existing specimen-jar set without touching the bracket or Pia's tool.
3. Ask Pia what causes the metal loss.
4. Travel to Vesper Quay Tollhouse.
5. Examine the disturbed contract archive shelves.
6. Ask Tomasso Gravelle about the searched defaulted contracts.
7. Press Tomasso about the fresh handling marks.
8. Wait ten minutes and watch whether records reach the brazier.
9. Examine the brazier ash and charred remnants.
10. Ask Tomasso about the red and black wax beads in the brazier.

The route formed a readable investigation without guaranteeing a solution. Pia attributed the damage to black rain but did not turn uncertainty into fact. At the tollhouse, Tomasso first offered a rehearsed quarterly-audit explanation, then narrowed it to contracts flagged for chain-of-custody irregularities when pressed. He still withheld access without a contract number or stamped reference. During the wait, ordinary tollhouse work continued, Tomasso moved among the ledgers, and no new records conveniently arrived at the fire. The ash showed ledger-page structure and two kinds of sealing wax but preserved no readable contract or stamp. Tomasso explained the wax in a plausible institutional way and challenged Marta's interest instead of surrendering the scene's information.

## Direct observations

- Opening plus exactly ten `player_action` turns are `completed`. No turn has an error, resume eligibility, or interrupted stage.
- Opening Planner, Judge, Game Master, Mechanical Authority Review where applicable, Actor Replanner where due, and Narrator all used Z.AI `glm-5.2` strict structured output at attempt one. No repair, text fallback, provider switch, model switch, or hidden retry occurred.
- The world advanced from version `13` after Opening to `26` after action ten. World time reached Day 1, `00:27`; the explicit ten-minute wait advanced it from `00:13` to `00:23`.
- Marta remained at Vesper Quay Tollhouse with Tomasso present. Pia did not follow her from the beacon terrace.
- Inventory after action ten contains exactly four positive possessions: `Inland travel clothes ×1`, `Sketchbook ×1`, `Specimen jars with sealed orange corrosion flake ×1`, and `Travel satchel ×1`.
- Reload preserved the current place, visible actor, inventory, Day 1 `00:27` result, prose, and next choices.
- SQLite `integrity_check` returned `ok`; `foreign_key_check` returned no rows.

## Quality findings

### What worked

- **Comprehension: 5/5.** Every result stated what Marta could perceive and left a concrete next question.
- **Player-action causality: 5/5.** The sequence followed submitted actions without granting unrequested access, possession, payment, travel, or certainty.
- **Prose readability: 4/5.** The investigation was easy to follow, sensory detail stayed specific, and Tomasso's guarded behavior remained legible.
- **World aliveness: 4/5.** Pia and Tomasso had work, boundaries, and behavior not created for Marta. Waiting produced normal activity and an honest absence of the hoped-for event.
- **Desire to continue: 5/5 for this evaluator.** The flagged contracts, brazier, and wax form a coherent unresolved thread with several plausible next moves.

The memorable causal chain was corrosion at the beacon, Pia's uncertain attribution, selective handling of defaulted contracts, Tomasso's narrowing explanation, his attention to the brazier, and the physical remains of ledger pages and seal compounds. The player could investigate, leave, or pursue another route; the scene did not declare a mandatory quest.

### Findings to carry forward

1. `What changed` and `The moment` usually repeat the same text with only a short lead-in difference. This weakens pacing and makes each slow model turn feel longer, but it does not change authority or persistence.
2. Action nine ends with fragments "still warm under your fingertips." The player asked to examine the ash, not touch it. This is minor action appropriation and should be watched in the formal lane; it becomes blocking if narration adds risky, costly, socially meaningful, or mechanically relevant conduct.
3. Action two's prose replaced the opening's established `scraper` with newly named `pumice stone and wire brush`. The authoritative possession transition remained correct, but the narration invented tool continuity.
4. Local scene activity is visible, but this sitting does not demonstrate a distant pressure changing independently, later returning to the player's awareness, or surviving a long absence.
5. Latency is substantial: completed actions took roughly 105 to 214 seconds end to end, and Opening took about 509 seconds. The model was allowed to finish; there were no timeout repairs.

## Verdict

`PASS_WITH_ADVISORIES`. No finding from this sitting justifies changing the mechanics or model pipeline before the formal lane. The next run should begin from a pre-play frozen evidence bundle and signed action ledger, preserve the same no-repair rule, and treat any stronger player-action appropriation or mechanical/prose disagreement as a lane failure.

Research guides `pgg:guide:practical-narrative-choice-slice` and `pgg:guide:practical-narrative-knowledge-disclosure-slice` were used only to separate offered input, authoritative commit, visible consequence, knowledge status, and reload evidence. They do not upgrade this single evaluator session into a claim about player agency or general narrative quality.

Humanizer review kept the note concrete and retained uncertainty, participant limits, and direct observations. Deslop review removed no authority condition and found no remaining formulaic framing that would justify changing the evidence record. Verdict: retain the direct report and proceed to formal pristine evidence.
