/**
 * 7 大类消费结构基准（PDD §附录 A）
 *
 * perCapitaMonthly —— 结构权重基数。
 *   最终预算会归一化到「可支配 × 0.95」（见 engine/normalize.js），因此只有
 *   【相对比例】影响结果，绝对量会被约掉。这组值表达的是"餐饮是大头、
 *   其他是小头"的结构关系。
 *
 * tierNShare —— 城市等级的结构调节系数，**按类目取不同值**。
 *
 *   历史 BUG：早先对 7 个类目用同一个系数（1.0 / 0.85 / 0.75）。归一化时
 *   ratio = base / Σbase 会把公共因子完全约掉，导致城市等级对最终预算零影响——
 *   上海、成都、兰州三城算出完全相同的预算。必须按类目差异化，城市差异
 *   才能真正体现在预算结构上。
 *
 *   取向依据：城市能级越低，服务/娱乐类消费占比越低，餐饮与日用百货等
 *   刚性支出占比越高。tier2 定为基准 1.00。
 *
 * incomeElasticity —— 收入弹性（恩格尔效应的简化建模）。
 *   调节量为 incomeCoeff^e：相对收入越高，餐饮占比下降（e 为负），
 *   娱乐/服饰占比上升（e 为正）。
 *
 * 数据校准：见开发计划 §七 风险与缓冲 — 基准数据校准留待内测期（Phase 9）。
 * 本数值为 MVP 占位估算，方向性依据如上，绝对值待真实数据校准。
 */
module.exports = [
  { category: 'food',          name: '餐饮',     perCapitaMonthly: 1500, tier1Share: 0.95, tier2Share: 1.00, tier3Share: 1.08, incomeElasticity: -0.60 },
  { category: 'daily',         name: '日用百货', perCapitaMonthly: 600,  tier1Share: 0.98, tier2Share: 1.00, tier3Share: 1.05, incomeElasticity:  0.10 },
  { category: 'entertainment', name: '娱乐休闲', perCapitaMonthly: 800,  tier1Share: 1.10, tier2Share: 1.00, tier3Share: 0.85, incomeElasticity:  0.45 },
  { category: 'medical',       name: '医疗健康', perCapitaMonthly: 500,  tier1Share: 1.00, tier2Share: 1.00, tier3Share: 0.95, incomeElasticity:  0.15 },
  { category: 'clothing',      name: '服饰美容', perCapitaMonthly: 600,  tier1Share: 1.05, tier2Share: 1.00, tier3Share: 0.92, incomeElasticity:  0.35 },
  { category: 'transport',     name: '交通通讯', perCapitaMonthly: 700,  tier1Share: 1.00, tier2Share: 1.00, tier3Share: 0.98, incomeElasticity:  0.30 },
  { category: 'other',         name: '其他',     perCapitaMonthly: 400,  tier1Share: 0.95, tier2Share: 1.00, tier3Share: 1.00, incomeElasticity:  0.00 },
]
