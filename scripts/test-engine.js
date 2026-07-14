/**
 * 引擎单测（开发计划 Phase 1 验收）
 * 运行：node --test scripts/test-engine.js
 *       npm test (在 uniapp/ 下)
 *
 * 不引外部依赖，使用 Node 内置 node:test + node:assert
 * 引擎单一来源：uniapp/cloudfunctions/common/engine/
 */
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const engine = require('../uniapp/cloudfunctions/common/engine')
const {
  calcQuick, calcFull, calcHealthScore, calcBabyReserve,
  normalize, constants, errors, benchmark,
} = engine

// ---------- benchmark 数据层 ----------
describe('benchmark data', () => {
  test('has 10 cities (PDD §附录 B)', () => {
    assert.equal(benchmark.cities.length, 10)
    const names = benchmark.cities.map(c => c.name)
    // 4 一线 + 6 新一线
    assert.equal(benchmark.cities.filter(c => c.tier === 'tier1').length, 4)
    assert.equal(benchmark.cities.filter(c => c.tier === 'tier2').length, 6)
    assert.ok(names.includes('上海') && names.includes('北京'))
    assert.ok(names.includes('杭州') && names.includes('成都'))
  })

  test('has 7 categories (PDD §附录 A)', () => {
    assert.equal(benchmark.categoryBenchmarks.length, 7)
    assert.deepEqual(
      benchmark.categoryBenchmarks.map(b => b.category).sort(),
      ['clothing', 'daily', 'entertainment', 'food', 'medical', 'other', 'transport']
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

// ---------- 城市覆盖 ----------
describe('calcQuick - 城市覆盖', () => {
  test('未覆盖城市（厦门）→ fallback + city_estimated: true', () => {
    const r = calcQuick({ city: '厦门', income: 25000, housing: 8000 })
    assert.equal(r.city_estimated, true)
    assert.equal(r.original_city, '厦门')
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
})

// ---------- 阶段系数 ----------
describe('阶段系数', () => {
  test('备孕 vs 新婚 → 阶段系数被读取', () => {
    const a = calcFull({
      stage: 'newlywed', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    const b = calcFull({
      stage: 'planning', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400, emergencyFundMonths: 6,
    })
    assert.equal(b.meta.stage_coefficient, 1.05)
    assert.equal(a.meta.stage_coefficient, 1.0)
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
    assert.equal(r.recommendations.length, 0)
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

// ---------- 性能门禁 ----------
describe('性能门禁', () => {
  test('10 城 × 100 次 calcQuick 平均 < 50ms', () => {
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
