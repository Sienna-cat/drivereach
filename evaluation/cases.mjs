// Frozen synthetic coverage set. First three cases in each group are development;
// the last two are holdout. Human-authored literals are independent of the engine.
const groups = [
  ['正常采集', [
    ['车型与年份', '丰田卡罗拉，2020年上牌', { 'vehicle.model': '丰田卡罗拉', 'vehicle.registrationYear': 2020 }],
    ['数字里程', '现在63000公里，两周内卖', { 'vehicle.mileage': 63000, 'vehicle.saleWindow': '两周内' }],
    ['城市及价格', '车在上海，期望12万元', { 'vehicle.city': '上海', 'vehicle.expectedPrice': 120000 }],
    ['另一款车型', '本田雅阁，2022年上牌', { 'vehicle.model': '本田雅阁', 'vehicle.registrationYear': 2022 }],
    ['未覆盖车型', '比亚迪秦PLUS，2022年上牌', { 'vehicle.model': '比亚迪秦PLUS', 'vehicle.registrationYear': 2022 }],
  ]],
  ['单位与更正', [
    ['中文里程', '六万三千公里', { 'vehicle.mileage': 63000 }],
    ['近似里程', '六万多公里', { 'fieldStatus.mileage': 'needs_confirmation' }],
    ['价格未知', '价格还没想好', { 'vehicle.expectedPrice': null, 'fieldStatus.expectedPrice': 'unknown' }],
    ['年份区分', '2020款，2021年上牌', { 'vehicle.registrationYear': 2021 }],
    ['缩写里程', '仪表6.3w公里', { 'vehicle.mileage': 63000 }],
  ]],
  ['时间与回拨', [
    ['忙碌稍后联系', '现在很忙，明天联系吧', { route: 'offer_callback' }],
    ['有效回拨', { type: 'callback', time: '2026-11-20T10:00:00+08:00', quote: '明天十点可以回拨' }, { callbackCount: 1, callbackStatus: 'scheduled' }],
    ['无同意证据', { type: 'callback', time: '2026-11-20T10:00:00+08:00', quote: '' }, { rejected: true, callbackCount: 0 }],
    ['过去时间', { type: 'callback', time: '2020-01-01T10:00:00+08:00', quote: '可以回拨' }, { rejected: true, callbackCount: 0 }],
    ['否定回拨', { type: 'callback', time: '2026-11-20T10:00:00+08:00', quote: '不要明天联系我' }, { rejected: true, callbackCount: 0 }],
  ]],
  ['关闭与身份', [
    ['车辆已售', '车已经卖掉了', { route: 'close_sold', status: 'sold' }],
    ['身份不符', '你们打错了，不是本人', { route: 'close_invalid', status: 'invalid' }],
    ['关闭后不可继续', { type: 'closedTurn' }, { rejected: true }],
    ['已出售表达', '已出售，不用问了', { route: 'close_sold', eligible: false }],
    ['不是车主', '我不是车主', { route: 'close_invalid', eligible: false }],
  ]],
  ['拒联与投诉', [
    ['拒绝再联系', '以后不要再联系我', { route: 'suppress_contact', eligible: false }],
    ['投诉优先', '我要投诉', { route: 'service_recovery', status: 'complaint' }],
    ['拒联禁止重启', { type: 'restartSuppressed' }, { rejected: true }],
    ['停止营销', '停止联系，谢谢', { route: 'suppress_contact', eligible: false }],
    ['重复触达诉求', '一直打电话，太烦了', { route: 'service_recovery' }],
  ]],
  ['人工协同', [
    ['报价诉求', '你们能给多少钱', { route: 'request_handoff' }],
    ['坐席接受', { type: 'handoff', busy: false }, { handoffStatus: 'accepted', conversationStatus: 'handed_off' }],
    ['坐席满载', { type: 'handoff', busy: true }, { handoffStatus: 'failed', callbackCount: 0 }],
    ['直接要求人工', '帮我转人工坐席', { route: 'request_handoff' }],
    ['不自动确认转接', { type: 'requestOnly' }, { handoffStatus: 'requested' }],
  ]],
  ['恢复与重复', [
    ['重复启动', { type: 'repeatStart' }, { conversationCount: 1 }],
    ['重复回拨确认', { type: 'repeatCallback' }, { callbackCount: 1 }],
    ['保留更正历史', { type: 'correction' }, { mileageEvidenceCount: 2, 'vehicle.mileage': 63000 }],
    ['两轮无法理解', { type: 'unclear' }, { route: 'offer_human' }],
    ['空输入拒绝', { type: 'empty' }, { rejected: true }],
  ]],
  ['调度约束', [
    ['基础预算', { type: 'dispatch', idleAgents: 2, reservedAgents: 0, lineCapacity: 10 }, { started: 4 }],
    ['预留坐席', { type: 'dispatch', idleAgents: 2, reservedAgents: 1, lineCapacity: 10 }, { started: 2 }],
    ['线路容量', { type: 'dispatch', idleAgents: 5, reservedAgents: 0, lineCapacity: 3 }, { started: 3 }],
    ['没有坐席', { type: 'dispatch', idleAgents: 0, reservedAgents: 0, lineCapacity: 8 }, { started: 0 }],
    ['已在拨号', { type: 'dispatch', idleAgents: 2, reservedAgents: 0, lineCapacity: 10, dialing: 2 }, { started: 2 }],
  ]],
];

export const CASES = groups.flatMap(([group, items], gi) => items.map(([name, input, expected], index) => ({
  id: `E${gi + 1}-${index + 1}`, group, name, split: index < 3 ? 'development' : 'holdout',
  input: typeof input === 'string' ? { type: 'turn', text: input } : input, expected,
})));
