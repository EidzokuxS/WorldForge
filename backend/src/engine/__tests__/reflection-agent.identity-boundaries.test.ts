import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Identity boundaries tests: verify that reflection-agent, reflection-tools,
 * and npc-agent source files contain no continuity/inertia/grounding references.
 * These fields were removed as part of the Phase 57 character profile redesign.
 */

const ENGINE_DIR = path.resolve(__dirname, "..");

const FILES_TO_CHECK = [
  "reflection-agent.ts",
  "reflection-tools.ts",
  "npc-agent.ts",
  "prompt-assembler.ts",
];

const FORBIDDEN_PATTERNS = [
  "CharacterContinuityPolicy",
  "CharacterGroundingProfile",
  "CharacterSourceBundle",
  "identityInertia",
  "protectedCore",
  "mutableSurface",
  "changePressureNotes",
  "grounding.summary",
  "grounding.powerProfile",
  "grounding.facts",
  "grounding.abilities",
];

describe("identity boundaries - no continuity/grounding references", () => {
  for (const file of FILES_TO_CHECK) {
    describe(file, () => {
      const filePath = path.join(ENGINE_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        it(`does not contain "${pattern}"`, () => {
          expect(content).not.toContain(pattern);
        });
      }
    });
  }
});

describe("reflection-tools uses flat threshold", () => {
  const reflectionToolsPath = path.join(ENGINE_DIR, "reflection-tools.ts");
  const content = fs.readFileSync(reflectionToolsPath, "utf-8");

  it("does not contain tier-based threshold branching", () => {
    // No branching based on key/supporting/temporary for threshold values
    expect(content).not.toMatch(/threshold.*key.*supporting.*temporary/i);
    expect(content).not.toMatch(/minimumEvidenceForPromotion/i);
  });

  it("does not reference identity inertia for evidence thresholds", () => {
    expect(content).not.toContain("identityInertia");
    expect(content).not.toContain("inertia");
  });
});

describe("reflection-agent uses flat REFLECTION_THRESHOLD constant", () => {
  const agentPath = path.join(ENGINE_DIR, "reflection-agent.ts");
  const content = fs.readFileSync(agentPath, "utf-8");

  it("exports a constant REFLECTION_THRESHOLD", () => {
    expect(content).toContain("REFLECTION_THRESHOLD");
    // Should be a simple numeric constant, not tier-dependent
    expect(content).toMatch(/REFLECTION_THRESHOLD\s*=\s*\d+/);
  });
});
