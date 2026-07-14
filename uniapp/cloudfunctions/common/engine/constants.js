/**
 * 引擎常量（PDD §6.2 + §6.3）
 * 单一来源，禁止散落
 */
module.exports = {
  // 7 大类 ID，顺序固定（PDD §附录 A）
  CATEGORY_IDS: ['food', 'daily', 'entertainment', 'medical', 'clothing', 'transport', 'other'],

  // 家庭阶段系数（PDD §6.2.2）
  // 新婚磨合期 1.0（基准）；备孕中 1.05（医疗/营养增量）；计划 1 年内生育 1.08（提前储备导向）
  STAGE_COEFFICIENTS: {
    newlywed: 1.0,
    planning: 1.05,
    pregnant: 1.08,
  },

  // 收入系数夹逼区间（PDD §6.2.2）
  INCOME_COEFF_MIN: 0.85,
  INCOME_COEFF_MAX: 1.15,

  // 收支失衡阈值（PDD §6.3）
  IMBALANCE_RATIO: 0.9,

  // 备育时间预警阈值（PDD §6.3）
  BABY_TOO_SOON_MONTHS: 6,

  // 家庭消费系数（二人世界固定）（PDD §6.2.2）
  FAMILY_CONSUMPTION_COEFF: 1.8,
}