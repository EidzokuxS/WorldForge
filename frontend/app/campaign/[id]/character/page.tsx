"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorldData,
  loadCampaign,
  parseCharacter,
  generateCharacter as apiGenerateCharacter,
  importV2Card,
  saveCharacter,
  type ParsedCharacter,
} from "@/lib/api";
import { parseV2CardFile } from "@/lib/v2-card-parser";
import { CharacterForm } from "@/components/character-creation/character-form";
import { CharacterCard } from "@/components/character-creation/character-card";

type BusyState = "idle" | "loading" | "parsing" | "generating" | "importing" | "saving";

export default function CharacterCreationPage(props: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(props.params);
  const router = useRouter();

  const [locationNames, setLocationNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyState>("loading");
  const [character, setCharacter] = useState<ParsedCharacter | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        await loadCampaign(campaignId);
        const world = await getWorldData(campaignId);
        setLocationNames(world.locations.map((l) => l.name));
      } catch (error) {
        toast.error("Failed to load world data", {
          description: getErrorMessage(error, "Unknown error"),
        });
      } finally {
        setBusy("idle");
      }
    }

    void loadData();
  }, [campaignId]);

  const handleParse = useCallback(
    async (description: string) => {
      setBusy("parsing");
      try {
        const result = await parseCharacter(campaignId, description);
        if (result.role === "player") setCharacter(result.character);
        toast.success("Character parsed");
      } catch (error) {
        toast.error("Failed to parse character", {
          description: getErrorMessage(error, "Unknown error"),
        });
      } finally {
        setBusy("idle");
      }
    },
    [campaignId]
  );

  const handleGenerate = useCallback(async () => {
    setBusy("generating");
    try {
      const result = await apiGenerateCharacter(campaignId);
      if (result.role === "player") setCharacter(result.character);
      toast.success("Character generated");
    } catch (error) {
      toast.error("Failed to generate character", {
        description: getErrorMessage(error, "Unknown error"),
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId]);

  const handleImport = useCallback(
    async (file: File) => {
      setBusy("importing");
      try {
        const payload = await parseV2CardFile(file);
        const result = await importV2Card(campaignId, payload);
        if (result.role === "player") setCharacter(result.character);
        toast.success(`Imported "${payload.name}"`);
      } catch (error) {
        toast.error("Failed to import character card", {
          description: getErrorMessage(error, "Unknown error"),
        });
      } finally {
        setBusy("idle");
      }
    },
    [campaignId],
  );

  const handleSave = useCallback(async () => {
    if (!character) return;
    setBusy("saving");
    try {
      await saveCharacter(campaignId, character);
      toast.success("Character saved");
      router.push("/game");
    } catch (error) {
      toast.error("Failed to save character", {
        description: getErrorMessage(error, "Unknown error"),
      });
    } finally {
      setBusy("idle");
    }
  }, [campaignId, character, router]);

  if (busy === "loading") {
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
              onImport={handleImport}
              parsing={busy === "parsing"}
              generating={busy === "generating"}
              importing={busy === "importing"}
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
                disabled={busy !== "idle" || !character.name.trim()}
              >
                {busy === "saving" ? (
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
