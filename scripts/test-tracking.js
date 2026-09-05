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
const dateUtil = require('../uniapp/cloudfunctions/api/common/date')

/**
 * 生成"必定落在当月内"的 week_start。
 *
 * 取当月 15 号所在 ISO 周的周一：周一落在 9~15 号之间，必然在当月内。
 * 历史写法取当月 3 号，若 3 号恰在周初，周一会倒推到上个月，
 * 导致「本月聚合」用例按月分 flaky。
 */
function seedWeekStartInCurrentMonth(now = new Date()) {
  const { year, month } = dateUtil.monthRange(now)
  const midMonth = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)) // 正午，避开时区边界
  return dateUtil.weekRange(midMonth).weekStart
}

/** 'YYYY-MM-DD' 平移 N 天 */
function shiftDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return dateUtil.toDateString(new Date(Date.UTC(y, m - 1, d) + days * 86400000))
}

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

    // dashboard (结构完整性验证; totals.used 在跨月边界时可能为 0,
    // 提交流程已验证通过 getCurrent)
    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const dashData = ok(dash)
    assert.equal(dashData.activated, true)
    assert.ok(dashData.categories)
    assert.ok(dashData.totals)

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
  test('dashboard 聚合当前月内的 entries', async () => {
    const OPENID = 't7_3_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    // 显式种一条当前月内的 entry（周一必定在当月 9~15 号之间）
    const weekStart = seedWeekStartInCurrentMonth()

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID))
    const familyId = ok(act).plan.family_id

    handlers._seedWeeklyEntry({
      _id: 'seed_t7_3',
      family_id: familyId,
      week_start: weekStart,
      categories: { food: 80, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: 80,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const dashData = ok(dash)
    assert.equal(dashData.activated, true)
    const food = dashData.categories.find(c => c.id === 'food')
    assert.ok(food)
    assert.ok(food.used >= 80, `expected food.used >= 80, got ${food.used}`)
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

    // 显式种一条当前月内的超额 entry（周一必定在当月 9~15 号之间）
    const weekStart = seedWeekStartInCurrentMonth()

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID))
    const familyId = ok(act).plan.family_id

    handlers._seedWeeklyEntry({
      _id: 'seed_t7_5d',
      family_id: familyId,
      week_start: weekStart,
      categories: { food: 99999, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: 99999,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const dash = await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID))
    const data = ok(dash)
    assert.ok(data.totals, 'totals 应存在')
    assert.ok(data.totals.pct <= 100, `totals.pct 应当 clamp 到 ≤100，实际 ${data.totals.pct}`)
    // color 由原始 pctRaw 决定: 超额 → red
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

    // 取本 ISO 周的周一，再前推 7 天得到上周的 week_start
    const lastWeekStart = shiftDays(dateUtil.weekRange().weekStart, -7)

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

// ---------- T7-7: 跨月周按天比例分摊（回归 P0-3）----------
describe('T7-7 跨月周按天分摊', () => {
  test('daysOfWeekInMonth 天數切分正确（含跨年）', () => {
    // 2026-08-31 是周一，该周为 8/31 ~ 9/6
    assert.equal(dateUtil.daysOfWeekInMonth('2026-08-31', 2026, 8), 1, '8 月仅占 8/31')
    assert.equal(dateUtil.daysOfWeekInMonth('2026-08-31', 2026, 9), 6, '9 月占 9/1~9/6')
    assert.equal(dateUtil.daysOfWeekInMonth('2026-09-07', 2026, 9), 7, '整周在月内')
    assert.equal(dateUtil.daysOfWeekInMonth('2026-09-28', 2026, 9), 3, '9/28~10/4 在 9 月占 3 天')
    assert.equal(dateUtil.daysOfWeekInMonth('2026-09-28', 2026, 10), 4, '同一周在 10 月占 4 天')
    // 跨年
    assert.equal(dateUtil.daysOfWeekInMonth('2026-12-28', 2026, 12), 4)
    assert.equal(dateUtil.daysOfWeekInMonth('2026-12-28', 2027, 1), 3)
    // 非法输入不应抛错
    assert.equal(dateUtil.daysOfWeekInMonth('', 2026, 9), 0)
    assert.equal(dateUtil.daysOfWeekInMonth('bad-input', 2026, 9), 0)
  })

  test('整周在月内 → 计入全额', async () => {
    const OPENID = 't7_m1_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    const familyId = act.plan.family_id
    const { weekStart } = dateUtil.weekRange()

    // 只在整周落在当月内时才断言全额，否则跳过（避免月初/月末 flaky）
    const { year, month } = dateUtil.monthRange()
    const days = dateUtil.daysOfWeekInMonth(weekStart, year, month)
    if (days !== 7) {
      console.log(`    (本周跨月 ${days}/7，跳过全额断言)`)
      return
    }
    handlers._seedWeeklyEntry({
      _id: 'seed_t7_m1',
      family_id: familyId,
      week_start: weekStart,
      categories: { food: 700, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: 700,
      submitted_by: OPENID,
      created_at: Date.now(),
    })
    const dash = ok(await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID)))
    assert.equal(dash.totals.used, 700)
  })

  test('跨月周 → 按天比例计入，不整周消失', async () => {
    const OPENID = 't7_m2_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    const familyId = act.plan.family_id
    const { weekStart } = dateUtil.weekRange()
    const { year, month } = dateUtil.monthRange()
    const days = dateUtil.daysOfWeekInMonth(weekStart, year, month)

    const SPENT = 700
    handlers._seedWeeklyEntry({
      _id: 'seed_t7_m2',
      family_id: familyId,
      week_start: weekStart,
      categories: { food: SPENT, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: SPENT,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const dash = ok(await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID)))
    const expected = Math.round(SPENT * days / 7)
    assert.equal(
      dash.totals.used, expected,
      `跨月周应按 ${days}/7 分摊：期望 ${expected}，实测 ${dash.totals.used}`
    )
    // 核心回归：旧口径下跨月周整周归 week_start 所在月，当月会看到 0
    if (days > 0 && days < 7) {
      assert.ok(dash.totals.used > 0, '跨月周不得整周消失（旧口径此处为 0）')
    }
  })
})

// ---------- T7-6: dashboard.savings（本月储蓄进度）----------
describe('T7-6 dashboard.savings', () => {
  test('未启用追踪 → actual 为 null（不得谎报为 0）', async () => {
    const OPENID = 't7_s1_openid'
    await bootstrapFamily(OPENID)
    const dash = ok(await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID)))
    assert.equal(dash.activated, false)
    assert.ok(dash.savings, 'dashboard 应始终返回 savings 结构')
    assert.equal(dash.savings.actual, null, '无填报数据时 actual 必须是 null 而非 0')
    assert.equal(dash.savings.pct, null)
    assert.equal(dash.savings.color, null)
    assert.equal(dash.savings.target, fixInput.savingsTarget)
  })

  test('启用追踪 + 月内支出 → actual = 收入 − 固定支出 − 已花', async () => {
    const OPENID = 't7_s2_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    const familyId = act.plan.family_id

    const SPENT = 4000
    handlers._seedWeeklyEntry({
      _id: 'seed_t7_s2',
      family_id: familyId,
      week_start: seedWeekStartInCurrentMonth(),
      categories: { food: SPENT, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: SPENT,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const dash = ok(await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID)))
    assert.equal(dash.activated, true)
    assert.equal(dash.totals.used, SPENT, '种子 entry 应计入本月聚合')

    const ms = dash.plan.monthly_summary
    const expected = ms.income - ms.fixed_expense - SPENT
    assert.equal(dash.savings.actual, expected, `actual 应为 ${expected}`)
    assert.equal(dash.savings.target, fixInput.savingsTarget)
    // pct 需 clamp 到 100，避免超额储蓄时进度条宽度越界
    const expectedPct = Math.min(100, Math.round((expected / ms.savings_target) * 100))
    assert.equal(dash.savings.pct, expectedPct)
    assert.ok(['green', 'yellow', 'red'].includes(dash.savings.color))
  })

  test('超支到负值 → actual 夹到 0，不出现负数储蓄', async () => {
    const OPENID = 't7_s3_openid'
    await bootstrapFamily(OPENID)
    await dispatch({ action: 'plans.activate' }, makeCtx(OPENID))

    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const act = ok(await dispatch({ action: 'plans.getActive' }, makeCtx(OPENID)))
    const familyId = act.plan.family_id

    const SPENT = 999999 // 远超收入
    handlers._seedWeeklyEntry({
      _id: 'seed_t7_s3',
      family_id: familyId,
      week_start: seedWeekStartInCurrentMonth(),
      categories: { food: SPENT, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 },
      total: SPENT,
      submitted_by: OPENID,
      created_at: Date.now(),
    })

    const dash = ok(await dispatch({ action: 'dashboard.get' }, makeCtx(OPENID)))
    assert.equal(dash.savings.actual, 0, 'actual 不应为负')
    assert.equal(dash.savings.pct, 0)
    assert.ok(dash.savings.pct >= 0 && dash.savings.pct <= 100)
  })
})
