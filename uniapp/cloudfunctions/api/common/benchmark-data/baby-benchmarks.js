/**
 * 备育首年增量基准（PDD §6.2.4）
 * monthlyIncrement: 奶粉尿布 + 早教托育 + 育儿医疗 + 育儿用品 的月均合计
 * oneTimeChildbirth: 产检分娩一次性支出
 *
 * 数据来源：参考公开母婴消费报告 + 一二线差异；MVP 占位估算。
 */
module.exports = {
  tier1: {
    milkDiapers: 1800,
    childcare:   3500,
    medical:     600,
    supplies:    500,
    oneTimeChildbirth: 15000,
  },
  tier2: {
    milkDiapers: 1500,
    childcare:   2800,
    medical:     500,
    supplies:    400,
    oneTimeChildbirth: 12000,
  },
}

// 便捷：获取某档的月增量合计
module.exports.getMonthlyIncrement = function (tier) {
  const b = module.exports[tier]
  return b.milkDiapers + b.childcare + b.medical + b.supplies
}