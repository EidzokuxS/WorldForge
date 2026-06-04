import { describe, expect, it } from "vitest";

import { extractSampleLinesFromMesExample } from "../mes-example-parser.js";

describe("extractSampleLinesFromMesExample", () => {
  it("returns [] for empty or whitespace input", () => {
    expect(extractSampleLinesFromMesExample("")).toEqual([]);
    expect(extractSampleLinesFromMesExample("   \n\t  ")).toEqual([]);
  });

  it("captures a single {{char}} turn from one <START> block", () => {
    const raw = `
<START>
{{char}}: The road remembers every traveler who leaves a promise in the dust.
{{user}}: I only need directions.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "The road remembers every traveler who leaves a promise in the dust.",
    ]);
  });

  it("captures only {{char}} turns across multiple <START> blocks and caps results at three", () => {
    const raw = `
<START>
{{char}}: I keep the lantern lit so the late ferries can still find the shore.
{{user}}: Good.
<START>
{{user}}: What do you know about the marsh?
{{char}}: The marsh listens before it swallows, so speak kindly if you value your boots.
<START>
{{char}}: Every oath sworn here lingers in the reeds until dawn drags it away.
<START>
{{char}}: If you want the safe trail, follow the bells and ignore the singing water.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "The marsh listens before it swallows, so speak kindly if you value your boots.",
      "If you want the safe trail, follow the bells and ignore the singing water.",
      "I keep the lantern lit so the late ferries can still find the shore.",
    ]);
  });

  it("joins continuation lines in a multi-line {{char}} turn with spaces", () => {
    const raw = `
<START>
{{char}}: I map the ruins by candlelight
because the daylight wakes the watchers
and they hate being counted.
{{user}}: That sounds unhealthy.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "I map the ruins by candlelight because the daylight wakes the watchers and they hate being counted.",
    ]);
  });

  it("strips inline OOC segments from a kept turn", () => {
    const raw = `
<START>
{{char}}: I smile for the crowd (OOC: this line should be removed) and keep the knife hidden in my sleeve.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "I smile for the crowd  and keep the knife hidden in my sleeve.",
    ]);
  });

  it("skips turns that start with OOC markers", () => {
    const raw = `
<START>
{{char}}: [OOC] Skip this line entirely because it breaks immersion.
<START>
{{char}}: (ooc: skip this one too)
<START>
{{char}}: The bells are ringing because someone important just lied in public again.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "The bells are ringing because someone important just lied in public again.",
    ]);
  });

  it("filters out turns shorter than twenty characters after cleanup", () => {
    const raw = `
<START>
{{char}}: Too short to keep.
<START>
{{char}}: This one survives because it keeps talking long enough to matter.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "This one survives because it keeps talking long enough to matter.",
    ]);
  });

  it("filters out action-only turns", () => {
    const raw = `
<START>
{{char}}: *sighs heavily*
<START>
{{char}}: *glances toward the altar and says nothing at all*
<START>
{{char}}: I can stay silent for effect, but never by accident.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "I can stay silent for effect, but never by accident.",
    ]);
  });

  it("sorts longer dialog-bearing turns ahead of shorter ones", () => {
    const raw = `
<START>
{{char}}: Keep your blade low.
<START>
{{char}}: "If you survive this crossing, remember that the river offered mercy first and demanded tribute second."
<START>
{{char}}: "I warned them three separate times, but prophecy sounds rude until the house is already on fire."
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "\"If you survive this crossing, remember that the river offered mercy first and demanded tribute second.\"",
      "\"I warned them three separate times, but prophecy sounds rude until the house is already on fire.\"",
      "Keep your blade low.",
    ]);
  });

  it("returns [] for malformed input without any {{char}} markers", () => {
    const raw = `
<START>
Narrator: The bells toll.
User: Who said that?
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([]);
  });

  it("recognizes case-insensitive {{char}} and {{user}} markers", () => {
    const raw = `
<START>
{{Char}}: The observatory dome rattles whenever the sleeping saint turns in her chains.
{{USER}}: That seems ominous.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "The observatory dome rattles whenever the sleeping saint turns in her chains.",
    ]);
  });

  it("parses a V3-style mes_example string with standard <START> blocks", () => {
    const raw = `
<START>
{{char}}: I archive every secret twice, once for history and once for blackmail.
{{user}}: You admit that openly?
<START>
{{char}}: Openly? No. Calmly? Always.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "I archive every secret twice, once for history and once for blackmail.",
      "Openly? No. Calmly? Always.",
    ]);
  });

  it("parses a V3-style mes_example string without an explicit <START> marker", () => {
    const raw = `
{{char}}: I learned long ago that doors obey confidence before they obey keys.
{{user}}: That sounds illegal.
{{char}}: Only to locksmiths without imagination.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "I learned long ago that doors obey confidence before they obey keys.",
      "Only to locksmiths without imagination.",
    ]);
  });

  it("filters V3 action-only emotes while keeping speech turns", () => {
    const raw = `
<START>
{{char}}: *tilts her head and listens to the radio static*
<START>
{{char}}: The static keeps secrets better than priests do, so I treat it with respect.
<START>
{{char}}: *drums her fingers against the window frame*
<START>
{{char}}: If the tower goes dark tonight, it means the city has started choosing sides.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "If the tower goes dark tonight, it means the city has started choosing sides.",
      "The static keeps secrets better than priests do, so I treat it with respect.",
    ]);
  });

  it("uses a realistic long V3 payload and returns the top three ranked dialogue turns", () => {
    const raw = `
<START>
{{char}}: [OOC] Ignore this setup note.
{{user}}: Sure.
<START>
{{char}}: *adjusts the silver clasp on her coat*
{{user}}: You look busy.
<START>
{{char}}: The ministry taught me to whisper like a confession and strike like an audit, because fear sticks better when it sounds administrative.
{{user}}: That's bleak.
<START>
{{char}}: When the bells under the river begin ringing at noon, you do not run for shore; you kneel, count backward from thirteen, and let the city decide whether you are still one of its citizens.
{{user}}: That sounds like a threat.
<START>
{{char}}: I could tell you the safe route, but safety is just another toll road and I already paid mine in blood and bad handwriting.
{{user}}: Charming.
<START>
{{char}}: (OOC: this is a formatting note that should vanish)
{{user}}: Right.
<START>
{{char}}: Every ledger in this district is haunted by the clerk who died balancing a famine, and if you listen carefully you can hear her correcting the arithmetic of the living.
{{user}}: I do not like this city.
<START>
{{char}}: *lights a cigarette in silence*
{{user}}: ...
<START>
{{char}}: The cathedral doors only open for the penitent and the arrogant, which is why the nobility never need to knock.
{{user}}: Useful.
<START>
{{char}}: If you plan to betray me, schedule it before dusk; after dusk the witnesses become too literal.
{{user}}: Noted.
`;

    expect(extractSampleLinesFromMesExample(raw)).toEqual([
      "When the bells under the river begin ringing at noon, you do not run for shore; you kneel, count backward from thirteen, and let the city decide whether you are still one of its citizens.",
      "Every ledger in this district is haunted by the clerk who died balancing a famine, and if you listen carefully you can hear her correcting the arithmetic of the living.",
      "The ministry taught me to whisper like a confession and strike like an audit, because fear sticks better when it sounds administrative.",
    ]);
  });
});
