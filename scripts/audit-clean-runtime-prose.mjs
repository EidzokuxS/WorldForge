import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const roots = [];
let outPath = null;
let failOnHits = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--out") {
    outPath = args[index + 1] ?? null;
    index += 1;
  } else if (arg === "--fail-on-hits") {
    failOnHits = true;
  } else {
    roots.push(arg);
  }
}

if (roots.length === 0) {
  console.error("usage: node scripts/audit-clean-runtime-prose.mjs [--out file] [--fail-on-hits] <artifact-dir>...");
  process.exit(2);
}

const blockingPatterns = {
  receiptDebug: /\b(Operation:|Source:|Target:|Final equip state:|Current scene anchor:|Item transfer result:|Player location changed|Travel cost|Current scene is|Current place is|Inventory item:|Visible target:|Route option:)\b/iu,
  enumLeak: /\b(transferred_to_actor|give_to_visible_actor|movement_option|visible_actor:|message_indicator|minute\(s\))\b/iu,
  oldRouteFormula: /\bThe settled route check confirms\b/iu,
  oldArrivalFormula: /\bYou arrive at\b/iu,
  backendFormula: /\bcurrent (?:scene|location|place)\b/iu,
  surfaceSummaryLeak: /\bCurrent visible (?:actors|targets|items|matches?|route options) include\b/iu,
  surfaceKindLeak: /\bvisible (?:actor|target|route option|device surface|support actor)\b/iu,
  dialogueSceneDump: /\bpresent themselves as distinct points of focus\b|\broutes branch toward\b/iu,
  flatItemTransfer: /^[\p{L}\p{N}' -]+ is now with [\p{L}\p{N}' -]+\.$/iu,
  flatSupportActor: /^[\p{L}\p{N}' -]+ is present(?: in [\p{L}\p{N}' -]+)?(?: as a [\p{L}\p{N}' -]+)?\.$/iu,
  flatPlayerCondition: /^Player is [^.]+\.$/iu,
  flatMinorPoi: /^[\p{L}\p{N}' -]+ (?:is now available|remains available) here as a visible [\p{L}\p{N}' -]+(?: handle)?\.$/iu,
  flatDeviceSurface: /^[\p{L}\p{N}' -]+(?:'s)? visible surface shows no requested [^.]+\.$/iu,
  bareDialogueQuote: /^[\p{L}\p{N}' -]+ says:\s*"[^"]+[.!?]?"\.?$/iu,
  directSceneDigest: /^You are at [^.]+\. (?:[\p{L}\p{N}' ,&-]+ (?:is|are) here\. )?(?:You have [^.]+\. )?(?:[\p{L}\p{N}' ,&-]+ (?:is|are) visible\. )?(?:Visible routes lead to|A visible route leads to)/iu,
  directSceneImpliedAction: /\b(?:waits? in|stands? in (?!view\b)|rides? at your side|at hand|set where it can be read|useful things? in reach)\b/iu,
  stockRouteOptions: /\bFrom here,\s+the visible ways? leads? to\b[\s\S]*\b(?:Each takes|It takes)\b/iu,
  stockMovementSummary: /^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes? of travel brings you to [^.]+\.$|^(?:(?:after|in) (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes?, [^.]+ becomes (?:your|the) current place|[^.]+ becomes (?:your|the) current place after (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes?)\.$/iu,
  stockElapsedSummary: /^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes? pass(?: at| in)?(?: [^.]+)?\.$/iu,
};

const styleFamilyPatterns = {
  optionMenu: /\beither\b[\s\S]{0,80}\bor\b|\b\w+\. Or \w+\b/iu,
  wordAsObject: /\b(?:taste[sd]?|weigh(?:ed|s)?|roll(?:ed|s)?|repeat(?:ed|s)?|testing|working through)\b[\s\S]{0,60}\b(?:name|word|phrase|syllable)s?\b/iu,
  noveltyTag: /\b(?:interesting|intriguing|full of surprises|that's new|we'll see)\b/iu,
  crowdFoil: /\b(?:most people|everyone else|people usually|most would)\b/iu,
  bottledAtmosphere: /\b(?:velvet|velvety|silk(?:en)?|husky|charged air|thick air|stretched silence|pregnant pause|barely above a whisper|ozone)\b/iu,
  negationAsDescription: /\bnot\s+(?:quite|really|exactly|just|merely|only)\b|\bnot\s+[\p{L}\p{N}' -]{1,40}\s+but\s+[\p{L}\p{N}' -]{1,60}\b/iu,
  cosmicFluff: /\b(?:world (?:narrowed|tilted|fell away)|something (?:dark|ancient|feral)|[\p{L}\p{N}_-]+ was a [\p{L}\p{N}_-]+ thing)\b/iu,
};

const bannedVocabularyPatterns = {
  freshMeat: /\bfresh meat\b/giu,
  breathHitch: /\bbreath (?:hitch(?:es|ed|ing)?|catch(?:es|ing|ed)?)\b/giu,
  husky: /\bhusky\b/giu,
  throatCatch: /\bcatch(?:es|ing|ed)? in (?:the )?throat\b/giu,
  blownPupils: /\bpupils? (?:blown wide|dilat(?:ed|ing)|wide)\b/giu,
  predatory: /\bpredatory\b/giu,
  ozone: /\bozone\b/giu,
  meat: /\bmeat\b/giu,
  asset: /\basset\b/giu,
  spineShiver: /\bshivers? down (?:the |your |his |her |their )?spine\b/giu,
  nailsBiting: /\bnails? bit(?:e|es|ing)?\b/giu,
  velvet: /\bvelvet(?:y)?\b/giu,
  viseVice: /\b(?:vise|vice)\b/giu,
  structuralIntegrity: /\bstructural integrity\b/giu,
  deepCurve: /\bdeep curve\b/giu,
  furnace: /\bfurnace\b/giu,
  throaty: /\bthroaty\b/giu,
  calloused: /\bcalloused\b/giu,
  guttural: /\bguttural\b/giu,
  slick: /\bslick\b/giu,
  unadulterated: /\bunadulterated\b/giu,
  jawClenched: /\bjaw clenched\b/giu,
  barelyWhisper: /\bbarely above a whisper\b/giu,
  musk: /\bmusk\b/giu,
  breast: /\bbreast\b/giu,
  twoBeatsLonger: /\btwo beats longer\b/giu,
  courtesyDemands: /\bthan (?:convention|courtesy) demands\b/giu,
  syllables: /\b(?:testing|working through) (?:the )?syllables\b/giu,
  rollsOffTongue: /\brolls? off (?:the |your |his |her |their )?tongue\b/giu,
  tastingName: /\btast(?:e|es|ed|ing) (?:the )?name\b/giu,
  mostPeople: /\bmost (?:people|who)\b/giu,
};

const adultRegisterPatterns = {
  clinicalEuphemism: /\b(?:intimate area|private parts|manhood|womanhood|nether regions|sensitive area|make love|shared intimacy|intimate contact)\b/giu,
  adultSceneMarker: /\b(?:sex|sexual|naked|nude|desire|arousal|kiss|touch|blood|wound|injury|pain|moan|groan|fuck|cock|cunt|pussy|dick)\b/giu,
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name === "result.json") out.push(full);
  }
  return out;
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function perThousand(count, wordCount) {
  if (wordCount <= 0) return 0;
  return (count / wordCount) * 1000;
}

function countMatches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  return [...text.matchAll(regex)].length;
}

function topCounts(map, limit) {
  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function firstSentence(text) {
  return text.trim().split(/(?<=[.!?])\s+/u)[0]?.trim() ?? "";
}

function openingDoor(text) {
  const sentence = firstSentence(text);
  if (sentence.length === 0) return "empty";
  if (/^(?:["']|[\p{L}\p{N}' -]+(?:\s+says|\s+asks|\s+replies|\s+answers|\s+calls|\s+mutters|\s+shouts)[:,]?\s*["'])/iu.test(sentence)) {
    return "speech_first";
  }
  if (/^(?:after|in)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+minutes?\b|\b(?:reaches|crosses|moves|passes|steps|lands|arrives)\b/iu.test(sentence)) {
    return "motion_or_time_landing";
  }
  if (/^(?:rain|wind|smoke|heat|cold|water|dust|light|shadow|a smell|the smell|noise|voices|metal|stone|wood|canvas|cloth|bell|thunder)\b/iu.test(sentence)) {
    return "sensory_strike";
  }
  if (/^(?:no visible sign|nothing visible|no visible person)\b/iu.test(sentence)) {
    return "bounded_answer";
  }
  if (/^[\p{L}\p{N}' -]+(?:\s+at\s+[\p{L}\p{N}' -]+)?\s+(?:says|asks|replies|answers|calls|mutters|shouts)\b/iu.test(sentence)) {
    return "setting_into_speech";
  }
  if (/\b(?:forms|sits|stretches|rises|extends|fills|holds|squats|hums|runs|opens|leans|wedged|built)\b/iu.test(sentence)) {
    return "setting_straight";
  }
  if (/^[\p{L}\p{N}' -]+\s+(?:stands|waits|takes|turns|snatches|sets|leans|keeps|holds|carries|comes|steps|moves)\b/iu.test(sentence)) {
    return "npc_or_object_act";
  }
  if (/^You\b/u.test(sentence)) return "you_player_frame";
  return "other";
}

function directSceneImpliedActionSupportedByPlayerAction(row) {
  const text = row.text;
  const action = String(row.action ?? "");
  const receiptCaps = Array.isArray(row.receiptCaps) ? row.receiptCaps : [];
  if (receiptCaps.some((receipt) => receipt?.capabilityId === "scene_beat_record")) {
    return true;
  }
  if (/^You stand in [^.!?]+[.!?,]/iu.test(text)) {
    return true;
  }
  if (/\bstands? in (?!view\b)/iu.test(text) && /\bstand(?:s|ing)?\b/iu.test(action)) {
    return true;
  }
  if (/\bwaits? in\b/iu.test(text) && /\bwait(?:s|ing)?\b/iu.test(action)) {
    return true;
  }
  return false;
}

const rows = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const text = String(data?.narrative?.text ?? data?.narrativeText ?? "").trim();
    rows.push({
      root,
      file,
      action: data.action ?? data.playerAction ?? null,
      text,
      receiptCaps: data?.db?.receiptCaps ?? [],
      wordCount: words(text).length,
    });
  }
}

const starts = new Map();
const exactSentences = new Map();
const openingDoors = new Map();
const hits = Object.fromEntries(Object.keys(blockingPatterns).map((key) => [key, 0]));
const styleFamilyHits = Object.fromEntries(Object.keys(styleFamilyPatterns).map((key) => [key, 0]));
const styleFamilyOccurrences = Object.fromEntries(Object.keys(styleFamilyPatterns).map((key) => [key, 0]));
const bannedVocabularyHits = Object.fromEntries(Object.keys(bannedVocabularyPatterns).map((key) => [key, 0]));
const bannedVocabularyOccurrences = Object.fromEntries(Object.keys(bannedVocabularyPatterns).map((key) => [key, 0]));
const adultRegisterHits = Object.fromEntries(Object.keys(adultRegisterPatterns).map((key) => [key, 0]));
const adultRegisterOccurrences = Object.fromEntries(Object.keys(adultRegisterPatterns).map((key) => [key, 0]));
const examples = Object.fromEntries(Object.keys(blockingPatterns).map((key) => [key, []]));
const styleFamilyExamples = Object.fromEntries(Object.keys(styleFamilyPatterns).map((key) => [key, []]));
const bannedVocabularyExamples = Object.fromEntries(Object.keys(bannedVocabularyPatterns).map((key) => [key, []]));
let oneToken = 0;
let youOpening = 0;
let listLikeSentenceStarts = 0;

for (const row of rows) {
  if (row.wordCount <= 1) oneToken += 1;
  const start = words(row.text).slice(0, 4).join(" ").toLowerCase();
  if (start) starts.set(start, (starts.get(start) ?? 0) + 1);
  const door = openingDoor(row.text);
  openingDoors.set(door, (openingDoors.get(door) ?? 0) + 1);
  if (/^You\b/u.test(row.text)) youOpening += 1;

  for (const sentence of row.text.split(/(?<=[.!?])\s+/u)) {
    const normalized = sentence.trim().toLowerCase();
    if (normalized) exactSentences.set(normalized, (exactSentences.get(normalized) ?? 0) + 1);
    if (/^(?:You are at|You have|Visible routes lead to|A visible route leads to|[\p{L}\p{N}' -]+ is here|[\p{L}\p{N}' -]+ is visible)\b/iu.test(sentence.trim())) {
      listLikeSentenceStarts += 1;
    }
  }

  for (const [key, pattern] of Object.entries(blockingPatterns)) {
    if (key === "directSceneImpliedAction" && directSceneImpliedActionSupportedByPlayerAction(row)) {
      continue;
    }
    if (pattern.test(row.text)) {
      hits[key] += 1;
      if (examples[key].length < 5) {
        examples[key].push({ file: row.file, text: row.text });
      }
    }
  }

  for (const [key, pattern] of Object.entries(styleFamilyPatterns)) {
    const count = countMatches(row.text, pattern);
    if (count > 0) {
      styleFamilyHits[key] += 1;
      styleFamilyOccurrences[key] += count;
      if (styleFamilyExamples[key].length < 5) {
        styleFamilyExamples[key].push({ file: row.file, text: row.text });
      }
    }
  }

  for (const [key, pattern] of Object.entries(bannedVocabularyPatterns)) {
    const count = countMatches(row.text, pattern);
    if (count > 0) {
      bannedVocabularyHits[key] += 1;
      bannedVocabularyOccurrences[key] += count;
      if (bannedVocabularyExamples[key].length < 5) {
        bannedVocabularyExamples[key].push({ file: row.file, text: row.text });
      }
    }
  }

  for (const [key, pattern] of Object.entries(adultRegisterPatterns)) {
    const count = countMatches(row.text, pattern);
    if (count > 0) {
      adultRegisterHits[key] += 1;
      adultRegisterOccurrences[key] += count;
    }
  }
}

const totalWords = rows.reduce((sum, row) => sum + row.wordCount, 0);
const totalBannedVocabularyOccurrences = Object.values(bannedVocabularyOccurrences)
  .reduce((sum, count) => sum + count, 0);
const totalStyleFamilyOccurrences = Object.values(styleFamilyOccurrences)
  .reduce((sum, count) => sum + count, 0);
const exactRepeatedSentenceTotal = topCounts(exactSentences, Number.MAX_SAFE_INTEGER)
  .reduce((sum, [, count]) => sum + count - 1, 0);
const repeatedStartTotal = topCounts(starts, Number.MAX_SAFE_INTEGER)
  .reduce((sum, [, count]) => sum + count - 1, 0);

const summary = {
  roots,
  total: rows.length,
  totalWords,
  avgWords: rows.length > 0
    ? totalWords / rows.length
    : 0,
  minWords: rows.length > 0 ? Math.min(...rows.map((row) => row.wordCount)) : 0,
  maxWords: rows.length > 0 ? Math.max(...rows.map((row) => row.wordCount)) : 0,
  oneToken,
  youOpening,
  youOpeningRate: rows.length > 0 ? youOpening / rows.length : 0,
  listLikeSentenceStarts,
  openingDoorCounts: Object.fromEntries([...openingDoors.entries()].sort(([left], [right]) => left.localeCompare(right))),
  repeatedStartTotal,
  repeatedStartRate: rows.length > 0 ? repeatedStartTotal / rows.length : 0,
  exactRepeatedSentenceTotal,
  exactRepeatedSentenceRate: rows.length > 0 ? exactRepeatedSentenceTotal / rows.length : 0,
  hits,
  styleBenchmark: {
    bannedVocabularyHits,
    bannedVocabularyOccurrences,
    totalBannedVocabularyOccurrences,
    bannedVocabularyPer1kWords: perThousand(totalBannedVocabularyOccurrences, totalWords),
    styleFamilyHits,
    styleFamilyOccurrences,
    totalStyleFamilyOccurrences,
    styleFamilyPer1kWords: perThousand(totalStyleFamilyOccurrences, totalWords),
    adultRegisterHits,
    adultRegisterOccurrences,
    adultEuphemismPer1kWords: perThousand(adultRegisterOccurrences.clinicalEuphemism ?? 0, totalWords),
  },
  topStarts: topCounts(starts, 20),
  topExactSentences: topCounts(exactSentences, 20),
  examples,
  styleFamilyExamples,
  bannedVocabularyExamples,
};

const serialized = JSON.stringify(summary, null, 2);
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, serialized, "utf8");
}
console.log(serialized);

const hitTotal = oneToken + Object.values(hits).reduce((sum, count) => sum + count, 0);
if (failOnHits && hitTotal > 0) {
  process.exit(1);
}
