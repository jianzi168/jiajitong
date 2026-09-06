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

// 结构评分阈值（占可支配预算的比例）
// 与 benchmark-data 一样属 MVP 占位估算，待 Phase 9 内测数据校准。
const STRUCTURE_BANDS = {
  // 餐饮占比（恩格尔系数）：越低越从容
  foodIdeal: 0.28,   // ≤ 此值满分
  foodWorst: 0.48,   // ≥ 此值 0 分
  // 弹性支出占比（娱乐 + 服饰 + 其他）：越高抗风险能力越弱
  flexIdeal: 0.32,
  flexWorst: 0.57,
  // 两者权重
  foodWeight: 0.5,
  flexWeight: 0.5,
}

/**
 * 预算结构合理性（PDD §6.2.3 第四维，权重 20%）
 *
 * 历史状态：此处恒返回 90（无 categories 时 75），占 20% 权重却从不变化——
 * 等于健康分有五分之一是常数，结构差异完全无法体现。
 *
 * 现在评估"推荐预算本身是否是一个健康的分配结构"，看两个信号：
 *   1. 餐饮占比 —— 越低越从容（恩格尔效应）：弹性空间被吃饭吃掉多少
 *   2. 弹性支出占比 —— 娱乐+服饰+其他：可压缩空间越大，抗风险能力越强
 *
 * 注意：入参 categories 是【推荐预算】而非实际支出，因此这里衡量的是
 * 分配结构是否健康，不衡量执行偏差（执行偏差由看板/复盘负责）。
 *
 * @param {Array<{id:string, suggested:number}>} categories
 * @returns {number} 0-100
 */
function scoreStructure(categories) {
  if (!categories || categories.length === 0) return 75 // 无数据时给中等分

  const total = categories.reduce((s, c) => s + (Number(c.suggested) || 0), 0)
  if (total <= 0) return 75

  const shareOf = (id) => {
    const c = categories.find((x) => x.id === id)
    return c ? (Number(c.suggested) || 0) / total : 0
  }
  const bandScore = (value, ideal, worst) => {
    const over = Math.max(0, value - ideal)
    const span = worst - ideal
    return Math.max(0, Math.min(100, span > 0 ? 100 - (over / span) * 100 : 100))
  }

  const foodShare = shareOf('food')
  const flexShare = shareOf('entertainment') + shareOf('clothing') + shareOf('other')

  const foodScore = bandScore(foodShare, STRUCTURE_BANDS.foodIdeal, STRUCTURE_BANDS.foodWorst)
  const flexScore = bandScore(flexShare, STRUCTURE_BANDS.flexIdeal, STRUCTURE_BANDS.flexWorst)

  return Math.round(
    foodScore * STRUCTURE_BANDS.foodWeight + flexScore * STRUCTURE_BANDS.flexWeight
  )
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
/**
 * 结构维度的细分拆解（供 dimensions 输出，便于核对分数来源）
 * @returns {{hasData:boolean, score:number, foodShare:number, flexShare:number}|null}
 */
function describeStructure(categories) {
  if (!categories || categories.length === 0) return { hasData: false, score: 75, foodShare: null, flexShare: null }
  const total = categories.reduce((s, c) => s + (Number(c.suggested) || 0), 0)
  if (total <= 0) return { hasData: false, score: 75, foodShare: null, flexShare: null }

  const shareOf = (id) => {
    const c = categories.find((x) => x.id === id)
    return c ? (Number(c.suggested) || 0) / total : 0
  }
  return {
    hasData: true,
    score: scoreStructure(categories),
    foodShare: Math.round(shareOf('food') * 10000) / 10000,
    flexShare: Math.round((shareOf('entertainment') + shareOf('clothing') + shareOf('other')) * 10000) / 10000,
  }
}

function calcHealthScore({ income, fixedExpense, savingsTarget, emergencyFundMonths, categories }) {
  const savingsRate = income > 0 ? savingsTarget / income : 0
  const fixedRatio = income > 0 ? fixedExpense / income : 1

  const dimensions = {
    savingsRate: Math.round(savingsRate * 10000) / 10000,
    fixedRatio: Math.round(fixedRatio * 10000) / 10000,
    emergencyMonths: emergencyFundMonths,
    // 结构维度此前只有布尔值，无法解释分数来源；改为暴露细分占比便于核对
    structure: describeStructure(categories),
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