/**
 * 引擎常量（PDD §6.2 + §6.3）
 * 单一来源，禁止散落
 */
module.exports = {
  // 7 大类 ID，顺序固定（PDD §附录 A）
  CATEGORY_IDS: ['food', 'daily', 'entertainment', 'medical', 'clothing', 'transport', 'other'],

  /**
   * 引擎版本号。每次改动测算口径必须 +1。
   *
   * 用途：已落库的 budget_plans 会带上生成时的版本号。当引擎升级后，
   * 可用 `engine_version != ENGINE_VERSION` 精确定位需要重算的存量方案，
   * 而不是"猜"哪些是旧数据。迁移脚本见 scripts/recalc-plans.js。
   *
   * 版本沿革：
   *   1 —— 初版。城市/阶段/收入系数为统一标量，归一化时被约掉，
   *        三城算出相同预算；健康分结构维度恒为 90。
   *   2 —— 三个系数改为按类目差异化（城市/阶段/收入差异真实生效）；
   *        实现 scoreStructure()；移除无效的家庭消费系数。
   */
  ENGINE_VERSION: 2,

  // 家庭阶段的结构调节系数（PDD §6.2.2），**按类目取不同值**
  //
  // 历史 BUG：早先是每阶段一个标量（1.0 / 1.05 / 1.08），对 7 个类目统一施加。
  // 归一化时 ratio = base / Σbase 会把公共因子完全约掉，阶段差异对最终预算零影响。
  // 改为分类目调节后，备育阶段才会真实体现为"医疗占比升、娱乐占比降"。
  //
  // 取向依据：备育期营养与产检支出上升、娱乐与非必要服饰支出下降。
  STAGE_SHARE_MODIFIERS: {
    newlywed: { food: 1.00, daily: 1.00, entertainment: 1.00, medical: 1.00, clothing: 1.00, transport: 1.00, other: 1.00 },
    planning: { food: 1.02, daily: 1.08, entertainment: 0.88, medical: 1.40, clothing: 0.95, transport: 1.00, other: 1.00 },
    pregnant: { food: 1.05, daily: 1.15, entertainment: 0.78, medical: 1.65, clothing: 0.90, transport: 1.00, other: 0.95 },
  },

  // 收入系数夹逼区间（PDD §6.2.2）
  INCOME_COEFF_MIN: 0.85,
  INCOME_COEFF_MAX: 1.15,

  // 收支失衡阈值（PDD §6.3）
  IMBALANCE_RATIO: 0.9,

  // 备育时间预警阈值（PDD §6.3）
  BABY_TOO_SOON_MONTHS: 6,
}
//
// 已移除：FAMILY_CONSUMPTION_COEFF（家庭消费系数 1.8，二人世界固定）
// 它对 7 个类目取同一值，归一化时必然被约掉，对结果零影响，
// 却会让人误以为它参与了计算。PDD §6.2.2 已同步删除该系数。
// 若将来要引入类似的"户规模"因子，必须按类目取值，否则依旧无效。