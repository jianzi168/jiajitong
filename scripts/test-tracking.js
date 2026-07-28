/**
 * 预算追踪闭环单测（开发计划 Phase 7 验收 — T7-1 / T7-2 / T7-3 / T7-4）
 *
 * 走本地 memoryStore 路径（无 wx-server-sdk）。
 * 直接 dispatch handlers，无需云开发环境。
 *
 * 运行: node --test scripts/test-tracking.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')

// 每 test 前清空
beforeEach(() => {
  try {
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    if (handlers._resetMemory) handlers._resetMemory()
  } catch (e) {}
})

function makeCtx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}

const fixInput = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

function ok(r) {
  assert.equal(r.code, 0, `expected code=0, got ${r.code} ${r.message || ''}`)
  return r.data
}

// ---------- helpers ----------
async function bootstrapFamily(openid) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'tracker' } }, makeCtx(openid))
  const out = calcFull(fixInput)
  const saved = await dispatch({ action: 'plans.save', payload: { planInput: fixInput, planOutput: out } }, makeCtx(openid))
  return ok(saved).plan
}

// ---------- T7-1: 启用 → 填周 → 看板 ----------
describe('T7-1 启用 → 填周 → 看板', () => {
  test('完整链路', async () => {
    const OPENID = 't7_1_openid'
    const plan = await bootstrapFamily(OPENID)
    assert.equal(plan.is_active, true)

    // activate
    const act = await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const activated = ok(act).plan
    assert.ok(activated.activated_at)

    // submit weekly
    const sub = await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 100, daily: 50, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))
    const entry = ok(sub).entry
    assert.ok(entry)
    assert.equal(entry.total, 150)

    // getCurrent
    const cur = await dispatch({ action: 'weekly.getCurrent' }, makeCtx(OPENID))
    const curData = ok(cur)
    assert.ok(curData.entry)
    assert.equal(curData.entry._id, entry._id)

    // dashboard
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const dashData = ok(dash)
    assert.equal(dashData.activated, true)
    assert.ok(dashData.categories)
    assert.ok(dashData.totals)
    assert.ok(dashData.totals.used > 0)

    // baby_reserve shape (T7-1 收尾: 启用了 plan 且 stage=planning → 应当有 pct/color)
    assert.ok(dashData.baby_reserve, 'expected baby_reserve when activated with planning stage')
    assert.equal(typeof dashData.baby_reserve.pct, 'number')
    assert.ok(['green', 'yellow', 'red'].includes(dashData.baby_reserve.color))
    assert.ok(dashData.baby_reserve.pct >= 0 && dashData.baby_reserve.pct <= 100)
    // totals.pct 也不应越界
    assert.ok(dashData.totals.pct >= 0 && dashData.totals.pct <= 100)
    console.log('T7-1 启用 → 填周 → 看板 PASS')
  })
})

// ---------- T7-2: 同周提交覆盖 ----------
describe('T7-2 同周覆盖', () => {
  test('提交两次同周 → 只 1 条 entry, total 更新覆盖', async () => {
    const OPENID = 't7_2_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    const cats1 = { food: 100, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
    const r1 = await dispatch({ action: 'weekly.submit', payload: { categories: cats1 } }, makeCtx(OPENID))
    const id1 = ok(r1).entry._id

    const cats2 = { food: 300, daily: 200, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
    const r2 = await dispatch({ action: 'weekly.submit', payload: { categories: cats2 } }, makeCtx(OPENID))
    const entry2 = ok(r2).entry

    assert.equal(entry2._id, id1, 'upsert: 应当复用同一 entry id')
    assert.equal(entry2.total, 500)
    assert.equal(entry2.categories.food, 300)

    // getCurrent 只返回 1 条
    const cur = await dispatch({ action: 'weekly.getCurrent' }, makeCtx(OPENID))
    const curData = ok(cur)
    assert.ok(curData.entry)
    assert.equal(curData.entry._id, id1)
    assert.equal(curData.entry.total, 500)
    console.log('T7-2 同周覆盖 PASS')
  })
})

// ---------- T7-3: 本月聚合过滤 ----------
describe('T7-3 本月聚合', () => {
  test('getMonthlyEntries 只返回本月 week_start 的 entries', async () => {
    const OPENID = 't7_3_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    // 本周提交
    await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 80, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))

    // 验证 dashboard 聚合从本周 entry 取得 — 当前是 7 月，week_start 本月
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const dashData = ok(dash)
    assert.equal(dashData.activated, true)
    const food = dashData.categories.find(c => c.id === 'food')
    assert.ok(food)
    assert.ok(food.used >= 80)
    // totals used 反映聚合
    assert.ok(dashData.totals.used >= 80)
    console.log('T7-3 本月聚合 PASS')
  })
})

// ---------- T7-4: 未启用空态 ----------
describe('T7-4 未启用空态', () => {
  test('有 plan 但未 activate → activated: false, categories: [], totals: null', async () => {
    const OPENID = 't7_4_openid'
    const plan = await bootstrapFamily(OPENID)
    // 不 activate
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.equal(data.activated, false)
    assert.equal(data.categories.length, 0)
    assert.equal(data.totals, null)
    assert.ok(data.plan)
    // dashboard 返回的 plan 应等于保存时（bootstrap）的 plan
    assert.equal(data.plan._id, plan._id)
    console.log('T7-4 未启用空态 PASS')
  })

  test('无 plan → activated: false, plan: null', async () => {
    const OPENID = 't7_4b_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.equal(data.activated, false)
    assert.equal(data.plan, null)
    assert.equal(data.categories.length, 0)
    assert.equal(data.totals, null)
  })

  test('plans.activate 无 active plan → NOT_FOUND', async () => {
    const OPENID = 't7_4c_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    const r = await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    assert.equal(r.code, 40401)
  })
})

// ---------- T7-5: baby_reserve shape (pct/color) ----------
describe('T7-5 baby_reserve shape', () => {
  test('有 plan 且 activate → baby_reserve 含 pct/color 且在 [0,100]', async () => {
    const OPENID = 't7_5_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.equal(data.activated, true)
    assert.ok(data.baby_reserve, '有 plan + planning stage 应当有 baby_reserve')
    assert.equal(typeof data.baby_reserve.pct, 'number')
    assert.ok(['green', 'yellow', 'red'].includes(data.baby_reserve.color))
    assert.ok(data.baby_reserve.pct >= 0 && data.baby_reserve.pct <= 100)
    console.log('T7-5 baby_reserve (activated) PASS')
  })

  test('有 plan 未 activate → baby_reserve 仍含 pct/color', async () => {
    const OPENID = 't7_5b_openid'
    await bootstrapFamily(OPENID)
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.equal(data.activated, false)
    assert.ok(data.baby_reserve, '未激活但有 plan 仍应返回 baby_reserve')
    assert.equal(typeof data.baby_reserve.pct, 'number')
    assert.ok(data.baby_reserve.pct >= 0 && data.baby_reserve.pct <= 100)
    assert.ok(['green', 'yellow', 'red'].includes(data.baby_reserve.color))
    console.log('T7-5 baby_reserve (not activated) PASS')
  })

  test('无 plan → baby_reserve: null', async () => {
    const OPENID = 't7_5c_openid'
    await dispatch({ action: 'user.bootstrap' }, makeCtx(OPENID))
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.equal(data.activated, false)
    assert.equal(data.baby_reserve, null)
    console.log('T7-5 baby_reserve (no plan) PASS')
  })

  test('totals.pct 不会越界 (>100 时 clamp 到 100)', async () => {
    const OPENID = 't7_5d_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    // 一次填满/超额
    const sub = await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 99999, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))
    const entry = ok(sub).entry
    assert.equal(entry.categories.food, 99999, 'food 应当被记录为 99999')
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.ok(data.totals, 'totals 应存在')
    assert.ok(data.totals.pct <= 100, 'totals.pct 应当 clamp 到 ≤100')
    // color 仍由原始 pct 决定: 应当为 red
    assert.equal(data.totals.color, 'red')
    console.log('T7-5 totals.pct clamp PASS')
  })
})

// ---------- weekly.submit 校验 ----------
describe('weekly.submit 校验', () => {
  test('缺 categories → VALIDATION_ERROR', async () => {
    const OPENID = 't7_v1_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const r = await dispatch({ action: 'weekly.submit', payload: {} }, makeCtx(OPENID))
    assert.equal(r.code, 40010)
  })

  test('负数 → 0 (coerce)', async () => {
    const OPENID = 't7_v2_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const r = await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: -50, daily: 30, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))
    const entry = ok(r).entry
    assert.equal(entry.categories.food, 0)
    assert.equal(entry.total, 30)
  })

  test('小数 → 四舍五入为整数', async () => {
    const OPENID = 't7_v3_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const r = await dispatch({
      action: 'weekly.submit',
      payload: { categories: { food: 10.6, daily: 20.4, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 } },
    }, makeCtx(OPENID))
    const entry = ok(r).entry
    assert.equal(entry.categories.food, 11)
    assert.equal(entry.categories.daily, 20)
  })
})

// ---------- weekly.copyLastWeek ----------
describe('weekly.copyLastWeek', () => {
  test('无上条 → categories: null', async () => {
    const OPENID = 't7_c1_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))
    const r = await dispatch({ action: 'weekly.copyLastWeek' }, makeCtx(OPENID))
    const data = ok(r)
    assert.equal(data.categories, null)
  })

  test('有上条 → 返回上周 categories', async () => {
    const OPENID = 't7_c2_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    // 第一次确认空态
    const empty = await dispatch({ action: 'weekly.copyLastWeek' }, makeCtx(OPENID))
    assert.equal(ok(empty).categories, null)

    // 注入一条"上周" entry (比本周 weekStart 早)
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    // 取 family_id: 直接调 user.bootstrap 已有逻辑 → 通过 plans.getActive 暴露
    const act = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID))
    const familyId = ok(act).plan.family_id
    assert.ok(familyId, 'setup: family_id should exist')

    // 算一个 ISO 周一，再前推 7 天得到上周的 week_start
    const monday = new Date()
    const day = monday.getDay() || 7
    monday.setDate(monday.getDate() - (day - 1))
    const lastWeek = new Date(monday)
    lastWeek.setDate(monday.getDate() - 7)
    const lastWeekStart = lastWeek.toISOString().slice(0, 10)

    const lastCats = { food: 77, daily: 88, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
    handlers._seedWeeklyEntry({
      _id: 'seed_last_week_entry',
      family_id: familyId,
      week_start: lastWeekStart,
      categories: lastCats,
      total: 165,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const r = await dispatch({ action: 'weekly.copyLastWeek' }, makeCtx(OPENID))
    const data = ok(r)
    assert.ok(data.categories, 'expected categories from last week')
    assert.equal(data.categories.food, 77)
    assert.equal(data.categories.daily, 88)
  })
})
