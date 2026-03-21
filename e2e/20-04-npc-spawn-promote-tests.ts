/**
 * Phase 20 Plan 04: NPC Spawn + Upward Tier Promotion Tests
 *
 * Gap closure tests:
 * - Gap 3: spawn_npc never triggered in 18 turns -- test via direct DB insert
 * - Gap 4: Upward tier promotion untested -- full chain temporary -> persistent -> key
 *
 * Strategy: Insert a temporary NPC directly into campaign SQLite DB,
 * verify it appears in world API, then promote through all tiers.
 *
 * Requires: backend running on localhost:3001, campaign loaded.
 */

import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

var BASE = "http://localhost:3001";
var CAMPAIGN_ID = "b85729f8-0de4-4d93-a0c3-e1c45646219c";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NpcData {
  id: string;
  name: string;
  tier: string;
  currentLocationId: string | null;
  tags: string;
  persona: string;
}

interface WorldData {
  npcs: NpcData[];
  locations: Array<{ id: string; name: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

var passed = 0;
var failed = 0;
var results: Array<{ name: string; ok: boolean; detail: string }> = [];

function assert(name: string, condition: boolean, detail: string = ""): void {
  if (condition) {
    passed++;
    results.push({ name, ok: true, detail });
    console.log(`  PASS: ${name}${detail ? ` -- ${detail}` : ""}`);
  } else {
    failed++;
    results.push({ name, ok: false, detail });
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function getWorldData(): Promise<WorldData> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/world`);
  if (!res.ok) throw new Error(`GET /world failed: ${res.status}`);
  return (await res.json()) as WorldData;
}

async function loadCampaign(): Promise<void> {
  var res = await fetch(`${BASE}/api/campaigns/${CAMPAIGN_ID}/load`, {
    method: "POST",
  });
  if (!res.ok) {
    var text = await res.text();
    throw new Error(`Load campaign failed: ${res.status} ${text}`);
  }
}

function createTempNpcInDb(name: string, locationId: string): string {
  var id = crypto.randomUUID();
  var dbPath = path.resolve(
    process.cwd(),
    "..",
    "campaigns",
    CAMPAIGN_ID,
    "state.db"
  );
  var db = new Database(dbPath);
  db.prepare(
    `INSERT INTO npcs (id, campaign_id, name, persona, tags, tier, current_location_id, goals, beliefs, unprocessed_importance, inactive_ticks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    CAMPAIGN_ID,
    name,
    "A mysterious test traveler",
    '["Mysterious","Traveler","Test"]',
    "temporary",
    locationId,
    '{"short_term":["Find shelter"],"long_term":["Survive"]}',
    "[]",
    0,
    0,
    Date.now()
  );
  db.close();
  return id;
}

function deleteTempNpcFromDb(npcId: string): void {
  var dbPath = path.resolve(
    process.cwd(),
    "..",
    "campaigns",
    CAMPAIGN_ID,
    "state.db"
  );
  var db = new Database(dbPath);
  db.prepare("DELETE FROM npcs WHERE id = ?").run(npcId);
  db.close();
}

// ─── Test 1: Create temporary NPC via DB insert, verify in world API ────────

async function testSpawnTempNpc(): Promise<string> {
  console.log("\n========== TEST 1: Create Temporary NPC (spawn_npc path) ==========\n");

  // Get world data for a valid locationId
  var world = await getWorldData();
  var location = world.locations.find((l) => l.id != null);
  if (!location) throw new Error("No location found in world data");

  console.log(`[Spawn] Using location: ${location.name} (${location.id})`);
  var npcCountBefore = world.npcs.length;
  console.log(`[Spawn] NPCs before: ${npcCountBefore}`);

  // Insert temporary NPC directly into DB (simulates what handleSpawnNpc does)
  var testNpcName = "Test Wanderer Zephyr";
  var npcId = createTempNpcInDb(testNpcName, location.id);
  console.log(`[Spawn] Inserted temp NPC: ${testNpcName} (${npcId})`);

  // Reload campaign so backend picks up the new NPC from DB
  await loadCampaign();

  // Verify via world API
  var worldAfter = await getWorldData();
  var newNpc = worldAfter.npcs.find((n) => n.id === npcId);

  assert(
    "Spawn-temp-npc-exists",
    newNpc != null,
    `NPC ${npcId} found in world data: ${newNpc != null}`
  );

  assert(
    "Spawn-temp-tier-correct",
    newNpc?.tier === "temporary",
    `Tier: ${newNpc?.tier}`
  );

  assert(
    "Spawn-temp-name-correct",
    newNpc?.name === testNpcName,
    `Name: ${newNpc?.name}`
  );

  assert(
    "Spawn-temp-location-correct",
    newNpc?.currentLocationId === location.id,
    `LocationId: ${newNpc?.currentLocationId}`
  );

  assert(
    "Spawn-temp-count-increased",
    worldAfter.npcs.length === npcCountBefore + 1,
    `NPCs after: ${worldAfter.npcs.length} (was ${npcCountBefore})`
  );

  return npcId;
}

// ─── Test 2: Promote temporary -> persistent ────────────────────────────────

async function testPromoteTempToPersistent(npcId: string): Promise<void> {
  console.log("\n========== TEST 2: Promote temporary -> persistent ==========\n");

  var res = await fetch(
    `${BASE}/api/campaigns/${CAMPAIGN_ID}/npcs/${npcId}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newTier: "persistent" }),
    }
  );

  var body = (await res.json()) as Record<string, unknown>;
  console.log(`[Promote] Response: ${res.status} ${JSON.stringify(body)}`);

  assert(
    "Promotion-temp-to-persistent-200",
    res.status === 200,
    `Status: ${res.status}`
  );

  assert(
    "Promotion-response-oldTier",
    body.oldTier === "temporary",
    `oldTier: ${body.oldTier}`
  );

  assert(
    "Promotion-response-newTier",
    body.newTier === "persistent",
    `newTier: ${body.newTier}`
  );

  // Verify in world data
  var world = await getWorldData();
  var npc = world.npcs.find((n) => n.id === npcId);
  assert(
    "Promotion-tier-verified-persistent",
    npc?.tier === "persistent",
    `Tier in world data: ${npc?.tier}`
  );
}

// ─── Test 3: Promote persistent -> key ──────────────────────────────────────

async function testPromotePersistentToKey(npcId: string): Promise<void> {
  console.log("\n========== TEST 3: Promote persistent -> key ==========\n");

  var res = await fetch(
    `${BASE}/api/campaigns/${CAMPAIGN_ID}/npcs/${npcId}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newTier: "key" }),
    }
  );

  var body = (await res.json()) as Record<string, unknown>;
  console.log(`[Promote] Response: ${res.status} ${JSON.stringify(body)}`);

  assert(
    "Promotion-persistent-to-key-200",
    res.status === 200,
    `Status: ${res.status}`
  );

  assert(
    "Promotion-response-key-oldTier",
    body.oldTier === "persistent",
    `oldTier: ${body.oldTier}`
  );

  assert(
    "Promotion-response-key-newTier",
    body.newTier === "key",
    `newTier: ${body.newTier}`
  );

  // Verify in world data
  var world = await getWorldData();
  var npc = world.npcs.find((n) => n.id === npcId);
  assert(
    "Promotion-tier-verified-key",
    npc?.tier === "key",
    `Tier in world data: ${npc?.tier}`
  );
}

// ─── Test 4: Double promotion blocked (key -> key) ──────────────────────────

async function testDoublePromotionBlocked(npcId: string): Promise<void> {
  console.log("\n========== TEST 4: Double promotion blocked (key -> key) ==========\n");

  var res = await fetch(
    `${BASE}/api/campaigns/${CAMPAIGN_ID}/npcs/${npcId}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newTier: "key" }),
    }
  );

  var body = (await res.json()) as Record<string, unknown>;
  console.log(`[Promote] Response: ${res.status} ${JSON.stringify(body)}`);

  assert(
    "Promotion-key-to-key-400",
    res.status === 400,
    `Status: ${res.status}`
  );

  assert(
    "Promotion-blocked-error-message",
    typeof body.error === "string" &&
      (body.error as string).includes("promote upward"),
    `Error: ${body.error}`
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Phase 20 Plan 04: NPC Spawn + Upward Tier Promotion Tests");
  console.log(`Campaign: ${CAMPAIGN_ID}`);
  console.log(`Backend: ${BASE}`);
  console.log();

  // Ensure campaign is loaded
  await loadCampaign();

  var testNpcId: string | null = null;

  try {
    // Test 1: Spawn temp NPC
    testNpcId = await testSpawnTempNpc();

    // Test 2: Promote temporary -> persistent
    await testPromoteTempToPersistent(testNpcId);

    // Test 3: Promote persistent -> key
    await testPromotePersistentToKey(testNpcId);

    // Test 4: Double promotion blocked
    await testDoublePromotionBlocked(testNpcId);
  } finally {
    // Cleanup: remove test NPC from DB
    if (testNpcId) {
      console.log(`\n[Cleanup] Removing test NPC ${testNpcId} from DB`);
      deleteTempNpcFromDb(testNpcId);

      // Reload campaign so backend state is clean
      await loadCampaign();

      // Verify cleanup
      var world = await getWorldData();
      var cleaned = world.npcs.find((n) => n.id === testNpcId);
      console.log(`[Cleanup] NPC removed: ${cleaned == null ? "yes" : "no"}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log("\n\n========== RESULTS SUMMARY ==========\n");
  for (var r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}: ${r.name}${r.detail ? ` -- ${r.detail}` : ""}`);
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
