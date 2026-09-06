/**
 * 超支预警 + 测算限流 测试
 *
 * 1) calc.quick / calc.full 是免登录接口，按 openid 每分钟 ≤10 次限流
 *    （技术方案 §5.7 / §6.2），第 11 次应返回 RATE_LIMITED(42901)。
 *
 * 2) weekly.submit 提交后，若某类「本月已用 / suggested ≥ 80%」，
 *    应返回 overspend 数组（应用内预警已有、这里补订阅推送触发的后端逻辑）。
 *    模板未配置时静默跳过，不影响记账成功返回。
 *
 * 运行: node --test scripts/test-overspend-rate.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')

beforeEach(() => {
  try {
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    if (handlers._resetMemory) handlers._resetMemory()
  } catch (e) {}
})

function ctx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}
function ok(r) {
  assert.equal(r.code, 0, `expected 0, got ${r.code} ${r.message || ''}`)
  return r.data
}

const input = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

async function activatePlan(openid) {
  const out = calcFull(input)
  await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: out } }, ctx(openid))
  await dispatch({ action: 'plans.activate' }, ctx(openid))
}

describe('测算接口限流（免登录）', () => {
  test('calc.quick 每分钟超过 10 次 → RATE_LIMITED', async () => {
    const payload = { city: '上海', income: 32000, housing: 11000 }
    for (let i = 0; i < 10; i++) {
      const r = await dispatch({ action: 'calc.quick', payload }, ctx('rl_quick'))
      assert.equal(r.code, 0, `第 ${i + 1} 次应放行`)
    }
    const r = await dispatch({ action: 'calc.quick', payload }, ctx('rl_quick'))
    assert.equal(r.code, 42901, '第 11 次应触发限流')
    assert.equal(r.message, 'RATE_LIMITED')
  })

  test('calc.full 每分钟超过 10 次 → RATE_LIMITED', async () => {
    const payload = {
      stage: 'planning', city: '上海', monthlyIncome: 32000,
      fixedExpenses: { housing: 11000 }, savingsTarget: 6400,
    }
    for (let i = 0; i < 10; i++) {
      const r = await dispatch({ action: 'calc.full', payload }, ctx('rl_full'))
      assert.equal(r.code, 0, `第 ${i + 1} 次应放行`)
    }
    const r = await dispatch({ action: 'calc.full', payload }, ctx('rl_full'))
    assert.equal(r.code, 42901, '第 11 次应触发限流')
  })

  test('不同 openid 之间限流互相独立', async () => {
    const payload = { city: '上海', income: 32000, housing: 11000 }
    for (let i = 0; i < 10; i++) {
      await dispatch({ action: 'calc.quick', payload }, ctx('rl_a'))
    }
    // rl_a 已耗尽，rl_b 不受影响
    const rb = await dispatch({ action: 'calc.quick', payload }, ctx('rl_b'))
    assert.equal(rb.code, 0, '不同 openid 不应互相限流')
  })
})

describe('超支预警（weekly.submit 触发）', () => {
  test('某类执行率 ≥80% → 返回 overspend 数组', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('os_o'))
    await activatePlan('os_o')

    // 拿到 active plan 的餐饮 suggested，填到刚好 ≥80%
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('os_o')))
    const foodCat = d.categories.find((c) => c.id === 'food')
    const foodSuggested = foodCat.suggested
    const overspendFood = Math.ceil(foodSuggested * 0.85)

    const r = ok(await dispatch(
      { action: 'weekly.submit', payload: { categories: { food: overspendFood, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } } },
      ctx('os_o')
    ))
    assert.ok(r.overspend, '应返回超支类目')
    assert.ok(r.overspend.some((c) => c.id === 'food'), '餐饮应被标记超支')
    assert.ok(r.overspend[0].pct >= 80, '执行率应 ≥80%')
  })

  test('未超支 → 不返回 overspend 字段', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('os_o2'))
    await activatePlan('os_o2')

    const r = ok(await dispatch(
      { action: 'weekly.submit', payload: { categories: { food: 100, daily: 50, entertainment: 50, medical: 0, clothing: 0, transport: 0, other: 0 } } },
      ctx('os_o2')
    ))
    assert.equal(r.overspend, undefined, '未超支不应有 overspend 字段')
  })

  test('模板未配置 → 仍正常返回记账，不报错', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('os_o3'))
    await activatePlan('os_o3')

    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('os_o3')))
    const foodCat = d.categories.find((c) => c.id === 'food')
    const r = ok(await dispatch(
      { action: 'weekly.submit', payload: { categories: { food: Math.ceil(foodCat.suggested * 0.9), daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } } },
      ctx('os_o3')
    ))
    // 即使超支、模板未配置，记账也要成功
    assert.ok(r.entry, '记账应成功')
  })

  test('未启用追踪（无 active plan）→ 不触发预警，正常记账', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('os_o4'))
    // 不 activate，直接填报
    const r = ok(await dispatch(
      { action: 'weekly.submit', payload: { categories: { food: 99999, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } } },
      ctx('os_o4')
    ))
    assert.equal(r.overspend, undefined, '无预算基线不应有超支预警')
    assert.ok(r.entry, '记账应成功')
  })
})
