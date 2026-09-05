/**
 * 备育首年增量基准（PDD §6.2.4）
 * monthlyIncrement: 奶粉尿布 + 早教托育 + 育儿医疗 + 育儿用品 的月均合计
 * oneTimeChildbirth: 产检分娩一次性支出
 *
 * tier1（北上广深）> tier2（新一线）> tier3（强二线），后者约为前者的 0.85 倍。
 *
 * 数据来源：参考公开母婴消费报告 + 一二三线差异；MVP 占位估算。
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
  tier3: {
    milkDiapers: 1300,
    childcare:   2400,
    medical:     430,
    supplies:    340,
    oneTimeChildbirth: 10000,
  },
}

// 便捷：获取某档的月增量合计
module.exports.getMonthlyIncrement = function (tier) {
  const b = module.exports[tier]
  return b.milkDiapers + b.childcare + b.medical + b.supplies
}
