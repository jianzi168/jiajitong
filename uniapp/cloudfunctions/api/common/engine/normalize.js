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
 *
 * 注意：因为要除以 sum(baseValues)，任何对所有类目取同一值的因子都会在这里
 * 被约掉。上游 computeCategoryBase 的调节系数必须按类目差异化，否则无效。
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
      // 用户可见文案：只陈述真正影响结果的因素。
      // 历史文案罗列了"家庭系数 1.8 / 城市系数 / 收入系数 / 阶段系数"，
      // 但当时它们对 7 个类目取同一值，归一化后全被约掉——解释与结果对不上。
      calculation_basis: total > 0
        ? `按所在城市等级、家庭阶段与收入水平调节后的结构占比 ${(ratio * 100).toFixed(1)}%，七类合计 ≈ 可支配收入 × 0.95`
        : '无可支配收入，预算为 0',
    }
  })
}

/**
 * 类目基准计算（PDD §6.2.1）
 * 输出 [{ id, baseValue }] 给 normalizeCategories
 *
 * baseValue = perCapitaMonthly × tierShare × stageShare × incomeShare
 *
 * 三个调节因子都**按类目取不同值**，这是关键：
 *   归一化时 ratio = base / Σbase，任何对所有类目取同一值的因子都会被完全约掉。
 *   历史版本正是用了统一标量（tier: 1.0/0.85/0.75、stage: 1.0/1.05/1.08、
 *   income: 单一系数），导致城市/阶段/收入对最终预算零影响——三城算出同一份预算。
 *   改为分类目取值后，差异才能在归一化后存活。
 *
 * 注意：归一化后只有相对比例有效，因此 baseValue 的绝对量不影响结果，
 * 这里不做任何"绝对金额"意义上的解释。
 *
 * @param {string} city - 城市名（决定 tier）
 * @param {'newlywed'|'planning'|'pregnant'} stage - 家庭阶段
 * @param {number} incomeCoeff - 收入系数，clamp(monthlyIncome / cityMedian, 0.85, 1.15)
 */
function computeCategoryBase({ city, stage = 'newlywed', incomeCoeff = 1.0 }) {
  const benchmarkData = require('../benchmark-data')
  const { STAGE_SHARE_MODIFIERS } = require('./constants')
  const cityObj = benchmarkData.getCityByName(city) || { tier: 'tier2' } // fallback
  const stageMod = STAGE_SHARE_MODIFIERS[stage] || STAGE_SHARE_MODIFIERS.newlywed

  return benchmarkData.categoryBenchmarks.map(b => {
    // 未知 tier 兜底用 tier2（兼容性）
    const tierShare = b[`${cityObj.tier}Share`] ?? b.tier2Share ?? 1
    const stageShare = stageMod[b.category] ?? 1
    // 收入弹性：incomeCoeff^e。e<0（餐饮）→ 收入越高占比越低（恩格尔效应）
    const incomeShare = Math.pow(incomeCoeff, b.incomeElasticity || 0)
    const baseValue = b.perCapitaMonthly * tierShare * stageShare * incomeShare
    return { id: b.category, baseValue: Math.round(baseValue) }
  })
}

module.exports = {
  normalizeCategories,
  computeCategoryBase,
}
