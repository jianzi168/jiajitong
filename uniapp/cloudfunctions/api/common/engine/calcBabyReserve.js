/**
 * 备育储备测算（PDD §6.2.4）
 *
 * 输入：{ stage, cityTier, monthsRemaining, currentReserve, monthlyDisposable? }
 * 输出：{ target, current, monthlyRequired, monthsRemaining, monthlyIncrement, oneTimeChildbirth, pressureRatio }
 *
 * 公式：
 *   target = monthlyIncrement × 12 + oneTimeChildbirth
 *   monthlyRequired = max(0, round((target - current) / monthsRemaining))
 *   pressureRatio = monthlyRequired / (monthlyDisposable × 0.30)   用于 R-N01 触发判断
 */

const benchmark = require('../benchmark-data')

function calcBabyReserve({ stage, cityTier, monthsRemaining, currentReserve, monthlyDisposable = 0 }) {
  // 非备育阶段
  if (!['planning', 'pregnant'].includes(stage)) {
    return null
  }
  // monthsRemaining 缺失
  if (monthsRemaining == null || monthsRemaining <= 0) {
    return { target: 0, current: currentReserve || 0, monthlyRequired: 0, monthsRemaining: 0 }
  }

  const babyBm = benchmark.getBabyBenchmarkByTier(cityTier) || benchmark.babyBenchmarks.tier2
  const monthlyIncrement = babyBm.milkDiapers + babyBm.childcare + babyBm.medical + babyBm.supplies
  const oneTimeChildbirth = babyBm.oneTimeChildbirth

  const target = monthlyIncrement * 12 + oneTimeChildbirth
  const monthlyRequired = Math.max(0, Math.round((target - (currentReserve || 0)) / monthsRemaining))
  const pressureRatio = monthlyDisposable > 0
    ? Math.round((monthlyRequired / (monthlyDisposable * 0.30)) * 10000) / 10000
    : null

  return {
    target,
    current: currentReserve || 0,
    monthlyRequired,
    monthsRemaining,
    monthlyIncrement,
    oneTimeChildbirth,
    pressureRatio,
  }
}

module.exports = calcBabyReserve