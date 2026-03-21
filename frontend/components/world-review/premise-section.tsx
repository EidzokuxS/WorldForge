"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RegenerateDialog } from "@/components/world-review/regenerate-dialog";

interface PremiseSectionProps {
  refinedPremise: string;
  onChange: (premise: string) => void;
  onRegenerate: (instruction: string | undefined) => void;
  regenerating: boolean;
}

export function PremiseSection({
  refinedPremise,
  onChange,
  onRegenerate,
  regenerating,
}: PremiseSectionProps) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-serif text-xl font-bold text-bone">
          Premise
        </CardTitle>
        <RegenerateDialog
          sectionName="Premise"
          onConfirm={onRegenerate}
          regenerating={regenerating}
        />
      </CardHeader>
      <CardContent>
        <Textarea
          value={refinedPremise}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="resize-none text-sm"
          placeholder="Describe your world premise..."
        />
      </CardContent>
    </Card>
  );
}
