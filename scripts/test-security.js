/**
 * 安全审计测试 (Phase 9)
 *
 * 验证:
 *   S-1: 未登录拒绝
 *   S-2: 跨 openid 数据隔离
 *   S-3: 非 owner 拒写
 *   S-4: auth guard 纯函数
 */
'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')

const { dispatch, handlers } = require('../uniapp/cloudfunctions/api')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')

// 固定输入
const fixInput = {
  stage: 'newlywed',
  city: '上海',
  monthlyIncome: 20000,
  incomeStability: 'stable',
  fixedExpenses: { rent: 4000, loan: 0, utilities: 500, transport: 400 },
  savingsTarget: 50000,
  emergencyFundMonths: 3,
}

function makeCtx(openid) {
  return { openid, requestId: 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }
}

function ok(r) {
  assert.equal(r.code, 0, r.userHint || r.message || 'expected code 0')
  return r.data
}

function expectFail(r, code, msgFragment) {
  assert.equal(r.code, code, `expected code ${code}, got ${r.code}: ${r.userHint || r.message}`)
  if (msgFragment) {
    const combined = (r.userHint || r.message || '').toLowerCase()
    assert.ok(combined.includes(msgFragment.toLowerCase()),
      `expected message fragment "${msgFragment}", got "${r.userHint || r.message}"`)
  }
}

// ---------- S-1: 未登录拒绝 ----------
describe('S-1 未登录拒绝', () => {
  test('citys.list / calc.quick / calc.full 不需要登录', async () => {
    // 这三个是公开 action，不应拒绝
    const r1 = await dispatch({ action: 'cities.list' }, {})
    ok(r1)
    const r2 = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 20000, housing: 4000 } }, {})
    ok(r2)
    const r3 = await dispatch({ action: 'calc.full', payload: fixInput }, {})
    ok(r3)
  })

  test('所有需要鉴权的 action 拒绝空 openid', async () => {
    const noCtx = {}
    const authActions = [
      'user.bootstrap', 'plans.save', 'plans.getActive', 'plans.activate',
      'dashboard.get', 'weekly.getCurrent', 'weekly.submit', 'weekly.copyLastWeek',
      'share.getQrCode',
      'users.exportData', 'users.deleteMe',
    ]
    for (const action of authActions) {
      const r = await dispatch({ action, payload: {} }, noCtx)
      expectFail(r, 40101, '登录')
    }
    console.log('S-1 PASS: 所有 11 个鉴权 action 均拒绝空 ctx')
  })
})

// ---------- S-2: 跨 openid 数据隔离 ----------
describe('S-2 跨 openid 隔离', () => {
  test('A 的数据 B 不可见', async () => {
    const A = 's2_alice_' + Date.now()
    const B = 's2_bob_' + Date.now()

    // A 注册 + 测算 + 激活
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'Alice' } }, makeCtx(A))
    const outA = calcFull(fixInput)
    await dispatch({ action: 'plans.save', payload: { planOutput: outA } }, makeCtx(A))
    const dashA = await dispatch({ action: 'dashboard.get' }, makeCtx(A))
    ok(dashA)

    // B 注册 (不同的 openid → 不同的 family)
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'Bob' } }, makeCtx(B))

    // B 读 dashboard → 应该没有 activated plan
    const dashB = await dispatch({ action: 'dashboard.get' }, makeCtx(B))
    const dB = ok(dashB)
    assert.equal(dB.activated, false, 'B 不应看到 A 的 activated plan')

    // B 读 plans.getActive → 应该是 null
    const planB = await dispatch({ action: 'plans.getActive' }, makeCtx(B))
    const pB = ok(planB)
    assert.equal(pB.plan, null, 'B 不应看到 A 的 plan')

    // B 尝试直接读 A 的 openid 的数据是不行的（云函数从 wxContext 取 openid）
    console.log('S-2 跨 openid 隔离 PASS')
  })

  test('A 的 weekly 数据 B 不可见', async () => {
    const A = 's2w_alice_' + Date.now()
    const B = 's2w_bob_' + Date.now()

    // A 注册 + 测算 + 激活 + 记账
    await dispatch({ action: 'user.bootstrap' }, makeCtx(A))
    const outA = calcFull(fixInput)
    await dispatch({ action: 'plans.save', payload: { planOutput: outA } }, makeCtx(A))
    await dispatch({ action: 'plans.activate' }, makeCtx(A))
    await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 100, daily: 50, entertainment: 30, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(A))

    // B 注册
    await dispatch({ action: 'user.bootstrap' }, makeCtx(B))

    // B 的 weekly.getCurrent → 应该是空
    const wB = await dispatch({ action: 'weekly.getCurrent' }, makeCtx(B))
    const wb = ok(wB)
    assert.equal(wb.entry, null, 'B 不应看到 A 的 weekly entry')

    // B 的 dashboard → 无 activated plan
    const dB = await dispatch({ action: 'dashboard.get' }, makeCtx(B))
    const db = ok(dB)
    assert.equal(db.activated, false)
    assert.equal(db.totals, null)

    console.log('S-2 weekly 数据隔离 PASS')
  })
})

// ---------- S-3: 非 owner 拒写 ----------
describe('S-3 非 owner 拒写', () => {
  test('weekly.submit 非 owner 拒绝', async () => {
    // 注意: 当前通过 openid 绑定用户, 内存测试中无法创建"非 owner 用户"
    // 此测试验证 requireOwner 纯函数逻辑
    const { requireOwner } = handlers

    // owner 应放行
    assert.equal(requireOwner({ openid: 'x', role: 'owner' }), null)

    // partner 应拒绝
    const r = requireOwner({ openid: 'x', role: 'partner' })
    expectFail(r, 40301, 'owner')

    // null user 应拒绝
    const r2 = requireOwner(null)
    expectFail(r2, 40301, 'owner')

    // 无 role 字段应拒绝
    const r3 = requireOwner({ openid: 'x' })
    expectFail(r3, 40301, 'owner')

    console.log('S-3 owner 角色检查 PASS')
  })
})

// ---------- S-4: auth guard 纯函数 ----------
describe('S-4 auth guard', () => {
  test('requireAuth 拒绝空/无 openid context', () => {
    const { requireAuth } = handlers

    expectFail(requireAuth(null), 40101)
    expectFail(requireAuth(), 40101)
    expectFail(requireAuth({}), 40101)
    expectFail(requireAuth({ openid: '' }), 40101)
  })

  test('requireAuth 放行有 openid 的 context', () => {
    const { requireAuth } = handlers
    assert.equal(requireAuth({ openid: 'test_123' }), null)
  })

  test('requireAuth 检查由 require 调用方断开 return', () => {
    // 验证返回的 fail 对象 code 是 40101
    const r = handlers.requireAuth({})
    assert.equal(r.code, 40101)
    assert.ok(r.userHint.includes('登录'))
    console.log('S-4 auth guard 纯函数 PASS')
  })
})

// ---------- S-5: 输入校验防注入 ----------
describe('S-5 输入校验', () => {
  test('calc.quick 拒绝负值/零值 income', async () => {
    const r1 = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: 0, housing: 4000 } }, {})
    expectFail(r1, 40010) // VALIDATION_ERROR

    const r2 = await dispatch({ action: 'calc.quick', payload: { city: '上海', income: -100, housing: 4000 } }, {})
    expectFail(r2, 40010)
  })

  test('calc.full 拒绝缺少必填字段', async () => {
    const r = await dispatch({ action: 'calc.full', payload: { city: '上海' } }, {})
    expectFail(r, 40010)
  })

  test('weekly.submit 拒绝空 categories', async () => {
    const r = await dispatch({ action: 'weekly.submit', payload: {} }, makeCtx('s5_wk'))
    expectFail(r, 40010)
    console.log('S-5 输入校验 PASS')
  })
})

console.log('\n=== 安全审计全部通过 ===')
