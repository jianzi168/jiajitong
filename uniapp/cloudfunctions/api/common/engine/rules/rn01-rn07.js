/**
 * 备育/新婚专属规则 R-N01-N07（PDD §7.2）
 *
 * stage_weight: 备育规则 1.2（PDD §7.3），其他 1.0
 */
'use strict'

function isBabyStage(plan) {
  return plan.meta && (plan.meta.stage === 'planning' || plan.meta.stage === 'pregnant')
}

function findCat(plan, id) {
  return (plan.categories || []).find(c => c.id === id) || null
}

const R_N01 = {
  id: 'R-N01',
  title: '备育储备压力',
  category: 'baby_reserve',
  severity: 'red',
  condition(plan) {
    if (!isBabyStage(plan)) return false
    const b = plan.baby_reserve
    const s = plan.monthly_summary
    if (!b || !b.monthlyRequired || !s.disposable) return false
    return (b.monthlyRequired + s.savings_target) > (s.disposable * 0.30)
  },
  build(plan) {
    const b = plan.baby_reserve
    const gap = b.monthlyRequired - Math.round(b.target - b.current) / Math.max(1, b.monthsRemaining)
    return {
      description: `按当前收入，每月需额外储备 ¥${b.monthlyRequired.toLocaleString('en-US')}，压力较大。`,
      actions: [
        `将娱乐预算压缩 20%（约可释放 ¥${Math.round(plan.categories.find(c => c.id === 'entertainment').suggested * 0.2).toLocaleString('en-US')}）`,
        '调整生育时间线至更晚（按月延后）',
        '协商配偶共同分担储蓄压力',
      ],
      impact: b.monthlyRequired,
      feasibility: 0.5,
      estimatedImpact: `每月多储备 ¥${Math.round(b.monthlyRequired * 0.5).toLocaleString('en-US')}`,
    }
  },
}

const R_N02 = {
  id: 'R-N02',
  title: '新婚合并开销',
  category: 'newlywed_dining',
  severity: 'yellow',
  condition(plan) {
    return plan.meta && plan.meta.stage === 'newlywed'
      && (() => {
        const food = findCat(plan, 'food')
        const ent = findCat(plan, 'entertainment')
        if (!food || !ent) return false
        return (food.suggested + ent.suggested) > (food.range_max + ent.range_max) * 1.10
      })()
  },
  build(plan) {
    return {
      description: '新婚期外出就餐较多，餐饮+娱乐超出预算 10% 以上。',
      actions: [
        '设定每周 3 天「在家做饭日」',
        '尝试自己下厨 + 看视频学做菜',
      ],
      impact: 600,
      feasibility: 1.0,
      estimatedImpact: '每月可省 ¥600',
    }
  },
}

const R_N03 = {
  id: 'R-N03',
  title: '备育家庭储蓄率不足',
  category: 'baby_savings',
  severity: 'red',
  condition(plan) {
    if (!isBabyStage(plan)) return false
    const s = plan.monthly_summary
    return s.income > 0 && (s.savings_target / s.income) < 0.15
  },
  build(plan) {
    const s = plan.monthly_summary
    const gap = Math.round(s.income * 0.20 - s.savings_target)
    return {
      description: `备育家庭建议储蓄率 ≥ 20%，当前 ${(s.savings_target / s.income * 100).toFixed(1)}%。`,
      actions: [
        '优先保障储备金账户独立',
        '与伴侣共同确认月度储蓄目标',
        '可考虑下调非必要预算挪给储蓄',
      ],
      impact: gap,
      feasibility: 0.75,
      estimatedImpact: `每月可补 ¥${gap.toLocaleString('en-US')}`,
    }
  },
}

const R_N04 = {
  id: 'R-N04',
  title: '房贷占比过高',
  category: 'housing_ratio',
  severity: 'red',
  condition(plan, input) {
    const housing = (input.fixedExpenses || {}).housing || 0
    return input.monthlyIncome > 0 && housing / input.monthlyIncome > 0.45
  },
  build(plan, input) {
    const housing = (input.fixedExpenses || {}).housing || 0
    const target = Math.round(input.monthlyIncome * 0.35)
    const gap = housing - target
    return {
      description: `房贷占收入 ${((housing / input.monthlyIncome) * 100).toFixed(1)}%，高于建议的 35%。`,
      actions: [
        '评估是否可 refinance 或调整贷款年限',
        '如近期有生育计划，建议提前储备',
        '考虑降低购房总价或换房',
      ],
      impact: gap,
      feasibility: 0.5,
      estimatedImpact: `如降至 35%，月省 ¥${gap.toLocaleString('en-US')}`,
    }
  },
}

const R_N05 = {
  id: 'R-N05',
  title: '备育前应急金不足',
  category: 'baby_emergency',
  severity: 'red',
  condition(plan, input) {
    return isBabyStage(plan) && (input.emergencyFundMonths || 0) < 3
  },
  build(plan, input) {
    const m = input.emergencyFundMonths || 0
    return {
      description: `备育前应急金仅覆盖 ${m} 个月，建议至少 6 个月。`,
      actions: [
        '优先补齐至 6 个月生活费',
        '暂停非应急金的长期投资',
      ],
      impact: 1000,
      feasibility: 0.75,
      estimatedImpact: '抗风险显著提升',
    }
  },
}

const R_N06 = {
  id: 'R-N06',
  title: '备孕医疗预算偏低',
  category: 'baby_medical',
  severity: 'yellow',
  condition(plan) {
    if (!isBabyStage(plan)) return false
    const c = findCat(plan, 'medical')
    return c && c.suggested < c.range_min
  },
  build(plan) {
    const c = findCat(plan, 'medical')
    const gap = c.range_min - c.suggested
    return {
      description: `备孕阶段医疗预算偏低，建议含产检预留 ¥${gap.toLocaleString('en-US')}。`,
      actions: [
        '了解所在城市的产检费用范围',
        '确认公司补充医疗是否覆盖产检',
      ],
      impact: gap,
      feasibility: 0.75,
      estimatedImpact: `医疗预算提升 ¥${gap.toLocaleString('en-US')}/月`,
    }
  },
}

const R_N07 = {
  id: 'R-N07',
  title: '伴侣储蓄不同步',
  category: 'partner_sync',
  severity: 'green',
  condition(plan, input) {
    // MVP: 暂未实现多成员协作，恒不触发
    return false
  },
  build(plan) {
    return {
      description: '',
      actions: [],
      impact: 0,
      feasibility: 1.0,
      estimatedImpact: '',
    }
  },
}

const ALL = [R_N01, R_N02, R_N03, R_N04, R_N05, R_N06, R_N07]

function stageWeight(plan) {
  return isBabyStage(plan) ? 1.2 : 1.0
}

module.exports = ALL.map(r => ({
  ...r,
  category: r.id,
  stage_weight: stageWeight,
}))