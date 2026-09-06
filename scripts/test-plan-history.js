/**
 * 历史规划书测试
 *
 * 背景：db.savePlan 每次生成都会保留旧版本（is_active=false），
 * 但此前没有任何接口能读到它们 —— 索引规划里的
 * budget_plans.idx_family_created（family_id + created_at）正说明设计上
 * 是打算做版本列表的。Profile 菜单「历史规划书」原本指向报告完整页，
 * 而那个页面只显示当前方案，与菜单名不符。
 *
 * 运行: node --test scripts/test-plan-history.js
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

function ctx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}
function ok(r) {
  assert.equal(r.code, 0, `expected 0, got ${r.code} ${r.message || ''}`)
  return r.data
}

const input = {
  stage: 'planning',
  city: '上海',
  monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400,
  emergencyFundMonths: 6,
  monthsToBaby: 12,
  currentBabyReserve: 32000,
}

async function saveVersions(openid, incomes) {
  await dispatch({ action: 'user.bootstrap' }, ctx(openid))
  for (const income of incomes) {
    const out = calcFull({ ...input, monthlyIncome: income })
    await dispatch(
      { action: 'plans.save', payload: { planInput: input, planOutput: out } },
      ctx(openid)
    )
  }
}

describe('plans.list', () => {
  test('列出全部历史版本，最新在前', async () => {
    await saveVersions('ph_1', [30000, 32000, 34000])
    const d = ok(await dispatch({ action: 'plans.list' }, ctx('ph_1')))
    assert.equal(d.plans.length, 3)

    // 版本倒序（同毫秒创建时用 version 兜底，保证顺序确定）
    const versions = d.plans.map((p) => p.version)
    assert.deepEqual(versions, [3, 2, 1], '应按版本号倒序')
  })

  test('列表只含轻量字段，不含完整方案', async () => {
    await saveVersions('ph_2', [32000])
    const d = ok(await dispatch({ action: 'plans.list' }, ctx('ph_2')))
    const p = d.plans[0]
    // 完整方案含 categories / recommendations / risk_report，列表不应带这些
    assert.ok(p.health_score !== undefined)
    assert.equal(p.categories, undefined, '列表不应带 categories')
    assert.equal(p.recommendations, undefined, '列表不应带 recommendations')
    assert.equal(p.plan_input, undefined, '列表不应带 plan_input')
  })

  test('激活项唯一', async () => {
    await saveVersions('ph_3', [30000, 32000, 34000])
    const d = ok(await dispatch({ action: 'plans.list' }, ctx('ph_3')))
    assert.equal(d.plans.filter((p) => p.is_active).length, 1)
  })

  test('无方案时返回空列表', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('ph_4'))
    const d = ok(await dispatch({ action: 'plans.list' }, ctx('ph_4')))
    assert.deepEqual(d.plans, [])
  })

  test('不同家庭数据隔离', async () => {
    await saveVersions('ph_5a', [30000, 32000])
    await saveVersions('ph_5b', [40000])
    const a = ok(await dispatch({ action: 'plans.list' }, ctx('ph_5a')))
    const b = ok(await dispatch({ action: 'plans.list' }, ctx('ph_5b')))
    assert.equal(a.plans.length, 2)
    assert.equal(b.plans.length, 1)
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'plans.list' }, {})
    assert.equal(r.code, 40101)
  })
})

describe('旧方案的 plan_input 清理（数据最小化）', () => {
  test('存新版后，已是当前引擎版本的旧方案不再保留原始输入', async () => {
    await saveVersions('phs_1', [30000, 32000])
    const list = ok(await dispatch({ action: 'plans.list' }, ctx('phs_1')))
    const active = list.plans.find((p) => p.is_active)
    const old = list.plans.find((p) => !p.is_active)

    const activeDetail = ok(await dispatch(
      { action: 'plans.getById', payload: { plan_id: active._id } }, ctx('phs_1')
    ))
    const oldDetail = ok(await dispatch(
      { action: 'plans.getById', payload: { plan_id: old._id } }, ctx('phs_1')
    ))

    assert.ok(activeDetail.plan.plan_input, '当前方案必须保留 plan_input（重算需要）')
    assert.equal(oldDetail.plan.plan_input, null, '被取代的旧方案应清掉 plan_input')

    // 但测算结果要保留，否则历史回看是空的
    assert.equal(oldDetail.plan.categories.length, 7, '旧方案仍应能回看完整预算')
    assert.ok(oldDetail.plan.health_score !== undefined)
  })

  test('旧引擎版本的方案保留 plan_input，保证迁移脚本能重算', async () => {
    await saveVersions('phs_2', [30000])
    // 手动把该方案降级成 v1 并停用，模拟「尚未迁移的历史数据」
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const allPlans = handlers._allPlans()
    const legacy = allPlans.find((p) => p.family_id !== undefined)
    legacy.engine_version = 1
    legacy.is_active = false

    // 再存一个新版本（触发清理）
    const out = calcFull({ ...input, monthlyIncome: 36000 })
    await dispatch(
      { action: 'plans.save', payload: { planInput: input, planOutput: out } },
      ctx('phs_2')
    )

    // 关键：v1 方案的 plan_input 必须还在，否则 recalc-plans.js 无法迁移它
    assert.ok(legacy.plan_input, '未迁移的旧版本方案必须保留 plan_input')
  })
})

describe('plans.getById', () => {
  test('取到完整方案内容', async () => {
    await saveVersions('ph_6', [30000, 32000])
    const list = ok(await dispatch({ action: 'plans.list' }, ctx('ph_6')))
    const target = list.plans.find((p) => p.version === 1)

    const d = ok(await dispatch(
      { action: 'plans.getById', payload: { plan_id: target._id } },
      ctx('ph_6')
    ))
    assert.ok(d.plan)
    assert.equal(d.plan._id, target._id)
    assert.equal(d.plan.categories.length, 7, '应含完整 7 类预算')
    assert.ok(d.plan.monthly_summary)
  })

  test('能取到非激活的历史版本（这是本功能的核心）', async () => {
    await saveVersions('ph_7', [30000, 32000])
    const list = ok(await dispatch({ action: 'plans.list' }, ctx('ph_7')))
    const inactive = list.plans.find((p) => !p.is_active)
    assert.ok(inactive, '应存在非激活的历史版本')

    const d = ok(await dispatch(
      { action: 'plans.getById', payload: { plan_id: inactive._id } },
      ctx('ph_7')
    ))
    assert.equal(d.plan.is_active, false)
    assert.equal(d.plan._id, inactive._id)
  })

  test('越权读取他人方案 → NOT_FOUND（不泄露存在性）', async () => {
    await saveVersions('ph_8a', [32000])
    await dispatch({ action: 'user.bootstrap' }, ctx('ph_8b'))

    const list = ok(await dispatch({ action: 'plans.list' }, ctx('ph_8a')))
    const victimId = list.plans[0]._id

    const r = await dispatch(
      { action: 'plans.getById', payload: { plan_id: victimId } },
      ctx('ph_8b')
    )
    assert.equal(r.code, 40401, '他人方案必须按不存在处理')
  })

  test('不存在的 id → NOT_FOUND', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('ph_9'))
    const r = await dispatch(
      { action: 'plans.getById', payload: { plan_id: 'plan_not_exist' } },
      ctx('ph_9')
    )
    assert.equal(r.code, 40401)
  })

  test('缺 plan_id → VALIDATION_ERROR', async () => {
    await dispatch({ action: 'user.bootstrap' }, ctx('ph_10'))
    const r = await dispatch({ action: 'plans.getById', payload: {} }, ctx('ph_10'))
    assert.equal(r.code, 40010)
  })

  test('plan_id 不是当前用户的（同家庭其他成员）可读', async () => {
    const OWNER = 'ph_11o'
    await saveVersions(OWNER, [32000])
    const inv = ok(await dispatch({ action: 'families.inviteCreate' }, ctx(OWNER)))

    const MEMBER = 'ph_11m'
    await dispatch({ action: 'user.bootstrap' }, ctx(MEMBER))
    ok(await dispatch(
      { action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } },
      ctx(MEMBER)
    ))

    const list = ok(await dispatch({ action: 'plans.list' }, ctx(MEMBER)))
    assert.equal(list.plans.length, 1, '伴侣应能看到同一家庭的方案')

    const d = ok(await dispatch(
      { action: 'plans.getById', payload: { plan_id: list.plans[0]._id } },
      ctx(MEMBER)
    ))
    assert.ok(d.plan, '伴侣应能查看家庭方案详情')
  })
})
