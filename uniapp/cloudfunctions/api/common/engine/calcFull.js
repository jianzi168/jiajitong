/**
 * 完整测算（PDD §6.1）
 *
 * 输入：完整向导字段
 * 输出：完整 plan JSON（plan_id / health_score / risk_level / monthly_summary / categories / baby_reserve / recommendations / risk_report）
 */

const crypto = require('crypto')
const benchmark = require('../benchmark-data')
const errors = require('./errors')
const calcHealthScore = require('./calcHealthScore')
const calcBabyReserve = require('./calcBabyReserve')
const { normalizeCategories, computeCategoryBase } = require('./normalize')
const { STAGE_COEFFICIENTS, INCOME_COEFF_MIN, INCOME_COEFF_MAX } = require('./constants')
const { evaluateRules } = require('./rules')

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

/**
 * 主入口
 * @param {object} input
 * @param {'newlywed'|'planning'|'pregnant'} input.stage
 * @param {string} input.city
 * @param {number} input.monthlyIncome
 * @param {string} input.incomeStability - stable/variable
 * @param {object} input.fixedExpenses - { housing, loan, insurance, ... }
 * @param {number} input.savingsTarget
 * @param {number} input.emergencyFundMonths
 * @param {number} [input.monthsToBaby]
 * @param {number} [input.currentBabyReserve]
 */
function calcFull(input) {
  const {
    stage = 'newlywed',
    city,
    monthlyIncome,
    incomeStability = 'stable',
    fixedExpenses = {},
    savingsTarget = 0,
    emergencyFundMonths = 0,
    monthsToBaby = null,
    currentBabyReserve = 0,
  } = input

  // 1. 城市 fallback
  const cityInfo = errors.detectCityNotCovered(city, benchmark.cities)

  // 2. 固定支出求和
  const fixedExpense = Object.values(fixedExpenses).reduce((s, v) => s + (Number(v) || 0), 0)
  errors.detectImbalance(fixedExpense, monthlyIncome)

  // 3. 可支配
  const disposable = monthlyIncome - fixedExpense - savingsTarget

  // 4. 月汇总
  const monthlySummary = {
    income: monthlyIncome,
    fixed_expense: fixedExpense,
    savings_target: savingsTarget,
    disposable,
  }

  // 5. 收入系数（PDD §6.2.2）
  const cityMedian = cityInfo.city.medianIncome || 20000
  const incomeCoeff = clamp(
    monthlyIncome / cityMedian,
    INCOME_COEFF_MIN,
    INCOME_COEFF_MAX
  )

  // 6. 类目基准 → 归一化
  const rawCategories = computeCategoryBase({
    city: cityInfo.city.name,
    monthlyIncome,
    stage,
    incomeCoeff,
  })
  const categories = normalizeCategories(rawCategories, disposable)

  // 7. 健康分
  const { score, riskLevel } = calcHealthScore({
    income: monthlyIncome,
    fixedExpense,
    savingsTarget,
    emergencyFundMonths,
    categories,
  })

  // 8. 备育分支
  const babyReserve = calcBabyReserve({
    stage,
    cityTier: cityInfo.city.tier,
    monthsRemaining: monthsToBaby,
    currentReserve: currentBabyReserve,
    monthlyDisposable: disposable,
  })

  // 9. risk_report 聚合
  const riskReport = {
    city_estimated: cityInfo.city_estimated,
    imbalance: false,
    baby_too_soon: null,
  }

  // BABY_TOO_SOON 仅在备育阶段检测
  if (babyReserve && monthsToBaby != null) {
    const babyWarn = errors.detectBabyTooSoon(monthsToBaby, currentBabyReserve, babyReserve.target)
    if (babyWarn) riskReport.baby_too_soon = babyWarn
  }

  // 9.5 评估规则引擎（Phase 5: R01-R07 + R-N01-N07）
  const builtPlan = {
    health_score: score,
    risk_level: riskLevel,
    monthly_summary: monthlySummary,
    categories,
    baby_reserve: babyReserve,
    risk_report: riskReport,
    meta: {
      stage,
      city: cityInfo.city.name,
      original_city: city,
      city_estimated: cityInfo.city_estimated,
      income_stability: incomeStability,
      income_coefficient: incomeCoeff,
      stage_coefficient: STAGE_COEFFICIENTS[stage] || 1.0,
    },
  }
  const recommendations = evaluateRules(builtPlan, {
    stage,
    monthlyIncome,
    fixedExpenses,
    emergencyFundMonths,
    monthsToBaby,
    currentBabyReserve,
  })

  // 10. 组装
  return {
    plan_id: crypto.randomUUID(),
    health_score: score,
    risk_level: riskLevel,
    monthly_summary: monthlySummary,
    categories,
    baby_reserve: babyReserve,
    recommendations,
    risk_report: riskReport,
    meta: builtPlan.meta,
  }
}

module.exports = calcFull