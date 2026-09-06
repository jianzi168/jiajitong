/**
 * Phase 10: 埋点系统测试
 *
 * 覆盖:
 *   - 单条 / 批量事件入库
 *   - 超 20 条拒绝 / 空数组拒绝 / 无有效事件拒绝
 *   - 未登录也可埋点（openid 空串兜底）
 *   - 事件名 / page / platform 截断
 *   - data 超 4KB 降级为空对象
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')

function makeCtx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}

function ok(r) {
  assert.equal(r.code, 0, `expected code=0, got ${r.code} ${r.message || ''}`)
  return r.data
}

function allEvents() {
  const handlers = require('../uniapp/cloudfunctions/api/handlers')
  return handlers._allAnalyticsEvents ? handlers._allAnalyticsEvents() : []
}

beforeEach(() => {
  try {
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    if (handlers._resetMemory) handlers._resetMemory()
  } catch (e) {}
})

// ---------- A-1: 单条入库 ----------
describe('A-1 单条事件', () => {
  test('带 openid 的事件完整入库', async () => {
    const OPENID = 'a1'
    const res = ok(await dispatch({
      action: 'analytics.track',
      payload: { events: [{ event: 'weekly_submit', data: { total: 320 }, page: 'weekly', ts: 1700000000000 }] },
    }, makeCtx(OPENID)))
    assert.equal(res.accepted, 1)

    const events = allEvents()
    assert.equal(events.length, 1)
    assert.equal(events[0].event, 'weekly_submit')
    assert.deepEqual(events[0].data, { total: 320 })
    assert.equal(events[0].page, 'weekly')
    assert.equal(events[0].openid, OPENID)
    assert.equal(events[0].client_ts, 1700000000000)
  })

  test('批量 20 条全部入库', async () => {
    const events = Array.from({ length: 20 }, (_, i) => ({ event: `ev_${i}`, data: { i } }))
    const res = ok(await dispatch({ action: 'analytics.track', payload: { events } }, makeCtx('a1b')))
    assert.equal(res.accepted, 20)
    assert.equal(allEvents().length, 20)
  })
})

// ---------- A-2: 校验 ----------
describe('A-2 校验', () => {
  test('超过 20 条拒绝', async () => {
    const events = Array.from({ length: 21 }, (_, i) => ({ event: `ev_${i}` }))
    const res = await dispatch({ action: 'analytics.track', payload: { events } }, makeCtx('a2'))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })

  test('空数组拒绝', async () => {
    const res = await dispatch({ action: 'analytics.track', payload: { events: [] } }, makeCtx('a2b'))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })

  test('缺少 events 字段拒绝', async () => {
    const res = await dispatch({ action: 'analytics.track', payload: {} }, makeCtx('a2c'))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })

  test('全是无效事件 → 无有效事件拒绝', async () => {
    const res = await dispatch({ action: 'analytics.track', payload: { events: [{ data: {} }, null, 42] } }, makeCtx('a2d'))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })
})

// ---------- A-3: 未登录兜底 ----------
describe('A-3 未登录', () => {
  test('无 ctx 也可埋点，openid 为空串', async () => {
    const res = ok(await dispatch({
      action: 'analytics.track',
      payload: { events: [{ event: 'app_launch' }] },
    }, {}))
    assert.equal(res.accepted, 1)
    const events = allEvents()
    assert.equal(events[0].openid, '', '未登录时 openid 应为空串')
    assert.equal(events[0].event, 'app_launch')
  })
})

// ---------- A-4: 截断与限流 ----------
describe('A-4 截断与限流', () => {
  test('超长事件名截断到 64 字符', async () => {
    const longName = 'x'.repeat(200)
    await dispatch({ action: 'analytics.track', payload: { events: [{ event: longName }] } }, makeCtx('a4'))
    const events = allEvents()
    assert.equal(events[0].event.length, 64)
  })

  test('data 超 4KB 降级为空对象', async () => {
    const big = { payload: 'y'.repeat(5000) }
    await dispatch({ action: 'analytics.track', payload: { events: [{ event: 'big', data: big }] } }, makeCtx('a4b'))
    const events = allEvents()
    assert.deepEqual(events[0].data, {}, '超限 data 应降级为空对象')
  })

  test('data 不可序列化（循环引用）→ 空对象', async () => {
    const circular = {}
    circular.self = circular
    await dispatch({ action: 'analytics.track', payload: { events: [{ event: 'circ', data: circular }] } }, makeCtx('a4c'))
    const events = allEvents()
    assert.deepEqual(events[0].data, {})
  })
})
