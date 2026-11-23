import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runtime = await import('../server.mjs').catch(() => ({}));

async function serve(run, database) {
  assert.equal(typeof runtime.createApp, 'function', 'HTTP server must exist');
  const app = runtime.createApp({ database: database || ':memory:' });
  await new Promise((resolve, reject) => { app.once('error', reject); app.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try { await run({ base, post }); } finally { await new Promise(resolve => app.close(resolve)); app.repository.close(); }
}

test('config honestly labels deterministic mode and has no model secret', async () => serve(async ({ base }) => {
  const c = await (await fetch(base + '/api/config')).json();
  assert.equal(c.mode, 'deterministic-demo'); assert.equal(c.persistence, 'sqlite'); assert.equal(c.apiKey, undefined);
}));

test('HTTP turn creates evidence and refusal cannot be bypassed by a new start', async () => serve(async ({ post, base }) => {
  const start = await post('/api/conversations', { leadId: 'lead-001' });
  assert.equal(start.status, 200);
  const id = start.body.result.id;
  const r = await post(`/api/conversations/${id}/turns`, { text: '丰田卡罗拉，2021年上牌，63000公里' });
  assert.equal(r.body.result.updates.find(u => u.field === 'mileage').value, 63000);
  await post(`/api/conversations/${id}/turns`, { text: '不要再联系我' });
  assert.equal((await post('/api/conversations', { leadId: 'lead-001' })).status, 400);
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.leads[0].contactEligible, false);
}));

test('invalid and oversized JSON requests do not mutate state', async () => serve(async ({ base, post }) => {
  assert.equal((await post('/api/conversations', { leadId: 'missing' })).status, 400);
  for (const body of ['{broken', JSON.stringify({ text: 'x'.repeat(100001) })]) {
    const r = await fetch(base + '/api/conversations', { method: 'POST', body });
    assert.ok([400, 413].includes(r.status));
  }
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.conversations.length, 0);
}));

test('SQLite state survives server restart and duplicate callback creates one record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drivereach-db-')); const database = join(dir, 'test.sqlite');
  try {
    await serve(async ({ post }) => {
      const body = { leadId: 'lead-001', agreedAt: '2026-11-20T10:00:00+08:00', consentQuote: '明天十点可以回拨', idempotencyKey: 'same' };
      assert.equal((await post('/api/callbacks', body)).status, 200);
      assert.equal((await post('/api/callbacks', body)).status, 200);
    }, database);
    await serve(async ({ base }) => {
      const state = await (await fetch(base + '/api/state')).json();
      assert.equal(state.callbacks.length, 1); assert.equal(state.callbacks[0].status, 'scheduled');
      const metrics = await (await fetch(base + '/api/metrics')).json();
      assert.equal(metrics.scheduledCallbacks, 1);
    }, database);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('static boundary blocks private source and configuration', async () => serve(async ({ base }) => {
  for (const path of ['/.env', '/server.mjs', '/src/domain.mjs', '/tests/server.test.mjs', '/%2e%2e%2fpackage.json']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
}));
