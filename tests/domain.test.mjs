import test from 'node:test';
import assert from 'node:assert/strict';
const {
  createInitialState,
  startConversation,
  processTurn,
  requestHandoff,
  acceptHandoff,
  scheduleCallback,
  simulateDispatch,
} = await import('../src/domain.mjs');

function fresh() { return createInitialState(); }

test('extracts vehicle facts with quoted evidence and turn id', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-001');
  const result = processTurn(state, conversation.id, '车还在卖，是丰田卡罗拉，20年上牌，六万三千公里，两周内想卖。');
  const fields = Object.fromEntries(result.updates.map(update => [update.field, update]));
  assert.equal(fields.model.value, '丰田卡罗拉');
  assert.equal(fields.registrationYear.value, 2020);
  assert.equal(fields.mileage.value, 63000);
  assert.equal(fields.model.status, 'confirmed');
  assert.match(fields.model.quote, /丰田卡罗拉/);
  assert.equal(fields.model.turnId, result.turn.id);
});

test('explicit refusal blocks future marketing and cancels queued work', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-002');
  const result = processTurn(state, conversation.id, '以后不要再给我打电话了。');
  const lead = state.leads.find(item => item.id === 'lead-002');
  assert.equal(result.route.action, 'suppress_contact');
  assert.equal(lead.contactEligible, false);
  assert.equal(state.callTasks.find(task => task.leadId === 'lead-002').status, 'cancelled');
});

test('unresolved complaint routes to service recovery without asking for sale details', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-003');
  const result = processTurn(state, conversation.id, '上次有人一直打电话，我要投诉。');
  assert.equal(result.route.action, 'service_recovery');
  assert.equal(result.reply.includes('车型'), false);
  assert.equal(state.leads.find(item => item.id === 'lead-003').status, 'complaint');
});

test('high-intent pricing request asks for handoff instead of inventing a quote', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-001');
  const result = processTurn(state, conversation.id, '我想尽快卖，能不能先给我一个收车报价？');
  assert.equal(result.route.action, 'request_handoff');
  assert.match(result.reply, /报价|人工/);
  assert.equal(result.updates.some(update => update.field === 'price'), false);
});

test('callback requires explicit consent and is idempotent by key', () => {
  const state = fresh();
  assert.throws(() => scheduleCallback(state, 'lead-001', '2026-11-20T10:00:00+08:00', '', 'cb-1'), /同意/);
  const first = scheduleCallback(state, 'lead-001', '2026-11-20T10:00:00+08:00', '明天上午十点可以联系我。', 'cb-1');
  const second = scheduleCallback(state, 'lead-001', '2026-11-20T10:00:00+08:00', '明天上午十点可以联系我。', 'cb-1');
  assert.equal(first.id, second.id);
  assert.equal(state.callbacks.length, 1);
});

test('current-call handoff requires an agent acceptance event', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-001');
  const first = requestHandoff(state, conversation.id, '客户要求报价', 'handoff-1');
  const second = requestHandoff(state, conversation.id, '客户要求报价', 'handoff-1');
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'requested');
  assert.equal(state.leads.find(item => item.id === 'lead-001').status, 'handoff_requested');
});

test('dispatch simulation is reproducible and caps new dials by capacity', () => {
  const input = { seed: 7, queued: 12, idleAgents: 2, reservedAgents: 1, waitingConnected: 0, lineCapacity: 12, connectProbability: 0.5, batchSize: 12 };
  const first = simulateDispatch(input);
  const second = simulateDispatch(input);
  assert.deepEqual(first, second);
  assert.ok(first.started <= 6);
  assert.ok(first.unhandledConnected >= 0);
});

test('sold vehicle ends the marketing conversation', () => {
  const state = fresh();
  const conversation = startConversation(state, 'lead-004');
  const result = processTurn(state, conversation.id, '车已经卖掉了，不需要继续联系。');
  assert.equal(result.route.action, 'close_sold');
  assert.equal(state.leads.find(item => item.id === 'lead-004').status, 'sold');
});

test('suppressed leads cannot restart a conversation or schedule a callback', () => {
  const s = fresh(); const c = startConversation(s, 'lead-002');
  processTurn(s, c.id, '不要再联系我');
  assert.throws(() => startConversation(s, 'lead-002'), /停止|不可/);
  assert.throws(() => scheduleCallback(s, 'lead-002', '2026-11-20T10:00:00+08:00', '可以回拨', 'blocked'), /停止/);
});

test('starting twice resumes the same active conversation and does not duplicate a call', () => {
  const s = fresh();
  assert.equal(startConversation(s, 'lead-001').id, startConversation(s, 'lead-001').id);
  assert.equal(s.conversations.length, 1);
});

test('a closed conversation rejects further turns without writing a message', () => {
  const s = fresh(); const c = startConversation(s, 'lead-001');
  processTurn(s, c.id, '车已经卖了');
  const count = c.turns.length;
  assert.throws(() => processTurn(s, c.id, '再问一个问题'), /结束/);
  assert.equal(c.turns.length, count);
});

test('refusal cancels previously confirmed callbacks as well as queued calls', () => {
  const s = fresh();
  scheduleCallback(s, 'lead-001', '2026-11-20T10:00:00+08:00', '明天可以回拨', 'cb-before');
  const c = startConversation(s, 'lead-001'); processTurn(s, c.id, '以后不要联系我');
  assert.equal(s.callbacks[0].status, 'cancelled');
});

test('registration year is distinct from model year and facts keep correction history', () => {
  const s = fresh(); const c = startConversation(s, 'lead-001');
  processTurn(s, c.id, '2020款卡罗拉，2021年上牌，6万公里');
  const r = processTurn(s, c.id, '不是6万，是63000公里');
  assert.equal(s.leads[0].vehicle.registrationYear, 2021);
  assert.equal(s.leads[0].vehicle.mileage, 63000);
  assert.equal(c.fieldEvidence.filter(e => e.field === 'mileage').length, 2);
  assert.equal(r.updates[0].turnId, r.turn.id);
});

test('unknown price is processed but not counted as a known monetary value', () => {
  const s = fresh(); const c = startConversation(s, 'lead-001');
  const r = processTurn(s, c.id, '价格还没想好');
  assert.equal(r.updates.find(u => u.field === 'expectedPrice')?.status, 'unknown');
  assert.equal(s.leads[0].vehicle.expectedPrice, null);
});

test('approximate mileage is not silently turned into an exact number', () => {
  const s = fresh(); const c = startConversation(s, 'lead-001');
  const r = processTurn(s, c.id, '六万多公里，价格希望十万左右，车在杭州');
  const mileage = r.updates.find(u => u.field === 'mileage');
  assert.equal(mileage.status, 'needs_confirmation');
  assert.equal(mileage.approximate, true);
  assert.equal(r.updates.find(u => u.field === 'expectedPrice').value, 100000);
});

test('handoff only becomes accepted after an idle agent is reserved', () => {
  const s = fresh(); const c = startConversation(s, 'lead-001');
  const h = requestHandoff(s, c.id, '人工', 'h-accept');
  acceptHandoff(s, h.id);
  assert.equal(h.status, 'accepted');
  assert.equal(s.agentStates.find(a => a.id === h.agentId).status, 'talking');
  assert.equal(c.status, 'handed_off');
});

test('no idle agent means transfer fails and customer can choose a callback', () => {
  const s = fresh(); s.agentStates.forEach(a => { a.status = 'talking'; });
  const c = startConversation(s, 'lead-001'); const h = requestHandoff(s, c.id, '人工', 'h-busy');
  assert.equal(acceptHandoff(s, h.id).status, 'failed');
  assert.equal(s.callbacks.length, 0);
});

test('callback time must be valid, future, and consent cannot be a negated sentence', () => {
  const s = fresh();
  for (const [time, quote] of [['broken', '可以回拨'], ['2020-01-01T10:00:00+08:00', '可以回拨'], ['2026-11-20T10:00:00+08:00', '不要明天联系我']]) {
    assert.throws(() => scheduleCallback(s, 'lead-001', time, quote, `invalid-${time}`));
  }
  assert.equal(s.callbacks.length, 0);
});

test('reserved seats reduce dialing budget and invalid probabilities are rejected', () => {
  const base = { seed: 7, queued: 12, idleAgents: 2, lineCapacity: 12, connectProbability: 0.5 };
  assert.equal(simulateDispatch({ ...base, reservedAgents: 1 }).started, 2);
  assert.equal(simulateDispatch({ ...base, reservedAgents: 0 }).started, 4);
  assert.throws(() => simulateDispatch({ ...base, connectProbability: 1.2 }), /概率/);
});

test('unresolved complaint cannot be bypassed via callback or new conversation', () => {
  const s = fresh(); const c = startConversation(s,'lead-001'); processTurn(s,c.id,'我要投诉');
  assert.throws(()=>scheduleCallback(s,'lead-001','2026-11-20T10:00:00+08:00','同意回拨','complaint-cb'),/停止|诉求/);
  assert.throws(()=>startConversation(s,'lead-001'),/停止|不可/);
  assert.equal(s.leads[0].status,'complaint');
});

test('time expressions and refusal do not constitute callback consent', () => {
  for(const quote of ['明天不行','明天没有时间','几点','不可以回拨']) {
    const s=fresh(); assert.throws(()=>scheduleCallback(s,'lead-001','2026-11-20T10:00:00+08:00',quote,'uncertain'));
    assert.equal(s.callbacks.length,0);
  }
});

test('a not-yet-sold vehicle remains eligible and the conversation stays open', () => {
  const s=fresh();const c=startConversation(s,'lead-001');const r=processTurn(s,c.id,'车还没卖掉');
  assert.notEqual(r.route.action,'close_sold');assert.equal(s.leads[0].contactEligible,true);assert.equal(c.status,'active');
});

test('explicit correction keeps the final positive model and year', () => {
  const s=fresh();const c=startConversation(s,'lead-001');processTurn(s,c.id,'不是丰田卡罗拉，是本田雅阁，不是2020年上牌，是2021年上牌');
  assert.equal(s.leads[0].vehicle.model,'本田雅阁');assert.equal(s.leads[0].vehicle.registrationYear,2021);
});

test('different idempotency keys cannot create duplicate pending handoffs', () => {
  const s=fresh();const c=startConversation(s,'lead-001');
  const a=requestHandoff(s,c.id,'人工','a');const b=requestHandoff(s,c.id,'人工','b');
  assert.equal(a.id,b.id);assert.equal(s.handoffs.length,1);
});

test('human accepted call prevents a simultaneous new AI conversation', () => {
  const s=fresh();const c=startConversation(s,'lead-001');const h=requestHandoff(s,c.id,'人工','human');acceptHandoff(s,h.id);
  assert.throws(()=>startConversation(s,'lead-001'),/人工|通话/);assert.equal(s.conversations.length,1);
});

test('handoff idempotency keys cannot be reused for another conversation', () => {
  const s=fresh();const a=startConversation(s,'lead-001');const b=startConversation(s,'lead-005');
  requestHandoff(s,a.id,'人工','shared-key');
  assert.throws(()=>requestHandoff(s,b.id,'人工','shared-key'),/幂等键|目标/);
});

test('callback idempotency keys cannot be reused for another lead or time', () => {
  const s=fresh();
  scheduleCallback(s,'lead-001','2026-11-20T10:00:00+08:00','明天十点可以回拨','shared-callback');
  assert.throws(()=>scheduleCallback(s,'lead-005','2026-11-20T10:00:00+08:00','明天十点可以回拨','shared-callback'),/幂等键|目标/);
  assert.throws(()=>scheduleCallback(s,'lead-001','2026-11-21T10:00:00+08:00','后天十点可以回拨','shared-callback'),/幂等键|时间/);
});
