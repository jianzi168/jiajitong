/**
 * Phase 9 数据可携带 & 注销 单测
 *
 * 运行: node --test scripts/test-phase9.js
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

function makeCtx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}

function ok(r) {
  assert.equal(r.code, 0, `expected code=0, got ${r.code} ${r.message || ''}`)
  return r.data
}

const fixInput = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

async function bootstrapFamily(openid) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'test-user' } }, makeCtx(openid))
  const out = calcFull(fixInput)
  const saved = await dispatch({ action: 'plans.save', payload: { planInput: fixInput, planOutput: out } }, makeCtx(openid))
  return ok(saved).plan
}

// ---------- users.exportData ----------
describe('users.exportData', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'users.exportData' }, {})
    assert.equal(r.code, 40101)
  })

  test('新用户无 plan → 返回基本数据', async () => {
    const OPENID = 't9_export_basic'
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'alice' } }, makeCtx(OPENID))
    const r = await dispatch({ action: 'users.exportData' }, makeCtx(OPENID))
    const data = ok(r)
    assert.ok(data.exported_at)
    assert.equal(data.user.nickname, 'alice')
    assert.ok(data.family)
    assert.equal(data.plans.length, 0)
    assert.equal(data.entries.length, 0)
  })

  test('有 plan + entry → 导出包含完整数据', async () => {
    const OPENID = 't9_export_full'
    const plan = await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 200, daily: 80, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))

    const r = await dispatch({ action: 'users.exportData' }, makeCtx(OPENID))
    const data = ok(r)

    // plans
    assert.ok(data.plans.length >= 1)
    assert.equal(data.plans[0].health_score, plan.health_score)

    // entries
    assert.ok(data.entries.length >= 1)
    assert.equal(data.entries[0].total, 280)

    // profile
    assert.ok(data.profile)
    assert.equal(data.profile.family_id, plan.family_id)

    console.log('T9 export full PASS')
  })
})

// ---------- users.deleteMe ----------
describe('users.deleteMe', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'users.deleteMe' }, {})
    assert.equal(r.code, 40101)
  })

  test('删除后 → 数据清空，再次 bootstrap 可重新注册', async () => {
    const OPENID = 't9_delete'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    // 提交一条周记账
    await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 100, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))

    // 删除
    const r = await dispatch({ action: 'users.deleteMe' }, makeCtx(OPENID))
    const data = ok(r)
    assert.equal(data.deleted, true)

    // 再次访问 → UNAUTHORIZED (用户已不存在)
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    assert.equal(dash.code, 40101)

    // 重新 bootstrap → 新用户
    const bs = await dispatch({ action: 'user.bootstrap', payload: { nickname: 'reborn' } }, makeCtx(OPENID))
    const reborn = ok(bs)
    assert.ok(reborn.user)
    assert.equal(reborn.user.nickname, 'reborn')
    assert.equal(reborn.activePlan, null) // 旧 plan 已删
  })

  test('删除不存在用户 → NOT_FOUND', async () => {
    const r = await dispatch({ action: 'users.deleteMe' }, makeCtx('t9_nobody'))
    assert.equal(r.code, 40401)
  })
})

// ---------- 导出后再删除的完整性 ----------
describe('T9 导出 → 删除完整链路', () => {
  test('导出后删除，二次 bootstrap 数据为全新', async () => {
    const OPENID = 't9_chain'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 300, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))

    // 导出
    const exp = await dispatch({ action: 'users.exportData' }, makeCtx(OPENID))
    const expData = ok(exp)
    assert.equal(expData.entries.length, 1)
    assert.equal(expData.entries[0].total, 300)

    // 删除
    const del = await dispatch({ action: 'users.deleteMe' }, makeCtx(OPENID))
    ok(del)

    // 重新注册
    const bs = await dispatch({ action: 'user.bootstrap', payload: { nickname: 'new-me' } }, makeCtx(OPENID))
    const bsData = ok(bs)
    assert.equal(bsData.activePlan, null)

    // 再次导出 → 空数据
    const exp2 = await dispatch({ action: 'users.exportData' }, makeCtx(OPENID))
    const exp2Data = ok(exp2)
    assert.equal(exp2Data.plans.length, 0)
    assert.equal(exp2Data.entries.length, 0)
    console.log('T9 导出 → 删除完整链路 PASS')
  })
})

