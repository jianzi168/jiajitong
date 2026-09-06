/**
 * 存量方案迁移脚本测试
 *
 * 迁移脚本要动生产数据，不能没测过就跑。
 * 这里用一个内存版 fake db 注入 runMigration()，覆盖：
 *   - 分类逻辑（哪些要重算 / 哪些重算不了）
 *   - 预演模式不得写库
 *   - --apply 才写入，且结果正确
 *   - limit / family 过滤
 *   - 写入失败的统计
 *
 * 运行: node --test scripts/test-recalc-migration.js
 */
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { runMigration, classifyPlans, parseArgs } = require('./recalc-plans')
const { calcFull } = require('../uniapp/cloudfunctions/api/common/engine')
const { ENGINE_VERSION } = require('../uniapp/cloudfunctions/api/common/engine/constants')

const input = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

/** 内存版云 db，只实现迁移脚本用到的接口 */
function makeFakeDb(plans, { failUpdateFor = [] } = {}) {
  const store = new Map(plans.map((p) => [p._id, { ...p }]))
  let updateCalls = 0
  return {
    _store: store,
    get updateCalls() { return updateCalls },
    collection(name) {
      assert.equal(name, 'budget_plans')
      return {
        where(w) {
          return {
            async get() {
              const all = Array.from(store.values())
              const data = w && w.family_id
                ? all.filter((p) => p.family_id === w.family_id)
                : all
              return { data }
            },
          }
        },
        doc(id) {
          return {
            async update({ data }) {
              updateCalls++
              if (failUpdateFor.includes(id)) {
                const e = new Error('模拟写入失败'); e.errMsg = 'simulated write failure'
                throw e
              }
              const existing = store.get(id)
              store.set(id, { ...existing, ...data })
              return { stats: { updated: 1 } }
            },
          }
        },
      }
    },
  }
}

function legacyPlan(id, overrides = {}) {
  const out = calcFull(input)
  return {
    _id: id,
    family_id: 'fam_1',
    engine_version: 1,
    health_score: 1,               // 荒谬值，用于确认被覆盖
    risk_level: 'red',
    categories: [],
    baby_reserve: null,
    recommendations: [],
    monthly_summary: out.monthly_summary,
    risk_report: null,
    plan_input: input,
    ...overrides,
  }
}

describe('classifyPlans', () => {
  test('按 engine_version 三分类', () => {
    const upToDate = { _id: 'a', engine_version: ENGINE_VERSION }
    const stale = { _id: 'b', engine_version: 1, plan_input: input }
    const noInput = { _id: 'c', engine_version: 1 }
    const missingVersion = { _id: 'd', plan_input: input }

    const r = classifyPlans([upToDate, stale, noInput, missingVersion], ENGINE_VERSION)
    assert.deepEqual(r.upToDate.map((p) => p._id), ['a'])
    assert.deepEqual(r.stale.map((p) => p._id), ['b', 'd'], '缺版本号的应视为 v1 → 待重算')
    assert.deepEqual(r.noInput.map((p) => p._id), ['c'])
  })

  test('空输入不报错', () => {
    const r = classifyPlans([], ENGINE_VERSION)
    assert.equal(r.stale.length, 0)
    const r2 = classifyPlans(null, ENGINE_VERSION)
    assert.equal(r2.stale.length, 0)
  })
})

describe('runMigration', () => {
  test('预演模式不得写库', async () => {
    const db = makeFakeDb([legacyPlan('p1'), legacyPlan('p2')])
    const r = await runMigration({ db, apply: false })
    assert.equal(r.stale, 2)
    assert.equal(db.updateCalls, 0, '预演模式不应产生写操作')
    assert.equal(db._store.get('p1').health_score, 1, '存储数据不应变化')
    assert.ok(r.samples.length >= 1, '应产出抽样对比')
  })

  test('--apply 写入且结果正确', async () => {
    const db = makeFakeDb([legacyPlan('p1')])
    const r = await runMigration({ db, apply: true })
    assert.equal(r.ok, 1)
    assert.equal(r.failed, 0)
    assert.equal(db.updateCalls, 1)

    const updated = db._store.get('p1')
    assert.equal(updated.engine_version, ENGINE_VERSION)
    assert.equal(updated.health_score, calcFull(input).health_score)
    assert.equal(updated.categories.length, 7)
    assert.ok(updated.recommendations.length >= 1)
    assert.ok(updated.recalculated_at)
  })

  test('已是当前版本的方案被跳过', async () => {
    const out = calcFull(input)
    const current = { _id: 'cur', family_id: 'fam_1', engine_version: ENGINE_VERSION, health_score: out.health_score, plan_input: input }
    const db = makeFakeDb([current, legacyPlan('old')])
    const r = await runMigration({ db, apply: true })
    assert.equal(r.upToDate, 1)
    assert.equal(r.stale, 1)
    assert.equal(db.updateCalls, 1, '只应重算旧方案')
    assert.equal(db._store.get('cur').health_score, out.health_score)
  })

  test('缺 plan_input 的方案不重算，单独统计', async () => {
    const db = makeFakeDb([
      legacyPlan('ok1'),
      legacyPlan('noinput', { plan_input: null }),
    ])
    const r = await runMigration({ db, apply: true })
    assert.equal(r.stale, 1)
    assert.equal(r.noInput, 1)
    assert.equal(db.updateCalls, 1)
    assert.equal(db._store.get('noinput').health_score, 1, '无法重算的方案不应被改动')
  })

  test('limit 生效并提示剩余', async () => {
    const db = makeFakeDb([legacyPlan('p1'), legacyPlan('p2'), legacyPlan('p3')])
    const logs = []
    const r = await runMigration({ db, apply: true, limit: 2, log: (m) => logs.push(m) })
    assert.equal(r.ok, 2)
    assert.equal(db.updateCalls, 2)
    assert.ok(logs.some((l) => l.includes('仍有 1 条待处理')), '应提示剩余未处理条数')
  })

  test('family 过滤只处理指定家庭', async () => {
    const db = makeFakeDb([
      legacyPlan('p1', { family_id: 'fam_A' }),
      legacyPlan('p2', { family_id: 'fam_B' }),
    ])
    const r = await runMigration({ db, apply: true, familyId: 'fam_A' })
    assert.equal(r.total, 1, '只应读到指定家庭的方案')
    assert.equal(r.ok, 1)
    assert.equal(db._store.get('p2').health_score, 1, '其他家庭不应被改动')
  })

  test('写入失败被统计且不中断', async () => {
    const db = makeFakeDb(
      [legacyPlan('ok1'), legacyPlan('bad1'), legacyPlan('ok2')],
      { failUpdateFor: ['bad1'] }
    )
    const r = await runMigration({ db, apply: true })
    assert.equal(r.ok, 2)
    assert.equal(r.failed, 1, '失败的条数应被统计')
    assert.equal(db._store.get('bad1').health_score, 1)
    assert.equal(db._store.get('ok2').engine_version, ENGINE_VERSION, '后续方案应继续处理')
  })

  test('无待重算方案时直接返回', async () => {
    const out = calcFull(input)
    const db = makeFakeDb([{ _id: 'c1', engine_version: ENGINE_VERSION, plan_input: input, health_score: out.health_score }])
    const r = await runMigration({ db, apply: true })
    assert.equal(r.stale, 0)
    assert.equal(db.updateCalls, 0)
  })
})

describe('parseArgs', () => {
  test('解析 envId 与开关', () => {
    const a = parseArgs(['node', 'script.js', 'env-1', '--apply', '--limit', '5', '--family', 'fam_x'])
    assert.equal(a.envId, 'env-1')
    assert.equal(a.apply, true)
    assert.equal(a.limit, 5)
    assert.equal(a.familyId, 'fam_x')
  })

  test('默认值：预演、不限条数、不限家庭', () => {
    const a = parseArgs(['node', 'script.js', 'env-1'])
    assert.equal(a.apply, false)
    assert.equal(a.limit, Infinity)
    assert.equal(a.familyId, null)
  })

  test('缺 envId → null', () => {
    assert.equal(parseArgs(['node', 'script.js']).envId, null)
  })
})
