const fs = require('node:fs');
const backend = 'http://localhost:3001';
const campaignId = '0ed6bb3c-a528-4067-8f29-86ebdd8d0637';
const summaryPath = process.env.SUMMARY_PATH;
const rawPath = process.env.RAW_PATH;
const action = 'I push through the narrow ledger curtain into whatever stamp alcove sits behind this records back room, ring for the clerk if nobody is there, and ask for a fresh wax-marked canal transfer slip I can actually carry.';
function log(line) { console.log(`${new Date().toISOString()} ${line}`); }
async function fetchJson(path, init) {
  const response = await fetch(`${backend}${path}`, init);
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed ${response.status}: ${await response.text()}`);
  return response.json();
}
function dispatchSseBlock(block, state) {
  const lines = block.split(/\r?\n/);
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines.filter((line) => line.startsWith('data:'));
  const event = eventLine ? eventLine.slice('event:'.length).trim() : '';
  const dataText = dataLines.map((line) => line.slice('data:'.length).trim()).join('\n');
  let data = null;
  try { data = dataText ? JSON.parse(dataText) : null; } catch {}
  if (!event) return;
  state.events.push({ event, data });
  if (event === 'scene-settling') log(`[sse] scene-settling phase=${data?.phase ?? ''} stage=${data?.stage ?? ''}`);
  else if (event === 'finalizing_turn') log(`[sse] finalizing stage=${data?.stage ?? ''} tick=${data?.tick ?? ''}`);
  else if (event === 'state_update') log(`[sse] state_update tool=${data?.tool ?? ''}`);
  else if (event === 'narrative') log(`[sse] narrative +${data?.text?.length ?? 0}`);
  else log(`[sse] ${event}`);
}
async function readSse(response) {
  if (!response.body) throw new Error('empty response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { events: [] };
  let buffer = '';
  let raw = '';
  let nextLogAt = Date.now() + 30000;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) dispatchSseBlock(part, state);
    if (Date.now() >= nextLogAt) {
      log(`[wait] still streaming; events=${state.events.length}; last=${state.events.at(-1)?.event ?? 'none'}`);
      nextLogAt = Date.now() + 30000;
    }
  }
  if (buffer.trim()) dispatchSseBlock(buffer, state);
  fs.writeFileSync(rawPath, raw, 'utf8');
  return state.events;
}
async function main() {
  await fetchJson(`/api/campaigns/${campaignId}/load`, { method: 'POST' });
  const beforeWorld = await fetchJson(`/api/campaigns/${campaignId}/world`);
  const beforeHistory = await fetchJson(`/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
  log(`[setup] currentScene=${beforeWorld.currentScene?.name ?? 'none'} messages=${beforeHistory.messages.length}`);
  log(`[action] ${action}`);
  const started = Date.now();
  const response = await fetch(`${backend}/api/chat/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, playerAction: action, intent: action, method: '' }),
  });
  if (!response.ok) throw new Error(`/api/chat/action failed ${response.status}: ${await response.text()}`);
  const events = await readSse(response);
  const afterWorld = await fetchJson(`/api/campaigns/${campaignId}/world`);
  const afterHistory = await fetchJson(`/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`);
  const newMessages = afterHistory.messages.slice(beforeHistory.messages.length);
  const assistant = [...newMessages].reverse().find((message) => message.role === 'assistant')?.content ?? '';
  const summary = {
    campaignId,
    action,
    elapsedMs: Date.now() - started,
    events: events.map((entry) => ({ event: entry.event, phase: entry.data?.phase, stage: entry.data?.stage, tool: entry.data?.tool, error: entry.data?.error })),
    errorEvents: events.filter((entry) => entry.event === 'error').map((entry) => entry.data),
    doneCount: events.filter((entry) => entry.event === 'done').length,
    finalizingEvents: events.filter((entry) => entry.event === 'finalizing_turn').map((entry) => entry.data),
    stateUpdateTools: events.filter((entry) => entry.event === 'state_update').map((entry) => entry.data?.tool),
    beforeScene: beforeWorld.currentScene,
    afterScene: afterWorld.currentScene,
    newItems: afterWorld.items.filter((item) => !beforeWorld.items.some((old) => old.id === item.id)).map((item) => ({ id: item.id, name: item.name, ownerId: item.ownerId, locationId: item.locationId })),
    newNpcs: afterWorld.npcs.filter((npc) => !beforeWorld.npcs.some((old) => old.id === npc.id)).map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier, currentLocationId: npc.currentLocationId, sceneScopeId: npc.sceneScopeId })),
    newLocations: afterWorld.locations.filter((location) => !beforeWorld.locations.some((old) => old.id === location.id)).map((location) => ({ id: location.id, name: location.name, kind: location.kind, parentLocationId: location.parentLocationId })),
    newMessages,
    assistantPreview: assistant.slice(0, 1200),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  log(`[summary] elapsed=${Math.round(summary.elapsedMs / 1000)}s done=${summary.doneCount} errors=${summary.errorEvents.length} tools=${summary.stateUpdateTools.join(',')} newLocations=${summary.newLocations.map((x)=>x.name).join('|')} newNpcs=${summary.newNpcs.map((x)=>x.name).join('|')} newItems=${summary.newItems.map((x)=>x.name).join('|')}`);
  if (summary.errorEvents.length > 0 || summary.doneCount < 1) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
