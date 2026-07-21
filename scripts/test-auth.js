/**
 * 用户/计划 handler 单测（开发计划 Phase 6 验收）
 *
 * 注：handlers 在 wx-server-sdk 不存在时走本地内存 DB,
 *      所以这里不需要真云开发环境.
 *
 * 运行: node --test scripts/test-auth.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')

// 每个 test 前清空 handler 模块的内存 store (local mock DB)
beforeEach(() => {
  // handler 模块在 require 时已捕获引用, 通过清空内部 Map 可重置
  try {
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    // 利用 _reset 模块导出 (单测模式)
    if (handlers._resetMemory) handlers._resetMemory()
  } catch (e) {}
})

const OPENID = 'test_openid_aaa'

function makeCtx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}

const fixInput = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

// ---------- user.bootstrap ----------
describe('user.bootstrap', () => {
  test('缺少 ctx.openid → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'user.bootstrap', payload: {} }, {})
    assert.equal(r.code, 40101)
  })

  test('新用户 → 创建 family + user + subscription:free', async () => {
    const r = await dispatch({ action: 'user.bootstrap', payload: { nickname: 'alice' } }, makeCtx(OPENID))
    assert.equal(r.code, 0)
    assert.ok(r.data.user.family_id)
    assert.equal(r.data.user.role, 'owner')
    assert.equal(r.data.subscription.plan_type, 'free')
  })

  test('二次登录同一 openid → 不重复建 family', async () => {
    const r1 = await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    const r2 = await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    assert.equal(r1.data.user.family_id, r2.data.user.family_id)
  })
})

// ---------- plans.save ----------
describe('plans.save', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'plans.save', payload: { planOutput: { health_score: 80 } } }, {})
    assert.equal(r.code, 40101)
  })

  test('已登录 + 有 planOutput → 保存成功 + is_active=true', async () => {
    const OPENID2 = 'test_openid_bbb'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID2))
    const planOutput = calcFull(fixInput)
    const r = await dispatch({ action: 'plans.save', payload: { planInput: fixInput, planOutput } }, makeCtx(OPENID2))
    assert.equal(r.code, 0)
    assert.equal(r.data.plan.is_active, true)
    assert.equal(r.data.plan.health_score, planOutput.health_score)
    assert.equal(r.data.plan.version, 1)
  })

  test('保存第二个 plan → 第一个自动 is_active=false', async () => {
    const OPENID3 = 'test_openid_ccc'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID3))
    const out1 = calcFull(fixInput)
    await dispatch({ action: 'plans.save', payload: { planOutput: out1 } }, makeCtx(OPENID3))
    // 改一个输入让 score 不同
    const out2 = calcFull({ ...fixInput, savingsTarget: 8000 })
    await dispatch({ action: 'plans.save', payload: { planOutput: out2 } }, makeCtx(OPENID3))

    const r = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID3))
    assert.equal(r.data.plan.health_score, out2.health_score)
    assert.equal(r.data.plan.version, 2)
  })
})

// ---------- plans.getActive ----------
describe('plans.getActive', () => {
  test('已登录但无 plan → plan: null', async () => {
    const OPENID4 = 'test_openid_ddd'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID4))
    const r = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID4))
    assert.equal(r.code, 0)
    assert.equal(r.data.plan, null)
  })

  test('已登录 + 有 plan → 返回 active', async () => {
    const OPENID5 = 'test_openid_eee'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID5))
    const out = calcFull(fixInput)
    await dispatch({ action: 'plans.save', payload: { planOutput: out } }, makeCtx(OPENID5))
    const r = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID5))
    assert.equal(r.code, 0)
    assert.ok(r.data.plan)
    assert.equal(r.data.plan.is_active, true)
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'plans.getActive' }, {})
    assert.equal(r.code, 40101)
  })
})

// ---------- 端到端：登录 → 存 → 读 ----------
describe('端到端', () => {
  test('完整链路：bootstrap → save → getActive', async () => {
    const OPENID6 = 'test_openid_e2e'
    const a = await dispatch({ action: 'user.bootstrap', payload: { nickname: 'e2e' } }, makeCtx(OPENID6))
    assert.equal(a.code, 0)
    const planOutput = calcFull(fixInput)
    const b = await dispatch({ action: 'plans.save', payload: { planOutput } }, makeCtx(OPENID6))
    assert.equal(b.code, 0)
    const c = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID6))
    assert.equal(c.data.plan.id || c.data.plan._id, b.data.plan._id)
  })
})
