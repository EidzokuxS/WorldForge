#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PHASE_DIR = ".planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap";
const INVENTORY_PATH = `${PHASE_DIR}/evidence/76-corpus-inventory.json`;
const FIXTURE_PATH = `${PHASE_DIR}/tools/fixtures/76-audit-parser-fixtures.md`;
const FINAL_AUDIT_PATH = `${PHASE_DIR}/76-HISTORICAL-PROMISE-AUDIT.md`;
const GAP_LEDGER_PATH = `${PHASE_DIR}/76-GAP-LEDGER.md`;
const VALIDATION_PATH = `${PHASE_DIR}/76-VALIDATION.md`;

const SLICE_FILES = [
  `${PHASE_DIR}/evidence/76-slice-v1-historical.md`,
  `${PHASE_DIR}/evidence/76-slice-v11-37-55.md`,
  `${PHASE_DIR}/evidence/76-slice-v11-56-69.md`,
  `${PHASE_DIR}/evidence/76-slice-recent-70-75.md`,
];

const TABLE_HEADERS = [
  "Audit Key",
  "Phase Source",
  "Phase #",
  "Title",
  "Material Promise",
  "Evidence Checked",
  "Classification",
  "Risk",
  "Disposition",
  "Code/Tests/Docs Change",
];

const FIELD_BY_HEADER = new Map([
  ["Audit Key", "auditKey"],
  ["Phase Source", "phaseSource"],
  ["Phase #", "phaseNumber"],
  ["Title", "title"],
  ["Material Promise", "materialPromise"],
  ["Evidence Checked", "evidenceChecked"],
  ["Classification", "classification"],
  ["Risk", "risk"],
  ["Disposition", "disposition"],
  ["Code/Tests/Docs Change", "codeTestsDocsChange"],
]);

const GAP_LEDGER_HEADERS = [
  "Gap ID",
  "Audit Key",
  "Source Phase(s)",
  "Material Promise",
  "Classification",
  "Severity",
  "Evidence",
  "Slice Candidate Provenance",
  "Recommended Routing",
  "Owner Recommendation",
  "Blocking?",
  "Backlog Link",
];

const ALLOWED_CLASSIFICATIONS = new Set([
  "verified-current",
  "stale-unwired",
  "partial",
  "superseded",
  "deprecated",
  "follow-up",
  "not-applicable",
  "needs-human-UAT",
]);

const ALLOWED_RISKS = new Set([
  "none",
  "low",
  "medium",
  "high",
  "release-blocking",
  "unknown",
]);

const GAP_CLASSIFICATIONS = new Set([
  "stale-unwired",
  "partial",
  "follow-up",
  "needs-human-UAT",
]);

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EVIDENCE_MARKERS = [
  "source",
  "test",
  "route",
  "runtime",
  "frontend",
  "verification",
  "supersession",
  "deprecation",
  "uat",
];

const LIVE_MARKERS = new Set(["source", "test", "route", "runtime", "frontend"]);

function fail(message) {
  throw new Error(message);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function normalizeSlash(value) {
  return String(value).replaceAll("\\", "/");
}

function repoPathExists(repoRelativePath) {
  const normalized = normalizeSlash(repoRelativePath).replace(/^["'`]+|["'`.,;:)]+$/g, "");
  if (!normalized) return false;
  return fs.existsSync(path.resolve(process.cwd(), normalized));
}

function assertArray(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
}

function coverageKeyForExtra(extra) {
  return extra === "19.1" ? "19.1-legacy" : extra;
}

function validateInventory() {
  const inventory = readJson(INVENTORY_PATH);
  assertArray(inventory.expectedIntegerRows, "expectedIntegerRows");
  assertArray(inventory.expectedArchivedExtraRows, "expectedArchivedExtraRows");
  assertArray(inventory.optionalRows, "optionalRows");

  const phases = inventory.expectedIntegerRows.map((row) => String(row.phase ?? row));
  const unique = new Set(phases);
  if (phases.length !== 75) fail(`expected 75 integer rows, found ${phases.length}`);
  if (unique.size !== phases.length) fail("duplicate integer phase rows in expectedIntegerRows");

  const missing = Array.from({ length: 75 }, (_, index) => String(index + 1)).filter(
    (phase) => !unique.has(phase),
  );
  if (missing.length) fail(`missing integer rows: ${missing.join(",")}`);

  for (const extra of ["17-legacy", "19.1"]) {
    if (!inventory.expectedArchivedExtraRows.includes(extra)) {
      fail(`missing archived extra row: ${extra}`);
    }
  }

  if (!inventory.optionalRows.includes("0-pre-gsd-baseline")) {
    fail("optionalRows must include 0-pre-gsd-baseline");
  }
  if (unique.has("0")) {
    fail("0-pre-gsd-baseline must not replace integer coverage");
  }

  const row17 = inventory.expectedIntegerRows.find((row) => String(row.phase) === "17");
  if (!row17 || row17.coverageKey !== "17-current") {
    fail("integer phase 17 must use active 17-current coverage");
  }
  const extra17 = inventory.expectedArchivedExtraRowDetails?.find((row) => row.key === "17-legacy");
  if (!extra17 || extra17.coverageKey !== "17-legacy") {
    fail("archived 17-legacy detail is missing or collapsed");
  }

  for (const row of [
    ...inventory.expectedIntegerRows,
    ...(inventory.expectedArchivedExtraRowDetails ?? []),
    ...(inventory.optionalRowDetails ?? []),
  ]) {
    for (const field of ["coverageKey", "sourcePath", "assignedSlice"]) {
      if (!row[field]) fail(`inventory row ${row.phase ?? row.key} missing ${field}`);
    }
    if (!repoPathExists(row.sourcePath)) {
      fail(`inventory source path does not exist: ${row.sourcePath}`);
    }
  }

  for (const sliceId of ["v1-historical", "v11-37-55", "v11-56-69", "recent-70-75"]) {
    const slice = inventory.sliceAssignments?.[sliceId];
    if (!slice) fail(`missing slice assignment: ${sliceId}`);
    assertArray(slice.expectedCoverageKeys, `sliceAssignments.${sliceId}.expectedCoverageKeys`);
  }

  console.log(
    `inventory ok integerRows=${inventory.expectedIntegerRows.length} archivedExtras=${inventory.expectedArchivedExtraRows.length}`,
  );
  return inventory;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    fail(`invalid markdown table row boundary: ${line}`);
  }
  const cells = [];
  let current = "";
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    const next = trimmed[index + 1];
    if (char === "\\" && next === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseMarkdownTable(markdown, headers, tableName) {
  const lines = markdown.split(/\r?\n/);
  const expectedHeader = headers.join("\u0000");
  const headerIndex = lines.findIndex((line) => {
    if (!line.trim().startsWith("|")) return false;
    try {
      return splitMarkdownRow(line).join("\u0000") === expectedHeader;
    } catch {
      return false;
    }
  });
  if (headerIndex === -1) fail(`${tableName} markdown table with exact headers not found`);

  const separator = splitMarkdownRow(lines[headerIndex + 1] ?? "");
  if (separator.length !== headers.length || !isSeparatorRow(separator)) {
    fail(`${tableName} markdown table separator row is invalid`);
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== headers.length) {
      fail(`wrong ${tableName} column count at line ${index + 1}: expected ${headers.length}, found ${cells.length}`);
    }
    const row = {};
    for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
      row[headers[cellIndex]] = cells[cellIndex];
    }
    rows.push(row);
  }
  return rows;
}

function parseMarkdownRows(markdown) {
  return parseMarkdownTable(markdown, TABLE_HEADERS, "audit").map((rawRow) => {
    const row = {};
    for (const header of TABLE_HEADERS) {
      row[FIELD_BY_HEADER.get(header)] = rawRow[header];
    }
    return row;
  });
}

function parseStructuredRows(markdown) {
  const structured = markdown.match(/^## Structured Audit Rows\s*[\r\n]+```jsonl\s*([\s\S]*?)```/m);
  if (!structured) fail("Structured Audit Rows jsonl block not found");
  return structured[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`invalid JSONL row ${index + 1}: ${error.message}`);
      }
    });
}

function normalizeStructuredRow(row) {
  const normalized = {};
  for (const [header, field] of FIELD_BY_HEADER.entries()) {
    const value = row[field] ?? row[header];
    normalized[field] = value == null ? "" : String(value).trim();
  }
  return normalized;
}

function parseAuditDocument(markdown) {
  const markdownRows = parseMarkdownRows(markdown).map(normalizeStructuredRow);
  const structuredRows = parseStructuredRows(markdown).map(normalizeStructuredRow);
  return { markdownRows, structuredRows };
}

function keySet(rows) {
  return new Set(rows.map((row) => row.auditKey));
}

function hasMarker(text, marker) {
  return new RegExp(`(?:^|[;\\s])${marker}:`, "i").test(text);
}

function extractEvidenceMarkers(text) {
  const markerAlternation = EVIDENCE_MARKERS.join("|");
  const pattern = new RegExp(
    `(${markerAlternation}):\\s*([\\s\\S]*?)(?=(?:\\s+(?:${markerAlternation}):)|;|$)`,
    "gi",
  );
  const markers = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    markers.push({ marker: match[1].toLowerCase(), value: match[2].trim() });
  }
  return markers;
}

function isAdministrativeEvidenceOnly(evidence) {
  const lower = evidence.toLowerCase();
  const hasAdminTerm = /\b(summary|checkbox|roadmap|completion|completed)\b/.test(lower);
  if (!hasAdminTerm) return false;
  const hasSubstantiveMarker = ["source", "test", "route", "runtime", "frontend", "supersession", "deprecation", "uat"].some(
    (marker) => hasMarker(lower, marker),
  );
  const hasVerificationArtifact = /verification:\s*[^;]*(verification|validation|matrix|audit)\.md\b/i.test(evidence);
  return !hasSubstantiveMarker && !hasVerificationArtifact;
}

function markerValuePathTokens(value) {
  return value
    .split(/[\s,]+/)
    .map((token) => token.trim().replace(/^["'`[(]+|["'`.,;:)]+$/g, ""))
    .filter(Boolean);
}

function isPathLikeToken(token) {
  const normalized = normalizeSlash(token);
  if (/^https?:\/\//i.test(normalized)) return false;
  if (/^\/api(\/|$)/i.test(normalized)) return false;
  if (/^[A-Z]+$/i.test(normalized)) return false;
  return (
    /^(\.planning|backend|frontend|shared|docs|tasks)\//.test(normalized) ||
    normalized.includes("/") ||
    normalized.includes("\\")
  );
}

function validateEvidencePaths(row) {
  for (const { marker, value } of extractEvidenceMarkers(row.evidenceChecked)) {
    if (marker === "route") continue;
    for (const token of markerValuePathTokens(value)) {
      if (!isPathLikeToken(token)) continue;
      if (!repoPathExists(token)) {
        fail(`missing path-like evidence for ${row.auditKey}: ${token}`);
      }
    }
  }
}

function validateRows(rows, markdownRows) {
  if (!rows.length) fail("no structured audit rows found");
  if (!markdownRows.length) fail("no markdown audit rows found");

  const seen = new Set();
  for (const row of rows) {
    if (!row.auditKey) fail("blank Audit Key");
    if (seen.has(row.auditKey)) fail(`duplicate Audit Key: ${row.auditKey}`);
    seen.add(row.auditKey);
  }

  const markdownKeys = keySet(markdownRows);
  const markdownByKey = new Map(markdownRows.map((row) => [row.auditKey, row]));
  for (const row of rows) {
    if (!markdownKeys.has(row.auditKey)) fail(`markdown table missing Audit Key: ${row.auditKey}`);
    const mirror = markdownByKey.get(row.auditKey);
    for (const field of FIELD_BY_HEADER.values()) {
      if ((mirror[field] ?? "") !== (row[field] ?? "")) {
        fail(`${row.auditKey} markdown/jsonl mismatch in ${field}`);
      }
    }
  }
  for (const row of markdownRows) {
    if (!seen.has(row.auditKey)) fail(`markdown table has extra Audit Key: ${row.auditKey}`);
  }

  for (const row of rows) {
    for (const field of FIELD_BY_HEADER.values()) {
      if (!row[field]) fail(`${row.auditKey || "(blank key)"} has empty required field: ${field}`);
    }
    if (!ALLOWED_CLASSIFICATIONS.has(row.classification)) {
      fail(`${row.auditKey} has invalid classification: ${row.classification}`);
    }
    if (!ALLOWED_RISKS.has(row.risk)) {
      fail(`${row.auditKey} has invalid risk: ${row.risk}`);
    }
    if (!row.evidenceChecked.trim()) fail(`${row.auditKey} missing Evidence Checked`);
    if (isAdministrativeEvidenceOnly(row.evidenceChecked)) {
      fail(`${row.auditKey} uses SUMMARY/checkbox/roadmap-only evidence`);
    }
    if (row.classification === "verified-current") {
      const hasLive = [...LIVE_MARKERS].some((marker) => hasMarker(row.evidenceChecked, marker));
      if (!hasLive) fail(`${row.auditKey} verified-current lacks live evidence marker`);
    } else if (row.disposition.toLowerCase() === "n/a") {
      fail(`${row.auditKey} non-verified row lacks disposition`);
    }
    if (row.classification === "superseded" && !hasMarker(row.evidenceChecked, "supersession")) {
      fail(`${row.auditKey} superseded row lacks supersession evidence`);
    }
    if (row.classification === "deprecated" && !hasMarker(row.evidenceChecked, "deprecation")) {
      fail(`${row.auditKey} deprecated row lacks deprecation evidence`);
    }
    validateEvidencePaths(row);
  }
}

function auditKeyCovers(auditKey, coverageKey) {
  return auditKey === coverageKey || auditKey.startsWith(`${coverageKey}:`);
}

function expectedKeysForSlice(inventory, sliceId) {
  const keys = inventory.sliceAssignments?.[sliceId]?.expectedCoverageKeys;
  if (!Array.isArray(keys)) fail(`unknown slice id or missing expected keys: ${sliceId}`);
  return keys;
}

function expectedAllCoverageKeys(inventory) {
  return [
    ...inventory.expectedIntegerRows.map((row) => row.coverageKey),
    ...inventory.expectedArchivedExtraRows.map(coverageKeyForExtra),
  ];
}

function validateExpectedCoverage(rows, expectedKeys, label) {
  const missing = expectedKeys.filter(
    (coverageKey) => !rows.some((row) => auditKeyCovers(row.auditKey, coverageKey)),
  );
  if (missing.length) fail(`${label} missing expected rows: ${missing.join(", ")}`);
}

function validateSlice(sliceId, sliceFile) {
  const inventory = validateInventory();
  const markdown = readText(sliceFile);
  const { structuredRows, markdownRows } = parseAuditDocument(markdown);
  validateRows(structuredRows, markdownRows);
  validateExpectedCoverage(structuredRows, expectedKeysForSlice(inventory, sliceId), `slice ${sliceId}`);
  console.log(`slice ok ${sliceId} rows=${structuredRows.length}`);
}

function validateGapLedger(rows) {
  const ledger = readText(GAP_LEDGER_PATH);
  const ledgerRows = parseMarkdownTable(ledger, GAP_LEDGER_HEADERS, "gap ledger");
  const normalizedLedgerRows = ledgerRows.map((row) => ({
    gapId: stripBackticks(row["Gap ID"]),
    auditKey: stripBackticks(row["Audit Key"]),
    sourcePhases: row["Source Phase(s)"],
    materialPromise: row["Material Promise"],
    classification: stripBackticks(row.Classification),
    severity: stripBackticks(row.Severity),
    evidence: row.Evidence,
    sliceCandidateProvenance: row["Slice Candidate Provenance"],
    recommendedRouting: stripBackticks(row["Recommended Routing"]),
    ownerRecommendation: row["Owner Recommendation"],
    blocking: row["Blocking?"],
    backlogLink: row["Backlog Link"],
  }));

  const seenLedgerKeys = new Set();
  for (const row of normalizedLedgerRows) {
    if (!row.auditKey) fail("gap ledger has blank Audit Key");
    if (seenLedgerKeys.has(row.auditKey)) fail(`gap ledger duplicate Audit Key: ${row.auditKey}`);
    seenLedgerKeys.add(row.auditKey);
    for (const [field, value] of Object.entries(row)) {
      if (!value) fail(`gap ledger ${row.auditKey} missing ${field}`);
    }
  }

  const materialRows = rows.filter((row) => GAP_CLASSIFICATIONS.has(row.classification));
  const materialKeys = new Set(materialRows.map((row) => row.auditKey));
  const missing = [...materialKeys].filter((key) => !seenLedgerKeys.has(key));
  const extra = [...seenLedgerKeys].filter((key) => !materialKeys.has(key));
  if (missing.length || extra.length) {
    fail(`gap ledger audit key mismatch missing=${missing.join(",")} extra=${extra.join(",")}`);
  }

  const backlog = fs.existsSync(".planning/BACKLOG.md") ? readText(".planning/BACKLOG.md") : "";
  for (const row of normalizedLedgerRows) {
    if (row.recommendedRouting === "backlog") {
      if (!row.backlogLink || row.backlogLink.toLowerCase() === "n/a") {
        fail(`gap ledger ${row.auditKey} backlog route lacks Backlog Link`);
      }
      const auditRowPattern = new RegExp(`Source Audit Row:\\*{0,2}\\s*${escapedRegex(row.auditKey)}`);
      const gapPattern = new RegExp(`Source Ledger Gap:\\*{0,2}\\s*${escapedRegex(row.gapId)}`);
      if (!auditRowPattern.test(backlog) || !gapPattern.test(backlog)) {
        fail(`backlog entry missing bidirectional trace for ${row.auditKey} / ${row.gapId}`);
      }
    }
  }
}

function stripBackticks(value) {
  return String(value ?? "").trim().replace(/^`+|`+$/g, "");
}

function validatePhase75Truth() {
  const files = [
    `${PHASE_DIR.replace("76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap", "75-cross-phase-promise-audit-and-location-presence-reality-clos")}/75-PROMISE-AUDIT.md`,
    `${PHASE_DIR.replace("76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap", "75-cross-phase-promise-audit-and-location-presence-reality-clos")}/75-REGRESSION-MATRIX.md`,
    `${PHASE_DIR.replace("76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap", "75-cross-phase-promise-audit-and-location-presence-reality-clos")}/75-VERIFICATION.md`,
    ".planning/ROADMAP.md",
    ".planning/STATE.md",
  ].filter((filePath) => fs.existsSync(filePath));

  const badPatterns = [
    /phase\s*75[\s\S]{0,180}(full historical|0-75|all prior phases|every prior phase)/i,
    /(full historical|0-75|all prior phases|every prior phase)[\s\S]{0,180}phase\s*75/i,
    /phase\s*75\s+added:\s*cross-phase promise audit/i,
  ];

  for (const filePath of files) {
    const text = readText(filePath);
    for (const pattern of badPatterns) {
      if (pattern.test(text)) {
        fail(`Phase 75 full-historical-audit misclaim found in ${filePath}`);
      }
    }
  }
}

function validateFinal() {
  const inventory = validateInventory();
  const auditMarkdown = readText(FINAL_AUDIT_PATH);
  const { structuredRows, markdownRows } = parseAuditDocument(auditMarkdown);
  validateRows(structuredRows, markdownRows);
  validateExpectedCoverage(structuredRows, expectedAllCoverageKeys(inventory), "final audit");
  const sliceRows = SLICE_FILES.flatMap((filePath) => {
    const parsed = parseAuditDocument(readText(filePath));
    validateRows(parsed.structuredRows, parsed.markdownRows);
    return parsed.structuredRows;
  });
  const sliceKeys = keySet(sliceRows);
  const finalKeys = keySet(structuredRows);
  const missingFromFinal = [...sliceKeys].filter((key) => !finalKeys.has(key));
  const extraInFinal = [...finalKeys].filter((key) => !sliceKeys.has(key));
  if (missingFromFinal.length || extraInFinal.length) {
    fail(`final/slice key mismatch missing=${missingFromFinal.join(",")} extra=${extraInFinal.join(",")}`);
  }
  readText(VALIDATION_PATH);
  validateGapLedger(structuredRows);
  validatePhase75Truth();
  console.log(`final ok rows=${structuredRows.length}`);
}

function fixtureBlocks(markdown) {
  const blocks = new Map();
  const lines = markdown.split(/\r?\n/);
  let currentName = null;
  let currentLines = [];

  function flush() {
    if (currentName) {
      blocks.set(currentName, currentLines.join("\n").trim());
    }
  }

  for (const line of lines) {
    const match = line.match(/^## Fixture: (.+)\s*$/);
    if (match) {
      flush();
      currentName = match[1].trim();
      currentLines = [];
    } else if (currentName) {
      currentLines.push(line);
    }
  }
  flush();
  return blocks;
}

function validateFixture(markdown) {
  const { structuredRows, markdownRows } = parseAuditDocument(markdown);
  validateRows(structuredRows, markdownRows);
}

function validateSelfTest() {
  const fixtures = fixtureBlocks(readText(FIXTURE_PATH));
  const expected = new Map([
    ["valid", true],
    ["invalid-markdown-jsonl-mismatch", false],
    ["invalid-duplicate-key", false],
    ["invalid-missing-disposition", false],
    ["invalid-missing-path", false],
  ]);

  for (const [name, shouldPass] of expected.entries()) {
    if (!fixtures.has(name)) fail(`missing fixture section: ${name}`);
    let passed = false;
    let errorMessage = "";
    try {
      validateFixture(fixtures.get(name));
      passed = true;
    } catch (error) {
      errorMessage = error.message;
    }
    if (shouldPass && !passed) fail(`fixture ${name} should pass but failed: ${errorMessage}`);
    if (!shouldPass && passed) fail(`fixture ${name} should fail but passed`);
    console.log(`self-test ${name} ${passed ? "passed" : "failed as expected"}`);
  }
  console.log("self-test ok");
}

function usage() {
  console.error(`Usage:
  node ${PHASE_DIR}/tools/validate-phase-76-audit.mjs --inventory
  node ${PHASE_DIR}/tools/validate-phase-76-audit.mjs --self-test
  node ${PHASE_DIR}/tools/validate-phase-76-audit.mjs --slice <sliceId> <sliceFile>
  node ${PHASE_DIR}/tools/validate-phase-76-audit.mjs --final`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "--inventory") {
    validateInventory();
    return;
  }
  if (command === "--self-test") {
    validateSelfTest();
    return;
  }
  if (command === "--slice") {
    if (rest.length !== 2) {
      usage();
      process.exitCode = 2;
      return;
    }
    validateSlice(rest[0], rest[1]);
    return;
  }
  if (command === "--final") {
    validateFinal();
    return;
  }
  usage();
  process.exitCode = 2;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`validation failed: ${error.message}`);
  process.exitCode = 1;
}
