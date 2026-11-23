export const DEMO_DATE = '2026-11-19';
export const SCHEMA_VERSION = 1;

export const VEHICLES = {
  corolla: { name: '丰田卡罗拉', category: '紧凑型轿车' },
  accord: { name: '本田雅阁', category: '中型轿车' },
  model3: { name: '特斯拉 Model 3', category: '纯电轿车' },
};

const lead = (id, name, text, extra = {}) => ({
  id, name, phone: `138****${id.slice(-3)}`, city: '杭州', status: 'queued', contactEligible: true,
  vehicle: {}, history: [{ id: `${id}-history-1`, text, date: DEMO_DATE }], ...extra,
});

export const SYNTHETIC_LEADS = [
  lead('lead-001', '林先生', '官网留资，关注二手车出售，希望了解评估和收车流程。'),
  lead('lead-002', '周女士', '客户曾表示不希望继续接收营销电话。', { contactEligible: true }),
  lead('lead-003', '陈先生', '客户反馈此前被重复联系，诉求尚未解决。', { status: 'complaint' }),
  lead('lead-004', '赵女士', '客户刚反馈车辆已出售，暂无继续处理。'),
  lead('lead-005', '王先生', '客户希望尽快卖车，愿意进一步沟通。'),
];

export function createInitialState() {
  return {
    version: SCHEMA_VERSION,
    leads: structuredClone(SYNTHETIC_LEADS),
    conversations: [],
    callTasks: SYNTHETIC_LEADS.map((item, index) => ({
      id: `call-task-${index + 1}`, leadId: item.id, channel: 'ai', status: 'queued', attempt: 0,
      idempotencyKey: `initial-${item.id}`, createdAt: `${DEMO_DATE}T01:00:00+08:00`,
    })),
    handoffs: [], callbacks: [],
    agentStates: [
      { id: 'agent-001', name: '坐席 A', status: 'idle' },
      { id: 'agent-002', name: '坐席 B', status: 'wrap_up' },
    ],
    events: [], evaluations: [],
  };
}
