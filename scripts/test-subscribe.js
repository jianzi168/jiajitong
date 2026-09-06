/**
 * Phase 10: 订阅消息推送测试
 *
 * 覆盖:
 *   - 授权上报（record）配额累计
 *   - 查询订阅状态（getStatus）
 *   - 主动推送（send）扣配额 / 配额耗尽
 *   - 模板未配置
 *   - 未登录 / 缺 template_id 校验
 *   - 定时批量推送（remindWeekly）只推订阅者
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const handlers = require('../uniapp/cloudfunctions/api/handlers')

const TPL = 'TPL_TEST_WEEKLY'

beforeEach(() => {
  try {
    if (handlers._resetMemory) handlers._resetMemory()
    // 配置周提醒模板（模拟小程序后台配置的模板 ID）
    if (handlers._seedAppConfig) handlers._seedAppConfig('subscribe_weekly_template_id', TPL)
  } catch (e) {}
})

function makeCtx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}

function ok(r) {
  assert.equal(r.code, 0, `expected code=0, got ${r.code} ${r.message || ''}`)
  return r.data
}

async function bootstrap(openid) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'user' } }, makeCtx(openid))
}

// ---------- S-1: 授权上报 ----------
describe('S-1 record 授权上报', () => {
  test('首次授权 quota=1，重复授权累计', async () => {
    const OPENID = 's1'
    await bootstrap(OPENID)

    const r1 = ok(await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(OPENID)))
    assert.equal(r1.quota, 1)
    assert.equal(r1.total, 1)

    const r2 = ok(await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(OPENID)))
    assert.equal(r2.quota, 2, '重复授权应累计配额')
    assert.equal(r2.total, 2)
  })

  test('缺 template_id → VALIDATION_ERROR', async () => {
    const OPENID = 's1b'
    await bootstrap(OPENID)
    const res = await dispatch({ action: 'subscribe.record', payload: {} }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })
})

// ---------- S-2: 查询状态 ----------
describe('S-2 getStatus', () => {
  test('返回配置状态与授权记录', async () => {
    const OPENID = 's2'
    await bootstrap(OPENID)
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(OPENID))

    const res = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.equal(res.configured, true)
    assert.equal(res.records.length, 1)
    assert.equal(res.records[0].template_id, TPL)
    assert.equal(res.records[0].quota, 1)
  })

  test('下发 template_id，前端无需硬编码（模板 ID 后端可配置）', async () => {
    const OPENID = 's2b'
    await bootstrap(OPENID)

    const res = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.equal(res.configured, true)
    assert.equal(res.template_id, TPL, '已配置时应下发模板 ID')
    assert.deepEqual(
      [res.template_id], [TPL],
      '前端将以此调用 requestSubscribeMessage'
    )
  })

  test('未配置模板时 template_id 为空串且 configured 为 false', async () => {
    const OPENID = 's2c'
    await bootstrap(OPENID)
    // 覆盖为空配置：模拟运维尚未申请模板
    handlers._seedAppConfig('subscribe_weekly_template_id', '')

    const res = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.equal(res.configured, false)
    assert.equal(res.template_id, '')
    assert.deepEqual(res.records, [])
  })
})

// ---------- S-3: 主动推送 ----------
describe('S-3 send 推送', () => {
  test('发送成功并扣减配额', async () => {
    const OPENID = 's3'
    await bootstrap(OPENID)
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(OPENID))

    const res = ok(await dispatch({ action: 'subscribe.send', payload: { template_id: TPL } }, makeCtx(OPENID)))
    assert.equal(res.sent, true)
    assert.equal(res.openid, OPENID)
    assert.equal(res.remaining, 0, '发送后配额应扣为 0')

    // 再查状态确认
    const st = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.equal(st.records[0].quota, 0)
  })

  test('配额耗尽 → SUBSCRIBE_QUOTA_EXHAUSTED', async () => {
    const OPENID = 's3b'
    await bootstrap(OPENID)
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(OPENID))
    await dispatch({ action: 'subscribe.send', payload: { template_id: TPL } }, makeCtx(OPENID))

    const res = await dispatch({ action: 'subscribe.send', payload: { template_id: TPL } }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'SUBSCRIBE_QUOTA_EXHAUSTED')
  })

  test('模板未配置 → SUBSCRIBE_NOT_CONFIGURED', async () => {
    const OPENID = 's3c'
    await bootstrap(OPENID)
    // 清掉模板配置
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._resetMemory()
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'user' } }, makeCtx(OPENID))

    const res = await dispatch({ action: 'subscribe.send', payload: {} }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'SUBSCRIBE_NOT_CONFIGURED')
  })
})

// ---------- S-4: 权限 ----------
describe('S-4 权限', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const res = await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, {})
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'UNAUTHORIZED')
  })
})

// ---------- S-5: 定时批量推送 ----------
describe('S-5 remindWeekly 批量推送', () => {
  test('只推给订阅过该模板的用户并扣配额', async () => {
    const A = 's5_a'
    const B = 's5_b'
    await bootstrap(A)
    await bootstrap(B)

    // A 订阅 2 次，B 订阅 1 次
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(A))
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(A))
    await dispatch({ action: 'subscribe.record', payload: { template_id: TPL } }, makeCtx(B))

    const res = ok(await dispatch({ action: 'subscribe.remindWeekly', payload: {} }, makeCtx(A)))
    assert.equal(res.targeted, 2, '2 个订阅者都应被定向')
    assert.equal(res.sent, 2)

    // 配额各自 -1
    const stA = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(A)))
    const stB = ok(await dispatch({ action: 'subscribe.getStatus', payload: {} }, makeCtx(B)))
    assert.equal(stA.records[0].quota, 1)
    assert.equal(stB.records[0].quota, 0)
  })

  test('模板未配置 → 不发送并报错', async () => {
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    handlers._resetMemory()
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'user' } }, makeCtx('s5c'))

    const res = await dispatch({ action: 'subscribe.remindWeekly', payload: {} }, makeCtx('s5c'))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'SUBSCRIBE_NOT_CONFIGURED')
  })
})
