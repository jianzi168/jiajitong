/**
 * Phase 10: 行动清单写库测试
 *
 * 覆盖:
 *   - 保存采纳状态 / 覆盖更新（upsert）
 *   - 非法 status / 缺 rec_id 校验
 *   - 未登录拒绝
 *   - member 家庭协作（可写可读）
 *   - 家庭间状态隔离
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')

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

async function bootstrap(openid) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'user' } }, makeCtx(openid))
}

// ---------- A-1: 保存 + 读取 ----------
describe('A-1 保存与读取', () => {
  test('保存状态后 getStatus 返回', async () => {
    const OPENID = 'a1'
    await bootstrap(OPENID)

    const save = ok(await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'R1', status: 'accepted' } }, makeCtx(OPENID)))
    assert.equal(save.rec_id, 'R1')
    assert.equal(save.status, 'accepted')

    const res = ok(await dispatch({ action: 'actions.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.deepEqual(res.statuses, { R1: 'accepted' })
  })

  test('覆盖更新已有状态（upsert 不重复）', async () => {
    const OPENID = 'a1b'
    await bootstrap(OPENID)

    await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'R1', status: 'accepted' } }, makeCtx(OPENID))
    const save2 = ok(await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'R1', status: 'later' } }, makeCtx(OPENID)))
    assert.equal(save2.status, 'later')

    const res = ok(await dispatch({ action: 'actions.getStatus', payload: {} }, makeCtx(OPENID)))
    assert.deepEqual(res.statuses, { R1: 'later' }, '状态应被覆盖为 later，而非新增记录')
  })
})

// ---------- A-2: 校验 ----------
describe('A-2 校验', () => {
  test('非法 status → VALIDATION_ERROR', async () => {
    const OPENID = 'a2'
    await bootstrap(OPENID)
    const res = await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'R1', status: 'maybe' } }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })

  test('缺 rec_id → VALIDATION_ERROR', async () => {
    const OPENID = 'a2b'
    await bootstrap(OPENID)
    const res = await dispatch({ action: 'actions.saveStatus', payload: { status: 'accepted' } }, makeCtx(OPENID))
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'VALIDATION_ERROR')
  })
})

// ---------- A-3: 权限 ----------
describe('A-3 权限', () => {
  test('未登录 → UNAUTHORIZED', async () => {
    const res = await dispatch({ action: 'actions.getStatus', payload: {} }, {})
    assert.notEqual(res.code, 0)
    assert.equal(res.message, 'UNAUTHORIZED')
  })

  test('member 家庭协作：可写可读同一份状态', async () => {
    const OWNER = 'a3_owner'
    const MEMBER = 'a3_member'
    await bootstrap(OWNER)
    const inv = ok(await dispatch({ action: 'families.inviteCreate', payload: {} }, makeCtx(OWNER)))
    await bootstrap(MEMBER)
    const join = await dispatch({ action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } }, makeCtx(MEMBER))
    assert.equal(join.code, 0)

    // member 写入
    const save = ok(await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'R2', status: 'ignored' } }, makeCtx(MEMBER)))
    assert.equal(save.status, 'ignored')

    // owner 读取到 member 写入的状态
    const res = ok(await dispatch({ action: 'actions.getStatus', payload: {} }, makeCtx(OWNER)))
    assert.equal(res.statuses.R2, 'ignored')
  })
})

// ---------- A-4: 家庭隔离 ----------
describe('A-4 家庭隔离', () => {
  test('A 家状态 B 家不可见', async () => {
    const A = 'a4_a'
    const B = 'a4_b'
    await bootstrap(A)
    await bootstrap(B)

    await dispatch({ action: 'actions.saveStatus', payload: { rec_id: 'RA', status: 'accepted' } }, makeCtx(A))
    const resB = ok(await dispatch({ action: 'actions.getStatus', payload: {} }, makeCtx(B)))
    assert.deepEqual(resB.statuses, {}, 'B 家不应看到 A 家的状态')
  })
})
