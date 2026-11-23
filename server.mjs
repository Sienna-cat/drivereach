import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as domain from './src/domain.mjs';
import { createRepository } from './src/repository.mjs';
import { runEvaluation } from './evaluation/runner.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
function json(res, status, object) { res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' }); res.end(JSON.stringify(object)); }
async function parseBody(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 100000) { const e = new Error('请求内容超过限制'); e.status = 413; throw e; } parts.push(chunk); }
  try { const b = JSON.parse(Buffer.concat(parts).toString()); if (!b || Array.isArray(b) || typeof b !== 'object') throw new Error(); return b; }
  catch { throw new Error('请求 JSON 格式错误'); }
}

export function createApp({ database = ':memory:' } = {}) {
  const repository = createRepository(database);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1'); const p = url.pathname;
      if (req.method === 'GET' && p === '/api/config') return json(res, 200, { mode: 'deterministic-demo', demoDate: '2026-11-19', timezone: 'Asia/Shanghai', persistence: 'sqlite', ruleVersion: domain.RULE_VERSION });
      if (req.method === 'GET' && p === '/api/state') return json(res, 200, repository.load());
      if (req.method === 'GET' && p === '/api/metrics') return json(res, 200, repository.metrics());
      if (req.method === 'GET' && p === '/api/export') return json(res, 200, { config: { mode: 'deterministic-demo', ruleVersion: domain.RULE_VERSION }, state: repository.load() });
      if (req.method === 'GET' && p === '/api/evaluation') return json(res, 200, repository.load().evaluations[0] || null);
      if (req.method === 'GET' && p === '/api/verified-report') {
        try { return json(res, 200, JSON.parse(await readFile(resolve(ROOT, 'evidence/runs/current-all.json'), 'utf8'))); }
        catch { return json(res, 200, null); }
      }
      if (req.method === 'GET' && p === '/api/first-holdout') return json(res, 200, JSON.parse(await readFile(resolve(ROOT, 'evidence/runs/first-holdout-v0.2.json'), 'utf8')));
      if (req.method === 'GET' && p === '/api/baseline') {
        return json(res, 200, JSON.parse(await readFile(resolve(ROOT, 'evidence/runs/baseline-development.json'), 'utf8')));
      }
      if (req.method === 'POST' && p.startsWith('/api/')) {
        const b = await parseBody(req); const state = repository.load(); let result;
        if (p === '/api/conversations') result = domain.startConversation(state, b.leadId);
        else if (/^\/api\/conversations\/[^/]+\/turns$/.test(p)) result = domain.processTurn(state, p.split('/')[3], b.text);
        else if (p === '/api/handoffs') result = domain.requestHandoff(state, b.conversationId, b.reason, b.idempotencyKey);
        else if (/^\/api\/handoffs\/[^/]+\/accept$/.test(p)) result = domain.acceptHandoff(state, p.split('/')[3]);
        else if (p === '/api/callbacks') result = domain.scheduleCallback(state, b.leadId, b.agreedAt, b.consentQuote, b.idempotencyKey);
        else if (p === '/api/agents') { if (typeof b.busy !== 'boolean') throw new Error('busy 必须为布尔值'); state.agentStates.forEach(a => { a.status = b.busy ? 'talking' : 'idle'; }); result = state.agentStates; }
        else if (p === '/api/dispatch/simulate') result = domain.simulateDispatch(b);
        else if (p === '/api/evaluation') { result = runEvaluation(); state.evaluations.unshift(result); state.evaluations = state.evaluations.slice(0, 20); }
        else if (p === '/api/reset') { repository.save(domain.createInitialState()); return json(res, 200, { state: repository.load() }); }
        else return json(res, 404, { error: '接口不存在' });
        // Mutate a loaded copy and commit only on success. Errors leave SQLite unchanged.
        repository.save(state);
        return json(res, 200, { result, state });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '不支持的方法' });
      let path = decodeURIComponent(p); if (path === '/') path = '/index.html';
      const file = resolve(PUBLIC, `.${path}`); const rel = relative(PUBLIC, file);
      if (!rel || rel.startsWith('..') || !Object.hasOwn(MIME, extname(file))) return json(res, 404, { error: '页面不存在' });
      let content; try { content = await readFile(file); } catch { return json(res, 404, { error: '页面不存在' }); }
      res.writeHead(200, { 'content-type': MIME[extname(file)], 'cache-control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { error: error.message || '操作失败' }); else res.destroy(); }
  });
  server.repository = repository; return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.PORT || process.argv[2] || 4197);
  createApp({ database: process.env.DRIVEREACH_DB || resolve(ROOT, 'data/demo.sqlite') }).listen(port, '127.0.0.1', () => console.log(`DriveReach AI: http://127.0.0.1:${port}`));
}
