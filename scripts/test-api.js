/**
 * API 网关单测（开发计划 Phase 2 验收）
 * 运行：node --test scripts/test-api.js
 */
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { ERROR_CODE } = require('../uniapp/cloudfunctions/common/response')

// ---------- cities.list ----------
describe('cities.list', () => {
  test('返回 10 城 + tier + medianIncome', async () => {
    const r = await dispatch({ action: 'cities.list' })
    assert.equal(r.code, 0)
    assert.equal(r.data.cities.length, 10)
    assert.ok(r.data.cities[0].tier)
    assert.ok(r.data.cities[0].medianIncome)
  })

  test('tier1 城市数量 = 4', async () => {
    const r = await dispatch({ action: 'cities.list' })
    const tier1 = r.data.cities.filter(c => c.tier === 'tier1')
    assert.equal(tier1.length, 4)
  })
})

// ---------- calc.quick ----------
describe('calc.quick', () => {
  test('happy path → code:0', async () => {
    const r = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 32000, housing: 11000 } })
    assert.equal(r.code, 0)
    assert.equal(r.data.risk_level, 'green')
    assert.ok(r.data.disposable_range[0] > 0)
  })

  test('城市未覆盖 → city_estimated: true（不抛错）', async () => {
    const r = await dispatch({ action: 'calc.quick', payload: { city: '厦门', income: 25000, housing: 8000 } })
    assert.equal(r.code, 0)
    assert.equal(r.data.city_estimated, true)
  })

  test('固定 91% → fail IMBALANCE', async () => {
    const r = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 10000, housing: 9100 } })
    assert.equal(r.code, ERROR_CODE.IMBALANCE)
    assert.equal(r.message, 'IMBALANCE')
    assert.ok(r.userHint)
  })

  test('缺少 city → VALIDATION_ERROR', async () => {
    const r = await dispatch({ action: 'calc.quick', payload: { income: 10000, housing: 3000 } })
    assert.equal(r.code, ERROR_CODE.VALIDATION_ERROR)
    assert.equal(r.message, 'VALIDATION_ERROR')
  })

  test('income=0 → VALIDATION_ERROR', async () => {
    const r = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 0, housing: 1000 } })
    assert.equal(r.code, ERROR_CODE.VALIDATION_ERROR)
  })
})

// ---------- calc.full ----------
describe('calc.full', () => {
  test('晓雯画像 → 完整 plan', async () => {
    const r = await dispatch({
      action: 'calc.full',
      payload: {
        stage: 'planning', city: '上海', monthlyIncome: 32000,
        fixedExpenses: { housing: 11000, loan: 1500, insurance: 1000 },
        savingsTarget: 6400, emergencyFundMonths: 6,
        monthsToBaby: 12, currentBabyReserve: 32000,
      },
    })
    assert.equal(r.code, 0)
    assert.ok(r.data.plan_id)
    assert.equal(r.data.health_score >= 75, true)
    assert.equal(r.data.categories.length, 7)
    assert.ok(r.data.baby_reserve)
  })

  test('缺少 fixedExpenses → VALIDATION_ERROR', async () => {
    const r = await dispatch({ action: 'calc.full', payload: { city: '上海', monthlyIncome: 32000 } })
    assert.equal(r.code, ERROR_CODE.VALIDATION_ERROR)
  })

  test('收支失衡 → fail IMBALANCE', async () => {
    const r = await dispatch({
      action: 'calc.full',
      payload: {
        city: '上海', monthlyIncome: 10000,
        fixedExpenses: { housing: 9100 },
      },
    })
    assert.equal(r.code, ERROR_CODE.IMBALANCE)
  })
})

// ---------- 路由 ----------
describe('action 路由', () => {
  test('未知 action → UNKNOWN_ACTION', async () => {
    const r = await dispatch({ action: 'foo.bar' })
    assert.equal(r.code, ERROR_CODE.UNKNOWN_ACTION)
  })

  test('缺少 action → VALIDATION_ERROR', async () => {
    const r = await dispatch({ payload: {} })
    assert.equal(r.code, ERROR_CODE.VALIDATION_ERROR)
  })

  test('空 event → VALIDATION_ERROR', async () => {
    const r = await dispatch({})
    assert.equal(r.code, ERROR_CODE.VALIDATION_ERROR)
  })
})

// ---------- 性能门禁 ----------
describe('性能门禁', () => {
  test('100 次 cities.list < 500ms (P95 满足)', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 100; i++) await dispatch({ action: 'cities.list' })
    const avg = (Date.now() - t0) / 100
    assert.ok(avg < 50, `avg ${avg.toFixed(2)}ms >= 50ms`)
  })

  test('100 次 calc.quick < 500ms (P95 满足)', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 100; i++) {
      await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 32000, housing: 11000 } })
    }
    const avg = (Date.now() - t0) / 100
    assert.ok(avg < 50, `avg ${avg.toFixed(2)}ms >= 50ms`)
  })
})
