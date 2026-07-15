/**
 * 类目归一化（PDD §6.2.1）
 * 输入：rawCategories = [{ id, baseValue }]
 * 输出：[{ id, name, suggested, range_min, range_max, ratio, calculation_basis }]
 *
 * 公式：
 *   ratio = baseValue / sum(baseValues)
 *   suggested = round(disposableIncome * 0.95 * ratio)
 *   range_min = round(suggested * 0.75)
 *   range_max = round(suggested * 1.25)
 *
 * 边界：disposableIncome <= 0 时所有类目 suggested = 0（不抛错，让上层展示）
 */
const { CATEGORY_IDS } = require('./constants')
const benchmark = require('../benchmark-data')

function normalizeCategories(rawCategories, disposableIncome) {
  const total = rawCategories.reduce((s, c) => s + c.baseValue, 0)
  const target = Math.max(0, disposableIncome) * 0.95

  return rawCategories.map(c => {
    const ratio = total > 0 ? c.baseValue / total : 0
    const suggested = Math.round(target * ratio)
    const bm = benchmark.getBenchmarkByCategory(c.id)
    const name = bm ? bm.name : c.id
    return {
      id: c.id,
      name,
      suggested,
      range_min: Math.round(suggested * 0.75),
      range_max: Math.round(suggested * 1.25),
      ratio: Math.round(ratio * 10000) / 10000, // 保留 4 位
      calculation_basis: total > 0
        ? `基准 ${c.baseValue} × 家庭系数 1.8 × 城市系数 × 收入系数 × 阶段系数，归一化使合计 ≈ 可支配 × 0.95`
        : '无可支配收入，预算为 0',
    }
  })
}

/**
 * 类目基准计算（PDD §6.2.1）
 * 输出 [{ id, baseValue }] 给 normalizeCategories
 *
 * baseValue = perCapitaMonthly × familyCoeff × tierMult × incomeCoeff × stageCoeff
 */
function computeCategoryBase({ city, monthlyIncome, stage = 'newlywed', incomeCoeff = 1.0 }) {
  const benchmarkData = require('../benchmark-data')
  const { FAMILY_CONSUMPTION_COEFF, STAGE_COEFFICIENTS } = require('./constants')
  const cityObj = benchmarkData.getCityByName(city) || { tier: 'tier2' } // fallback
  const stageCoeff = STAGE_COEFFICIENTS[stage] || 1.0

  return benchmarkData.categoryBenchmarks.map(b => {
    const tierMult = cityObj.tier === 'tier1' ? b.tier1Multiplier : b.tier2Multiplier
    const baseValue = Math.round(
      b.perCapitaMonthly * FAMILY_CONSUMPTION_COEFF * tierMult * incomeCoeff * stageCoeff
    )
    return { id: b.category, baseValue }
  })
}

module.exports = {
  normalizeCategories,
  computeCategoryBase,
}