/**
 * 规则引擎聚合器（PDD §7.3）
 *
 * 排序公式: score = impact * feasibility * stage_weight
 * 输出 Top 5 recommendations
 */
'use strict'

const R_GENERAL = require('./r01-r07')
const R_BABY = require('./rn01-rn07')
const ALL = [...R_GENERAL, ...R_BABY]

/**
 * 评估所有规则，对命中的按 score 排序，返回 Top 5
 * @param {object} plan - calcFull 的输出（plan.baby_reserve / categories / monthly_summary / meta）
 * @param {object} input - calcFull 的输入（fixedExpenses / monthlyIncome / emergencyFundMonths / stage）
 * @returns {Array<{id, title, severity, description, actions, estimatedImpact, score}>}
 */
function evaluateRules(plan, input) {
  const triggered = ALL.filter(r => {
    try {
      return r.condition(plan, input)
    } catch (e) {
      console.error('[rules]', r.id, e)
      return false
    }
  })

  const results = triggered
    .map(r => {
      let detail
      try {
        detail = r.build(plan, input)
      } catch (e) {
        console.error('[rules.build]', r.id, e)
        return null
      }
      if (!detail || !detail.description) return null
      const stage_w = r.stage_weight(plan, input) || 1.0
      return {
        id: r.id,
        title: r.title,
        severity: r.severity,
        category: r.id,
        description: detail.description,
        actions: detail.actions || [],
        impact: detail.impact || 0,
        feasibility: detail.feasibility || 0.75,
        stage_weight: stage_w,
        estimatedImpact: detail.estimatedImpact || '',
        score: (detail.impact || 0) * (detail.feasibility || 0.75) * stage_w,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // 兜底：健康/良好用户没有任何规则命中时，给出正向维持建议，避免行动清单空态
  if (!results.length && plan.health_score >= 60) {
    const score = plan.health_score || 0
    const healthy = score >= 80
    return [{
      id: 'R-POSITIVE',
      title: healthy ? '财务状况优秀，继续保持' : '财务状况良好，仍可微调',
      severity: 'green',
      category: 'R-POSITIVE',
      description: healthy
        ? `当前健康分 ${score} 分，整体财务状况优秀，暂无需要调整的风险项。`
        : `当前健康分 ${score} 分，整体情况良好，可继续优化储蓄结构。`,
      actions: healthy ? [
        '保持当前储蓄节奏，建议设置工资到账自动转账',
        '将多余资金配置到稳健理财或长期投资',
        '每季度回顾一次预算分配',
      ] : [
        '尝试把储蓄率提升到收入的 20% 以上',
        '优先补齐 3-6 个月应急金',
        '减少非必要支出，把释放资金用于长期目标',
      ],
      impact: 0,
      feasibility: 0.9,
      stage_weight: 1,
      estimatedImpact: healthy ? '维持当前健康状态' : '进一步提升财务健康度',
      score: 1,
    }]
  }

  return results
}

module.exports = {
  evaluateRules,
  ALL,
}