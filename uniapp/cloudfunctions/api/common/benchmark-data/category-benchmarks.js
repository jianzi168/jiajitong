/**
 * 7 大类人均月消费基准（PDD §附录 A）
 * perCapitaMonthly: 一线城市人均月基准（元）
 * tier1Multiplier / tier2Multiplier: 城市等级系数
 *   tier1 系数 1.0（一线基准）
 *   tier2 系数 0.85（新一线略低，对应 2025 公开发布数据均值）
 *
 * 数据校准：见开发计划 §七 风险与缓冲 — 基准数据校准留待内测期（Phase 9）。
 * 本数值为 MVP 占位估算。
 */
module.exports = [
  { category: 'food',         name: '餐饮',     perCapitaMonthly: 1500, tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'daily',        name: '日用百货', perCapitaMonthly: 600,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'entertainment', name: '娱乐休闲', perCapitaMonthly: 800,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'medical',      name: '医疗健康', perCapitaMonthly: 500,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'clothing',     name: '服饰美容', perCapitaMonthly: 600,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'transport',    name: '交通通讯', perCapitaMonthly: 700,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
  { category: 'other',        name: '其他',     perCapitaMonthly: 400,  tier1Multiplier: 1.0,  tier2Multiplier: 0.85 },
]