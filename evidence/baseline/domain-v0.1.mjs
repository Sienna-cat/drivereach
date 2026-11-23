import { DEMO_DATE, SCHEMA_VERSION, createInitialState } from './data.mjs';

let sequence = 0;
const id = prefix => `${prefix}-${++sequence}`;
const now = () => `${DEMO_DATE}T03:08:00+08:00`;

function leadFor(state, leadId) {
  const lead = state.leads.find(item => item.id === leadId);
  if (!lead) throw new Error('线索不存在');
  return lead;
}

function conversationFor(state, conversationId) {
  const conversation = state.conversations.find(item => item.id === conversationId);
  if (!conversation) throw new Error('会话不存在');
  return conversation;
}

function event(state, type, payload = {}) {
  state.events.unshift({ id: id('event'), type, occurredAt: now(), payload });
}

function cancelQueued(state, leadId, reason) {
  state.callTasks.filter(task => task.leadId === leadId && ['queued', 'dialing', 'connected'].includes(task.status)).forEach(task => {
    task.status = 'cancelled';
    task.cancelReason = reason;
  });
}

function evidence(field, value, quote, turnId, status = 'confirmed') {
  return { field, value, status, quote, turnId };
}

function parseChineseNumber(value) {
  if (/^\d/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };
  let total = 0;
  let section = 0;
  let current = 0;
  for (const char of value) {
    if (digits[char] !== undefined) current = digits[char];
    else if (units[char]) {
      const unit = units[char];
      if (unit >= 10000) {
        section += current;
        total += section * unit;
        section = 0;
      } else {
        section += (current || 1) * unit;
      }
      current = 0;
    }
  }
  return total + section + current;
}

function parseFields(text, turnId) {
  const updates = [];
  const model = text.match(/丰田卡罗拉|本田雅阁|特斯拉\s*Model\s*3/i)?.[0];
  if (model) updates.push(evidence('model', model.replace(/\s+/g, ' '), model, turnId));
  const yearMatch = text.match(/(20\d{2}|\d{2})\s*年(?:上牌|注册)/);
  if (yearMatch) {
    const year = Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]);
    updates.push(evidence('registrationYear', year, yearMatch[0], turnId));
  }
  const mileageMatch = text.match(/(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万亿]+)\s*(万)?\s*公里/);
  if (mileageMatch) {
    const mileage = parseChineseNumber(mileageMatch[1]) * (mileageMatch[2] ? 10000 : 1);
    updates.push(evidence('mileage', mileage, mileageMatch[0], turnId));
  }
  const saleWindow = text.match(/两周内|两周左右|本周|尽快|最近卖/);
  if (saleWindow) updates.push(evidence('saleWindow', saleWindow[0], saleWindow[0], turnId));
  const priceMatch = text.match(/(?:希望|大概|预算|报价)[^。！？\n]{0,8}(\d+(?:\.\d+)?)\s*(万|万元|元)/);
  if (priceMatch) {
    const price = Number(priceMatch[1]) * (priceMatch[2].startsWith('万') ? 10000 : 1);
    updates.push(evidence('expectedPrice', price, priceMatch[0], turnId, 'needs_confirmation'));
  }
  return updates;
}

function missingFields(lead) {
  return ['model', 'registrationYear', 'mileage', 'saleWindow'].filter(field => lead.vehicle?.[field] === undefined);
}

export function startConversation(state, leadId) {
  const lead = leadFor(state, leadId);
  const conversation = {
    id: id('conversation'), leadId, status: 'active', mode: 'deterministic-demo', startedAt: now(),
    turns: [{ id: id('turn'), role: 'assistant', text: `您好，我是卖车服务助手。现在方便确认一下您的车辆出售情况吗？`, createdAt: now() }],
    fieldEvidence: [], route: { action: 'collect', reason: '等待客户确认是否仍在出售' },
  };
  state.conversations.unshift(conversation);
  const task = state.callTasks.find(item => item.leadId === leadId && item.status === 'queued');
  if (task) task.status = 'connected';
  lead.status = 'in_conversation';
  event(state, 'conversation.started', { conversationId: conversation.id, leadId });
  return conversation;
}

export function processTurn(state, conversationId, text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入客户回复');
  const conversation = conversationFor(state, conversationId);
  const lead = leadFor(state, conversation.leadId);
  const turn = { id: id('turn'), role: 'user', text: text.trim(), createdAt: now() };
  conversation.turns.push(turn);
  const normalized = text.replace(/\s+/g, '');
  let route = { action: 'collect', reason: '继续确认卖车信息' };
  let reply = '我先记录下来了。还需要确认车辆的品牌车型、上牌年份、里程和预计出售时间。';
  let updates = [];

  if (/不要.*打|别.*联系|停止.*联系|不再.*联系/.test(normalized)) {
    lead.contactEligible = false;
    lead.status = 'suppressed';
    cancelQueued(state, lead.id, 'customer_refusal');
    route = { action: 'suppress_contact', reason: '客户明确拒绝后续联系' };
    reply = '好的，我已记录停止联系请求，后续营销任务不会继续执行。';
  } else if (/投诉|不满|一直打电话|重复联系/.test(normalized)) {
    lead.status = 'complaint';
    route = { action: 'service_recovery', reason: '客户提出未解决诉求，转人工处理' };
    reply = '我先停止卖车沟通，已把您的诉求转给人工服务人员处理。';
  } else if (/卖掉|已经卖|已出售|不需要继续/.test(normalized)) {
    lead.status = 'sold';
    lead.contactEligible = false;
    cancelQueued(state, lead.id, 'vehicle_sold');
    route = { action: 'close_sold', reason: '车辆已出售，关闭卖车线索' };
    reply = '了解，我已记录车辆已出售，并关闭后续卖车触达。';
  } else if (/报价|多少钱|收车价|能给多少/.test(normalized)) {
    lead.status = 'handoff_requested';
    route = { action: 'request_handoff', reason: '客户要求报价，需要人工深度沟通' };
    reply = '报价需要人工根据车况确认，我可以现在帮您转给坐席；如果当前没有空闲坐席，也可以约时间回拨。';
  } else {
    updates = parseFields(text, turn.id);
    for (const update of updates) {
      conversation.fieldEvidence = conversation.fieldEvidence.filter(item => item.field !== update.field);
      conversation.fieldEvidence.push(update);
      lead.vehicle[update.field] = update.value;
    }
    const missing = missingFields(lead);
    route = { action: missing.length ? 'collect' : 'ready_for_review', reason: missing.length ? `还缺少${missing.join('、')}` : '必采字段已有证据，等待确认下一步' };
    reply = missing.length ? `收到。接下来还需要确认：${missing.join('、')}。` : '关键信息已经记录，请确认是否同意由人工坐席继续沟通报价和车况。';
  }
  conversation.turns.push({ id: id('turn'), role: 'assistant', text: reply, createdAt: now() });
  conversation.route = route;
  event(state, `conversation.${route.action}`, { conversationId, leadId: lead.id, turnId: turn.id, updates });
  return { reply, updates, route, turn, conversation };
}

export function requestHandoff(state, conversationId, reason, idempotencyKey) {
  if (!idempotencyKey) throw new Error('缺少转接幂等键');
  const existing = state.handoffs.find(item => item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const conversation = conversationFor(state, conversationId);
  const lead = leadFor(state, conversation.leadId);
  if (!lead.contactEligible) throw new Error('该线索已停止触达');
  const handoff = { id: id('handoff'), conversationId, leadId: lead.id, reason, status: 'requested', idempotencyKey, createdAt: now() };
  state.handoffs.unshift(handoff);
  lead.status = 'handoff_requested';
  event(state, 'handoff.requested', { handoffId: handoff.id, leadId: lead.id });
  return handoff;
}

export function scheduleCallback(state, leadId, agreedAt, consentQuote, idempotencyKey) {
  if (!idempotencyKey) throw new Error('缺少回拨幂等键');
  const existing = state.callbacks.find(item => item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const lead = leadFor(state, leadId);
  if (!lead.contactEligible) throw new Error('该线索已停止触达');
  if (!consentQuote || !/(可以|联系|回拨|明天|上午|下午|点)/.test(consentQuote)) throw new Error('需要保存客户明确同意回拨的原话');
  if (!agreedAt) throw new Error('需要明确回拨时间');
  const callback = { id: id('callback'), leadId, agreedAt, consentQuote, status: 'scheduled', idempotencyKey, createdAt: now() };
  state.callbacks.unshift(callback);
  lead.status = 'callback_scheduled';
  event(state, 'callback.scheduled', { callbackId: callback.id, leadId });
  return callback;
}

export function simulateDispatch({ seed = 1, queued = 0, idleAgents = 0, reservedAgents = 0, waitingConnected = 0, lineCapacity = 0, connectProbability = 0.5, batchSize = queued } = {}) {
  const available = Math.max(0, idleAgents + reservedAgents - waitingConnected);
  const theoretical = Math.max(0, Math.floor(available / Math.max(0.1, Math.min(1, connectProbability))));
  const started = Math.min(Math.max(0, queued), Math.max(0, lineCapacity), Math.max(0, batchSize), theoretical);
  let value = Math.max(1, Math.floor(seed));
  const random = () => { value = (value * 48271) % 2147483647; return value / 2147483647; };
  let connected = 0;
  for (let index = 0; index < started; index += 1) if (random() < connectProbability) connected += 1;
  const unhandledConnected = Math.max(0, connected - idleAgents);
  return { seed, queued, available, started, connected, unhandledConnected, connectProbability, lineCapacity };
}

export { createInitialState, SCHEMA_VERSION };
