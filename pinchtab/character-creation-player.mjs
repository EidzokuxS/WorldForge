// Phase 61 player character creation smoke test.
// Precondition: backend on :3001, frontend on :3000, PinchTab bridge on :9867.
// Requires a campaign id with generationComplete=true.
// Run: node pinchtab/character-creation-player.mjs <campaignId>
// Exits 0 on pass, non-zero on failure.

const BRIDGE = "http://localhost:9867";
const campaignId = process.argv[2];
if (!campaignId) {
  console.error("usage: node pinchtab/character-creation-player.mjs <campaignId>");
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
  console.log("[1/7] Navigating to player creation page...");
  await navigate(`http://localhost:3000/campaign/${campaignId}/character`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log("[2/7] Asserting 4 creation modes present...");
  const modeCount = await evaluate(`
    var tabs = document.querySelectorAll('[role="tab"]');
    tabs.length;
  `);
  if (modeCount.result !== 4) throw new Error(`Expected 4 modes, got ${modeCount.result}`);

  console.log("[3/7] Typing description...");
  await evaluate(`
    var ta = document.querySelector('textarea');
    var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "an old warrior haunted by a guilty past");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  `);

  console.log("[4/7] Typing into OverrideTextField...");
  await evaluate(`
    var ovr = document.querySelector('[id="character-override-text"]');
    var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ovr, "eyes are red not blue");
    ovr.dispatchEvent(new Event("input", { bubbles: true }));
  `);

  console.log("[5/7] Clicking Parse button (programmatic click)...");
  await evaluate(`
    var btns = Array.from(document.querySelectorAll("button"));
    var parse = btns.find(b => b.textContent && b.textContent.trim().toLowerCase().startsWith("parse"));
    if (parse === undefined) throw new Error("no parse button");
    parse.click();
  `);

  console.log("[6/7] Waiting for draft to render (30s)...");
  await new Promise((r) => setTimeout(r, 30000));

  console.log("[7/7] Asserting PowerStatsSection visible...");
  const hasStats = await evaluate(`
    var labels = Array.from(document.querySelectorAll("td, span, label")).map(n => n.textContent);
    labels.some(t => t && t.indexOf("Attack Potency") >= 0);
  `);
  if (hasStats.result === false) throw new Error("Power Stats section not rendered on player card");

  const hasRed = await evaluate(`document.body.textContent.toLowerCase().indexOf("red") >= 0;`);
  if (hasRed.result === false) {
    console.warn("[WARN] 'red' not in rendered text — override may not have propagated into appearance");
  }

  console.log("PASS \u2014 player creation smoke completed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
