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

const patterns = {
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
  directSceneImpliedAction: /\b(?:waits? in|stands? in|rides? at your side|at hand|set where it can be read|useful things? in reach)\b/iu,
  stockRouteOptions: /\bFrom here,\s+the visible ways? leads? to\b[\s\S]*\b(?:Each takes|It takes)\b/iu,
  stockMovementSummary: /^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes? of travel brings you to [^.]+\.$|^(?:(?:after|in) (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes?, [^.]+ becomes (?:your|the) current place|[^.]+ becomes (?:your|the) current place after (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes?)\.$/iu,
  stockElapsedSummary: /^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes? pass(?: at| in)?(?: [^.]+)?\.$/iu,
  optionMenu: /\beither\b[\s\S]{0,80}\bor\b|\b\w+\. Or \w+\b/iu,
  wordAsObject: /\b(?:taste[sd]?|weigh(?:ed|s)?|roll(?:ed|s)?|repeat(?:ed|s)?|testing|working through)\b[\s\S]{0,60}\b(?:name|word|phrase|syllable)s?\b/iu,
  noveltyTag: /\b(?:interesting|intriguing|full of surprises|that's new|we'll see)\b/iu,
  crowdFoil: /\b(?:most people|everyone else|people usually|most would)\b/iu,
  bottledAtmosphere: /\b(?:velvet|velvety|silk(?:en)?|husky|charged air|thick air|stretched silence|pregnant pause|barely above a whisper|ozone)\b/iu,
  cosmicFluff: /\b(?:world (?:narrowed|tilted|fell away)|something (?:dark|ancient|feral)|[\p{L}\p{N}_-]+ was a [\p{L}\p{N}_-]+ thing)\b/iu,
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

function topCounts(map, limit) {
  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
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
      wordCount: words(text).length,
    });
  }
}

const starts = new Map();
const exactSentences = new Map();
const hits = Object.fromEntries(Object.keys(patterns).map((key) => [key, 0]));
const examples = Object.fromEntries(Object.keys(patterns).map((key) => [key, []]));
let oneToken = 0;
let youOpening = 0;
let listLikeSentenceStarts = 0;

for (const row of rows) {
  if (row.wordCount <= 1) oneToken += 1;
  const start = words(row.text).slice(0, 4).join(" ").toLowerCase();
  if (start) starts.set(start, (starts.get(start) ?? 0) + 1);
  if (/^You\b/u.test(row.text)) youOpening += 1;

  for (const sentence of row.text.split(/(?<=[.!?])\s+/u)) {
    const normalized = sentence.trim().toLowerCase();
    if (normalized) exactSentences.set(normalized, (exactSentences.get(normalized) ?? 0) + 1);
    if (/^(?:You are at|You have|Visible routes lead to|A visible route leads to|[\p{L}\p{N}' -]+ is here|[\p{L}\p{N}' -]+ is visible)\b/iu.test(sentence.trim())) {
      listLikeSentenceStarts += 1;
    }
  }

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(row.text)) {
      hits[key] += 1;
      if (examples[key].length < 5) {
        examples[key].push({ file: row.file, text: row.text });
      }
    }
  }
}

const summary = {
  roots,
  total: rows.length,
  avgWords: rows.length > 0
    ? rows.reduce((sum, row) => sum + row.wordCount, 0) / rows.length
    : 0,
  minWords: rows.length > 0 ? Math.min(...rows.map((row) => row.wordCount)) : 0,
  maxWords: rows.length > 0 ? Math.max(...rows.map((row) => row.wordCount)) : 0,
  oneToken,
  youOpening,
  listLikeSentenceStarts,
  hits,
  topStarts: topCounts(starts, 20),
  topExactSentences: topCounts(exactSentences, 20),
  examples,
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
