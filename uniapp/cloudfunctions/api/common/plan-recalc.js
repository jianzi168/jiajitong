/**
 * 方案重算的纯逻辑（不碰数据库）
 *
 * 为什么单独成模块：
 *   handlers 在本地测试路径下 db 为 null（因为分支写的是 `if (db)` 而非
 *   `if (usingCloudDb)`），直接把纯函数挂在 db 模块上会导致内存路径调不到，
 *   两条路径被迫各实现一份 —— 正是"本地测试通过、线上行为不一致"的温床。
 *
 *   放在这里后，handlers（内存路径）、db（云端路径）、scripts/recalc-plans.js
 *   三处共用同一套口径。
 */
'use strict'

const { ENGINE_VERSION } = require('./engine/constants')

/**
 * 方案是否由旧版引擎生成（需要重算）
 * @param {object} plan
 * @returns {boolean}
 */
function isPlanStale(plan) {
  if (!plan) return false
  return Number(plan.engine_version || 1) < ENGINE_VERSION
}

/**
 * 用当前引擎重算方案的派生字段 —— 纯函数，不写库、不改入参
 *
 * @param {object} plan - 必须含 plan_input
 * @returns {object|null} 待 update 的字段；无法重算返回 null
 */
function computePlanUpdate(plan) {
  if (!plan || !plan.plan_input) return null
  try {
    const engine = require('./engine')
    const recalculated = engine.calcFull(plan.plan_input)
    if (!recalculated) return null
    return {
      engine_version: ENGINE_VERSION,
      health_score: recalculated.health_score,
      risk_level: recalculated.risk_level,
      monthly_summary: recalculated.monthly_summary || plan.monthly_summary,
      categories: recalculated.categories || plan.categories,
      baby_reserve: recalculated.baby_reserve || plan.baby_reserve,
      recommendations: recalculated.recommendations || [],
      risk_report: recalculated.risk_report || plan.risk_report,
      recalculated_at: new Date(),
    }
  } catch (e) {
    console.error('[plan-recalc] recalc failed', e)
    return null
  }
}

module.exports = { isPlanStale, computePlanUpdate, ENGINE_VERSION }
