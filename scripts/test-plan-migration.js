/**
 * 方案迁移与读接口纯度测试
 *
 * 背景：
 *   1. db.getActivePlan() 曾内嵌"建议为空则重跑引擎并回写"的修复逻辑，
 *      导致读操作带写副作用。现已拆为纯读 + 显式迁移。
 *   2. 引擎测算口径升级（v1 → v2）后，存量 budget_plans 需要按
 *      engine_version 定向重算。
 *
 * 运行: node --test scripts/test-plan-migration.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')
const { ENGINE_VERSION } = require('../uniapp/cloudfunctions/api/common/engine/constants')
const db = require('../uniapp/cloudfunctions/api/common/db')

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

const input = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

describe('engine_version 标记', () => {
  test('calcFull 输出带上当前引擎版本', () => {
    const r = calcFull(input)
    assert.equal(r.engine_version, ENGINE_VERSION)
  })

  test('isPlanStale 能识别旧版本方案', () => {
    assert.equal(db.isPlanStale(null), false)
    assert.equal(db.isPlanStale({ engine_version: ENGINE_VERSION }), false)
    assert.equal(db.isPlanStale({}), true, '缺 engine_version 视为 v1 → 旧')
    assert.equal(db.isPlanStale({ engine_version: 1 }), ENGINE_VERSION > 1)
    assert.equal(db.isPlanStale({ engine_version: ENGINE_VERSION + 5 }), false)
  })
})

describe('computePlanUpdate（纯函数）', () => {
  test('用当前引擎重算派生字段', () => {
    const legacy = {
      _id: 'plan_legacy',
      plan_input: input,
      engine_version: 1,
      health_score: 1,          // 故意给个荒谬值，确认会被覆盖
      categories: [],
      recommendations: [],
    }
    const update = db.computePlanUpdate(legacy)
    assert.ok(update, '应返回待更新字段')
    assert.equal(update.engine_version, ENGINE_VERSION)
    assert.equal(update.health_score, calcFull(input).health_score)
    assert.equal(update.categories.length, 7)
    assert.ok(update.recommendations.length >= 1)
    assert.ok(update.recalculated_at)
  })

  test('缺 plan_input → 返回 null（无法重算）', () => {
    assert.equal(db.computePlanUpdate({ _id: 'x' }), null)
    assert.equal(db.computePlanUpdate(null), null)
  })

  test('不修改入参（纯函数）', () => {
    const legacy = { _id: 'p1', plan_input: input, engine_version: 1, health_score: 1 }
    const snapshot = JSON.stringify(legacy)
    db.computePlanUpdate(legacy)
    assert.equal(JSON.stringify(legacy), snapshot, '入参不应被修改')
  })
})

describe('getActivePlan 是纯读', () => {
  test('读取旧方案不会回写（stale 标记暴露，但不自动重算）', async () => {
    const OPENID = 'migr_read_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OPENID))

    // 手动把落库方案降级成 v1 且清空建议，模拟历史脏数据
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const before = handlers._allPlans()[0]
    before.engine_version = 1
    before.recommendations = []
    const snapshot = JSON.stringify(before)

    const r = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    assert.ok(r.plan, '应返回方案')
    assert.equal(r.stale, true, '旧版本方案应被标记为 stale')

    // 关键：存储中的方案不应被读操作改动
    const after = handlers._allPlans().find((p) => p._id === before._id)
    assert.equal(JSON.stringify(after), snapshot, '读操作不得修改存储中的方案')
    assert.equal(after.engine_version, 1, '读操作不得自动升级版本号')
  })

  test('读取不会新增方案记录', async () => {
    const OPENID = 'migr_count_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const n = handlers._allPlans().length
    await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID))
    assert.equal(handlers._allPlans().length, n, '读操作不应产生新记录')
  })
})

describe('plans.recalc（显式重算）', () => {
  test('把旧方案升级到当前版本', async () => {
    const OPENID = 'migr_recalc_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const plan = handlers._allPlans()[0]
    plan.engine_version = 1
    plan.health_score = 1
    plan.categories = []
    plan.recommendations = []

    const r = ok(await dispatch({ action: 'plans.recalc' }, makeCtx(OPENID)))
    assert.equal(r.stale, false)
    assert.equal(r.plan.engine_version, ENGINE_VERSION)
    assert.equal(r.plan.health_score, calcFull(input).health_score)
    assert.equal(r.plan.categories.length, 7)

    // 确认真的落库了
    const persisted = handlers._allPlans().find((p) => p._id === plan._id)
    assert.equal(persisted.engine_version, ENGINE_VERSION)
    assert.equal(persisted.health_score, calcFull(input).health_score)
  })

  test('已有方案已是当前版本时也可重算（幂等）', async () => {
    const OPENID = 'migr_idem_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OPENID))

    const first = ok(await dispatch({ action: 'plans.recalc' }, makeCtx(OPENID)))
    const second = ok(await dispatch({ action: 'plans.recalc' }, makeCtx(OPENID)))
    assert.equal(second.plan.health_score, first.plan.health_score)
    assert.equal(second.plan.engine_version, ENGINE_VERSION)
  })

  test('需要 owner 权限', async () => {
    const OWNER = 'migr_own_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OWNER))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OWNER))

    // 邀请一个伴侣加入（角色 member）
    const inv = ok(await dispatch({ action: 'families.inviteCreate' }, makeCtx(OWNER)))
    const MEMBER = 'migr_member_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(MEMBER))
    ok(await dispatch({ action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } }, makeCtx(MEMBER)))

    const r = await dispatch({ action: 'plans.recalc' }, makeCtx(MEMBER))
    assert.equal(r.code, 40301, 'member 不应能重算方案')
  })

  test('无方案 → NOT_FOUND', async () => {
    const OPENID = 'migr_noplan_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    const r = await dispatch({ action: 'plans.recalc' }, makeCtx(OPENID))
    assert.equal(r.code, 40401)
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'plans.recalc' }, {})
    assert.equal(r.code, 40101)
  })
})

describe('ensureRecommendations 不修改入参', () => {
  test('缺建议时返回新对象，原对象不变', async () => {
    const OPENID = 'migr_pure_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: calcFull(input) } }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const plan = handlers._allPlans()[0]
    plan.recommendations = []
    const snapshot = JSON.stringify(plan)

    const r = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    assert.ok(r.plan.recommendations.length >= 1, '应补齐正向维持建议')

    const persisted = handlers._allPlans().find((p) => p._id === plan._id)
    assert.equal(JSON.stringify(persisted), snapshot, '存储中的方案不应被修改')
  })
})
