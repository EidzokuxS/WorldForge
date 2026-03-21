---
phase: 13-gameplay-playtest-ai-tuning
verified: 2026-03-20T00:30:00Z
status: human_needed
score: 16/16 code truths verified; gameplay quality requires live session
human_verification:
  - test: "Run a 5-turn combat session and verify average quality >= 4.5/5"
    expected: "set_condition called every combat turn, Oracle gives 30-35% at low HP, non-lethal pit fight ends in KO not death, narrative does not repeat section headers"
    why_human: "Gameplay quality is subjective and requires live LLM session to confirm"
  - test: "Run a 10-turn NPC interaction session and verify NPCs take autonomous actions"
    expected: "Key NPCs take at least 1 action per 3 turns, actions reference their goals and beliefs, off-screen NPC updates appear in world state every 5 ticks"
    why_human: "NPC autonomy depends on LLM behavior under live conditions"
  - test: "Verify faction ticks produce observable world changes at ticks 5 and 10"
    expected: "Faction action events appear in chronicle with specific location/NPC references, not vague summaries"
    why_human: "Faction tick behavior confirmed once in playtest but requires ongoing validation"
  - test: "Verify LanceDB episodic memory pipeline (known pre-existing bug)"
    expected: "Episodic events stored with valid vector field after each turn"
    why_human: "Pre-existing 'Failed to infer data type for field vector' bug — fix was not part of Phase 13 scope"
  - test: "Verify offer_quick_actions called consistently (current rate ~80%)"
    expected: "Quick actions panel appears after every narrative response"
    why_human: "Model-level limitation (Gemini Flash) — all prompt reinforcement was applied but rate remains ~80%"
---

# Phase 13: Gameplay Playtest & AI Tuning Verification Report

**Phase Goal:** All AI systems produce quality 4.5+/5. Oracle calibrated, Storyteller atmospheric with IP terminology, NPCs autonomous, combat HP tracked, checkpoints work, world simulation active.
**Verified:** 2026-03-20T00:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (From 3 Plans)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Oracle calibration bands prevent over-generous probabilities | VERIFIED | `oracle.ts` line 72-78: calibration bands 5-15% through 91-99%, "Do NOT default to high chances. A character without an explicit skill tag starts at ~30%" |
| 2 | CRITICAL OUTPUT RULES prevent Gemini Flash from echoing section headers | VERIFIED | `prompt-assembler.ts`: CRITICAL OUTPUT RULES block at top of SYSTEM_RULES, LEAKED_HEADERS list in `turn-processor.ts` with 12 headers, sanitizeNarrative function truncates on first leak |
| 3 | Storyteller narrates outcome matching Oracle result (miss=failure, strong_hit=success) | VERIFIED | `turn-processor.ts` OUTCOME_INSTRUCTIONS: "The player FAILED. Narrate the failure clearly and unambiguously." for miss; "NEVER narrate the NPC being 'intrigued'..." |
| 4 | NPC presence enforced — NPCs in [NPC STATES] ARE PRESENT in scene | VERIFIED | `prompt-assembler.ts` SYSTEM_RULES: "If the [NPC STATES] section lists NPCs, those NPCs ARE PRESENT in this scene with the player" |
| 5 | set_condition tool mandated on every damage/heal event in combat | VERIFIED | `tool-schemas.ts`: "Call this EVERY TIME the player takes damage or is healed. In combat: light hit = delta -1, solid blow = delta -1 or -2, devastating attack = delta -2 or -3"; COMBAT HP TRACKING block in SYSTEM_RULES; set_condition requirement in all 3 OUTCOME_INSTRUCTIONS tiers |
| 6 | Oracle factors HP into probability (wounded state reduces chance by 10-20%) | VERIFIED | `oracle.ts` line 69: "If the actor is wounded (low HP noted in scene context), reduce chance for physically demanding actions by 10-20%. A character at HP 1-2 is severely hampered." + `turn-processor.ts` HP injection: `if (player.hp < 5) { sceneContext += \` Actor HP: ${player.hp}/5.\` }` |
| 7 | Non-lethal vs lethal HP=0 narration split (pit fight = KO, lethal fight = death) | VERIFIED | `prompt-assembler.ts` SYSTEM_RULES: explicit split between non-lethal (KO/submission) and lethal (death possible) contexts |
| 8 | NPC agent temperature 0.3 for varied autonomous behavior | VERIFIED | `npc-agent.ts` line 218: `temperature: 0.3` |
| 9 | NPC agent action bias — must take action when other characters present | VERIFIED | `npc-agent.ts`: "You SHOULD take at least one action when other characters are present — passing (no tools) should only happen if truly nothing warrants action" |
| 10 | readCampaignConfig tick bug fixed — currentTick returned correctly | VERIFIED | `campaign/manager.ts`: `currentTick: typeof parsed.currentTick === "number" ? parsed.currentTick : undefined` present in return object |
| 11 | Faction tick interval = 5 (from 10) for more frequent world simulation | VERIFIED | `world-engine.ts`: `interval = 5` as default parameter; faction actions require "SPECIFIC, OBSERVABLE change... Vague actions like 'continued to plan' are NOT acceptable" |
| 12 | NPC reflection threshold = 10 (from 15) for responsive belief updates | VERIFIED | `reflection-agent.ts`: `export const REFLECTION_THRESHOLD = 10` line 23; SQL filter: `sql\`${npcs.unprocessedImportance} >= ${REFLECTION_THRESHOLD}\`` |
| 13 | Storyteller gets 3 steps (narrative + state tools + quick_actions) | VERIFIED | `turn-processor.ts` line 308: `stopWhen: stepCountIs(3)` |
| 14 | off-screen NPC simulation interval = 5 with specific action requirement | VERIFIED | `npc-offscreen.ts`: `interval = 5` default; "Each NPC update MUST describe something SPECIFIC they did — name locations, actions, and consequences" |
| 15 | IP terminology guidance references world premise and lore context | VERIFIED | `prompt-assembler.ts` SYSTEM_RULES: "Use vocabulary, titles, and proper nouns from [WORLD PREMISE] and [LORE CONTEXT]" |
| 16 | Miss narration includes concrete failure examples per action type | VERIFIED | `turn-processor.ts` OUTCOME_INSTRUCTIONS miss: "Combat miss → attack misses or is blocked, enemy counterattacks and DEALS DAMAGE. Persuasion miss → NPC refuses, dismisses, or becomes hostile. Search miss → find nothing useful, or attract danger." |

**Code Score:** 16/16 truths verified in codebase

### Required Artifacts

| Artifact | Expected | Status | Details |
|---------|----------|--------|---------|
| `backend/src/engine/oracle.ts` | Calibrated probability with HP factor + calibration bands | VERIFIED | 140 lines, calibration bands 5-99%, HP wounded reduction instruction, coin-flip fallback |
| `backend/src/engine/prompt-assembler.ts` | CRITICAL OUTPUT RULES, COMBAT HP TRACKING, world consistency | VERIFIED | SYSTEM_RULES block with all 13-01/02/03 tunings: output rules, outcome fidelity, NPC presence, HP tracking, duplicate items, transfer_item, quick actions mandatory |
| `backend/src/engine/turn-processor.ts` | OUTCOME_INSTRUCTIONS with examples, stepCountIs(3), sanitizeNarrative, HP in scene | VERIFIED | 389 lines; all claimed features present and wired |
| `backend/src/engine/npc-agent.ts` | temperature 0.3, action bias language | VERIFIED | temperature: 0.3, mandatory action prompt present |
| `backend/src/engine/tool-schemas.ts` | offer_quick_actions mandatory, set_condition damage scale | VERIFIED | Both tool descriptions include mandatory language and damage scale |
| `backend/src/campaign/manager.ts` | currentTick returned from readCampaignConfig | VERIFIED | Tick bug fix present, incrementTick function functional |
| `backend/src/engine/world-engine.ts` | interval=5, specific observable action requirement | VERIFIED | Default interval=5, vague action prohibition present |
| `backend/src/engine/reflection-agent.ts` | REFLECTION_THRESHOLD = 10 | VERIFIED | Exported constant at line 23, used in SQL filter |
| `backend/src/engine/npc-offscreen.ts` | interval=5, specific action requirement | VERIFIED | Default interval=5, specific action requirement present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `turn-processor.ts` | `oracle.ts` | `callOracle()` + HP injection | VERIFIED | `sceneContext` built with HP, passed to `callOracle`, Oracle system prompt processes HP |
| `turn-processor.ts` | `prompt-assembler.ts` | `assemblePrompt()` + OUTCOME_INSTRUCTIONS | VERIFIED | Oracle result passed to `assemblePrompt`, outcome used to select from OUTCOME_INSTRUCTIONS, appended to systemPrompt |
| `turn-processor.ts` | `tool-schemas.ts` | `createStorytellerTools(campaignId, currentTick)` | VERIFIED | Tools created per-turn with currentTick from fixed `readCampaignConfig` |
| `campaign/manager.ts` | `turn-processor.ts` | `readCampaignConfig()` call | VERIFIED | `readCampaignConfig` called at line 292, currentTick used at line 293-296 |
| `npc-agent.ts` | world engine cycle | Called by `npc-ticks.ts` post-turn | INFERRED | Not directly verified (npc-ticks.ts not read), but declared in 13-02 summary as working |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| Oracle calibration | 13-01-PLAN | Probability ranges prevent over-generosity | SATISFIED | oracle.ts calibration bands + anti-default language |
| CRITICAL OUTPUT RULES | 13-01-PLAN | Prevent metadata echo | SATISFIED | prompt-assembler.ts + sanitizeNarrative in turn-processor.ts |
| Outcome fidelity | 13-01-PLAN | miss=failure, strong_hit=success | SATISFIED | OUTCOME_INSTRUCTIONS with "NEVER narrate NPC as intrigued on miss" |
| NPC autonomy | 13-01/02-PLAN | NPCs take actions autonomously | SATISFIED (code) | npc-agent.ts temperature 0.3 + action bias; quality confirmed in playtest |
| IP terminology | 13-01-PLAN | Use world-specific vocabulary | SATISFIED | SYSTEM_RULES references [WORLD PREMISE] and [LORE CONTEXT] |
| Tick bug fix | 13-02-PLAN | currentTick stuck at 1 | SATISFIED | manager.ts fix verified; faction ticks confirmed in playtest |
| Faction ticks interval=5 | 13-02-PLAN | More frequent world simulation | SATISFIED | world-engine.ts default interval=5 |
| NPC reflection threshold=10 | 13-02-PLAN | Responsive belief updates | SATISFIED | reflection-agent.ts REFLECTION_THRESHOLD = 10 |
| COMBAT HP TRACKING | 13-03-PLAN | set_condition on every damage event | SATISFIED | tool-schemas.ts + SYSTEM_RULES COMBAT HP TRACKING block + OUTCOME_INSTRUCTIONS |
| Oracle HP factor | 13-03-PLAN | Wounded state reduces probability | SATISFIED | oracle.ts HP reduction instruction + turn-processor.ts HP injection |
| Contextual death narration | 13-03-PLAN | Non-lethal KO vs lethal death | SATISFIED | prompt-assembler.ts split narration rules |
| Auto-checkpoint at HP<=2 | 13-03-PLAN | Checkpoint triggers at danger | NEEDS HUMAN | Playtest verified triggering; requires live session to confirm ongoing |
| Checkpoint save/load | 13-03-PLAN | Mid-session checkpoint restore | NEEDS HUMAN | Playtest verified working; no code changes were needed |
| Gameplay quality 4.5+/5 | 13-03-PLAN | Post-fix average quality target | NEEDS HUMAN | Playtest showed 4.6/5 post-fix for 13-03; requires live validation |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| `backend/src/engine/npc-offscreen.ts` | N/A | Known pre-existing LanceDB vector field bug | Info | Episodic events stored with empty vector; does not block gameplay |
| `turn-processor.ts` | 335 | Metadata leak truncation sends prior deltas, can't retract them | Warning | If leak starts mid-sentence, partial corrupted text may reach client |

**No blocker anti-patterns found.** All engine code is substantive and wired.

### Human Verification Required

#### 1. Combat HP Tracking (Post-Fix Validation)

**Test:** Start a new combat-focused campaign. Play 5 turns in a fight. Inspect game state after each turn.
**Expected:** HP decreases on damage turns (set_condition called), Oracle gives lower probability when HP is low (check oracle_result event), HP=0 in pit fight shows knockout narration not death
**Why human:** Requires live LLM session with actual combat scenario

#### 2. NPC Autonomous Actions

**Test:** Start a campaign with Key NPCs present in the same location. Play 6+ turns without interacting with NPCs.
**Expected:** At least 2/6 turns show NPC-initiated actions (move, speak, attack, use item). NPC actions reference their goals from world scaffold.
**Why human:** NPC tick behavior is LLM-dependent with temperature 0.3 — correct prompt structure is verified, actual behavior requires live session

#### 3. Faction World Simulation

**Test:** Play a campaign to tick 5 and tick 10. Check chronicle entries.
**Expected:** Faction events appear in chronicle at ticks 5 and 10 with specific observable changes (territory control, NPC effects, location changes)
**Why human:** Faction tick timing and action quality verified once in 13-02 playtest; requires ongoing validation

#### 4. LanceDB Episodic Memory (Pre-Existing Bug)

**Test:** Play 3 turns and inspect the LanceDB vectors directory for the campaign.
**Expected:** Episodic events stored with valid vector embeddings. Error: "Failed to infer data type for field vector" should not appear in logs.
**Why human:** Pre-existing bug from before Phase 13. Not fixed in this phase. Requires investigation of LanceDB schema for episodic events table.

#### 5. Quick Actions Consistency

**Test:** Play 10 turns of varied actions (combat, social, exploration).
**Expected:** offer_quick_actions called after every narration (100%). Current rate with Gemini Flash: ~80%.
**Why human:** Model-level limitation confirmed — all prompt reinforcement applied (mandatory language in tool description, SYSTEM_RULES, OUTCOME_INSTRUCTIONS). Improvement expected with higher-tier models.

### Gaps Summary

No code gaps found. All 16 must-have truths are verified in the actual codebase. The SUMMARY.md claims match the code.

The phase goal states "All AI systems produce quality 4.5+/5" — this target was measured via live playtest sessions and achieved in 13-03 (4.6/5 post-fix). The code changes that enabled this quality are all verified present. Human verification is flagged for ongoing confirmation, not because the fixes are absent.

**Known remaining issues (documented, not blocking):**
1. Quick actions consistency ~80% (Gemini Flash model limitation — all prompt engineering applied)
2. Oracle coin-flip fallback triggered 2/27 turns in 13-02 (OpenRouter/Gemini Flash reliability, not engine bug)
3. LanceDB episodic event storage fails silently (pre-existing bug, not Phase 13 scope)

---

_Verified: 2026-03-20T00:30:00Z_
_Verifier: Claude (gsd-verifier)_
