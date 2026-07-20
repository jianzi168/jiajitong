/**
 * 通用建议规则 R01-R07（PDD §7.1）
 * 楔子版校准阈值
 */
'use strict'

function category(id) { return id }

function findCat(plan, id) {
  return (plan.categories || []).find(c => c.id === id) || null
}

const R01 = {
  id: 'R01',
  title: '储蓄率不足',
  category: 'savings',
  severity: 'yellow',
  condition(plan) {
    const s = plan.monthly_summary
    return s.income > 0 && (s.savings_target / s.income) < 0.20
  },
  build(plan) {
    const s = plan.monthly_summary
    const rate = s.savings_target / s.income
    const gap = Math.round(s.income * 0.20 - s.savings_target)
    return {
      description: `储蓄率仅 ${(rate * 100).toFixed(1)}%，低于建议的 20%。`,
      actions: [
        `每月额外储蓄 ¥${gap.toLocaleString('en-US')}，补到收入 20%`,
        '审视可削减的固定项（房贷、保险、订阅）',
        '把月度自动转账设到每月发工资当天',
      ],
      impact: gap,
      feasibility: 0.75,
      estimatedImpact: `每月多存 ¥${gap.toLocaleString('en-US')}`,
    }
  },
}

const R02 = {
  id: 'R02',
  title: '固定支出占比过高',
  category: 'fixed_ratio',
  severity: 'red',
  condition(plan) {
    const s = plan.monthly_summary
    return s.income > 0 && (s.fixed_expense / s.income) > 0.50
  },
  build(plan) {
    const s = plan.monthly_summary
    const ratio = s.fixed_expense / s.income
    const target = Math.round(s.income * 0.40)
    const gap = s.fixed_expense - target
    return {
      description: `固定支出占收入 ${(ratio * 100).toFixed(1)}%，高于安全的 50%。`,
      actions: [
        `争取压到 40%（月省 ¥${gap.toLocaleString('en-US')}）`,
        '盘点房贷是否可 refinance 或换房',
        '审视保险额度，避免重复或超配',
      ],
      impact: gap,
      feasibility: 0.5,
      estimatedImpact: `每月可释放 ¥${gap.toLocaleString('en-US')}`,
    }
  },
}

const R03 = {
  id: 'R03',
  title: '应急金不足',
  category: 'emergency_fund',
  severity: 'red',
  condition(plan, input) {
    return (input.emergencyFundMonths || 0) < 3
  },
  build(plan, input) {
    const m = input.emergencyFundMonths || 0
    const fixed = plan.monthly_summary.fixed_expense
    const gap = Math.round((3 - m) * fixed)
    return {
      description: `当前应急金仅覆盖 ${m} 个月，建议至少 3 个月。`,
      actions: [
        `每月补 ¥${Math.round(gap / Math.max(1, 3 - m)).toLocaleString('en-US')} 直到达标`,
        '放入可随取的货币基金 / 活期理财',
        '避免把应急金放在股票等高波动资产',
      ],
      impact: Math.round(gap / 3),
      feasibility: 0.75,
      estimatedImpact: `${3 - m} 个月可达标`,
    }
  },
}

const R04 = {
  id: 'R04',
  title: '餐饮预算超标',
  category: 'food',
  severity: 'yellow',
  condition(plan) {
    const c = findCat(plan, 'food')
    return c && c.suggested > c.range_max
  },
  build(plan) {
    const c = findCat(plan, 'food')
    const gap = c.suggested - c.range_max
    return {
      description: `当前餐饮 ¥${c.suggested.toLocaleString('en-US')}，超出建议上限 ¥${c.range_max.toLocaleString('en-US')}。`,
      actions: [
        `每周在家做饭 3 次，预计月省 ¥${Math.round(gap * 0.5).toLocaleString('en-US')}`,
        '用外卖平台红包 / 拼单降低单价',
      ],
      impact: Math.round(gap * 0.5),
      feasibility: 1.0,
      estimatedImpact: `每月可省 ¥${Math.round(gap * 0.5).toLocaleString('en-US')}`,
    }
  },
}

const R05 = {
  id: 'R05',
  title: '娱乐预算超标',
  category: 'entertainment',
  severity: 'yellow',
  condition(plan) {
    const c = findCat(plan, 'entertainment')
    return c && c.suggested > c.range_max
  },
  build(plan) {
    const c = findCat(plan, 'entertainment')
    const gap = c.suggested - c.range_max
    return {
      description: `当前娱乐 ¥${c.suggested.toLocaleString('en-US')}，略偏高。`,
      actions: [
        `每月砍掉 1 次大额娱乐活动，可省 ¥${Math.round(gap * 0.6).toLocaleString('en-US')}`,
        '尝试免费 / 折扣活动代替',
      ],
      impact: Math.round(gap * 0.6),
      feasibility: 1.0,
      estimatedImpact: `每月可省 ¥${Math.round(gap * 0.6).toLocaleString('en-US')}`,
    }
  },
}

const R06 = {
  id: 'R06',
  title: '医疗预算不足',
  category: 'medical',
  severity: 'yellow',
  condition(plan) {
    const c = findCat(plan, 'medical')
    return c && c.suggested < c.range_min
  },
  build(plan) {
    const c = findCat(plan, 'medical')
    const gap = c.range_min - c.suggested
    return {
      description: `医疗预算 ¥${c.suggested.toLocaleString('en-US')} 低于建议下限 ¥${c.range_min.toLocaleString('en-US')}。`,
      actions: [
        `每月补 ¥${gap.toLocaleString('en-US')} 到医疗预算`,
        '含年度体检、口腔、自费的预留',
        '如公司有补充医疗，确认已用足',
      ],
      impact: gap,
      feasibility: 1.0,
      estimatedImpact: `医疗保障增强 ¥${gap.toLocaleString('en-US')}/月`,
    }
  },
}

const R07 = {
  id: 'R07',
  title: '备用金过高',
  category: 'emergency_fund_excess',
  severity: 'green',
  condition(plan, input) {
    return (input.emergencyFundMonths || 0) > 12
  },
  build(plan, input) {
    return {
      description: '应急金已超过 12 个月生活费。',
      actions: [
        '把多余部分挪到收益更高的稳健理财',
        '考虑增配长期投资 / 退休账户',
      ],
      impact: 0,
      feasibility: 0.75,
      estimatedImpact: '资金利用更高效',
    }
  },
}

const ALL = [R01, R02, R03, R04, R05, R06, R07]

function stageWeight() { return 1.0 }

module.exports = ALL.map(r => ({
  ...r,
  category: category(r.id),
  stage_weight: stageWeight,
}))