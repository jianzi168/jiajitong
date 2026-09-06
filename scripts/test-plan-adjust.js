/**
 * 预算手动微调测试
 *
 * 设计依据：PDD §15 风险应对「用户质疑基准数据 → 计算透明化 + 可手动微调」。
 *
 * 约束：
 *  - 7 类齐全、非负整数、合计 ≤ 可支配（非零和：合计变少 = 多储蓄）
 *  - 规划变更属 owner 决策（member 可记账但不动规划结构）
 *  - 首次调整存 base_categories，供「恢复默认」还原
 *
 * 运行: node --test scripts/test-plan-adjust.js
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
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}
const CAT_IDS = ['food', 'daily', 'entertainment', 'medical', 'clothing', 'transport', 'other']

async function setup(openid) {
  await dispatch({ action: 'user.bootstrap' }, ctx(openid))
  const out = calcFull(input)
  await dispatch({ action: 'plans.save', payload: { planInput: input, planOutput: out } }, ctx(openid))
  await dispatch({ action: 'plans.activate' }, ctx(openid))
  const plan = ok(await dispatch({ action: 'plans.getActive' }, ctx(openid))).plan
  const engine = Object.fromEntries(plan.categories.map((c) => [c.id, c.suggested]))
  const disposable = plan.monthly_summary.disposable
  return { engine, disposable }
}

function suggestedOf(plan, id) {
  const c = plan.categories.find((x) => x.id === id)
  return c ? c.suggested : undefined
}

describe('plans.adjust', () => {
  test('正常微调：改 suggested，保留类目其余字段', async () => {
    const { engine } = await setup('pa_1')
    const cats = { ...engine, food: engine.food + 500 }
    const d = ok(await dispatch({ action: 'plans.adjust', payload: { categories: cats } }, ctx('pa_1')))

    assert.equal(suggestedOf(d.plan, 'food'), engine.food + 500)
    const foodCat = d.plan.categories.find((c) => c.id === 'food')
    assert.equal(foodCat.name, '餐饮', 'name 等其余字段不应丢失')
    assert.equal(suggestedOf(d.plan, 'daily'), engine.daily, '未改的类目不变')
    assert.ok(d.plan.adjusted_at, '应有调整时间标记')
    assert.ok(Array.isArray(d.plan.base_categories), '首次调整应存引擎原始值')
  })

  test('合计超可支配 → 拒绝', async () => {
    const { engine, disposable } = await setup('pa_2')
    const over = Object.fromEntries(CAT_IDS.map((id) => [id, engine[id]]))
    over.food += disposable + 1 // 必超
    const r = await dispatch({ action: 'plans.adjust', payload: { categories: over } }, ctx('pa_2'))
    assert.equal(r.code, 40010)
    assert.match(r.userHint, /超出/)
  })

  test('合计 ≤ 可支配即合法（非零和：少花 = 多储蓄）', async () => {
    const { engine, disposable } = await setup('pa_3')
    // 每类减半 → 合计明显低于可支配
    const less = Object.fromEntries(CAT_IDS.map((id) => [id, Math.floor(engine[id] / 2)]))
    const d = ok(await dispatch({ action: 'plans.adjust', payload: { categories: less } }, ctx('pa_3')))
    const sum = d.plan.categories.reduce((s, c) => s + c.suggested, 0)
    assert.ok(sum < disposable, '合计应低于可支配且被接受')
  })

  test('负数 / 非法值 → 拒绝', async () => {
    const { engine } = await setup('pa_4')
    const r1 = await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: -5 } } }, ctx('pa_4')
    )
    assert.equal(r1.code, 40010)
    const r2 = await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: 'abc' } } }, ctx('pa_4')
    )
    assert.equal(r2.code, 40010)
  })

  test('缺类目 → 拒绝（不允许静默丢类目）', async () => {
    const { engine } = await setup('pa_5')
    const missing = { ...engine }
    delete missing.medical
    const r = await dispatch({ action: 'plans.adjust', payload: { categories: missing } }, ctx('pa_5'))
    assert.equal(r.code, 40010)
    assert.match(r.userHint, /medical/)
  })

  test('恢复默认：还原引擎值并清调整标记', async () => {
    const { engine } = await setup('pa_6')
    await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: engine.food + 500 } } },
      ctx('pa_6')
    )
    const d = ok(await dispatch({ action: 'plans.adjust', payload: { reset: true } }, ctx('pa_6')))
    assert.equal(suggestedOf(d.plan, 'food'), engine.food, '应还原引擎值')
    assert.equal(d.plan.adjusted_at, null, '应清调整标记')
    assert.equal(d.plan.base_categories, null, '应清 base_categories')
    // 再 reset → 当前已是默认，报错而非静默
    const r = await dispatch({ action: 'plans.adjust', payload: { reset: true } }, ctx('pa_6'))
    assert.equal(r.code, 40010)
  })

  test('重复调整不覆盖 base_categories（恢复链仍指向引擎原始值）', async () => {
    const { engine } = await setup('pa_7')
    await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: engine.food + 100 } } },
      ctx('pa_7')
    )
    // 第二次调整以「已调整的值」为基础再改
    await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: engine.food + 200 } } },
      ctx('pa_7')
    )
    const d = ok(await dispatch({ action: 'plans.adjust', payload: { reset: true } }, ctx('pa_7')))
    assert.equal(suggestedOf(d.plan, 'food'), engine.food, '恢复必须回到引擎原始值，而非第二次调整值')
  })

  test('权限：member 不可调整（记账可协同，规划属 owner 决策）', async () => {
    await setup('pa_8o')
    const inv = ok(await dispatch({ action: 'families.inviteCreate' }, ctx('pa_8o')))
    await dispatch({ action: 'user.bootstrap' }, ctx('pa_8m'))
    ok(await dispatch(
      { action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } },
      ctx('pa_8m')
    ))
    const r = await dispatch(
      { action: 'plans.adjust', payload: { reset: true } }, ctx('pa_8m')
    )
    assert.equal(r.code, 40301, 'member 应被 FORBIDDEN')
  })

  test('未登录 → UNAUTHORIZED；无方案 → NOT_FOUND', async () => {
    const r1 = await dispatch({ action: 'plans.adjust', payload: { reset: true } }, {})
    assert.equal(r1.code, 40101)
    await dispatch({ action: 'user.bootstrap' }, ctx('pa_9'))
    const r2 = await dispatch(
      { action: 'plans.adjust', payload: { reset: true } }, ctx('pa_9')
    )
    assert.equal(r2.code, 40401)
  })

  test('调整后 dashboard 使用新预算值', async () => {
    const { engine } = await setup('pa_10')
    const newFood = engine.food + 500
    await dispatch(
      { action: 'plans.adjust', payload: { categories: { ...engine, food: newFood } } },
      ctx('pa_10')
    )
    // 启用后看板类目建议值应反映调整
    const d = ok(await dispatch({ action: 'dashboard.get' }, ctx('pa_10')))
    const food = d.categories.find((c) => c.id === 'food')
    assert.equal(food.suggested, newFood, '看板应使用调整后的预算')
  })
})
