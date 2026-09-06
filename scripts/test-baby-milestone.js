/**
 * 备育里程碑与达标外推测试
 *
 * 修了一个方向性 bug：shapeBabyReserve 此前用 colorOf（「已花占比」语义，
 * 越高越危险）给**目标完成度**配色，导致——
 *   存到 95% → 红色（快达标了却报警）
 *   只存 20% → 绿色（严重落后却显得安全）
 * 完全反向。正确的是 progressColorOf（≥100 绿 / ≥70 黄 / 其余红）。
 *
 * 外推（projected/on_track/gap/extra_monthly）用「实际储蓄速度」而非
 * monthlyRequired —— 后者是「按计划刚好达标」的值，用它外推永远显示
 * 达标，属于自我循环。
 *
 * 运行: node --test scripts/test-baby-milestone.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const handlers = require('../uniapp/cloudfunctions/api/handlers')
const { calcFull, calcBabyReserve } = require('../uniapp/cloudfunctions/api/common/engine')

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

async function activateFamily(openid, { current = 32000 } = {}) {
  await dispatch({ action: 'user.bootstrap' }, ctx(openid))
  const out = calcFull({ ...input, currentBabyReserve: current })
  await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: out } }, ctx(openid))
  await dispatch({ action: 'plans.activate' }, ctx(openid))
  return out
}

function seedWeek(openid, familyId, weekStart, cats) {
  return handlers._seedWeeklyEntry({
    family_id: familyId,
    week_start: weekStart,
    week_end: weekStart,
    categories: cats,
    total: Object.values(cats).reduce((s, v) => s + v, 0),
  })
}

describe('配色方向（回归：此前完全反向）', () => {
  test('接近达标 → 绿色（旧实现会显示红色）', async () => {
    await activateFamily('bm_g1', { current: 91800 }) // 100%
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_g1')))
    assert.equal(d.baby_reserve.pct, 100)
    assert.equal(d.baby_reserve.color, 'green', '存满 100% 必须是绿色')
    assert.equal(d.baby_reserve.next_milestone, null, '全部里程碑达成')
  })

  test('过半（50%）→ 红色（与储蓄进度条同一分档口径）', async () => {
    // progressColorOf 分档：≥100 绿 / ≥70 黄 / 其余红。
    // 备育储备与首页储蓄进度必须用同一分档，否则两条进度条并排显示时颜色语义不一致。
    await activateFamily('bm_g2', { current: 46000 }) // ~50%
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_g2')))
    assert.equal(d.baby_reserve.color, 'red')
    assert.equal(d.baby_reserve.next_milestone, 75)
  })

  test('刚起步 → 红色（提示需加油，而非旧实现的安全绿）', async () => {
    await activateFamily('bm_g3', { current: 9000 }) // ~10%
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_g3')))
    assert.equal(d.baby_reserve.color, 'red')
    assert.equal(d.baby_reserve.next_milestone, 25)
  })
})

describe('里程碑', () => {
  test('四个节点 25/50/75/100，按当前进度判定达成', async () => {
    await activateFamily('bm_m1', { current: 46000 }) // 50%
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_m1')))
    assert.deepEqual(d.baby_reserve.milestones, [
      { pct: 25, reached: true },
      { pct: 50, reached: true },
      { pct: 75, reached: false },
      { pct: 100, reached: false },
    ])
    assert.equal(d.baby_reserve.next_milestone, 75)
  })
})

describe('按实际储蓄速度外推', () => {
  test('本月有填报 → projected/on_track/gap/extra_monthly 齐全', async () => {
    await activateFamily('bm_p1', { current: 32000 }) // target 91800
    // 本月填报：合计 5500 → pace = 32000 − 12500 − 5500 = 14000
    seedWeek('bm_p1', 'fam_bm_p1', '2026-09-07', {
      food: 3000, daily: 1000, entertainment: 500,
      medical: 200, clothing: 200, transport: 300, other: 300,
    })
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_p1')))
    const b = d.baby_reserve
    assert.equal(b.monthly_saving_pace, 14000)
    // projected = 32000 + 14000 × 12 = 200000 ≥ 91800 → on_track
    assert.equal(b.on_track, true)
    assert.equal(b.gap, 0)
    assert.equal(b.extra_monthly, 0)
  })

  test('落后时给出每月需多存多少', async () => {
    await activateFamily('bm_p2', { current: 32000 })
    // 本月填很多：pace = 32000 − 12500 − 30000 为负 → 取 0
    seedWeek('bm_p2', 'fam_bm_p2', '2026-09-07', {
      food: 20000, daily: 5000, entertainment: 2000,
      medical: 1000, clothing: 1000, transport: 1000, other: 1000,
    })
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_p2')))
    const b = d.baby_reserve
    assert.equal(b.monthly_saving_pace, 0, '超支时速度按 0 计')
    assert.equal(b.on_track, false)
    assert.equal(b.gap, 91800 - 32000, '按 0 速度，缺口 = 目标 − 已存')
    assert.equal(b.extra_monthly, Math.ceil((91800 - 32000) / 12))
  })

  test('本月无填报 → 不外推（宁可不显示，也不拿不完整数据编造）', async () => {
    await activateFamily('bm_p3', { current: 32000 })
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('bm_p3')))
    const b = d.baby_reserve
    assert.equal(b.monthly_saving_pace, null)
    assert.equal(b.projected, null)
    assert.equal(b.on_track, null)
    assert.equal(b.gap, null)
    assert.equal(b.extra_monthly, null)
    // 但里程碑仍可用（只依赖进度）
    assert.ok(Array.isArray(b.milestones) && b.milestones.length === 4)
  })
})

describe('引擎 calcBabyReserve 基础口径', () => {
  test('monthlyRequired = (target − current) / monthsRemaining', () => {
    const r = calcBabyReserve({
      stage: 'planning', cityTier: 'tier1',
      monthsRemaining: 12, currentReserve: 32000, monthlyDisposable: 13100,
    })
    assert.equal(r.monthlyRequired, Math.round((r.target - 32000) / 12))
    assert.ok(r.target > 0)
  })
})
