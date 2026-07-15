/**
 * 快测（PDD §6.1 输出 schema 简化版）
 *
 * 输入：{ city, income, housing }
 * 输出：{ health_score, risk_level, monthly_summary, disposable_range, top_recommendation, city_estimated, warnings }
 *
 * 快测只关心 3 维（无完整 fixedExpenses 列表），housing 当作固定支出，
 * savingsTarget 默认 income × 20%，emergencyFundMonths 默认 3 月。
 */

const benchmark = require('../benchmark-data')
const errors = require('./errors')
const calcHealthScore = require('./calcHealthScore')

const DEFAULT_TOP_RECOMMENDATION = '餐饮可适当压缩，每月可省 ¥300-500'

function calcQuick({ city, income, housing }) {
  // 1. 收支失衡检测
  errors.detectImbalance(housing, income)

  // 2. 城市覆盖检测（fallback 不抛错）
  const cityInfo = errors.detectCityNotCovered(city, benchmark.cities)

  // 3. 简化的月汇总（PDD §6.1）
  const savingsTarget = Math.round(income * 0.20)
  const fixedExpense = housing
  const disposable = income - fixedExpense - savingsTarget

  // 4. 可支配区间
  const disposableRange = [
    Math.max(0, Math.round(disposable * 0.8)),
    Math.round(disposable * 1.2),
  ]

  // 5. 健康分（仅 3 维，无 categories）
  const { score, riskLevel } = calcHealthScore({
    income,
    fixedExpense,
    savingsTarget,
    emergencyFundMonths: 3,
  })

  return {
    health_score: score,
    risk_level: riskLevel,
    monthly_summary: {
      income,
      fixed_expense: fixedExpense,
      savings_target: savingsTarget,
      disposable,
    },
    disposable_range: disposableRange,
    top_recommendation: DEFAULT_TOP_RECOMMENDATION,
    city_estimated: cityInfo.city_estimated,
    original_city: cityInfo.city.originalName || city,
    warnings: [],
  }
}

module.exports = calcQuick