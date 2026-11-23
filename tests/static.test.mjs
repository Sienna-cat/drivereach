import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build-static.mjs'], { cwd: new URL('../', import.meta.url) });
const { createStaticApi } = await import('../dist/static-api.mjs');
const { runEvaluation } = await import('../evaluation/runner.mjs');
function storage() { const values = new Map(); return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }; }

test('browser mode preserves conversation evidence after refresh and isolates visitors', async () => {
  const saved = storage(), api = createStaticApi(saved);
  const started = await api('/api/conversations', { leadId: 'lead-001' });
  const id = started.state.conversations[0].id;
  await api(`/api/conversations/${id}/turns`, { text: '丰田卡罗拉，2020年上牌，63000公里' });
  const restored = await createStaticApi(saved)('/api/state');
  assert.equal(restored.leads[0].vehicle.mileage, 63000);
  assert.ok(restored.conversations[0].fieldEvidence.some(e => e.field === 'mileage' && e.quote));
  assert.equal((await createStaticApi(storage())('/api/state')).conversations.length, 0);
});

test('browser refusal blocks restarting and rejected writes leave state intact', async () => {
  const api = createStaticApi(storage());
  const { state } = await api('/api/conversations', { leadId: 'lead-002' });
  await api(`/api/conversations/${state.conversations[0].id}/turns`, { text: '以后不要再联系我' });
  const before = await api('/api/state');
  await assert.rejects(api('/api/conversations', { leadId: 'lead-002' }));
  assert.deepEqual(await api('/api/state'), before);
  assert.equal(before.leads[1].contactEligible, false);
});

test('browser evaluations actually rerun all cases with the same results as server', async () => {
  const api = createStaticApi(storage());
  const first = (await api('/api/evaluation', {})).result;
  const second = (await api('/api/evaluation', {})).result;
  assert.equal(first.total, 40);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.results, runEvaluation().results);
  assert.equal((await api('/api/state')).evaluations.length, 2);
});

test('unavailable browser storage keeps actions usable and reports persistence limits', async () => {
  const api = createStaticApi({ getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } });
  const created = await api('/api/conversations', { leadId: 'lead-001' });
  assert.ok(created.warning);
  assert.equal(created.state.conversations.length, 1);
  assert.equal((await api('/api/state')).conversations.length, 1);
  assert.equal((await api('/api/reset', {})).state.conversations.length, 0);
});
