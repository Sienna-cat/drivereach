import * as domain from './domain.mjs';
import { runEvaluation } from './evaluation.mjs';

const KEY = 'drivereach-static-v1';
export function createStaticApi(storage) {
  if (!storage) { try { storage = globalThis.localStorage; } catch {} }
  let current = domain.createInitialState();
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    if (saved?.version === current.version && ['leads', 'conversations', 'callTasks', 'handoffs', 'callbacks', 'events', 'agentStates', 'evaluations'].every(key => Array.isArray(saved[key]))) current = saved;
  } catch { /* Storage unavailable: keep a usable in-memory session. */ }
  const config = { mode: 'deterministic-demo', persistence: 'browser-local', ruleVersion: domain.RULE_VERSION };
  return async (path, body) => {
    if (body === undefined) {
      if (path === '/api/state') return structuredClone(current);
      if (path === '/api/config') return { ...config };
      if (path === '/api/export') return { config, state: structuredClone(current) };
      throw new Error('演示接口不存在');
    }
    // Work on a copy: a rejected action must never leave partial state behind.
    let state = structuredClone(current), result;
    if (path === '/api/conversations') result = domain.startConversation(state, body.leadId);
    else if (/^\/api\/conversations\/[^/]+\/turns$/.test(path)) result = domain.processTurn(state, path.split('/')[3], body.text);
    else if (path === '/api/handoffs') result = domain.requestHandoff(state, body.conversationId, body.reason, body.idempotencyKey);
    else if (/^\/api\/handoffs\/[^/]+\/accept$/.test(path)) result = domain.acceptHandoff(state, path.split('/')[3]);
    else if (path === '/api/callbacks') result = domain.scheduleCallback(state, body.leadId, body.agreedAt, body.consentQuote, body.idempotencyKey);
    else if (path === '/api/agents') {
      if (typeof body.busy !== 'boolean') throw new Error('busy 必须为布尔值');
      state.agentStates.forEach(agent => { agent.status = body.busy ? 'talking' : 'idle'; });
      result = state.agentStates;
    } else if (path === '/api/dispatch/simulate') result = domain.simulateDispatch(body);
    else if (path === '/api/evaluation') {
      result = runEvaluation();
      state.evaluations.unshift(result);
      state.evaluations = state.evaluations.slice(0, 20);
    } else if (path === '/api/reset') state = domain.createInitialState();
    else throw new Error('演示接口不存在');
    current = state;
    try { storage.setItem(KEY, JSON.stringify(current)); }
    catch { return { result, state: structuredClone(current), warning: '操作已完成，但浏览器无法保存；请导出记录，刷新可能丢失。' }; }
    return { result, state: structuredClone(current) };
  };
}
