# Phase 77 Visual QA Evidence

## P77-R7

**Mode:** agent-run browser screenshot loop with Playwright using installed system Chrome. PinchTab was not required because browser screenshot evidence was captured directly.
**URL:** `http://localhost:3000/game`
**Campaign:** `d1e30fe5-60c0-42f4-abb3-2c42a17c954e`
**Read:** dark scene-first game/VN surface, not a document, SaaS dashboard, paper reader, or debug cockpit.

## Screenshot Evidence

| Viewport | Screenshot | Result | Notes |
|---|---|---|---|
| 2560x1440 | `screenshots/game-2560x1440.png` | PASS | Wide scene zones contain Scene/Status and People visible widgets; no dead admin sidebars. |
| 1920x1080 | `screenshots/game-1920x1080.png` | PASS | Scene backdrop, lower narration dock, action dock, and compact rail remain visible. |
| 1728x1117 | `screenshots/game-1728x1117.png` | PASS | Layout preserves scene-first hierarchy and bottom input. |
| 1440x900 | `screenshots/game-1440x900.png` | PASS | Lower-bound desktop keeps dock/action controls reachable. |
| 1366x768 | `screenshots/game-1366x768.png` | PASS | Laptop lower bound keeps current beat and Continue visible. |
| 390x844 | `screenshots/game-390x844.png` | PASS | Mobile stack keeps scene, rail, narration, action, and Continue without overlap. |
| 360x740 | `screenshots/game-360x740.png` | PASS | Stress mobile hides duplicate backdrop title and avoids rail/narration/action overlap. |

## Rejection Checks

| Check | Result | Evidence |
|---|---|---|
| No white/cream/parchment/tan paper dominance | PASS | Screenshots remain dark neutral with controlled blood accent. |
| No long prose column as default shape | PASS | Prose is inside `NarrationDock`; scene backdrop remains first viewport context. |
| No permanent Location/Character/Lore/Oracle sidebars | PASS | Widget rail and drawers are compact/closed by default. |
| No raw debug labels by default | PASS | Browser text scan found no `Chance`, `Roll`, `Raw reasoning`, `JSON`, `payload`, `scene-settling`, or `Support Actions`. |
| No mobile control overlap | PASS | Final screenshot pass found widget rail does not overlap `NarrationDock` or `ActionDock`. |
| Wide desktop side bands | PASS | 2560x1440 has stage widgets and scene composition rather than empty admin columns. |

## Browser Interaction Checks

| Control | Result | Evidence |
|---|---|---|
| Next | PASS | Scoped `NarrationDock` click did not call `/api/chat/action`. |
| Auto | PASS | Scoped `NarrationDock` click did not call `/api/chat/action`. |
| Log | PASS | Opened drawer locally; action route count stayed `0`. |
| Continue | PASS | Intercepted backend turn payload: `playerAction: "Continue scene."`. |
| Send | PASS | Intercepted backend turn payload: `playerAction: "Browser QA freeform action"`. |

## Patch Loop

1. Initial mobile screenshots failed: the widget rail overlapped narration/action space at narrow widths.
2. Patched `SceneBackdrop`, `GameSceneShell`, and `WidgetRail` with a smaller mobile rail, tiny-viewport title suppression, and non-overlapping rail placement.
3. Re-ran screenshots at all required viewports.
4. Verified the final 360x740 screenshot has `widgetOverlapsNarration: false` and `widgetOverlapsActionDock: false`.

## Residual Risks

- The screenshot campaign has no clearly visible actor in the current scene, so the default screenshot shows `People visible: 0` plus off-screen anchors. Actor interaction is covered by deterministic P77-R8 playtest evidence.
- This visual QA does not claim live provider writing quality; it verifies the responsive play surface, disclosure hierarchy, and route semantics.
