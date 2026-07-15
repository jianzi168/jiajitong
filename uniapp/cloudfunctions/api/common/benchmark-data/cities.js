/**
 * 首期开放 10 城（PDD §附录 B）
 * tier: 'tier1' 一线（上海/北京/深圳/广州）/ 'tier2' 新一线（其他）
 * medianIncome: 家庭月收入中位数（元），用于计算收入系数（PDD §6.2.2）
 */
module.exports = [
  { name: '上海', tier: 'tier1', medianIncome: 28000 },
  { name: '北京', tier: 'tier1', medianIncome: 28000 },
  { name: '深圳', tier: 'tier1', medianIncome: 28000 },
  { name: '广州', tier: 'tier1', medianIncome: 28000 },
  { name: '杭州', tier: 'tier2', medianIncome: 20000 },
  { name: '成都', tier: 'tier2', medianIncome: 20000 },
  { name: '武汉', tier: 'tier2', medianIncome: 20000 },
  { name: '南京', tier: 'tier2', medianIncome: 20000 },
  { name: '苏州', tier: 'tier2', medianIncome: 20000 },
  { name: '西安', tier: 'tier2', medianIncome: 20000 },
]