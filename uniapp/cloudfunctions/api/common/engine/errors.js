/**
 * 业务错误与异常检测（PDD §6.3 + 技术方案 §5.4）
 *
 * 设计：
 * - IMBALANCE: 抛 BizError（阻断流程，UI 跳 error-imbalance）
 * - CITY_NOT_COVERED: 不抛错，返回 fallback（UI 标注 city_estimated）
 * - BABY_TOO_SOON: 不抛错，返回 warning 对象（写入 risk_report）
 */

const { IMBALANCE_RATIO, BABY_TOO_SOON_MONTHS } = require('./constants')
const { ERROR_CODE } = require('../response')

/**
 * 业务错误类。技术方案 §5.5 网关会捕获 code/message 并返回统一 fail。
 */
class BizError extends Error {
  constructor(code, message, userHint = '', details = null) {
    super(message)
    this.name = 'BizError'
    this.code = code
    this.userHint = userHint
    this.details = details
  }
}

function bizError(code, message, userHint, details) {
  return new BizError(code, message, userHint, details)
}

/**
 * 检测收支失衡（PDD §6.3）
 * 固定支出 ≥ 收入 × 90% → 抛 BizError
 */
function detectImbalance(fixedExpense, income) {
  if (income <= 0) {
    throw bizError(ERROR_CODE.IMBALANCE, 'IMBALANCE', '收入数据异常，请重新填写')
  }
  const ratio = fixedExpense / income
  if (ratio >= IMBALANCE_RATIO) {
    throw bizError(
      ERROR_CODE.IMBALANCE,
      'IMBALANCE',
      `固定支出占收入 ${(ratio * 100).toFixed(0)}%，收支失衡，建议先梳理必选项`,
      { fixedExpense, income, ratio: Math.round(ratio * 10000) / 10000 }
    )
  }
  return ratio
}

// fallback 城市优先级：tier3（最低开销基线）→ tier2 → tier1 → 列表第一个
const CITY_FALLBACK_TIERS = ['tier3', 'tier2', 'tier1']

/**
 * 检测城市未覆盖（PDD §6.3）
 * 不抛错，返回 fallback 城市信息（含 city_estimated: true 标记）
 *
 * 升级说明：原实现固定 fallback 到 tier2 中位数城市（杭州）。
 * 多 tier 体系下，未覆盖城市统一 fallback 到"最接近的最低开销档（tier3）"，
 * 保证 UI 标注 city_estimated: true 时使用最保守的消费基线。
 */
function detectCityNotCovered(cityName, cities) {
  const found = cities.find(c => c.name === cityName)
  if (found) {
    return { city: found, city_estimated: false }
  }
  let fallback = null
  for (const t of CITY_FALLBACK_TIERS) {
    fallback = cities.find(c => c.tier === t)
    if (fallback) break
  }
  if (!fallback) fallback = cities[0]
  return {
    city: { ...fallback, name: cityName, originalName: cityName },
    city_estimated: true,
  }
}

/**
 * 检测备育时间紧迫（PDD §6.3）
 * monthsRemaining < 6 且 currentReserve < required → 红字预警
 */
function detectBabyTooSoon(monthsRemaining, currentReserve, required) {
  if (monthsRemaining == null || monthsRemaining >= BABY_TOO_SOON_MONTHS) return null
  if (currentReserve >= required) return null
  return {
    code: 'BABY_TOO_SOON',
    severity: 'red',
    message: `距生育仅 ${monthsRemaining} 个月，当前储备 ¥${currentReserve} < 推荐 ¥${required}`,
  }
}

module.exports = {
  BizError,
  bizError,
  detectImbalance,
  detectCityNotCovered,
  detectBabyTooSoon,
  CITY_FALLBACK_TIERS,
}
