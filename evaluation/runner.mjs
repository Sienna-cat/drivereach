import { createHash } from 'node:crypto';
import * as current from '../src/domain.mjs';
import { CASES } from './cases.mjs';

export const DATASET_HASH = createHash('sha256').update(JSON.stringify(CASES)).digest('hex');
const valueAt = (o, path) => path.split('.').reduce((v, key) => v?.[key], o);

function execute(engine, c) {
  const s = engine.createInitialState(); let convo, result, rejected = false;
  const i = c.input;
  try {
    if (i.type === 'dispatch') return engine.simulateDispatch({ seed: 7, queued: 12, connectProbability: 0.5, ...i });
    if (['callback', 'repeatCallback'].includes(i.type)) {
      const args = [s, 'lead-001', i.time || '2026-11-20T10:00:00+08:00', i.quote ?? '明天十点可以回拨', 'eval-callback'];
      engine.scheduleCallback(...args);
      if (i.type === 'repeatCallback') engine.scheduleCallback(...args);
    } else {
      convo = engine.startConversation(s, 'lead-001');
      if (i.type === 'turn') result = engine.processTurn(s, convo.id, i.text);
      else if (i.type === 'repeatStart') engine.startConversation(s, 'lead-001');
      else if (i.type === 'closedTurn') { engine.processTurn(s, convo.id, '车已经卖了'); engine.processTurn(s, convo.id, '继续'); }
      else if (i.type === 'restartSuppressed') { engine.processTurn(s, convo.id, '不要再联系我'); engine.startConversation(s, 'lead-001'); }
      else if (i.type === 'correction') { engine.processTurn(s, convo.id, '60000公里'); result = engine.processTurn(s, convo.id, '更正，是63000公里'); }
      else if (i.type === 'unclear') { engine.processTurn(s, convo.id, '嗯嗯嗯'); result = engine.processTurn(s, convo.id, '什么什么'); }
      else if (i.type === 'empty') engine.processTurn(s, convo.id, '');
      else if (['handoff', 'requestOnly'].includes(i.type)) {
        if (i.busy) s.agentStates.forEach(a => { a.status = 'talking'; });
        const h = engine.requestHandoff(s, convo.id, '客户要求人工', 'eval-handoff');
        if (i.type === 'handoff') engine.acceptHandoff(s, h.id);
      }
    }
  } catch { rejected = true; }
  const lead = s.leads[0];
  return { rejected, vehicle: lead.vehicle, eligible: lead.contactEligible, status: lead.status,
    route: result?.route?.action, callbackCount: s.callbacks.length, callbackStatus: s.callbacks[0]?.status,
    conversationCount: s.conversations.length, conversationStatus: convo?.status, handoffStatus: s.handoffs[0]?.status,
    fieldStatus: Object.fromEntries((convo?.fieldEvidence || []).map(e => [e.field, e.status])),
    mileageEvidenceCount: convo?.fieldEvidence?.filter(e => e.field === 'mileage').length,
  };
}

export function runEvaluation({ engine = current, split = 'all', version = current.RULE_VERSION } = {}) {
  const cases = CASES.filter(c => split === 'all' || c.split === split);
  const results = cases.map(c => {
    const full = execute(engine, c); const actual = Object.fromEntries(Object.keys(c.expected).map(key => [key, valueAt(full, key) ?? (valueAt(full, key) === null ? null : '[missing]')]));
    const mismatches = Object.keys(c.expected).filter(key => JSON.stringify(c.expected[key]) !== JSON.stringify(actual[key]));
    return { ...c, actual, pass: mismatches.length === 0, mismatches, failureType: mismatches.length ? (c.group === '正常采集' || c.group === '单位与更正' ? 'extraction_coverage' : 'business_rule') : null };
  });
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), mode: 'deterministic-synthetic', version,
    datasetHash: DATASET_HASH, split, total: results.length, passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length, results,
    limitation: '合成案例上的规则覆盖验证；不代表真实模型准确率、电话体验或业务收益。留出结果查看后不再作为未见数据。',
  };
}
