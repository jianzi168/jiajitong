/**
 * 业务 handlers（技术方案 §5.2 路由表 + 开发计划 Phase 2）
 *
 * 命名规则：{资源}.{动作}
 *   - cities.list   → 开放城市列表
 *   - calc.quick    → 免登录快测
 *   - calc.full     → 完整测算（免登录，返回 plan 不落库）
 *   - calc.preview  → 取已存的 session 测算结果（Phase 6 接入 session 后启用）
 */
'use strict'

const benchmark = require('../../common/benchmark-data')
const engine = require('../../common/engine')
const { ok, fail, ERROR_CODE } = require('../../common/response')

// ---------- cities.list ----------
async function citiesList(ctx, payload) {
  return ok({
    cities: benchmark.cities.map(c => ({
      name: c.name,
      tier: c.tier,
      medianIncome: c.medianIncome,
    })),
  })
}

// ---------- calc.quick ----------
async function calcQuick(ctx, payload) {
  const { city, income, housing } = payload || {}
  if (!city || typeof income !== 'number' || typeof housing !== 'number') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 city/income/housing 字段')
  }
  if (income <= 0 || housing < 0) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', 'income 必须 > 0，housing 必须 ≥ 0')
  }
  try {
    const data = engine.calcQuick({ city, income, housing })
    return ok(data)
  } catch (e) {
    if (e.code === ERROR_CODE.IMBALANCE) {
      return fail(e.code, e.message, e.userHint, e.details)
    }
    throw e
  }
}

// ---------- calc.full ----------
async function calcFull(ctx, payload) {
  const v = payload || {}
  // 必填
  if (!v.city || typeof v.monthlyIncome !== 'number') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 city/monthlyIncome 字段')
  }
  if (!v.fixedExpenses || typeof v.fixedExpenses !== 'object') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 fixedExpenses 对象')
  }
  try {
    const data = engine.calcFull({
      stage: v.stage,
      city: v.city,
      monthlyIncome: v.monthlyIncome,
      incomeStability: v.incomeStability,
      fixedExpenses: v.fixedExpenses,
      savingsTarget: v.savingsTarget,
      emergencyFundMonths: v.emergencyFundMonths,
      monthsToBaby: v.monthsToBaby,
      currentBabyReserve: v.currentBabyReserve,
    })
    return ok(data)
  } catch (e) {
    if (e.code === ERROR_CODE.IMBALANCE) {
      return fail(e.code, e.message, e.userHint, e.details)
    }
    throw e
  }
}

module.exports = {
  'cities.list': citiesList,
  'calc.quick': calcQuick,
  'calc.full': calcFull,
}