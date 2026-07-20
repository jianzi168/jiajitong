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

  return triggered
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
}

module.exports = {
  evaluateRules,
  ALL,
}