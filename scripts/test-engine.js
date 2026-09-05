/**
 * 引擎单测（开发计划 Phase 1 验收）
 * 运行：node --test scripts/test-engine.js
 *       npm test (在 uniapp/ 下)
 *
 * 不引外部依赖，使用 Node 内置 node:test + node:assert
 * 引擎单一来源：uniapp/cloudfunctions/api/common/engine/
 */
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const engine = require('../uniapp/cloudfunctions/api/common/engine')
const {
  calcQuick, calcFull, calcHealthScore, calcBabyReserve,
  normalize, constants, errors, benchmark,
} = engine
const { computeCategoryBase } = normalize

// ---------- benchmark 数据层 ----------
describe('benchmark data', () => {
  test('has 30 cities (PDD §附录 B 扩展版)', () => {
    assert.equal(benchmark.cities.length, 30)
    const names = benchmark.cities.map(c => c.name)
    // 4 一线 + 15 新一线 + 11 强二线
    assert.equal(benchmark.cities.filter(c => c.tier === 'tier1').length, 4)
    assert.equal(benchmark.cities.filter(c => c.tier === 'tier2').length, 15)
    assert.equal(benchmark.cities.filter(c => c.tier === 'tier3').length, 11)
    assert.ok(names.includes('上海') && names.includes('北京'))
    assert.ok(names.includes('杭州') && names.includes('成都'))
    assert.ok(names.includes('厦门') && names.includes('沈阳'))
    // medianIncome 单调下降
    const med = (tier) => benchmark.cities.filter(c => c.tier === tier).map(c => c.medianIncome)
    assert.ok(med('tier1').every(v => v > med('tier2')[0]))
    assert.ok(med('tier2').every(v => v > med('tier3')[0]))
  })

  test('has 7 categories (PDD §附录 A) + 结构调节系数按类目差异化', () => {
    assert.equal(benchmark.categoryBenchmarks.length, 7)
    assert.deepEqual(
      benchmark.categoryBenchmarks.map(b => b.category).sort(),
      ['clothing', 'daily', 'entertainment', 'food', 'medical', 'other', 'transport']
    )
    benchmark.categoryBenchmarks.forEach(b => {
      assert.equal(typeof b.tier1Share, 'number', `${b.category} 缺 tier1Share`)
      assert.equal(typeof b.tier2Share, 'number', `${b.category} 缺 tier2Share`)
      assert.equal(typeof b.tier3Share, 'number', `${b.category} 缺 tier3Share`)
      assert.equal(typeof b.incomeElasticity, 'number', `${b.category} 缺 incomeElasticity`)
      // tier2 为基准档
      assert.equal(b.tier2Share, 1.0, `${b.category} 的 tier2Share 应为基准 1.0`)
    })

    // 关键不变量：调节系数必须【按类目取不同值】。
    // 若对 7 个类目取同一值，归一化 ratio = base / Σbase 会把公共因子完全约掉，
    // 城市等级对最终预算零影响 —— 历史 BUG：上海/成都/兰州算出完全相同的预算。
    assert.ok(
      new Set(benchmark.categoryBenchmarks.map(b => b.tier1Share)).size > 1,
      'tier1Share 必须按类目差异化，否则归一化时被约掉'
    )
    assert.ok(
      new Set(benchmark.categoryBenchmarks.map(b => b.tier3Share)).size > 1,
      'tier3Share 必须按类目差异化，否则归一化时被约掉'
    )
    assert.ok(
      new Set(benchmark.categoryBenchmarks.map(b => b.incomeElasticity)).size > 1,
      'incomeElasticity 必须按类目差异化，否则归一化时被约掉'
    )
  })

  test('tier1 has higher or equal median income than tier2', () => {
    const tier1 = benchmark.cities.filter(c => c.tier === 'tier1').map(c => c.medianIncome)
    const tier2 = benchmark.cities.filter(c => c.tier === 'tier2').map(c => c.medianIncome)
    assert.ok(tier1.every(v => v > tier2[0]))
  })
})

// ---------- 基准（快测） ----------
describe('calcQuick - 基准', () => {
  test('case 1: 上海 32000/11000 → 绿色 + 合理区间', () => {
    const r = calcQuick({ city: '上海', income: 32000, housing: 11000 })
    assert.equal(r.risk_level, 'green')
    assert.ok(r.health_score >= 70 && r.health_score <= 100)
    assert.ok(r.disposable_range[0] > 0)
    assert.ok(r.disposable_range[1] > r.disposable_range[0])
    assert.equal(r.city_estimated, false)
  })

  test('case 2: 北京 28000/9000 → 类似上海（tier1 同系数）', () => {
    const r = calcQuick({ city: '北京', income: 28000, housing: 9000 })
    assert.equal(r.risk_level, 'green')
    assert.equal(r.city_estimated, false)
    assert.ok(r.health_score >= 70)
  })
})

// ---------- calcQuick - tier3 适配 ----------
describe('calcQuick - tier3 城市适配', () => {
  test('厦门（tier3）15000/6000 → green + city_estimated: false', () => {
    const r = calcQuick({ city: '厦门', income: 15000, housing: 6000 })
    assert.equal(r.city_estimated, false)
    assert.ok(r.health_score > 0)
  })

  test('沈阳（tier3）12000/5000 → 可计算', () => {
    const r = calcQuick({ city: '沈阳', income: 12000, housing: 5000 })
    assert.equal(r.city_estimated, false)
    assert.ok(r.disposable_range[0] >= 0)
  })

  test('tier3 城市快测 → disposable 计算正常', () => {
    const r = calcQuick({ city: '哈尔滨', income: 13000, housing: 4500 })
    // income - housing - income*0.20 = 13000 - 4500 - 2600 = 5900
    assert.equal(r.monthly_summary.disposable, 5900)
    // 区间 [4720, 7080]
    assert.deepEqual(r.disposable_range, [4720, 7080])
  })
})

// ---------- 城市覆盖 ----------
describe('calcQuick - 城市覆盖', () => {
  test('未覆盖城市（鄂尔多斯）→ fallback + city_estimated: true', () => {
    const r = calcQuick({ city: '鄂尔多斯', income: 25000, housing: 8000 })
    assert.equal(r.city_estimated, true)
    assert.equal(r.original_city, '鄂尔多斯')
    assert.ok(r.health_score > 0)
  })

  test('已覆盖城市 → city_estimated: false', () => {
    const r = calcQuick({ city: '杭州', income: 25000, housing: 8000 })
    assert.equal(r.city_estimated, false)
  })
})

// ---------- 收支失衡边界 ----------
describe('calcQuick - 收支失衡', () => {
  test('固定 89% → 通过（不抛错）', () => {
    const r = calcQuick({ city: '上海', income: 10000, housing: 8900 })
    assert.ok(r.health_score > 0)
  })

  test('固定 91% → 抛 IMBALANCE', () => {
    assert.throws(
      () => calcQuick({ city: '上海', income: 10000, housing: 9100 }),
      (e) => e.code === 40001 && e.message === 'IMBALANCE'
    )
  })

  test('固定 100% → 抛 IMBALANCE', () => {
    assert.throws(
      () => calcQuick({ city: '上海', income: 10000, housing: 10000 }),
      (e) => e.code === 40001
    )
  })
})

// ---------- 健康分 ----------
describe('calcHealthScore', () => {
  test('储蓄 20%/固定 45%/备用 6 月 → ≥75 green', () => {
    const r = calcHealthScore({
      income: 32000, fixedExpense: 14400, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    assert.ok(r.score >= 75)
    assert.equal(r.riskLevel, 'green')
  })

  test('储蓄 5%/固定 60%/备用 1 月 → <60 red', () => {
    const r = calcHealthScore({
      income: 30000, fixedExpense: 18000, savingsTarget: 1500, emergencyFundMonths: 1,
    })
    assert.ok(r.score < 60)
    assert.equal(r.riskLevel, 'red')
  })

  test('中等画像 → yellow', () => {
    const r = calcHealthScore({
      income: 30000, fixedExpense: 13500, savingsTarget: 4500, emergencyFundMonths: 4,
    })
    assert.ok(r.score >= 50 && r.score < 85)
    assert.equal(r.riskLevel, 'yellow')
  })

  test('结构维度不再恒为常数（回归 P2-1）', () => {
    // 历史实现 scoreStructure() 恒返回 90，占 20% 权重却从不变化，
    // 等于健康分有五分之一是死数。
    const mk = (city, stage) => calcFull({
      city, stage, monthlyIncome: 30000,
      fixedExpenses: { housing: 8000 }, savingsTarget: 3000, emergencyFundMonths: 6,
    }).categories
    const structOf = (cats) => calcHealthScore({
      income: 30000, fixedExpense: 8000, savingsTarget: 3000,
      emergencyFundMonths: 6, categories: cats,
    }).dimensions.structure.score

    const scores = [
      structOf(mk('上海', 'newlywed')),
      structOf(mk('兰州', 'newlywed')),
      structOf(mk('上海', 'pregnant')),
    ]
    assert.ok(new Set(scores).size > 1, `结构分应随城市/阶段变化，实测 ${scores.join('/')}`)
    scores.forEach((s) => {
      assert.ok(s >= 0 && s <= 100, `结构分应在 0-100，实测 ${s}`)
    })
  })

  test('均衡结构得分高于失衡结构', () => {
    const score = (cats) => calcHealthScore({
      income: 30000, fixedExpense: 8000, savingsTarget: 3000,
      emergencyFundMonths: 6, categories: cats,
    }).dimensions.structure.score

    const lopsided = score([
      { id: 'food', suggested: 9000 }, { id: 'entertainment', suggested: 5000 },
      { id: 'clothing', suggested: 3000 }, { id: 'other', suggested: 2000 },
      { id: 'daily', suggested: 100 }, { id: 'medical', suggested: 100 },
      { id: 'transport', suggested: 100 },
    ])
    const balanced = score([
      { id: 'food', suggested: 4000 }, { id: 'daily', suggested: 1800 },
      { id: 'entertainment', suggested: 1500 }, { id: 'medical', suggested: 1500 },
      { id: 'clothing', suggested: 1200 }, { id: 'transport', suggested: 1500 },
      { id: 'other', suggested: 500 },
    ])
    assert.ok(balanced > lopsided, `均衡(${balanced}) 应高于失衡(${lopsided})`)
  })

  test('结构维度边界：无数据 / 预算为 0 → 75', () => {
    const a = calcHealthScore({
      income: 30000, fixedExpense: 8000, savingsTarget: 3000, emergencyFundMonths: 6, categories: [],
    })
    assert.equal(a.dimensions.structure.hasData, false)
    assert.equal(a.dimensions.structure.score, 75)

    const b = calcHealthScore({
      income: 30000, fixedExpense: 8000, savingsTarget: 3000, emergencyFundMonths: 6,
      categories: [{ id: 'food', suggested: 0 }, { id: 'entertainment', suggested: 0 }],
    })
    assert.equal(b.dimensions.structure.hasData, false)
    assert.equal(b.dimensions.structure.score, 75)
  })
})

// ---------- 阶段结构调节 ----------
describe('阶段结构调节', () => {
  test('meta 记录实际生效的调节档位', () => {
    const a = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    const b = calcFull({
      stage: 'planning', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    assert.equal(a.meta.share_modifiers.stage, 'newlywed')
    assert.equal(b.meta.share_modifiers.stage, 'planning')
    assert.equal(b.meta.share_modifiers.tier, 'tier1')
  })

  test('备孕 vs 新婚 → 预算结构真实变化（非 rounding）', () => {
    const mk = (stage) => calcFull({
      stage, city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    const a = mk('newlywed')
    const b = mk('planning')
    const get = (r, id) => r.categories.find(c => c.id === id).suggested
    // 备育期医疗上升、娱乐下降，且幅度远超取整误差
    assert.ok(get(b, 'medical') - get(a, 'medical') > 300, '备育期医疗预算应显著上升')
    assert.ok(get(a, 'entertainment') - get(b, 'entertainment') > 100, '备育期娱乐预算应显著下降')
  })
})

// ---------- 收入系数 ----------
describe('收入系数 (clamp)', () => {
  test('5x 中位数 → clamp 1.15', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 140000,
      fixedExpenses: { housing: 20000 }, savingsTarget: 28000, emergencyFundMonths: 6,
    })
    assert.equal(r.meta.income_coefficient, 1.15)
  })

  test('0.5x 中位数 → clamp 0.85', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 14000,
      fixedExpenses: { housing: 5000 }, savingsTarget: 2800, emergencyFundMonths: 6,
    })
    assert.equal(r.meta.income_coefficient, 0.85)
  })
})

// ---------- 备育 ----------
describe('calcBabyReserve', () => {
  test('12 月后生育 + 储备 32000 → monthlyRequired > 0', () => {
    const r = calcBabyReserve({
      stage: 'planning', cityTier: 'tier1', monthsRemaining: 12, currentReserve: 32000,
    })
    assert.ok(r.target > 80000)
    assert.ok(r.monthlyRequired > 0)
  })

  test('18 月后生育 + 储备 80000 → monthlyRequired = 0', () => {
    const r = calcBabyReserve({
      stage: 'pregnant', cityTier: 'tier2', monthsRemaining: 18, currentReserve: 80000,
    })
    assert.equal(r.monthlyRequired, 0)
  })

  test('4 月后生育 + 储备 5000 → BABY_TOO_SOON warning', () => {
    const warn = errors.detectBabyTooSoon(4, 5000, 80000)
    assert.equal(warn.code, 'BABY_TOO_SOON')
    assert.equal(warn.severity, 'red')
  })

  test('12 月后生育 + tier3 储备 20000 → target = 63640', () => {
    const r = calcBabyReserve({
      stage: 'planning', cityTier: 'tier3', monthsRemaining: 12, currentReserve: 20000,
    })
    assert.equal(r.target, 63640)
    assert.ok(r.monthlyRequired > 0)
  })

  test('未知 tier (tier99) → 兜底到 tier3 基线', () => {
    const r = calcBabyReserve({
      stage: 'planning', cityTier: 'tier99', monthsRemaining: 12, currentReserve: 0,
    })
    // 兜底 tier3 target = 63640
    assert.equal(r.target, 63640)
  })

  test('新婚阶段 → null', () => {
    const r = calcBabyReserve({
      stage: 'newlywed', cityTier: 'tier1', monthsRemaining: 12, currentReserve: 0,
    })
    assert.equal(r, null)
  })
})

// ---------- calcFull ----------
describe('calcFull', () => {
  test('新婚 + 上海 → baby_reserve: null', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000, loan: 1500 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    assert.equal(r.baby_reserve, null)
    assert.equal(r.categories.length, 7)
    assert.equal(r.recommendations.length, 1)
    assert.equal(r.recommendations[0].id, 'R-POSITIVE')
    assert.equal(r.recommendations[0].severity, 'green')
  })

  test('备育 + 上海 → baby_reserve 完整对象', () => {
    const r = calcFull({
      stage: 'planning', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
      monthsToBaby: 12, currentBabyReserve: 32000,
    })
    assert.ok(r.baby_reserve)
    assert.ok(r.baby_reserve.target > 0)
    assert.ok(r.baby_reserve.monthlyRequired > 0)
    assert.equal(r.baby_reserve.monthsRemaining, 12)
  })

  test('7 个 categories 必有', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    const ids = r.categories.map(c => c.id)
    assert.deepEqual(ids.sort(), ['clothing', 'daily', 'entertainment', 'food', 'medical', 'other', 'transport'])
  })

  test('categories 合计 ≈ disposable × 0.95', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    const sum = r.categories.reduce((s, c) => s + c.suggested, 0)
    const expected = r.monthly_summary.disposable * 0.95
    assert.ok(Math.abs(sum - expected) <= 5, `sum=${sum} expected~${expected}`)
  })

  test('disposable ≈ 0 → categories 不崩', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 12000,
      fixedExpenses: { housing: 10500 }, savingsTarget: 1500, emergencyFundMonths: 6,
    })
    assert.equal(r.monthly_summary.disposable, 0)
    assert.ok(r.categories.every(c => c.suggested === 0))
  })

  test('plan_id 是 uuid', () => {
    const r = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    assert.match(r.plan_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

// ---------- 归一化 ----------
describe('normalize', () => {
  test('disposable=0 → 所有 suggested=0', () => {
    const r = normalize.normalizeCategories([
      { id: 'food', baseValue: 3000 },
      { id: 'daily', baseValue: 1200 },
    ], 0)
    assert.ok(r.every(c => c.suggested === 0))
  })

  test('range 是 suggested 的 0.75-1.25 倍', () => {
    const r = normalize.normalizeCategories([{ id: 'food', baseValue: 3000 }], 10000)
    const food = r[0]
    assert.equal(food.range_min, Math.round(food.suggested * 0.75))
    assert.equal(food.range_max, Math.round(food.suggested * 1.25))
  })
})

// ---------- calcFull - tier3 适配 ----------
describe('calcFull - tier3 城市适配', () => {
  test('厦门（tier3）planning → baby_reserve.target = tier3 基线', () => {
    const r = calcFull({
      stage: 'planning', city: '厦门', monthlyIncome: 15000,
      fixedExpenses: { housing: 6000 }, savingsTarget: 3000, emergencyFundMonths: 6,
      monthsToBaby: 12, currentBabyReserve: 0,
    })
    assert.equal(r.meta.city, '厦门')
    assert.equal(r.meta.city_estimated, false)
    assert.ok(r.baby_reserve)
    // tier3 月增量 4470、一次性 10000，target = 4470*12 + 10000 = 63640
    assert.equal(r.baby_reserve.target, 63640)
  })

  test('tier1/tier2/tier3 同样条件下 target 单调递减', () => {
    const base = {
      stage: 'planning', monthlyIncome: 30000,
      fixedExpenses: { housing: 8000 }, savingsTarget: 6000, emergencyFundMonths: 6,
      monthsToBaby: 12, currentBabyReserve: 0,
    }
    const t1 = calcFull({ ...base, city: '上海' }).baby_reserve.target
    const t2 = calcFull({ ...base, city: '杭州' }).baby_reserve.target
    const t3 = calcFull({ ...base, city: '厦门' }).baby_reserve.target
    assert.ok(t1 > t2, `tier1(${t1}) should > tier2(${t2})`)
    assert.ok(t2 > t3, `tier2(${t2}) should > tier3(${t3})`)
  })

  test('归一化后：三档城市的预算结构必须不同（回归 P0-1）', () => {
    // 历史 BUG：调节系数对 7 个类目取同一值，归一化时被约掉，
    // 三城算出完全相同的预算，"按城市测算"的产品承诺落空。
    // 本用例直接锁死最终输出，而不是检查归一化前的中间值。
    const base = {
      stage: 'newlywed', monthlyIncome: 30000,
      fixedExpenses: { housing: 8000 }, savingsTarget: 3000, emergencyFundMonths: 6,
    }
    const cats = (city) => calcFull({ ...base, city }).categories
    const get = (arr, id) => arr.find(c => c.id === id).suggested
    const maxDiff = (a, b) => Math.max(...a.map((x, i) => Math.abs(x.suggested - b[i].suggested)))

    const sh = cats('上海')
    const hz = cats('杭州')
    const xm = cats('厦门')

    // 差异必须显著，不能被误判为 rounding 噪声
    assert.ok(maxDiff(sh, xm) > 100, `tier1 vs tier3 预算应显著不同，实测最大差异 ${maxDiff(sh, xm)}`)
    assert.ok(maxDiff(sh, hz) > 50, `tier1 vs tier2 预算应显著不同，实测最大差异 ${maxDiff(sh, hz)}`)

    // 方向性：城市能级越低，刚性支出占比越高、服务消费占比越低
    assert.ok(get(xm, 'food') > get(sh, 'food'), 'tier3 餐饮应高于 tier1（刚性支出占比更高）')
    assert.ok(
      get(xm, 'entertainment') < get(sh, 'entertainment'),
      'tier3 娱乐应低于 tier1（服务消费占比更低）'
    )
  })

  test('归一化后：家庭阶段必须影响预算结构（回归 P0-1）', () => {
    const base = {
      city: '上海', monthlyIncome: 30000,
      fixedExpenses: { housing: 8000 }, savingsTarget: 3000, emergencyFundMonths: 6,
    }
    const get = (stage, id) => calcFull({ ...base, stage }).categories.find(c => c.id === id).suggested

    // 备育期：医疗显著上升、娱乐下降
    assert.ok(get('planning', 'medical') > get('newlywed', 'medical'), '备育中医疗预算应上升')
    assert.ok(get('pregnant', 'medical') > get('planning', 'medical'), '临近生育医疗预算应进一步上升')
    assert.ok(
      get('pregnant', 'entertainment') < get('newlywed', 'entertainment'),
      '备育期娱乐预算应下降'
    )
  })

  test('归一化后：收入水平必须影响预算结构（恩格尔效应）', () => {
    const base = {
      city: '上海', stage: 'newlywed', emergencyFundMonths: 6,
      fixedExpenses: { housing: 2000 }, savingsTarget: 1000,
    }
    const foodShare = (inc) => {
      const r = calcFull({ ...base, monthlyIncome: inc })
      const sum = r.categories.reduce((s, c) => s + c.suggested, 0)
      return r.categories.find(c => c.id === 'food').suggested / sum
    }
    // 相对收入越高，餐饮占比越低
    assert.ok(foodShare(60000) < foodShare(30000), '高收入餐饮占比应低于中收入')
    assert.ok(foodShare(30000) < foodShare(15000), '中收入餐饮占比应低于低收入')
  })

  test('不变量：七类合计 ≈ 可支配 × 0.95（结构分化后仍成立）', () => {
    const r = calcFull({
      stage: 'pregnant', city: '兰州', monthlyIncome: 26000,
      fixedExpenses: { housing: 7000 }, savingsTarget: 4000, emergencyFundMonths: 6,
    })
    const sum = r.categories.reduce((s, c) => s + c.suggested, 0)
    const expected = r.monthly_summary.disposable * 0.95
    assert.ok(Math.abs(sum - expected) <= 10, `合计 ${sum} 应 ≈ ${expected}`)
  })
})

// ---------- 性能门禁 ----------
describe('性能门禁', () => {
  test('30 城 × 100 次 calcQuick 平均 < 50ms', () => {
    const cities = benchmark.cities.map(c => c.name)
    const iterations = 100
    // 预热
    for (let i = 0; i < 10; i++) for (const c of cities) calcQuick({ city: c, income: 28000, housing: 9000 })

    const t0 = Date.now()
    for (let i = 0; i < iterations; i++) for (const c of cities) calcQuick({ city: c, income: 28000, housing: 9000 })
    const avg = (Date.now() - t0) / (iterations * cities.length)
    assert.ok(avg < 50, `avg ${avg.toFixed(2)}ms >= 50ms`)
  })
})
