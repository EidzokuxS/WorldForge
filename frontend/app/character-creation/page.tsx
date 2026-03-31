"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorldData,
  loadCampaign,
  parseCharacter,
  generateCharacter as apiGenerateCharacter,
  saveCharacter,
  type ParsedCharacter,
  importV2Card,
} from "@/lib/api";
import type { CharacterImportMode } from "@/lib/types";
import { parseV2CardFile } from "@/lib/v2-card-parser";
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
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [character, setCharacter] = useState<ParsedCharacter | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    async function loadData() {
      try {
        await loadCampaign(campaignId);
        const world = await getWorldData(campaignId);
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
        if (result.role === "player") setCharacter(result.character);
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
      if (result.role === "player") setCharacter(result.character);
      toast.success("Character generated");
    } catch (error) {
      toast.error("Failed to generate character", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setGenerating(false);
    }
  }, [campaignId]);

  const handleImport = useCallback(
    async (file: File, importMode: CharacterImportMode) => {
      if (!campaignId) return;
      setImporting(true);
      try {
        const card = await parseV2CardFile(file);
        const result = await importV2Card(campaignId, card, {
          role: "player",
          importMode,
          locationNames,
        });
        if (result.role === "player") setCharacter(result.character);
        toast.success("Character imported");
      } catch (error) {
        toast.error("Failed to import character", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setImporting(false);
      }
    },
    [campaignId, locationNames]
  );

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
              onImport={handleImport}
              parsing={parsing}
              generating={generating}
              importing={importing}
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
