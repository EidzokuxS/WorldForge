# Reference Research: Marinara GM Flow

## Decision To Support

Improve WorldForge's play feel and interface flow by studying Marinara Engine's Game/GM mode as a presentation reference, not as a technical architecture to copy.

The target question: why does Marinara feel like a lightweight visual-novel solo RPG even with weaker consistency/tracking, and which design functions should WorldForge adopt while preserving its stronger authoritative backend?

## Search Scope And Assumptions

Sources inspected:

- Official repository and screenshots at commit `0b7e03c6890adedf1dc6b5ff33b7671ce2979758`.
- `README.md`, `docs/FRONTEND.md`, chat mode definitions, GM/party prompts, game UI components, time/weather services, direction/scene analyzer, and screenshots.
- This is a flow/presentation read. I am intentionally not recommending Marinara's state model as-is.

## Reference Matrix

| Source | System | Observed Pattern | Inferred Design Function | Evidence | Risk/Trade-Off | Applicability To WorldForge |
|---|---|---|---|---|---|---|
| Marinara README/screenshots | Game Mode | Full-bleed scene image, weather overlay, bottom narration box, party chips, small floating widgets, map and character panels around the scene. | Makes the user feel located in a scene before they parse mechanics. The screen says "you are here", not "here is a database". | README advertises Game Mode as AI GM + party + generated backgrounds + weather + time of day. Screenshot shows background first, UI second. | Can become pretty but shallow if underlying state lies. | High. WorldForge can use its stronger state to feed a scene-first shell. |
| Chat modes | Mode framing | Separate `visual_novel` mode and `game` mode. Game mode defaults to GM, party, world-state, quest, expression, combat agents. | The product makes a clear promise for each mode: conversation, RP, VN, or game. | `chat-modes.ts` explicitly defines Visual Novel as backgrounds/sprites/text boxes/choices and Game as AI-managed singleplayer RPG. | Too many modes can confuse users. | Medium. WorldForge probably does not need more modes yet, but it needs a stronger "playing" surface. |
| GameNarration | Text flow | Assistant output is parsed into `narration`, `dialogue`, `readable`, and `system` segments, then shown through a VN-style segmented box with Reveal/Next/Auto-play. | Reading becomes paced interaction. The player consumes one beat, then acts when the scene hands control back. | Component is literally labeled "VN-style segmented box"; it gates input until narration segments are read. | Over-segmentation can slow down users who want fast scanning. Needs skip/history. | Very high. WorldForge currently streams a scroll-log; it needs a presentation timeline over the canonical chat history. |
| GM prompt format | Output contract | GM is told to output short narration beats, separate dialogue lines, commands for choices/map/inventory/state/reputation/session end, and not simply ask "what next". | The model knows which text becomes visible prose, which text becomes UI/state, and when control returns. | `gm-prompts.ts` places current state and output format close to generation. | Tag formats are brittle if used as authority. | High, but with WorldForge twist: backend should emit/display semantic events, not trust raw tags as authority. |
| Party prompt | Character presentation | Party members have line types: main, side, action, thought, whisper, all with expression tags. | Characters enter through behavior and reaction, not through list membership. Side remarks make the scene feel populated without derailing the main beat. | `party-prompts.ts` defines main/side/action/thought/whisper syntax and expression usage. | Can become noisy or omniscient if not bounded by presence. | High. WorldForge's fresh presence-scope work can make this safer than Marinara. |
| Time/weather services | Ambience progression | Time advances by action type; weather is generated/changed from biome/season tables. | The world moves even when no major plot event happens. Small changes make turns feel lived-in. | `time.service.ts` maps actions to minutes; `weather.service.ts` changes weather by action/biome. | If too deterministic or too random, ambience becomes meaningless. | High. WorldForge already has ticks and locations; add display-facing time/weather/ambience state. |
| Scene analyzer + DirectionEngine | Per-beat direction | A sidecar analyzes completed narration and chooses background, weather, SFX, cinematic direction effects, and per-beat background changes. | Presentation is decoupled from core narration: the scene can fade, shake, zoom, play SFX, or change image without the GM stuffing UI details into prose. | Scene analyzer asks for setting/per-beat effects; DirectionEngine renders crossfades/effects. | Model-selected effects can overfire; needs rate limits and skip button. | High. WorldForge can compute/LLM-assist "presentation events" after authoritative turn settlement. |
| AnimatedText / ReadableDisplay | Text tactility | Animated emphasis for dramatic words/tags; notes/books open as stylized overlays. | Important words and artifacts feel physical. Reading a note is not just another paragraph in the log. | AnimatedText supports explicit and heuristic effects; ReadableDisplay has note/book overlays. | Can look gimmicky if everything animates. | Medium-high. Use sparingly for magic, impact, whispers, written artifacts. |
| GameInput | Input cadence | Input sits inside/under the narration surface, with address modes for scene/party/GM, dice queue, pending movement, and "What do you do?" prompt. | The player acts from inside the current beat. Addressing party/GM becomes an explicit play mode, not hidden syntax. | `GameInput.tsx` has scene/party/GM address mode, queued dice, pending movement label, and "What do you do?" placeholder. | More controls can overwhelm if always visible. | Medium. WorldForge should hide advanced modes behind compact controls. |

## What This Explains

Marinara feels pleasant because the primary loop is not "send message, get wall of text". It is:

1. The screen establishes a place.
2. The GM delivers one or more readable beats.
3. Characters appear as named, voiced, visually distinct reactions.
4. Small ambience changes imply time is passing.
5. The player is handed control in the same visual space where they were reading.

WorldForge has the opposite strength profile right now. It has stronger canonical state, presence boundaries, rollback, inventory authority, lore/context, and adjudication. But the play surface still feels like a debug console: side panels, oracle math, support-action labels, scene-settling text, and a scrollback log have nearly equal visual weight with the story itself.

So the issue is not only "make UI prettier". The issue is that WorldForge does not yet have a strong presentation layer that transforms authoritative runtime events into a playable scene.

## Design Principles Extracted

1. Scene first, tools second.
   The first visual read should be the current place and active beat. Panels are secondary overlays/drawers, not equal columns competing with narration.

2. Pace prose as beats, not logs.
   Keep the authoritative chat history, but render the latest assistant turn as a segmented VN-style presentation: narration, dialogue, side remark, artifact, mechanical cue, player-control handoff.

3. Introduce characters through behavior.
   "People Here" is useful as data, but the player should meet characters through speech, interruption, movement, expression, and targeted reaction. A character card can be opened after interest exists.

4. Make mechanics diegetic by default.
   Oracle math should exist, but the default surface should say "Close call", "Clean success", or "Bad break" with a collapsible detail view. The raw chance/roll panel should not be the first emotional beat.

5. Treat time/weather/ambience as a channel.
   A turn can matter because the light changes, rain starts, a crowd thins, or a location grows quieter. This should be display state, not prose-only filler.

6. Use presentation events after authority settles.
   WorldForge should not let LLM tags become authority. The backend resolves truth; then a presentation pass maps truth + narration into safe display events: background, tint, SFX, character focus, text effect, note overlay.

7. Do not copy Marinara's weak spots.
   Marinara's pleasant flow does not solve consistency. WorldForge should copy the game-feel function, not the loose tracking model.

## Recommendation For WorldForge

Create a future phase/spike for a "scene-first play surface". The implementation should be small, testable, and layered over current authoritative state.

Recommended slices:

1. DisplayBeat model
   Add a frontend-only or API-provided presentation model:
   `narration`, `dialogue`, `side_remark`, `mechanical_result`, `state_change`, `readable`, `choice`, `input_handoff`.
   This is display, not authority.

2. Latest-turn VN reader
   Render only the newest assistant turn as beat cards with Reveal/Next/Skip/History. Keep full scroll history in a drawer.

3. Scene-first shell
   Replace the equal three-column feel with a central scene viewport: background/location art or generated fallback, current scene title, present actor strip, bottom narration/input box, collapsible side panels.

4. Character focus layer
   Show active clear actors as portrait chips. Highlight the current speaker. Side/hint actors should not become interactable unless presence scope says so.

5. Diegetic mechanics
   Convert `oracle_result`, movement, inventory, and state updates into compact presentation beats. Raw detail remains one click away.

6. Ambient state
   Add display-facing time of day, weather/tint, and location mood. Start deterministic: derive from tick/location/action class. LLM can embellish later but should not own truth.

7. Quick actions as choices
   Rename/present quick actions as player-facing choice cards only after narration handoff. "Support Actions / unlocks after authoritative turn completion" is implementation language, not player language.

8. Artifact overlays
   Notes/books/messages should open as styled readables instead of ordinary log paragraphs.

## Risks Of Copying Blindly

- Full-bleed visuals can make a weak system look better without making it play better.
- Tag-driven GM output can leak syntax and become another Zod-style fragility point.
- Too much animation can make reading worse.
- Always-visible stats and widgets can become noise if they do not answer "what matters right now?"
- Party side remarks are excellent only when presence and knowledge boundaries are enforced.

## Follow-Up Tests

1. Five-second read test:
   Can a user identify where they are, who is immediately present, what just changed, and what they can do next?

2. Ten-turn playtest:
   Compare current UI vs VN-reader prototype on perceived agency, readability, and confusion.

3. Mechanical visibility test:
   A player should understand success/failure consequences without seeing raw oracle math, but raw math must remain available.

4. Presence test:
   A character in the same broad district but not the same scene must not appear as a speaker/target/portrait chip.

5. Pace test:
   Latest turn should be readable as 1-5 beats. Anything larger needs automatic split/summary controls.

## Sources

- Marinara Engine official repository: https://github.com/Pasta-Devs/Marinara-Engine
- README Game Mode screenshots/features: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/README.md#L72-L83
- README modes/features: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/README.md#L137-L145
- Chat mode definitions: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/shared/src/constants/chat-modes.ts#L30-L42
- Frontend agent/mode docs: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/docs/FRONTEND.md#L576-L646
- GM prompt format and commands: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/server/src/services/game/gm-prompts.ts#L470-L558
- Game setup prompt/world blueprint: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/server/src/services/game/gm-prompts.ts#L698-L822
- VN narration component: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/client/src/components/game/GameNarration.tsx#L2-L179
- Segment parser: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/client/src/components/game/GameNarration.tsx#L3752-L3800
- Time/weather services: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/server/src/services/game/time.service.ts#L2-L66 and https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/server/src/services/game/weather.service.ts#L2-L209
- Scene analyzer and direction engine: https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/server/src/services/sidecar/scene-analyzer.ts#L177-L209 and https://github.com/Pasta-Devs/Marinara-Engine/blob/0b7e03c6890adedf1dc6b5ff33b7671ce2979758/packages/client/src/components/game/DirectionEngine.tsx#L2-L87
