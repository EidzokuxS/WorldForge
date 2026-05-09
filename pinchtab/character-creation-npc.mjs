// Phase 61 NPC creation smoke test (world-review NPC tab).
// Precondition: backend on :3001, frontend on :3000, PinchTab bridge on :9867.
// Requires a campaign id with generationComplete=true and at least one location.
// Run: node pinchtab/character-creation-npc.mjs <campaignId>
// Exits 0 on pass, non-zero on failure.

const BRIDGE = "http://localhost:9867";
const campaignId = process.argv[2];
if (!campaignId) {
  console.error("usage: node pinchtab/character-creation-npc.mjs <campaignId>");
  process.exit(2);
}

async function bridge(method, path, body) {
  const res = await fetch(`${BRIDGE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} => ${res.status} ${res.statusText}`);
  return res.json();
}

const navigate = (url) => bridge("POST", "/navigate", { url });
const evaluate = (script) => bridge("POST", "/evaluate", { script });

async function main() {
  console.log("[1/8] Navigating to world review page...");
  await navigate(`http://localhost:3000/campaign/${campaignId}/review`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log("[2/8] Selecting NPCs tab if present...");
  await evaluate(`
    var tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    var npcTab = tabs.find(t => t.textContent && t.textContent.toLowerCase().indexOf("npc") >= 0);
    if (npcTab) npcTab.click();
  `);
  await new Promise((r) => setTimeout(r, 800));

  console.log("[3/8] Asserting CreationModes (4 mode tabs) inside Create an NPC...");
  const modeCount = await evaluate(`
    var modes = document.querySelectorAll('[aria-label="Creation modes"] [role="tab"]');
    modes.length;
  `);
  if (modeCount.result !== 4) throw new Error(`Expected 4 NPC creation modes, got ${modeCount.result}`);

  console.log("[4/8] Activating AI Generate mode (generate-from-scratch)...");
  await evaluate(`
    var modes = Array.from(document.querySelectorAll('[aria-label="Creation modes"] [role="tab"]'));
    var generate = modes.find(m => m.getAttribute("aria-label") && m.getAttribute("aria-label").toLowerCase().indexOf("from scratch") >= 0);
    if (generate === undefined) throw new Error("no generate-from-scratch tab");
    generate.click();
  `);
  await new Promise((r) => setTimeout(r, 400));

  console.log("[5/8] Typing into OverrideTextField...");
  await evaluate(`
    var ovr = document.querySelector('[id="character-override-text"]');
    var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ovr, "speaks in archaic English");
    ovr.dispatchEvent(new Event("input", { bubbles: true }));
  `);

  console.log("[6/8] Clicking Generate button...");
  await evaluate(`
    var btns = Array.from(document.querySelectorAll("button"));
    var gen = btns.find(b => b.textContent && b.textContent.trim().toLowerCase() === "generate");
    if (gen === undefined) throw new Error("no generate button");
    gen.click();
  `);

  console.log("[7/8] Waiting for new NPC card to render (45s)...");
  await new Promise((r) => setTimeout(r, 45000));

  console.log("[8/8] Asserting Power Stats visible + no franchise names...");
  const hasStats = await evaluate(`
    document.body.textContent.indexOf("Attack Potency") >= 0;
  `);
  if (hasStats.result === false) throw new Error("Power Stats not rendered on NPC card");

  const hasFranchise = await evaluate(`
    var bad = ["gandalf", "naruto", "gojo", "coruscant", "konoha", "hogwarts"];
    var body = document.body.textContent.toLowerCase();
    bad.some(function (w) { return body.indexOf(w) >= 0; });
  `);
  if (hasFranchise.result === true) throw new Error("franchise name leaked into rendered NPC content");

  console.log("PASS \u2014 NPC creation smoke completed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
