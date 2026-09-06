/**
 * 周记账协同 + 本周填报状态测试
 *
 * 1) 家庭成员（owner + member）均可填报周记账。
 *    原实现给 weekly.submit / copyLastWeek 加了 requireOwner，
 *    member 只能看不能记 —— 对「新婚家庭共同管理财务」是核心短板，
 *    现实里谁花钱谁记，只让一方记会明显压低填报率。
 *
 * 2) dashboard 返回本周填报状态，供看板做应用内提醒。
 *    订阅消息推送依赖后台配置模板 ID，这条路径零配置即可生效。
 *
 * 运行: node --test scripts/test-weekly-collab.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const dateUtil = require('../uniapp/cloudfunctions/api/common/date')
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

const CATS = {
  food: 500, daily: 100, entertainment: 50,
  medical: 0, clothing: 80, transport: 60, other: 20,
}

const input = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

/** 建家庭：owner 邀请 member 加入 */
async function makeFamily(ownerId, memberId) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: '晓雯' } }, ctx(ownerId))
  const inv = ok(await dispatch({ action: 'families.inviteCreate' }, ctx(ownerId)))
  await dispatch({ action: 'user.bootstrap', payload: { nickname: '阿哲' } }, ctx(memberId))
  ok(await dispatch(
    { action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } },
    ctx(memberId)
  ))
}

async function activatePlan(openid) {
  const out = calcFull(input)
  await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: out } }, ctx(openid))
  await dispatch({ action: 'plans.activate' }, ctx(openid))
}

describe('周记账：家庭成员均可填报', () => {
  test('member 可以填报，并记录填报人', async () => {
    await makeFamily('wc_o', 'wc_m')
    const r = ok(await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, ctx('wc_m')))
    assert.equal(r.entry.categories.food, 500)
    assert.equal(r.entry.submitter_openid, 'wc_m', '应记录填报人')
  })

  test('member 可以使用「复制上周」', async () => {
    await makeFamily('wc_o2', 'wc_m2')
    await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, ctx('wc_o2'))
    // 直接读上周（与 copyLastWeek 同一数据源），member 应能拿到
    const r = await dispatch({ action: 'weekly.copyLastWeek' }, ctx('wc_m2'))
    assert.equal(r.code, 0, 'member 不应被 owner 校验挡住')
  })

  test('owner 与 member 互相接力，最后一次覆盖并记录新填报人', async () => {
    await makeFamily('wc_o3', 'wc_m3')
    await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, ctx('wc_m3'))
    const after = ok(await dispatch(
      { action: 'weekly.submit', payload: { categories: { ...CATS, food: 888 } } },
      ctx('wc_o3')
    ))
    assert.equal(after.entry.categories.food, 888, '后填的应覆盖')
    assert.equal(after.entry.submitter_openid, 'wc_o3', '填报人应更新为最后一次填报者')
  })

  test('外人写入的是自己家庭，不污染本家庭数据', async () => {
    await makeFamily('wc_o4', 'wc_m4')
    await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, ctx('wc_m4'))
    await dispatch({ action: 'user.bootstrap' }, ctx('wc_x'))
    ok(await dispatch({ action: 'weekly.submit', payload: { categories: { ...CATS, food: 1 } } }, ctx('wc_x')))

    const mine = ok(await dispatch({ action: 'weekly.getCurrent' }, ctx('wc_o4')))
    assert.equal(mine.entry.categories.food, 500, '本家庭数据不应被外人改动')
    assert.equal(mine.entry.submitter_openid, 'wc_m4')
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, {})
    assert.equal(r.code, 40101)
  })
})

describe('dashboard 本周填报状态', () => {
  test('未填报 → filled=false', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('dw_a'))
    await activatePlan('dw_a')
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('dw_a')))
    assert.ok(d.current_week, '应返回本周状态')
    assert.equal(d.current_week.filled, false)
    assert.equal(d.current_week.submitter_openid, '')
    assert.ok(d.current_week.week_start && d.current_week.week_end)
  })

  test('填报后 → filled=true 且带回填报人', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('dw_b'))
    await activatePlan('dw_b')
    await dispatch({ action: 'weekly.submit', payload: { categories: CATS } }, ctx('dw_b'))
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('dw_b')))
    assert.equal(d.current_week.filled, true)
    assert.equal(d.current_week.submitter_openid, 'dw_b')
  })

  test('week_start 与 weekly 接口一致（同一周一）', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('dw_c'))
    await activatePlan('dw_c')
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('dw_c')))
    const w = ok(await dispatch({ action: 'weekly.getCurrent' }, ctx('dw_c')))
    assert.equal(d.current_week.week_start, w.weekStart, '两处周起点必须一致')
  })

  test('days_left 与 weekday 自洽', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('dw_d'))
    await activatePlan('dw_d')
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('dw_d')))
    const cw = d.current_week
    assert.ok(cw.weekday >= 1 && cw.weekday <= 7, 'weekday 应在 1–7')
    assert.equal(cw.days_left, 7 - cw.weekday, 'days_left = 7 - weekday')
  })
})

describe('date.isoDayOfWeek 时区鲁棒性', () => {
  test('周一为 1、周日为 7', () => {
    assert.equal(dateUtil.isoDayOfWeek(new Date('2026-08-31T12:00:00+08:00')), 1, '2026-08-31 是周一')
    assert.equal(dateUtil.isoDayOfWeek(new Date('2026-09-06T12:00:00+08:00')), 7, '2026-09-06 是周日')
    assert.equal(dateUtil.isoDayOfWeek(new Date('2026-09-02T12:00:00+08:00')), 3, '2026-09-02 是周三')
  })

  test('不依赖运行环境时区（凌晨边界）', () => {
    // UTC 凌晨 2 点 = 北京上午 10 点，仍属同一天；
    // 若用 getDay() 在非 UTC+8 环境会算到前一天
    const dt = new Date('2026-09-02T02:00:00Z')
    assert.equal(dateUtil.isoDayOfWeek(dt), 3, '业务时区(UTC+8)下应为周三')
  })
})
