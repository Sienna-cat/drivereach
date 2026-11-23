import { DEMO_DATE, SCHEMA_VERSION, createInitialState } from './data.mjs';

const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const now = () => `${DEMO_DATE}T03:08:00+08:00`;
export const FIELD_LABELS = { model: '品牌车型', registrationYear: '首次上牌年', mileage: '行驶里程', city: '车辆城市', saleWindow: '出售时间', expectedPrice: '期望价格' };
export const RULE_VERSION = 'rules-0.3';

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
  state.events.unshift({ id: id('event'), type, occurredAt: now(), recordedAt: new Date().toISOString(), mode: 'synthetic-demo', ruleVersion: RULE_VERSION, payload });
}

function cancelQueued(state, leadId, reason) {
  state.callTasks.filter(task => task.leadId === leadId && ['queued', 'dialing', 'connected'].includes(task.status)).forEach(task => {
    task.status = 'cancelled';
    task.cancelReason = reason;
  });
  state.callbacks.filter(task => task.leadId === leadId && task.status === 'scheduled').forEach(task => { task.status = 'cancelled'; task.cancelReason = reason; });
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
  const model = [...text.matchAll(/(?:丰田)?卡罗拉|(?:本田)?雅阁|(?:特斯拉\s*)?Model\s*3/gi)].at(-1)?.[0];
  if (model) updates.push(evidence('model', model.replace(/\s+/g, ' '), model, turnId));
  const yearMatch = [...text.matchAll(/(20\d{2}|\d{2})\s*年(?:上牌|注册)/g)].at(-1);
  if (yearMatch) {
    const year = Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]);
    updates.push(evidence('registrationYear', year, yearMatch[0], turnId));
  }
  const mileageMatch = [...text.matchAll(/(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万亿]+)\s*(万)?\s*(多|左右)?\s*公里/g)].at(-1);
  if (mileageMatch) {
    const mileage = parseChineseNumber(mileageMatch[1]) * (mileageMatch[2] ? 10000 : 1);
    if (mileage >= 0 && mileage <= 2000000) updates.push({ ...evidence('mileage', mileage, mileageMatch[0], turnId, mileageMatch[3] ? 'needs_confirmation' : 'confirmed'), approximate: !!mileageMatch[3] });
  }
  const saleWindow = text.match(/两周内|两周左右|这两周|本周|尽快|最近卖|一个月内|下个月|半年后|近期不卖|目前不想卖/);
  if (saleWindow) updates.push(evidence('saleWindow', saleWindow[0], saleWindow[0], turnId));
  const city = text.match(/杭州|上海|北京|成都|深圳|广州|南京|苏州/);
  if (city) updates.push(evidence('city', city[0], city[0], turnId));
  const priceMatch = text.match(/(?:价格|期望|希望|想卖|卖价)[^。！？,，\n]{0,5}?((?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+))\s*(万元|万|元)(左右|上下)?/);
  if (priceMatch) {
    const price = parseChineseNumber(priceMatch[1]) * (priceMatch[2].startsWith('万') ? 10000 : 1);
    if (price > 0 && price <= 50000000) updates.push({ ...evidence('expectedPrice', price, priceMatch[0], turnId), approximate: !!priceMatch[3] });
  }
  const unknownPrice = text.match(/(?:价格|价钱)(?:还)?(?:没想好|不清楚|不知道|没定)/);
  if (unknownPrice) updates.push(evidence('expectedPrice', null, unknownPrice[0], turnId, 'unknown'));
  return updates;
}

function missingFields(lead) {
  return Object.keys(FIELD_LABELS).filter(field => lead.vehicle?.[field] === undefined);
}

export function startConversation(state, leadId) {
  const lead = leadFor(state, leadId);
  if (!lead.contactEligible || ['sold', 'complaint'].includes(lead.status)) throw new Error('该线索已停止或不可继续营销触达');
  if (state.conversations.some(c => c.leadId === leadId && c.status === 'handed_off')) throw new Error('当前通话已由人工接管，不可同时开启 AI 通话');
  const active = state.conversations.find(c => c.leadId === leadId && c.status === 'active');
  if (active) return active;
  const conversation = {
    id: id('conversation'), leadId, status: 'active', mode: 'deterministic-demo', startedAt: now(),
    turns: [{ id: id('turn'), role: 'assistant', text: `您好，我是卖车服务助手。现在方便确认一下您的车辆出售情况吗？`, createdAt: now() }],
    fieldEvidence: [], ruleVersion: RULE_VERSION, unclearCount: 0, route: { action: 'collect', reason: '等待客户确认是否仍在出售' },
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
  if (conversation.status !== 'active') throw new Error('会话已结束，请查看处理结果');
  const lead = leadFor(state, conversation.leadId);
  const turn = { id: id('turn'), role: 'user', text: text.trim(), createdAt: now() };
  conversation.turns.push(turn);
  const normalized = text.replace(/\s+/g, '');
  let route = { action: 'collect', reason: '继续确认卖车信息' };
  let reply = '我先记录下来了。还需要确认车辆的品牌车型、上牌年份、里程和预计出售时间。';
  let updates = [];

  if (/不要.*打|(?:不要|别|停止|不再).*联系/.test(normalized)) {
    lead.contactEligible = false;
    lead.status = 'suppressed';
    cancelQueued(state, lead.id, 'customer_refusal');
    route = { action: 'suppress_contact', reason: '客户明确拒绝后续联系' };
    reply = '好的，我已记录停止联系请求，后续营销任务不会继续执行。';
    conversation.status = 'completed';
  } else if (/投诉|不满|一直打电话|重复联系/.test(normalized)) {
    lead.status = 'complaint';
    lead.contactEligible = false;
    route = { action: 'service_recovery', reason: '客户提出未解决诉求，转人工处理' };
    cancelQueued(state, lead.id, 'complaint');
    conversation.status = 'completed';
    reply = '我先停止卖车沟通，已记录您的诉求，等待人工服务人员处理。';
  } else if (/打错|不是本人|不是车主/.test(normalized)) {
    lead.status = 'invalid'; lead.contactEligible = false; cancelQueued(state, lead.id, 'wrong_identity'); conversation.status = 'completed';
    route = { action: 'close_invalid', reason: '身份不符，不再继续营销' }; reply = '了解，我已记录身份不符，停止此条线索的后续联系。';
  } else if (/卖掉|已经卖|已出售/.test(normalized) && !/(?:还没|没有|没|未|不)[^，。]{0,2}(?:卖掉|卖出|出售)/.test(normalized)) {
    lead.status = 'sold';
    lead.contactEligible = false;
    cancelQueued(state, lead.id, 'vehicle_sold');
    route = { action: 'close_sold', reason: '车辆已出售，关闭卖车线索' };
    reply = '了解，我已记录车辆已出售，并关闭后续卖车触达。';
    conversation.status = 'completed';
  } else if (/报价|多少钱|收车价|能给多少|转人工|找个人|人工坐席/.test(normalized)) {
    lead.status = 'handoff_requested';
    route = { action: 'request_handoff', reason: '客户要求报价，需要人工深度沟通' };
    reply = '报价需要人工根据车况确认，我可以现在帮您转给坐席；如果当前没有空闲坐席，也可以约时间回拨。';
  } else {
    updates = parseFields(text, turn.id);
    for (const update of updates) {
      conversation.fieldEvidence.push(update);
      lead.vehicle[update.field] = update.value;
    }
    const missing = missingFields(lead);
    conversation.unclearCount = updates.length ? 0 : conversation.unclearCount + 1;
    if (/忙|不方便|明天.*联系|稍后.*联系|明天.*点/.test(normalized)) {
      route = { action: 'offer_callback', reason: '客户希望另约时间，尚未创建回拨' }; reply = '可以的。请确认具体回拨时间，同意后我再记录安排。';
    } else if (conversation.unclearCount >= 2) {
      route = { action: 'offer_human', reason: '连续两轮关键信息无法确认' }; reply = '这部分信息暂时无法确认。是否希望人工协助，或结束本次沟通？';
    } else {
      const uncertain = conversation.fieldEvidence.filter((e, i, all) => e.status === 'needs_confirmation' && all.findLast(x => x.field === e.field) === e);
      route = { action: missing.length || uncertain.length ? 'collect' : 'ready_for_review', reason: uncertain.length ? `需要确认${FIELD_LABELS[uncertain[0].field]}` : missing.length ? `待补充：${missing.map(f => FIELD_LABELS[f]).join('、')}` : '必采字段均已处理；未知价格保留为空，不等于高意向' };
      reply = uncertain.length ? `您提到“${uncertain[0].quote}”，能否确认准确的${FIELD_LABELS[uncertain[0].field]}？` : missing.length ? `收到，已记录。请问${FIELD_LABELS[missing[0]]}是什么？` : '关键信息已经记录。是否希望由人工坐席继续沟通车况与报价？';
    }
  }
  conversation.turns.push({ id: id('turn'), role: 'assistant', text: reply, createdAt: now() });
  conversation.route = route;
  event(state, `conversation.${route.action}`, { conversationId, leadId: lead.id, turnId: turn.id, updates });
  return { reply, updates, route, turn, conversation };
}

export function requestHandoff(state, conversationId, reason, idempotencyKey) {
  if (!idempotencyKey) throw new Error('缺少转接幂等键');
  const existing = state.handoffs.find(item => item.idempotencyKey === idempotencyKey);
  if (existing) {
    if (existing.conversationId !== conversationId || existing.reason !== reason) throw new Error('幂等键已用于其他转接目标或原因');
    return existing;
  }
  const conversation = conversationFor(state, conversationId);
  const lead = leadFor(state, conversation.leadId);
  if (conversation.status !== 'active') throw new Error('会话已结束，不可转接');
  if (!lead.contactEligible) throw new Error('该线索已停止触达');
  const active = state.handoffs.find(h => h.conversationId === conversationId && h.status === 'requested');
  if (active) return active;
  const handoff = { id: id('handoff'), conversationId, leadId: lead.id, reason, status: 'requested', idempotencyKey, createdAt: now() };
  state.handoffs.unshift(handoff);
  lead.status = 'handoff_requested';
  event(state, 'handoff.requested', { handoffId: handoff.id, leadId: lead.id });
  return handoff;
}

export function acceptHandoff(state, handoffId) {
  const handoff = state.handoffs.find(h => h.id === handoffId);
  if (!handoff) throw new Error('转接请求不存在');
  if (handoff.status !== 'requested') return handoff;
  const conversation = conversationFor(state, handoff.conversationId);
  const lead = leadFor(state, handoff.leadId);
  if (!lead.contactEligible || conversation.status !== 'active') throw new Error('当前会话不可承接');
  const agent = state.agentStates.find(a => a.status === 'idle');
  if (!agent) { handoff.status = 'failed'; handoff.failureReason = '无空闲坐席'; }
  else { handoff.status = 'accepted'; handoff.agentId = agent.id; agent.status = 'talking'; lead.status = 'human_accepted'; conversation.status = 'handed_off'; }
  event(state, `handoff.${handoff.status}`, { handoffId, leadId: lead.id });
  return handoff;
}

export function scheduleCallback(state, leadId, agreedAt, consentQuote, idempotencyKey) {
  if (!idempotencyKey) throw new Error('缺少回拨幂等键');
  const existing = state.callbacks.find(item => item.idempotencyKey === idempotencyKey);
  if (existing) {
    if (existing.leadId !== leadId || existing.agreedAt !== agreedAt || existing.consentQuote !== consentQuote) throw new Error('幂等键已用于其他回拨目标或时间');
    return existing;
  }
  const lead = leadFor(state, leadId);
  if (!lead.contactEligible) throw new Error('该线索已停止触达');
  if (typeof consentQuote !== 'string' || !/(可以|同意|请.*回拨|(?:明天|上午|下午).*联系我)/.test(consentQuote) || /不要|不想|不同意|不可以|不行|不能|没时间|没有时间|别/.test(consentQuote)) throw new Error('需要保存客户明确同意回拨的原话');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(agreedAt || '') || !Number.isFinite(Date.parse(agreedAt)) || Date.parse(agreedAt) <= Date.parse(now())) throw new Error('需要有效且未来的回拨时间');
  const scheduled = state.callbacks.find(c => c.leadId === leadId && c.status === 'scheduled');
  if (scheduled) return scheduled;
  const callback = { id: id('callback'), leadId, agreedAt, consentQuote, status: 'scheduled', idempotencyKey, createdAt: now() };
  state.callbacks.unshift(callback);
  lead.status = 'callback_scheduled';
  event(state, 'callback.scheduled', { callbackId: callback.id, leadId });
  return callback;
}

export function simulateDispatch({ seed = 1, queued = 0, idleAgents = 0, reservedAgents = 0, waitingConnected = 0, lineCapacity = 0, connectProbability = 0.5, batchSize = queued, dialing = 0 } = {}) {
  if (!Number.isFinite(connectProbability) || connectProbability < 0 || connectProbability > 1) throw new Error('接通概率必须介于 0 与 1');
  for (const n of [queued, idleAgents, reservedAgents, waitingConnected, lineCapacity, batchSize, dialing, seed]) if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error('调度数量必须为 0 到 100000 的整数');
  const available = Math.max(0, idleAgents - reservedAgents - waitingConnected);
  const theoretical = Math.max(0, Math.floor(available / Math.max(0.1, Math.min(1, connectProbability))));
  const started = Math.min(queued, Math.max(0, lineCapacity - dialing), batchSize, Math.max(0, theoretical - dialing));
  let value = Math.max(1, Math.floor(seed));
  const random = () => { value = (value * 48271) % 2147483647; return value / 2147483647; };
  let connected = 0;
  for (let index = 0; index < started; index += 1) if (random() < connectProbability) connected += 1;
  const unhandledConnected = Math.max(0, connected - available);
  return { seed, queued, available, started, connected, unhandledConnected, served: Math.min(connected, available), connectProbability, lineCapacity, ruleVersion: RULE_VERSION };
}

export { createInitialState, SCHEMA_VERSION };
