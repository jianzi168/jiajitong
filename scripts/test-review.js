/**
 * Phase 10: 月末自动复盘测试
 *
 * 覆盖:
 *   - 有记账数据 → 执行率/健康分/超支Top/结余Top/建议
 *   - 无方案 / 无支出 → has_data=false
 *   - 指定月份隔离聚合
 *   - 上月健康分对比
 *   - 健康分扣分规则（超支扣 15，>130% 额外扣 5）
 *   - member 只读、未登录拒绝、非法月份
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
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'reviewer' } }, makeCtx(openid))
  const out = calcFull(fixInput)
  const saved = await dispatch({ action: 'plans.save', payload: { planInput: fixInput, planOutput: out } }, makeCtx(openid))
  return ok(saved).plan
}

function catSuggestions(plan) {
  const map = {}
  for (const c of (plan.categories || [])) map[c.id] = c.suggested
  return map
}

function monthInfo(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return { y, m, weekStart: `${y}-${String(m).padStart(2, '0')}-01` }
}

// ---------- R-1: 有数据 → 指标正确 ----------
describe('R-1 有记账数据', () => {
  test('执行率/健康分/超支Top/结余Top/建议', async () => {
    const OPENID = 'r1'
    const plan = await bootstrapFamily(OPENID)
    const { y, m, weekStart } = monthInfo()
    const sug = catSuggestions(plan)

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: weekStart,
      categories: {
        food: sug.food * 2 + 100,                // 超支 >130%
        daily: Math.floor((sug.daily || 0) * 0.9),
        entertainment: Math.floor((sug.entertainment || 0) * 0.9),
        clothing: Math.floor((sug.clothing || 0) * 0.9),
        transport: Math.floor((sug.transport || 0) * 0.9),
        other: Math.floor((sug.other || 0) * 0.9),
        medical: Math.floor((sug.medical || 0) * 0.5), // 结余最多 → Top1
      },
    })

    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: y, month: m } }, makeCtx(OPENID)))
    assert.equal(res.has_data, true)
    assert.equal(res.month_label, `${m}月`)
    // 7 类中 6 类未超支 → 86%
    assert.equal(res.metrics.execution_rate, 86)
    // food 超支 >130% → 100 - 15 - 5 = 80
    assert.equal(res.metrics.health_score, 80)
    // 超支 Top 第一位是 food
    assert.equal(res.overspend_top[0].id, 'food')
    assert.ok(res.overspend_top[0].over > 0)
    // 结余 Top 第一位是 medical
    assert.equal(res.surplus_top[0].id, 'medical')
    assert.ok(res.suggestion.length > 0)
  })

  test('只超支未过 130% → 仅扣 15 分', async () => {
    const OPENID = 'r1b'
    const plan = await bootstrapFamily(OPENID)
    const { y, m, weekStart } = monthInfo()
    const sug = catSuggestions(plan)

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: weekStart,
      categories: { food: Math.floor(sug.food * 1.2) }, // ≈120%
    })

    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: y, month: m } }, makeCtx(OPENID)))
    assert.equal(res.metrics.health_score, 85)
    assert.equal(res.overspend_top[0].id, 'food')
  })
})

// ---------- R-2: 无方案 / 无支出 → 空态 ----------
describe('R-2 空数据', () => {
  test('有账号无方案 → has_data=false', async () => {
    const OPENID = 'r2a'
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'r2a' } }, makeCtx(OPENID))
    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: {} }, makeCtx(OPENID)))
    assert.equal(res.has_data, false)
    assert.equal(res.metrics, null)
  })

  test('有方案无支出 → has_data=false', async () => {
    const OPENID = 'r2b'
    await bootstrapFamily(OPENID)
    const { y, m } = monthInfo()
    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: y, month: m } }, makeCtx(OPENID)))
    assert.equal(res.has_data, false)
  })
})

// ---------- R-3: 指定月份隔离 ----------
describe('R-3 月份隔离', () => {
  test('只聚合指定月，上月无数据 → has_data=false', async () => {
    const OPENID = 'r3'
    const plan = await bootstrapFamily(OPENID)
    const cur = monthInfo()
    const prev = monthInfo(-1)
    const sug = catSuggestions(plan)

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: cur.weekStart,
      categories: { food: sug.food * 2 },
    })

    // 当月有数据
    const curRes = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: cur.y, month: cur.m } }, makeCtx(OPENID)))
    assert.equal(curRes.has_data, true)
    // 上月无数据
    const prevRes = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: prev.y, month: prev.m } }, makeCtx(OPENID)))
    assert.equal(prevRes.has_data, false)
  })
})

// ---------- R-4: 上月健康分对比 ----------
describe('R-4 上月对比', () => {
  test('上月也有超支 → prev_health_score 存在且 <100', async () => {
    const OPENID = 'r4'
    const plan = await bootstrapFamily(OPENID)
    const cur = monthInfo()
    const prev = monthInfo(-1)
    const sug = catSuggestions(plan)

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: prev.weekStart,
      categories: { food: sug.food * 2 },
    })
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: cur.weekStart,
      categories: { food: 1 }, // 当月有支出即可
    })

    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: cur.y, month: cur.m } }, makeCtx(OPENID)))
    assert.ok(res.metrics.prev_health_score !== null)
    assert.ok(res.metrics.prev_health_score < 100)
    assert.equal(res.metrics.prev_health_score, 80)
  })
})

// ---------- R-5: 全在控 → 建议语 ----------
describe('R-5 全在控', () => {
  test('无超支分类 → suggestion 提示全部在控', async () => {
    const OPENID = 'r5'
    const plan = await bootstrapFamily(OPENID)
    const { y, m, weekStart } = monthInfo()
    const sug = catSuggestions(plan)

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: weekStart,
      categories: { food: 1, medical: 1 }, // 极小额支出
    })

    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: y, month: m } }, makeCtx(OPENID)))
    assert.equal(res.has_data, true)
    assert.equal(res.overspend_top.length, 0)
    assert.match(res.suggestion, /在控/)
  })
})

// ---------- R-6: 权限与校验 ----------
describe('R-6 权限与校验', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const res = await dispatch({ action: 'reviews.getMonthly', payload: {} }, {})
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'UNAUTHORIZED')
  })

  test('非法月份 → VALIDATION_ERROR', async () => {
    const OPENID = 'r6'
    await bootstrapFamily(OPENID)
    const res = await dispatch({ action: 'reviews.getMonthly', payload: { year: 2026, month: 13 } }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })

  test('member 可读复盘（只读共享）', async () => {
    const OWNER = 'r6_owner'
    const MEMBER = 'r6_member'
    const plan = await bootstrapFamily(OWNER)
    const { y, m, weekStart } = monthInfo()
    const sug = catSuggestions(plan)

    // owner 创建邀请 + member 加入
    const inv = ok(await dispatch({ action: 'families.inviteCreate', payload: {} }, makeCtx(OWNER)))
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'partner' } }, makeCtx(MEMBER))
    const join = await dispatch({ action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } }, makeCtx(MEMBER))
    assert.equal(join.code, 0)

    // owner 记账
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._seedWeeklyEntry({
      family_id: plan.family_id,
      week_start: weekStart,
      categories: { food: sug.food * 2 },
    })

    // member 查复盘 → 同一份家庭数据
    const res = ok(await dispatch({ action: 'reviews.getMonthly', payload: { year: y, month: m } }, makeCtx(MEMBER)))
    assert.equal(res.has_data, true)
    assert.equal(res.overspend_top[0].id, 'food')
  })
})
