/**
 * 健康分计算（PDD §6.2.3）
 *
 * 四维权重：储蓄率 30% / 固定支出占比 25% / 备用金月数 25% / 预算结构合理性 20%
 *
 * 输出：{ score: 0-100, riskLevel: 'green'|'yellow'|'red', dimensions: {...} }
 */

const WEIGHTS = {
  savingsRate: 0.30,
  fixedRatio: 0.25,
  emergencyMonths: 0.25,
  structure: 0.20,
}

/**
 * 单维度评分（0-100）
 */
function scoreSavingsRate(rate) {
  if (rate >= 0.20) return 100
  if (rate >= 0.10) return Math.round(50 + (rate - 0.10) / 0.10 * 50) // 10%→50, 20%→100
  return Math.round(rate / 0.10 * 50) // 0%→0, 10%→50
}

function scoreFixedRatio(ratio) {
  if (ratio <= 0.40) return 100
  if (ratio <= 0.50) return Math.round(100 - (ratio - 0.40) / 0.10 * 50) // 40%→100, 50%→50
  return Math.round(Math.max(0, 50 - (ratio - 0.50) / 0.10 * 50)) // 50%→50, 60%→0
}

function scoreEmergencyMonths(months) {
  if (months >= 6) return 100
  if (months >= 3) return Math.round(50 + (months - 3) / 3 * 50) // 3→50, 6→100
  return Math.round(months / 3 * 50) // 0→0, 3→50
}

/**
 * 预算结构合理性：MVP 简化为「如果存在 normalize 后的 categories，则视为通过」
 * Phase 5 接入 R01–R07 后会基于「餐饮/娱乐是否在区间内」评分
 */
function scoreStructure(categories) {
  if (!categories || categories.length === 0) return 75 // 无数据时给中等分
  return 90 // MVP 默认给高分
}

/**
 * 主入口
 * @param {object} params
 * @param {number} params.income - 月收入
 * @param {number} params.fixedExpense - 月固定支出合计
 * @param {number} params.savingsTarget - 月储蓄目标
 * @param {number} params.emergencyFundMonths - 备用金覆盖月数
 * @param {array} [params.categories] - 类目数组（可选，用于结构分）
 * @returns {{score: number, riskLevel: string, dimensions: object}}
 */
function calcHealthScore({ income, fixedExpense, savingsTarget, emergencyFundMonths, categories }) {
  const savingsRate = income > 0 ? savingsTarget / income : 0
  const fixedRatio = income > 0 ? fixedExpense / income : 1

  const dimensions = {
    savingsRate: Math.round(savingsRate * 10000) / 10000,
    fixedRatio: Math.round(fixedRatio * 10000) / 10000,
    emergencyMonths: emergencyFundMonths,
    structureReasonable: categories ? categories.length > 0 : null,
  }

  const sRate = scoreSavingsRate(savingsRate)
  const sFixed = scoreFixedRatio(fixedRatio)
  const sEmerg = scoreEmergencyMonths(emergencyFundMonths)
  const sStruct = scoreStructure(categories)

  const score = Math.round(
    sRate * WEIGHTS.savingsRate +
    sFixed * WEIGHTS.fixedRatio +
    sEmerg * WEIGHTS.emergencyMonths +
    sStruct * WEIGHTS.structure
  )

  let riskLevel
  if (score >= 75 && emergencyFundMonths >= 3) riskLevel = 'green'
  else if (score < 50 || fixedRatio > 0.55 || emergencyFundMonths < 1) riskLevel = 'red'
  else riskLevel = 'yellow'

  return { score, riskLevel, dimensions }
}

module.exports = calcHealthScore