# Phase 82 Research - Dynamic Scene Tools And Agent Harness

## Codebase Findings

Read-only code exploration found that WorldForge already has partial dynamic-scene support:

- Location kinds include `macro`, `persistent_sublocation`, and `ephemeral_scene`.
- Locations already carry `parentLocationId`, `anchorLocationId`, `persistence`, `expiresAtTick`, and `archivedAtTick`.
- Runtime presence already separates broad location from current scene using `currentLocationId` plus `currentSceneLocationId/currentSceneScopeId`.
- `reveal_location` inserts `kind: "ephemeral_scene"` and anchors it, but does not set expiry/archive lifecycle.
- `spawn_npc` inserts `tier: "temporary"`, but support/temporary NPCs do not have an implemented retirement lifecycle.
- There is a likely broad/current-scene mismatch risk when spawning into a sublocation current scene.
- `location-graph` already skips expired/archived ephemeral nodes when those fields are set.
- `location-events` already supports anchored spillover for archived ephemeral scenes.

The main opportunity is not inventing a new system. It is wiring the existing schema and runtime seams into a clear GM tool contract with lifecycle.

## External Agent Harness Findings

Public docs and analysis converge on the same pattern:

- Claude Code describes an agent loop as gather context, take action, verify results, with each tool result feeding the next decision.
- The VILA-Lab Claude Code analysis argues most agent engineering is deterministic infrastructure around the model: permissions, context management, tool routing, recovery, and persistence.
- Hermes Agent documents a loop that sends messages plus tool schemas, dispatches tool calls, appends tool results, and repeats until no tool call remains. It also exposes callbacks for thinking, tool progress, reasoning, generated tool preview, and status.
- Hermes Loop frames agent runs as queryable transactions: prompts, raw responses, tool calls, approvals, memory injections, and receipts are rows, not vibes.
- MCP tools model a small `inputSchema`, structured tool results, tool annotations, progress notifications, and tool-originated errors returned as tool results.

Phase 82 should use those patterns without copying leaked/proprietary code. The user-provided leaked-source mirrors are treated as context for why real agents feel usable, not as implementation sources.

## Target Pattern

Use a sequential mutation loop:

1. GM chooses the next small tool action from a bounded local affordance list.
2. Backend validates the tool, refs, side effects, and current state version.
3. Backend executes or rejects deterministically.
4. Runtime returns a compact observation: `ok`, `tool`, `stateVersion`, `createdRefs`, `diff`, `warnings`, `nextAllowedTools`, `failureReason`.
5. GM continues only if another checklist item still needs execution.

Read-only retrieval can be parallel later. Mutating gameplay tools should remain sequential.

## Design Implications

- Tool descriptions should say when *not* to use dynamic creation.
- Ephemeral scene creation should be anchored to the current local scene/broad location and have a default lifetime.
- Support NPCs should have a lifecycle and provenance so they can retire naturally.
- Promotion is a deliberate tool/transition, not accidental persistence.
- Tool loop control should use semantic budgets: max mutating steps, repeated equivalent calls, max revisions, max new transient entities, and unresolved failure fallback.
- Progress UI should show stages, not deadlines.

## Sources

- Claude Code overview and agent loop: https://code.claude.com/docs/en/how-claude-code-works
- Claude Code overview: https://code.claude.com/docs/en/overview
- VILA-Lab Dive into Claude Code: https://github.com/VILA-Lab/Dive-into-Claude-Code
- Hermes Agent loop internals: https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop/
- Hermes Agent environments/tool parsers: https://hermes-agent.nousresearch.com/docs/developer-guide/environments/
- Hermes Loop architecture notes: https://www.hermesloop.cc/about
- MCP tools specification: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP progress utility: https://modelcontextprotocol.io/specification/2024-11-05/basic/utilities/progress

## Research Verdict

GO. The schema and runtime already have enough pieces for a high-leverage implementation. The phase should avoid provider-native tool-calling rewrites unless needed; the important product fix is small validated tools, structured observations, lifecycle, and live play proof.
