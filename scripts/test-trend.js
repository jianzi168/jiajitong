/**
 * reviews.getTrend 多月趋势测试
 *
 * 重点验证跨月按天分摊：一条周记账若跨月，其支出应按天数比例分到两个月。
 * 若只按 week_start 整周归属，每月 1~6 日填报的支出会在当月凭空消失
 * （此前看板就有这个 bug，修复见 daysOfWeekInMonth）。
 *
 * 运行: node --test scripts/test-trend.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const handlers = require('../uniapp/cloudfunctions/api/handlers')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')

beforeEach(() => {
  if (handlers._resetMemory) handlers._resetMemory()
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

/** 直接塞一条周记账（绕过 weekly.submit 只能写当前周的限制） */
function seedWeek(familyId, weekStart, food, daily) {
  return handlers._seedWeeklyEntry({
    family_id: familyId,
    week_start: weekStart,
    week_end: weekStart,
    categories: {
      food, daily, entertainment: 0, medical: 0,
      clothing: 0, transport: 0, other: 0,
    },
    total: food + daily,
  })
}

async function prepare(openid) {
  await dispatch({ action: 'user.bootstrap' }, ctx(openid))
  const out = calcFull(input)
  await dispatch(
    { action: 'plans.save', payload: { planInput: input, planOutput: out } },
    ctx(openid)
  )
  return `fam_${openid}`
}

describe('reviews.getTrend', () => {
  test('按月份聚合支出，升序返回', async () => {
    const fam = await prepare('td_1')
    seedWeek(fam, '2026-06-01', 800, 200)
    seedWeek(fam, '2026-07-06', 1800, 600)
    seedWeek(fam, '2026-08-03', 1200, 300)

    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_1')))
    assert.equal(d.has_data, true)
    const months = d.months.map((m) => m.month)
    assert.deepEqual(months, ['2026-06', '2026-07', '2026-08'], '应按月份升序')
    assert.equal(d.months[0].label, '6月')
  })

  test('跨月周按天比例分摊（核心）', async () => {
    const fam = await prepare('td_2')
    // 2026-07-27 是周一，该周为 7/27~8/2：7 月占 5 天、8 月占 2 天
    seedWeek(fam, '2026-07-27', 700, 0) // 每天 100

    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_2')))
    const jul = d.months.find((m) => m.month === '2026-07')
    const aug = d.months.find((m) => m.month === '2026-08')

    assert.ok(jul && aug, '该周应同时出现在 7 月与 8 月')
    // 700 * 5/7 = 500；700 * 2/7 = 200
    assert.equal(jul.spend, 500, '7 月应得 5/7')
    assert.equal(aug.spend, 200, '8 月应得 2/7')
    assert.equal(jul.spend + aug.spend, 700, '分摊总和应等于原值，不丢不重')
  })

  test('不跨月的整周归属单一月份', async () => {
    const fam = await prepare('td_3')
    seedWeek(fam, '2026-06-08', 500, 500) // 6/8~6/14 全在 6 月
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_3')))
    assert.equal(d.months.length, 1, '只应产生一个月份')
    assert.equal(d.months[0].month, '2026-06')
    assert.equal(d.months[0].spend, 1000)
  })

  test('储蓄率 = (收入 − 固定支出 − 支出) / 收入', async () => {
    const fam = await prepare('td_4')
    seedWeek(fam, '2026-06-01', 3000, 2000) // 支出 5000
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_4')))
    const m = d.months[0]
    // 收入 32000 − 固定 12500 − 支出 5000 = 14500；14500/32000 ≈ 45%
    assert.equal(m.savings_actual, 14500)
    assert.equal(m.savings_rate, Math.round((14500 / 32000) * 100))
  })

  test('餐饮占比（恩格尔系数）', async () => {
    const fam = await prepare('td_5')
    seedWeek(fam, '2026-06-01', 3000, 1000) // 餐饮 3000 / 合计 4000 = 75%
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_5')))
    assert.equal(d.months[0].food_ratio, 75)
  })

  test('执行率以可支配预算为分母', async () => {
    const fam = await prepare('td_6')
    // 可支配 = 32000 − 12500 − 6400 = 13100
    seedWeek(fam, '2026-06-01', 6550, 0)
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_6')))
    assert.equal(d.baseline.disposable, 13100)
    assert.equal(d.months[0].execution_rate, 50)
  })

  test('首月 deltas 为 null，其后为与上月之差', async () => {
    const fam = await prepare('td_7')
    seedWeek(fam, '2026-06-01', 1000, 0)
    seedWeek(fam, '2026-07-06', 2500, 0)
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_7')))
    assert.equal(d.months[0].deltas.spend, null, '首月无对比')
    assert.equal(d.months[1].deltas.spend, 1500, '第二月应为 2500 − 1000')
  })

  test('limit 生效，只返回最近 N 个月', async () => {
    const fam = await prepare('td_8')
    const starts = [
      '2026-01-05', '2026-02-02', '2026-03-02',
      '2026-04-06', '2026-05-04', '2026-06-01',
    ]
    starts.forEach((s, i) => seedWeek(fam, s, 1000 + i * 100, 0))

    const d = ok(await dispatch(
      { action: 'reviews.getTrend', payload: { limit: 3 } }, ctx('td_8')
    ))
    assert.equal(d.months.length, 3)
    assert.deepEqual(d.months.map((m) => m.month), ['2026-04', '2026-05', '2026-06'])
  })

  test('无填报数据 → 空趋势', async () => {
    await prepare('td_9')
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_9')))
    assert.equal(d.has_data, false)
    assert.deepEqual(d.months, [])
  })

  test('无方案 → 空趋势', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('td_10'))
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_10')))
    assert.equal(d.has_data, false)
  })

  test('家庭数据隔离', async () => {
    const famA = await prepare('td_11a')
    await prepare('td_11b')
    seedWeek(famA, '2026-06-01', 1000, 0)
    const d = ok(await dispatch({ action: 'reviews.getTrend' }, ctx('td_11b')))
    assert.equal(d.has_data, false, 'B 家庭不应看到 A 的数据')
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'reviews.getTrend' }, {})
    assert.equal(r.code, 40101)
  })
})
