"use client";

import { Plus, X } from "lucide-react";
import type { CampaignPlayCharacterDraft, CampaignPlayCharacterSkill } from "@worldforge/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface CampaignPlayerEditorProps {
  draft: CampaignPlayCharacterDraft;
  onChange: (draft: CampaignPlayCharacterDraft) => void;
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

function TextField({ label, value, onChange, multiline = false }: TextFieldProps) {
  const control = multiline ? (
    <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
  ) : (
    <Input value={value} onChange={(event) => onChange(event.target.value)} />
  );
  return <label className="grid gap-2 text-sm text-[var(--fg-2)]"><span>{label}</span>{control}</label>;
}

interface ListFieldProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}

function ListField({ label, items, onChange }: ListFieldProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-[var(--fg-2)]">{label}</legend>
      {items.map((item, index) => (
        <div className="flex gap-2" key={index}>
          <Input
            aria-label={`${label} ${index + 1}`}
            value={item}
            onChange={(event) => onChange(items.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))}
          />
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${label} ${index + 1}`} onClick={() => onChange(items.filter((_, entryIndex) => entryIndex !== index))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onChange([...items, ""])}>
        <Plus className="mr-2 h-4 w-4" /> Add {label.toLowerCase()}
      </Button>
    </fieldset>
  );
}

function SkillsField({ skills, onChange }: { skills: CampaignPlayCharacterSkill[]; onChange: (skills: CampaignPlayCharacterSkill[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-[var(--fg-2)]">Skills</legend>
      {skills.map((skill, index) => (
        <div className="grid grid-cols-[minmax(0,1fr)_140px_auto] gap-2" key={index}>
          <Input aria-label={`Skill ${index + 1}`} value={skill.name} onChange={(event) => onChange(skills.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry))} />
          <Select value={skill.tier ?? "unrated"} onValueChange={(tier) => onChange(skills.map((entry, entryIndex) => entryIndex === index ? { ...entry, tier: tier === "unrated" ? null : tier as CampaignPlayCharacterSkill["tier"] } : entry))}>
            <SelectTrigger aria-label={`Skill ${index + 1} tier`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unrated">Unrated</SelectItem>
              <SelectItem value="Novice">Novice</SelectItem>
              <SelectItem value="Skilled">Skilled</SelectItem>
              <SelectItem value="Master">Master</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove skill ${index + 1}`} onClick={() => onChange(skills.filter((_, entryIndex) => entryIndex !== index))}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onChange([...skills, { name: "", tier: null }])}><Plus className="mr-2 h-4 w-4" /> Add skill</Button>
    </fieldset>
  );
}

export function CampaignPlayerEditor({ draft, onChange }: CampaignPlayerEditorProps) {
  const setField = <Key extends keyof CampaignPlayCharacterDraft>(key: Key, value: CampaignPlayCharacterDraft[Key]) => onChange({ ...draft, [key]: value });
  const setPersonality = <Key extends keyof CampaignPlayCharacterDraft["personality"]>(key: Key, value: CampaignPlayCharacterDraft["personality"][Key]) => onChange({ ...draft, personality: { ...draft.personality, [key]: value } });

  return (
    <section className="grid gap-8 rounded-[var(--r-l)] border border-white/[0.08] bg-black/25 p-[clamp(16px,1.5vw,28px)]">
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Name" value={draft.name} onChange={(value) => setField("name", value)} />
        <TextField label="Species" value={draft.species} onChange={(value) => setField("species", value)} />
        <TextField label="Age" value={draft.ageText} onChange={(value) => setField("ageText", value)} />
        <TextField label="Gender" value={draft.gender} onChange={(value) => setField("gender", value)} />
        <div className="md:col-span-2"><TextField label="Summary" value={draft.summary} onChange={(value) => setField("summary", value)} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField label="Appearance" value={draft.appearance} onChange={(value) => setField("appearance", value)} multiline />
        <TextField label="Biography" value={draft.biography} onChange={(value) => setField("biography", value)} multiline />
      </div>
      <div>
        <p className="wf-kicker mb-4">Inner life</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Personality" value={draft.personality.summary} onChange={(value) => setPersonality("summary", value)} multiline />
          <TextField label="Voice" value={draft.personality.voice} onChange={(value) => setPersonality("voice", value)} multiline />
          <TextField label="Decision style" value={draft.personality.decisionStyle} onChange={(value) => setPersonality("decisionStyle", value)} multiline />
          <TextField label="Worldview" value={draft.personality.worldview} onChange={(value) => setPersonality("worldview", value)} multiline />
          <TextField label="Personal mythology" value={draft.personality.mythology} onChange={(value) => setPersonality("mythology", value)} multiline />
          <ListField label="Contradictions" items={draft.personality.contradictions} onChange={(value) => setPersonality("contradictions", value)} />
          <div className="lg:col-span-2"><ListField label="Sample lines" items={draft.personality.sampleLines} onChange={(value) => setPersonality("sampleLines", value)} /></div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ListField label="Motives" items={draft.motives} onChange={(value) => setField("motives", value)} />
        <ListField label="Beliefs" items={draft.beliefs} onChange={(value) => setField("beliefs", value)} />
        <ListField label="Drives" items={draft.drives} onChange={(value) => setField("drives", value)} />
        <ListField label="Traits" items={draft.traits} onChange={(value) => setField("traits", value)} />
        <ListField label="Flaws" items={draft.flaws} onChange={(value) => setField("flaws", value)} />
        <ListField label="Specialties" items={draft.specialties} onChange={(value) => setField("specialties", value)} />
        <ListField label="Inventory" items={draft.inventory} onChange={(value) => setField("inventory", value)} />
        <ListField label="Signature items" items={draft.signatureItems} onChange={(value) => setField("signatureItems", value)} />
        <div className="lg:col-span-2"><SkillsField skills={draft.skills} onChange={(value) => setField("skills", value)} /></div>
      </div>
      <div className="border-t border-white/[0.08] pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">
        Source · {draft.source.kind} · {draft.source.label}{draft.source.importMode ? ` · ${draft.source.importMode}` : ""}
      </div>
    </section>
  );
}
