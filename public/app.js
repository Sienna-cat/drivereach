const STATIC_MODE = document.documentElement.dataset.hosting === 'static';
const browserApi = STATIC_MODE ? (await import('./static-api.mjs')).createStaticApi() : null;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { model: '品牌车型', registrationYear: '首次上牌年', mileage: '行驶里程', city: '车辆城市', saleWindow: '出售时间', expectedPrice: '期望价格' };
const statusNames = { queued: '待触达', in_conversation: '信息采集中', suppressed: '已停止联系', sold: '车辆已售', invalid: '身份不符', complaint: '人工处理诉求', handoff_requested: '等待人工', human_accepted: '人工已接管', callback_scheduled: '已安排回拨' };
const routeNames = { collect: '信息确认', suppress_contact: '停止触达', service_recovery: '诉求处理', close_invalid: '关闭无效线索', close_sold: '关闭已售线索', request_handoff: '请求人工', offer_callback: '确认回拨', offer_human: '人工协助', ready_for_review: '等待后续确认' };
const ui = { view: location.hash.slice(1) || 'leads', selected: 'lead-001', query: '', filter: 'all', dispatch: null, busy: false, report: null, baseline: null };
let state;
async function api(path, body) {
  if (browserApi) {
    const payload = await browserApi(path, body);
    if (payload?.state) state = payload.state;
    if (payload?.warning) toast(payload.warning, true);
    return payload;
  }
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await r.json(); if (!r.ok) throw new Error(payload.error || '请求失败');
  if (payload.state) state = payload.state;
  return payload;
}
function toast(text, error = false) { $('#toast').textContent = text; $('#toast').className = `toast ${error ? 'error' : ''}`; $('#toast').hidden = false; clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
async function action(fn) { if (ui.busy) return; ui.busy = true; try { await fn(); } catch (e) { toast(e.message, true); } finally { ui.busy = false; } }
const selectedLead = () => state.leads.find(l => l.id === ui.selected) || state.leads[0];
const selectedConversation = () => state.conversations.find(c => c.leadId === selectedLead().id);
const tag = status => `<span class="tag ${['suppressed','sold','invalid'].includes(status) ? 'neutral' : status === 'complaint' ? 'red' : status === 'queued' ? 'amber' : 'green'}">${esc(statusNames[status] || status)}</span>`;
const percent = (a,b) => b ? `${Math.round(a/b*100)}%` : '—';
function latestEvidence(c, field) { return c?.fieldEvidence.findLast(e => e.field === field); }
function fieldValue(field, e) {
  if (!e) return '待补充'; if (e.status === 'unknown') return '客户暂未确定';
  if (field === 'mileage') return `${e.approximate ? '约 ' : ''}${Number(e.value).toLocaleString()} km`;
  if (field === 'expectedPrice') return `${e.approximate ? '约 ' : ''}¥ ${Number(e.value).toLocaleString()}`;
  return e.value;
}
function metric(label, value, detail, symbol, color = '') { return `<div class="metric ${color}"><div class="metric-label">${label}<span>${symbol}</span></div><strong>${value}</strong><small>${detail}</small></div>`; }
function head(kicker, title, desc, extra = '') { return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc}</p></div>${extra}</div>`; }
function setView(view) { ui.view = ['leads','conversation','operations'].includes(view) ? view : 'leads'; location.hash = ui.view; $('#sidebar').classList.remove('open'); render(); }
function render() {
  if (!state) return;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#breadcrumbTitle').textContent = { leads: '线索与任务', conversation: '对话与人工接管', operations: '运营与质量' }[ui.view];
  $('#navCount').textContent = state.leads.length;
  $('#app').innerHTML = ui.view === 'leads' ? leadsView() : ui.view === 'conversation' ? conversationView() : operationsView();
  bind();
}
function leadsView() {
  const lead = selectedLead(); const c = selectedConversation();
  const connected = new Set(state.conversations.map(c => c.leadId)).size;
  const eligible = state.leads.filter(l => l.contactEligible).length;
  const rows = state.leads.filter(l => (!ui.query || `${l.name} ${l.id} ${l.city}`.toLowerCase().includes(ui.query.toLowerCase())) && (ui.filter === 'all' || ui.filter === 'queued' && l.status === 'queued' || ui.filter === 'active' && !['queued','sold','suppressed','invalid'].includes(l.status) || ui.filter === 'closed' && !l.contactEligible));
  return `${head('LEAD OPERATIONS', '让每条线索，都有明确的下一步。', '从首次触达、信息确认到人工承接，在一个工作空间中完成。', '<a class="btn secondary" href="./portfolio.html">查看项目过程 ↗</a>')}
  <div class="metrics">${metric('演示线索', state.leads.length, '批次 SYN-20261119 · 合成样本', '▦')}${metric('已进入对话', connected, `去重线索 / ${state.leads.length} 条`, '◌')}${metric('等待人工回拨', state.callbacks.filter(c => c.status === 'scheduled').length, '已确认具体时间的任务', '↗', 'accent')}${metric('允许后续触达', eligible, '拒联、已售与无效身份被排除', '◎')}</div>
  <div class="workspace-grid"><section class="panel lead-panel"><div class="panel-head"><div><h2>卖车线索池 <span class="count">${state.leads.length}</span></h2><p>先确认意愿，再推进下一步</p></div><label class="search"><span>⌕</span><input id="search" value="${esc(ui.query)}" placeholder="搜索姓名、线索编号" aria-label="搜索线索"></label></div><div class="tabs">${[['all','全部'],['queued','待触达'],['active','处理中'],['closed','已关闭']].map(([k,v]) => `<button data-filter="${k}" class="tab ${ui.filter===k?'selected':''}">${v}</button>`).join('')}<span class="sample-label">合成线索</span></div><div class="lead-table"><div class="table-head"><span>客户 / 来源</span><span>所在城市</span><span>当前状态</span><span></span></div>${rows.length ? rows.map(l => `<button class="lead-row ${l.id===lead.id?'selected':''}" data-lead="${l.id}"><span class="person"><span class="person-icon">${l.name[0]}</span><span><b>${esc(l.name)}</b><small>${l.id.toUpperCase()} · 卖车留资</small></span></span><span class="city">${l.city}</span>${tag(l.status)}<span class="row-arrow">↗</span></button>`).join('') : '<div class="empty">没有符合条件的线索</div>'}</div><div class="table-footer"><span>共 ${rows.length} 条 · 单一演示批次</span><span>联系资格在每次发起前重新检查</span></div></section>
  <aside class="panel lead-detail"><div class="detail-top"><span class="eyebrow">LEAD CONTEXT</span>${tag(lead.status)}</div><div class="person large"><span class="person-icon">${lead.name[0]}</span><span><h2>${lead.name}</h2><small>${lead.id.toUpperCase()} · ${lead.phone}</small></span></div><div class="detail-label">线索背景 <span>虚构情境</span></div><p class="context">${esc(lead.history[0].text)}</p><div class="fact-mini"><div><span>意向判定</span><b>${lead.contactEligible ? '等待对话确认' : '已停止营销触达'}</b></div><div><span>数据来源</span><b>演示留资批次</b></div></div><div class="flow-card"><span class="eyebrow">处理路径</span><div><span class="flow-dot current"></span>意愿与身份确认</div><div><span class="flow-dot"></span>采集有证据的车辆信息</div><div><span class="flow-dot"></span>明确结果与后续安排</div></div><div class="detail-action"><button class="btn primary full" id="startButton" ${!lead.contactEligible || lead.status==='complaint' ? 'disabled' : ''}>${c ? '查看当前对话' : '开始模拟外呼'} <span>→</span></button><small>${lead.contactEligible ? '文本扮演车主 · 电话线路为模拟' : '已按规则排除后续触达'}</small></div></aside></div>
  <div class="bottom-note"><span>✦</span><p><b>每一个业务动作都有依据。</b> 对话证据、路由原因和写入结果会保留在本地，支持导出复查。</p><a href="./portfolio.html#validation">验证方法 ↗</a></div>`;
}
function conversationView() {
  const lead = selectedLead(); const c = selectedConversation();
  if (!c) return `${head('CONVERSATION', '把客户表达，变成可核验的信息。', '选择一条线索开始，或继续之前的处理。')}<section class="panel empty-start"><span class="empty-symbol">◌</span><h2>${lead.name} · 尚未开始</h2><p>以车主身份输入回复，观察字段证据与业务规则如何流转。</p><button class="btn primary" id="startButton" ${!lead.contactEligible?'disabled':''}>开始模拟外呼 →</button><button class="btn text" data-go="leads">返回线索池</button></section>`;
  const fields = Object.keys(labels); const known = fields.filter(f => latestEvidence(c,f)?.status==='confirmed').length;
  const handoff = state.handoffs.find(h => h.conversationId === c.id);
  const callback = state.callbacks.find(cb => cb.leadId === lead.id && cb.status === 'scheduled');
  const active = c.status === 'active';
  return `${head('CONVERSATION & HANDOFF', '有依据的对话，有结果的交接。', '文本对话基线 · 本地电话模拟。', '<button class="btn secondary" data-go="leads">← 返回线索池</button>')}
  <div class="conversation-grid"><section class="panel chat-panel"><div class="chat-head"><div class="person"><span class="person-icon">${lead.name[0]}</span><span><b>${lead.name}</b><small>${lead.id.toUpperCase()} · ${lead.city}</small></span></div><span class="session-state"><i class="${active?'live':''}"></i>${active?'对话进行中':c.status==='handed_off'?'人工已接管':'本次对话已结束'}</span></div><div class="chat-disclaimer">模拟电话线路 <span>·</span> 规则引擎 ${esc(c.ruleVersion)} <span>·</span> 消息与证据已保存</div><div class="messages" id="messages">${c.turns.map(t => `<article class="message ${t.role}" id="${t.id}"><span class="message-avatar">${t.role==='assistant'?'✦':'车'}</span><div><small>${t.role==='assistant'?'服务助手':'车主 · 测试者输入'}</small><p>${esc(t.text)}</p></div></article>`).join('')}</div><div class="chat-compose"><div class="quick-replies"><span>演示回答</span>${['丰田卡罗拉，2020年上牌，63000公里，两周内想卖，车在杭州，价格希望十万左右。','能不能帮我转人工报价？','明天上午十点可以联系我。','以后不要再联系我'].map((text,i) => `<button data-quick="${esc(text)}" ${!active?'disabled':''}>${['车辆信息','请求人工','约回拨','停止联系'][i]}</button>`).join('')}</div><form id="turnForm"><textarea id="turnText" aria-label="车主回复" placeholder="以车主身份输入回复，例如：车还在卖，六万多公里…" rows="2" maxlength="2000" ${!active?'disabled':''}></textarea><button class="send-btn" type="submit" aria-label="发送车主回复" ${!active?'disabled':''}>↑</button></form><small>确定性演示仅覆盖已定义的表达；不理解时会提示人工协助。</small></div></section>
  <aside class="conversation-aside"><section class="panel evidence-panel"><div class="panel-head compact"><div><h2>车辆信息与证据</h2><p>点击字段查看客户原话</p></div><span class="completion">${known}<small>/ 6</small></span></div><div class="progress-track"><span style="width:${known/6*100}%"></span></div><div class="fields">${fields.map(f => { const e = latestEvidence(c,f); return `<button class="field ${e?'has-value':''}" data-field="${f}"><span>${labels[f]}<small>${!e?'未提供':e.status==='unknown'?'明确未知':e.status==='needs_confirmation'?'需追问':'客户已提供'}</small></span><b>${esc(fieldValue(f,e))}</b><i>${e?'↗':'—'}</i></button>`; }).join('')}</div><p class="card-note">已确认字段 ${known}/6。明确未知与待确认值单独保留，不计为已获得事实。</p></section>
  <section class="panel handoff-panel"><div class="eyebrow">NEXT ACTION</div><div class="route-title"><span class="route-icon">↗</span><h3>${routeNames[c.route.action]}</h3></div><p class="route-reason">${esc(c.route.reason)}</p><div class="agent-state"><span><i class="${state.agentStates.some(a=>a.status==='idle')?'available':''}"></i>空闲坐席 ${state.agentStates.filter(a=>a.status==='idle').length} / ${state.agentStates.length}</span><button id="toggleAgents" class="link-button">${state.agentStates.some(a=>a.status==='idle')?'模拟全部忙碌':'模拟坐席空闲'}</button></div>${handoff ? `<div class="handoff-result ${handoff.status==='failed'?'warning':''}">${handoff.status==='requested'?'转接请求已创建，等待坐席接受':handoff.status==='accepted'?'坐席已接受，当前通话交接完成':'转接失败：暂无空闲坐席，可征求回拨意愿'}</div>` : ''}${callback ? `<div class="handoff-result">已安排回拨<br><b>${esc(callback.agreedAt.replace('T',' ').slice(0,16))}</b><small>客户原话：${esc(callback.consentQuote)}</small></div>` : ''}<div class="handoff-actions">${active && lead.contactEligible ? `${!handoff || handoff.status==='failed' ? '<button class="btn secondary full" id="handoffButton">发起当前通话转接 ↗</button>' : ''}${handoff?.status==='requested'?'<button class="btn primary full" id="acceptButton">模拟坐席接受转接 →</button>':''}<button class="btn primary full" id="callbackButton" ${callback?'disabled':''}>${callback?'已创建回拨任务':'确认时间后安排回拨 →'}</button>` : '<p class="muted">当前流程已结束，保留完整处理记录。</p>'}</div><p class="card-note">转接与未来回拨是两个独立动作，创建请求不代表承接成功。</p></section></aside></div>`;
}
function operationsView() {
  const report = ui.report || state.evaluations[0];
  const connected = new Set(state.conversations.map(c => c.leadId)).size;
  const handled = state.leads.filter(l => l.status !== 'queued').length;
  const processed = state.conversations.filter(c => Object.keys(labels).every(f => latestEvidence(c,f))).length;
  const d = ui.dispatch;
  return `${head('OPERATIONS & QUALITY', '看见结果，也看见失败。', '从原始事件追溯指标，通过固定案例检验业务规则。', '<button class="btn primary" id="evaluationButton">运行 40 个规则场景 ↗</button>')}
  <div class="metrics">${metric('已处理线索',handled, `同批次 / ${state.leads.length} 条`, '▦')}${metric('必采字段已处理',processed, '明确未知算处理，单独保留事实缺口','◌')}${metric('当前通话接管成功',state.handoffs.filter(h=>h.status==='accepted').length, `共 ${state.handoffs.length} 次转接请求`,'↗')}${metric('规则场景验证',report?`${report.passed} / ${report.total}`:'未运行',report?`开发 24 · 留出 16 · ${report.version}`:'运行后展示实际结果','✓','accent')}</div>
  <div class="operations-grid"><section class="panel"><div class="panel-head"><div><h2>拨号节奏模拟</h2><p>固定随机种子 7 · 观察效率与接通后无人承接</p></div><span class="tag amber">机制模拟</span></div><form id="dispatchForm" class="dispatch-form"><label>空闲坐席<input name="idleAgents" type="number" min="0" max="20" value="${ui.dispatchInput?.idleAgents??3}"></label><label>转接预留<input name="reservedAgents" type="number" min="0" max="20" value="${ui.dispatchInput?.reservedAgents??1}"></label><label>接通概率<select name="connectProbability">${[.25,.5,.75,1].map(p=>`<option value="${p}" ${p===(ui.dispatchInput?.connectProbability??.5)?'selected':''}>${p*100}%</option>`).join('')}</select></label><button class="btn secondary" type="submit">推进一批拨号 →</button></form><div class="simulation-result">${d ? `<div class="sim-numbers"><div><strong>${d.started}</strong><span>新增拨号</span></div><div><strong>${d.connected}</strong><span>模拟接通</span></div><div><strong>${d.served}</strong><span>坐席承接</span></div><div class="${d.unhandledConnected?'danger':''}"><strong>${d.unhandledConnected}</strong><span>接通无人承接</span></div></div><div class="sim-bar"><span style="width:${d.started?d.served/d.started*100:0}%"></span><i style="width:${d.started?d.unhandledConnected/d.started*100:0}%"></i></div><p>待拨 12 · 线路上限 12 · 可承接 ${d.available}。预留坐席从人工拨号预算中扣除。</p>` : '<div class="sim-placeholder"><span>▥</span><p>调整坐席与接通概率，观察拨号预算和实际承接结果。</p></div>'}</div><p class="card-note padded">简化预算 = 可承接坐席 ÷ 接通概率。随机接通仍可能超过承接能力，模拟保留超量结果；不推导生产收益。</p></section>
  <section class="panel funnel-panel"><div class="panel-head"><div><h2>本批次处理漏斗</h2><p>按去重线索统计 · 实时本地记录</p></div></div>${[['合成入组线索',state.leads.length],['已开始对话',connected],['六项必采已处理',processed],['人工承接或待回拨',new Set([...state.handoffs.filter(h=>h.status==='accepted'),...state.callbacks.filter(c=>c.status==='scheduled')].map(x=>x.leadId)).size]].map(([name,count],i)=>`<div class="funnel-row"><div><span>${name}</span><b>${count}</b></div><div class="funnel-track"><span style="width:${count/state.leads.length*100}%;opacity:${1-i*.16}"></span></div></div>`).join('')}<p class="card-note padded">客户拒绝、车辆已售与系统失败分别记录，避免混成一个“流失率”。</p></section></div>
  <section class="panel evaluation-panel"><div class="panel-head"><div><h2>规则评测与错误分析</h2><p>${report?`数据集 ${report.datasetHash.slice(0,12)} · ${new Date(report.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`:'8 类场景 · 24 个开发集 / 16 个留出集 · 固定划分'}</p></div>${report?'<button class="btn secondary small" id="exportEvaluation">导出逐案例 JSON ↓</button>':''}</div>${report ? `<div class="evaluation-callout"><span class="eval-summary">${report.passed}/${report.total} 通过</span><p>评测对象为合成案例中的字段、路由和任务规则。${report.failed ? `<b>${report.failed} 个未通过场景已保留。</b>`:''}</p></div><div class="evaluation-list"><div class="eval-row header"><span>场景 / 划分</span><span>预期 → 实际</span><span>结果</span></div>${report.results.map(r=>`<div class="eval-row"><div><b>${r.id} · ${esc(r.name)}</b><small>${r.group} · ${r.split==='holdout'?'留出集（已查看）':'开发集'}</small></div><code>${esc(JSON.stringify(r.expected))}<br><span>${esc(JSON.stringify(r.actual))}</span></code><span class="tag ${r.pass?'green':'red'}">${r.pass?'通过':'未通过'}</span></div>`).join('')}</div>` : '<div class="evaluation-empty"><span>✓</span><h3>让规则先接受检验</h3><p>运行固定场景，查看逐条预期、实际输出与失败原因。结果由当前规则运行生成。</p></div>'}</section>
  <section class="panel event-panel"><div class="panel-head"><div><h2>可追溯事件</h2><p>对话、规则路由和业务写入的真实本地记录</p></div><button class="btn text small" id="resetButton">重置演示数据</button></div>${state.events.length?state.events.slice(0,12).map(e=>`<div class="event-row"><span class="event-dot"></span><div><b>${esc(e.type)}</b><small>${esc(e.payload.leadId||'')} · ${esc(e.payload.turnId?.slice(0,16)||e.payload.handoffId?.slice(0,16)||e.payload.callbackId?.slice(0,16)||'')}</small></div><time>模拟业务时钟 03:08</time></div>`).join(''):'<div class="empty">开始一次对话后，事件会出现在这里。</div>'}</section>`;
}
function bind() {
  $$('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go));
  $$('[data-lead]').forEach(b=>b.onclick=()=>{ui.selected=b.dataset.lead;if(matchMedia('(max-width:850px)').matches)setView('conversation');else render();});
  $$('[data-filter]').forEach(b=>b.onclick=()=>{ui.filter=b.dataset.filter;render();});
  $('#search')?.addEventListener('input',e=>{const pos=e.target.selectionStart;ui.query=e.target.value;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);});
  $('#startButton')?.addEventListener('click',()=>action(async()=>{const lead=selectedLead();const c=state.conversations.find(c=>c.leadId===lead.id); if(!c)await api('/api/conversations',{leadId:lead.id});setView('conversation');}));
  $$('[data-quick]').forEach(b=>b.onclick=()=>{$('#turnText').value=b.dataset.quick;$('#turnText').focus();});
  $('#turnForm')?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const text=$('#turnText').value.trim();if(!text)return;const c=selectedConversation();const button=$('#turnForm button');button.disabled=true;try{await api(`/api/conversations/${c.id}/turns`,{text});render();$('#messages').scrollTop=$('#messages').scrollHeight;}finally{if(document.contains(button))button.disabled=false;}});});
  $$('[data-field]').forEach(b=>b.onclick=()=>openEvidence(b.dataset.field));
  $('#toggleAgents')?.addEventListener('click',()=>action(async()=>{await api('/api/agents',{busy:state.agentStates.some(a=>a.status==='idle')});render();}));
  $('#handoffButton')?.addEventListener('click',()=>action(async()=>{const c=selectedConversation();await api('/api/handoffs',{conversationId:c.id,reason:c.route.reason,idempotencyKey:`handoff-${c.id}-${state.handoffs.length}`});render();toast('已创建转接请求，等待坐席接受');}));
  $('#acceptButton')?.addEventListener('click',()=>action(async()=>{const h=state.handoffs.find(h=>h.conversationId===selectedConversation().id&&h.status==='requested');const r=await api(`/api/handoffs/${h.id}/accept`,{});render();toast(r.result.status==='accepted'?'坐席已接受，交接成功':'无空闲坐席，转接未成功',r.result.status!=='accepted');}));
  $('#callbackButton')?.addEventListener('click',()=>{$('#callbackQuote').value=selectedConversation().turns.findLast(t=>t.role==='user')?.text||'';$('#callbackConfirmed').checked=false;$('#callbackError').textContent='';$('#callbackDialog').showModal();});
  $('#dispatchForm')?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const f=new FormData(e.target);ui.dispatchInput={idleAgents:Number(f.get('idleAgents')),reservedAgents:Number(f.get('reservedAgents')),connectProbability:Number(f.get('connectProbability'))};const r=await api('/api/dispatch/simulate',{seed:7,queued:12,lineCapacity:12,...ui.dispatchInput});ui.dispatch=r.result;render();});});
  $('#evaluationButton')?.addEventListener('click',()=>action(async()=>{const r=await api('/api/evaluation',{});ui.report=r.result;render();toast(`评测完成：${r.result.passed}/${r.result.total} 通过，逐案例结果已保存`);}));
  $('#exportEvaluation')?.addEventListener('click',()=>download('drivereach-evaluation.json',ui.report||state.evaluations[0]));
  $('#resetButton')?.addEventListener('click',()=>{if(confirm('清空本地演示会话和任务？已导出的过程文件保留。'))action(async()=>{await api('/api/reset',{});ui.selected='lead-001';ui.report=null;ui.dispatch=null;render();toast('已重置演示数据');});});
}
function openEvidence(field) {
  const c=selectedConversation();const evidence=c.fieldEvidence.filter(e=>e.field===field);
  $('#evidenceContent').innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">FIELD EVIDENCE</span><h2>${labels[field]}</h2></div><button class="close-btn" data-close="evidenceDialog" aria-label="关闭">×</button></div>${evidence.length?evidence.map((e,i)=>`<div class="evidence-item"><span class="tag ${e.status==='needs_confirmation'?'amber':'green'}">${i===evidence.length-1?'当前记录':'历史记录'}</span><h3>${esc(fieldValue(field,e))}</h3><blockquote>“${esc(e.quote)}”</blockquote><small>来源：${esc(e.turnId)}<br>状态：${esc(e.status)}</small></div>`).join(''):'<p class="muted">尚无来自客户对话的证据。系统保持空值，后续继续询问。</p>'}`;
  $('#evidenceContent [data-close]').onclick=()=>$('#evidenceDialog').close();$('#evidenceDialog').showModal();
}
function download(name,object){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#callbackForm').addEventListener('submit',e=>{e.preventDefault();action(async()=>{try{const c=selectedConversation();await api('/api/callbacks',{leadId:c.leadId,agreedAt:`${$('#callbackTime').value}:00+08:00`,consentQuote:$('#callbackQuote').value.trim(),idempotencyKey:`callback-${c.id}`});$('#callbackDialog').close();render();toast('回拨任务已保存，可在刷新后继续查看');}catch(error){$('#callbackError').textContent=error.message;}});});
$$('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
$$('.nav-item').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#menuButton').onclick=()=>$('#sidebar').classList.toggle('open');
$('#exportButton').onclick=()=>action(async()=>download('drivereach-process.json',await api('/api/export')));
try { state=await api('/api/state'); ui.report=state.evaluations[0]; render(); }
catch(error){$('#app').innerHTML=`<div class="panel empty"><h2>暂时无法载入演示</h2><p>${esc(error.message)}</p><button class="btn primary" onclick="location.reload()">重新连接</button></div>`;}
