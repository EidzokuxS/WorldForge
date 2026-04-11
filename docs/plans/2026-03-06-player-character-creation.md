# Player Character Creation — Implementation Plan

> **Historical note**
> This plan is retained as design history and is **superseded** as a live gameplay baseline. For current runtime truth, use `docs/mechanics.md` and `docs/memory.md`.
>
> It predates the canonical `CharacterRecord` contract, structured `startConditions`, bounded opening-state runtime effects, and the still-open Phase 38 inventory/equipment authority seam. Read it as historical implementation context, not current product authority.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a character creation page where users describe a character in free text, have AI parse it into structured data, edit the result, and proceed to the game.

**Architecture:** New `/character-creation` page between World Review and Game. Backend endpoint uses Generator role to parse free-text into structured player data (name, tags, hp, equipped items, starting location). Player row saved to SQLite `players` table. Frontend holds parsed character in editable state, saves on "Begin Adventure".

**Tech Stack:** Hono + Zod (backend), Next.js + Shadcn UI (frontend), Vercel AI SDK `generateObject()`, Drizzle ORM

---

## Shared Context

**DB players table** (`backend/src/db/schema.ts:37-54`):
```ts
players: { id, campaignId, name, hp (0-5), tags (JSON string[]), equippedItems (JSON string[]), currentLocationId }
```

**Generator role pattern** — used via `generateObject()` with Zod schema, `createModel(role.provider)`, temperature from role config.

**Route pattern** — Hono with `parseBody()` for Zod validation, outer try/catch, `getErrorMessage()`/`getErrorStatus()`.

**Frontend API pattern** — `apiPost<T>()` / `apiGet<T>()` with typed responses.

---

### Task 1: Shared Player Types

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`

**Step 1: Add types to shared/src/types.ts**

Append after `CampaignMeta` interface:

```ts
export interface PlayerCharacter {
  name: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}
```

**Step 2: Re-export from shared/src/index.ts**

Add `PlayerCharacter` to the type export list from `"./types.js"`.

**Step 3: Verify**

Run: `npm --prefix backend run typecheck`
Expected: PASS (no consumers yet)

**Step 4: Commit**

```bash
git add shared/
git commit -m "feat: add PlayerCharacter shared type"
```

---

### Task 2: Backend — Parse Character Endpoint

**Files:**
- Modify: `backend/src/routes/schemas.ts`
- Create: `backend/src/character/generator.ts`
- Modify: `backend/src/routes/worldgen.ts`

**Step 1: Add Zod schemas to `backend/src/routes/schemas.ts`**

Append after `saveEditsSchema`:

```ts
export const parseCharacterSchema = z.object({
  campaignId: z.string().min(1),
  description: z.string().min(1, "Character description is required."),
});

export const generateCharacterSchema = z.object({
  campaignId: z.string().min(1),
});

export const saveCharacterSchema = z.object({
  campaignId: z.string().min(1),
  character: z.object({
    name: z.string().min(1),
    tags: z.array(z.string()),
    hp: z.number().int().min(1).max(5),
    equippedItems: z.array(z.string()),
    locationName: z.string().min(1),
  }),
});
```

**Step 2: Create `backend/src/character/generator.ts`**

```ts
import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";

const characterSchema = z.object({
  name: z.string().describe("Character's full name"),
  tags: z
    .array(z.string())
    .min(3)
    .max(12)
    .describe(
      "Character tags covering traits, skills, flaws, background. " +
      "Examples: [Charismatic], [Veteran Soldier], [Limping], [Noble-born], [Pickpocket], [Cowardly]"
    ),
  hp: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Hit points 1-5. 5=peak health, 3=average, 1=frail/wounded"),
  equippedItems: z
    .array(z.string())
    .max(6)
    .describe("Starting items the character carries. 0-6 items."),
  locationName: z
    .string()
    .describe("Name of the starting location from KNOWN LOCATIONS that best fits this character"),
});

export type ParsedCharacter = z.infer<typeof characterSchema>;

export async function parseCharacterDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are parsing a player's character description into structured RPG data.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

PLAYER'S CHARACTER DESCRIPTION:
${opts.description}

REQUIREMENTS:
- Extract or infer a name from the description. If none given, create a fitting one.
- Tags should cover: personality traits, skills/abilities, flaws/weaknesses, background/occupation.
- Use the tag-only system: no numeric stats except HP (1-5).
- HP reflects physical condition: 5=peak, 3=average, 1=frail or wounded.
- equippedItems: items the character would realistically carry based on description.
- locationName MUST be one of KNOWN LOCATIONS — pick the most fitting one.
- Keep tags evocative and concise: [Master Thief], not [Is good at stealing things].`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return result.object;
}

export async function generateCharacter(opts: {
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<ParsedCharacter> {
  const prompt = `You are creating a player character for a text RPG.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS:
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS:
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

REQUIREMENTS:
- Create an interesting, flawed protagonist who fits this world.
- The character should have clear motivations and a reason to explore.
- Tags should cover: personality, skills, flaws, background (6-10 tags total).
- HP: 4-5 (new adventure, healthy).
- equippedItems: 2-4 items fitting the character's background.
- locationName MUST be one of KNOWN LOCATIONS.
- Make the character compelling but not overpowered — flaws create good stories.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: characterSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return result.object;
}
```

**Step 3: Add character routes to `backend/src/routes/worldgen.ts`**

Add imports:
```ts
import { parseCharacterDescription, generateCharacter } from "../character/generator.js";
import {
  // ... existing imports ...
  parseCharacterSchema,
  generateCharacterSchema,
  saveCharacterSchema,
} from "./schemas.js";
import { players } from "../db/schema.js";
import { getDb } from "../db/index.js";
import { eq } from "drizzle-orm";
```

Add three endpoints before `export default app`:

```ts
app.post("/parse-character", async (c) => {
  try {
    const result = await parseBody(c, parseCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, description } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const db = getDb();
    const locationNames = db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    const character = await parseCharacterDescription({
      description,
      premise: campaign.premise,
      locationNames,
      role: gen.resolved,
    });

    return c.json(character);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to parse character.") },
      getErrorStatus(error)
    );
  }
});

app.post("/generate-character", async (c) => {
  try {
    const result = await parseBody(c, generateCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const db = getDb();
    const locationNames = db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    const factionNames = db
      .select({ name: factions.name })
      .from(factions)
      .where(eq(factions.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    const character = await generateCharacter({
      premise: campaign.premise,
      locationNames,
      factionNames,
      role: gen.resolved,
    });

    return c.json(character);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to generate character.") },
      getErrorStatus(error)
    );
  }
});

app.post("/save-character", async (c) => {
  try {
    const result = await parseBody(c, saveCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, character } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const db = getDb();

    // Resolve locationName → locationId
    const location = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .find((l) => {
        const loc = db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, l.id))
          .get();
        return loc?.name === character.locationName;
      });

    // Simpler: query by name
    const locationRow = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();

    // Actually, let's just do it properly:
    const allLocations = db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const matchedLocation = allLocations.find((l) => l.name === character.locationName);

    // Delete existing player for this campaign (single player game)
    db.delete(players).where(eq(players.campaignId, campaignId)).run();

    const playerId = crypto.randomUUID();
    db.insert(players)
      .values({
        id: playerId,
        campaignId,
        name: character.name,
        hp: character.hp,
        tags: JSON.stringify(character.tags),
        equippedItems: JSON.stringify(character.equippedItems),
        currentLocationId: matchedLocation?.id ?? null,
      })
      .run();

    return c.json({ ok: true, playerId });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save character.") },
      getErrorStatus(error)
    );
  }
});
```

**Note for implementer:** The `save-character` endpoint above has redundant location queries — clean it up. Only need one query: get all locations for campaign, find by name. Also need to import `locations`, `factions`, `players` from schema and `eq` from drizzle-orm.

**Step 4: Verify**

Run: `npm --prefix backend run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/character/ backend/src/routes/
git commit -m "feat: add character parse/generate/save endpoints"
```

---

### Task 3: Frontend API Functions

**Files:**
- Modify: `frontend/lib/api.ts`

**Step 1: Add types and API functions**

Append after the `saveWorldEdits` function:

```ts
// ───── Character Creation ─────

export interface ParsedCharacter {
  name: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

export function parseCharacter(
  campaignId: string,
  description: string
): Promise<ParsedCharacter> {
  return apiPost<ParsedCharacter>("/api/worldgen/parse-character", {
    campaignId,
    description,
  });
}

export function generateCharacter(
  campaignId: string
): Promise<ParsedCharacter> {
  return apiPost<ParsedCharacter>("/api/worldgen/generate-character", {
    campaignId,
  });
}

export function saveCharacter(
  campaignId: string,
  character: ParsedCharacter
): Promise<{ ok: boolean; playerId: string }> {
  return apiPost<{ ok: boolean; playerId: string }>(
    "/api/worldgen/save-character",
    { campaignId, character }
  );
}
```

**Step 2: Verify**

Run: `npm --prefix frontend run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add character creation API functions"
```

---

### Task 4: Character Creation Page

**Files:**
- Create: `frontend/app/character-creation/page.tsx`
- Create: `frontend/components/character-creation/character-form.tsx`
- Create: `frontend/components/character-creation/character-card.tsx`

**Step 1: Create `frontend/components/character-creation/character-card.tsx`**

Editable card showing parsed character data. Fields:
- **Name** — text input
- **Tags** — reuse `TagEditor` from world-review
- **HP** — number slider or select (1-5), visualized as hearts
- **Equipped Items** — reuse `StringListEditor` from world-review
- **Starting Location** — select dropdown from available locations

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagEditor } from "@/components/world-review/tag-editor";
import { StringListEditor } from "@/components/world-review/string-list-editor";
import type { ParsedCharacter } from "@/lib/api";

interface CharacterCardProps {
  character: ParsedCharacter;
  locationNames: string[];
  onChange: (character: ParsedCharacter) => void;
}

const HP_OPTIONS = [1, 2, 3, 4, 5];

export function CharacterCard({
  character,
  locationNames,
  onChange,
}: CharacterCardProps) {
  function update(patch: Partial<ParsedCharacter>) {
    onChange({ ...character, ...patch });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input
          value={character.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Character name"
          className="mt-1 font-serif text-lg font-bold"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Tags</Label>
        <p className="text-xs text-muted-foreground/70 mb-1">
          Traits, skills, flaws, background
        </p>
        <TagEditor
          tags={character.tags}
          onChange={(tags) => update({ tags })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">HP</Label>
          <div className="mt-1 flex items-center gap-1">
            {HP_OPTIONS.map((hp) => (
              <button
                key={hp}
                type="button"
                onClick={() => update({ hp })}
                className={`text-lg ${
                  hp <= character.hp
                    ? "text-red-500"
                    : "text-muted-foreground/30"
                }`}
              >
                &#9829;
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {character.hp}/5
            </span>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">
            Starting Location
          </Label>
          <Select
            value={character.locationName}
            onValueChange={(v) => update({ locationName: v })}
          >
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {locationNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Equipped Items</Label>
        <div className="mt-1">
          <StringListEditor
            items={character.equippedItems}
            onChange={(equippedItems) => update({ equippedItems })}
            placeholder="Add item..."
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create `frontend/components/character-creation/character-form.tsx`**

Free-text input with Parse / Generate buttons:

```tsx
"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CharacterFormProps {
  onParse: (description: string) => void;
  onGenerate: () => void;
  parsing: boolean;
  generating: boolean;
}

export function CharacterForm({
  onParse,
  onGenerate,
  parsing,
  generating,
}: CharacterFormProps) {
  const [description, setDescription] = useState("");
  const busy = parsing || generating;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium text-bone">
          Describe your character
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Write a free-text description — name, background, personality, skills,
          flaws, equipment. The AI will parse it into game stats.
        </p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="mt-2 resize-none"
          placeholder="A grizzled ex-soldier with a limp and a heart of gold. Carries a battered sword and a flask of cheap whiskey. Knows her way around a battlefield but can't resist a card game..."
          disabled={busy}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => onParse(description.trim())}
          disabled={busy || !description.trim()}
        >
          {parsing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Parse Character
            </>
          )}
        </Button>

        <Button variant="outline" onClick={onGenerate} disabled={busy}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              AI Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: Create `frontend/app/character-creation/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getActiveCampaign,
  getWorldData,
  parseCharacter,
  generateCharacter as apiGenerateCharacter,
  saveCharacter,
  type ParsedCharacter,
} from "@/lib/api";
import { CharacterForm } from "@/components/character-creation/character-form";
import { CharacterCard } from "@/components/character-creation/character-card";

export default function CharacterCreationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const campaignId = searchParams.get("campaignId");

  const [locationNames, setLocationNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [character, setCharacter] = useState<ParsedCharacter | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    async function loadData() {
      try {
        const [, world] = await Promise.all([
          getActiveCampaign(),
          getWorldData(campaignId!),
        ]);
        setLocationNames(world.locations.map((l) => l.name));
      } catch (error) {
        toast.error("Failed to load world data", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [campaignId]);

  const handleParse = useCallback(
    async (description: string) => {
      if (!campaignId) return;
      setParsing(true);
      try {
        const result = await parseCharacter(campaignId, description);
        setCharacter(result);
        toast.success("Character parsed");
      } catch (error) {
        toast.error("Failed to parse character", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setParsing(false);
      }
    },
    [campaignId]
  );

  const handleGenerate = useCallback(async () => {
    if (!campaignId) return;
    setGenerating(true);
    try {
      const result = await apiGenerateCharacter(campaignId);
      setCharacter(result);
      toast.success("Character generated");
    } catch (error) {
      toast.error("Failed to generate character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setGenerating(false);
    }
  }, [campaignId]);

  const handleSave = useCallback(async () => {
    if (!campaignId || !character) return;
    setSaving(true);
    try {
      await saveCharacter(campaignId, character);
      toast.success("Character saved");
      router.push("/game");
    } catch (error) {
      toast.error("Failed to save character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }, [campaignId, character, router]);

  if (!campaignId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No campaign ID provided.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-bone">
          Create Your Character
        </h1>
        <p className="text-sm text-muted-foreground">
          Describe your character or let the AI create one for you
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-border/50 bg-card">
          <CardContent className="pt-6">
            <CharacterForm
              onParse={handleParse}
              onGenerate={handleGenerate}
              parsing={parsing}
              generating={generating}
            />
          </CardContent>
        </Card>

        {character && (
          <>
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="font-serif text-xl text-bone">
                  Your Character
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CharacterCard
                  character={character}
                  locationNames={locationNames}
                  onChange={setCharacter}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={handleSave}
                disabled={saving || !character.name.trim()}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Begin Adventure \u2192"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
```

**Step 4: Verify**

Run: `npm --prefix frontend run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/app/character-creation/ frontend/components/character-creation/
git commit -m "feat: add character creation page and components"
```

---

### Task 5: Update Redirects

**Files:**
- Modify: `frontend/app/world-review/page.tsx`

**Step 1: Update world-review save redirect**

Change line 204:
```ts
router.push("/game"); // TODO: change to /character-creation when Task 13.2 lands
```
To:
```ts
router.push(`/character-creation?campaignId=${campaignId}`);
```

**Step 2: Verify**

Run: `npm --prefix frontend run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/app/world-review/page.tsx
git commit -m "feat: redirect world-review to character-creation"
```

---

### Task 6: Backend Typecheck + Frontend Lint

Full verification pass.

**Step 1: Backend typecheck**

Run: `npm --prefix backend run typecheck`
Expected: PASS

**Step 2: Frontend lint**

Run: `npm --prefix frontend run lint`
Expected: PASS

**Step 3: Backend tests**

Run: `npm --prefix backend test`
Expected: All existing tests pass (no new tests for LLM-dependent endpoints)

**Step 4: Final commit if any fixes needed**

---

## Files to Create (3)
```
backend/src/character/generator.ts
frontend/app/character-creation/page.tsx
frontend/components/character-creation/character-form.tsx
frontend/components/character-creation/character-card.tsx
```

## Files to Modify (4)
```
shared/src/types.ts                — add PlayerCharacter type
shared/src/index.ts                — re-export PlayerCharacter
backend/src/routes/schemas.ts      — add parse/generate/save character schemas
backend/src/routes/worldgen.ts     — add 3 character endpoints
frontend/lib/api.ts                — add parseCharacter, generateCharacter, saveCharacter
frontend/app/world-review/page.tsx — redirect to /character-creation
```

## Key Design Decisions

- **Generator role, not Judge** — character parsing is creative work (inferring missing data, generating names). Generator fits better than Judge (which is for structured game-state decisions).
- **Single player** — `save-character` deletes existing player row before insert. One player per campaign.
- **No Regenerate button on card** — user can re-parse with edited description or use AI Generate. Simpler than regenerate-with-instruction pattern.
- **locationName, not locationId** — frontend works with names (same as world-review). Backend resolves to ID on save.
- **No new route file** — character endpoints go on `/api/worldgen/` since they're part of world setup flow. Could be split to `/api/character/` later if needed.
- **Reuses TagEditor + StringListEditor** — consistent UX with world-review, no new shared components needed.

## Verification

1. `npm --prefix backend run typecheck` — no type errors
2. `npm --prefix frontend run lint` — no lint errors
3. `npm --prefix backend test` — all existing tests pass
4. Manual flow: World Review → "Continue to Character Creation" → lands on `/character-creation` → describe character → Parse → edit fields → Begin Adventure → player saved to DB → navigate to `/game`
5. AI Generate flow: click "AI Generate" → character appears → edit → save
6. Verify DB: `players` table has row with correct campaignId, tags, equippedItems, currentLocationId
