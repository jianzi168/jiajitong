/**
 * Phase 8 商业化端到端测试
 *
 * 走本地 memoryStore (无 wx-server-sdk), 直接 dispatch handlers。
 * 覆盖 T8-1 ~ T8-12 (开发计划 Phase 8 验收)。
 *
 * 运行: node --test scripts/test-commercialization.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const { calcFull, calcEntitlements, computeExpiresAt } = require('../uniapp/cloudfunctions/api/handlers')
const { calcFull: engineCalcFull } = require('../uniapp/cloudfunctions/api/common/engine')

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

function ok(r) {
  assert.equal(r.code, 0, `expected code=0, got ${r.code} ${r.message || ''}`)
  return r.data
}

function fail(r, expectedCode) {
  assert.equal(r.code, expectedCode, `expected code=${expectedCode}, got ${r.code} ${r.message || ''}`)
  return r
}

const fixInput = {
  stage: 'planning', city: '上海', monthlyIncome: 32000,
  fixedExpenses: { housing: 11000, loan: 1500 },
  savingsTarget: 6400, emergencyFundMonths: 6,
  monthsToBaby: 12, currentBabyReserve: 32000,
}

async function bootstrapFamily(openid) {
  await dispatch({ action: 'user.bootstrap', payload: { nickname: 'phase8' } }, makeCtx(openid))
  const planOutput = engineCalcFull(fixInput)
  const saved = await dispatch({ action: 'plans.save', payload: { planInput: fixInput, planOutput } }, makeCtx(openid))
  return ok(saved).plan
}

// ---------- 纯函数: 权益计算 ----------
describe('T8-0 权益计算纯函数', () => {
  test('free → canViewFull=false', () => {
    const e = calcEntitlements('free', null, 1000)
    assert.equal(e.canViewFull, false)
    assert.equal(e.canExportPdf, false)
    assert.equal(e.canShareFree, true)
    assert.equal(e.daysRemaining, null)
  })

  test('pro_yearly 未过期 → canViewFull=true', () => {
    const now = 1700000000000
    const e = calcEntitlements('pro_yearly', now + 86400000, now)
    assert.equal(e.canViewFull, true)
    assert.equal(e.canExportPdf, true)
    assert.equal(e.daysRemaining, 1)
  })

  test('pro_yearly 已过期 → canViewFull=false', () => {
    const now = 1700000000000
    const e = calcEntitlements('pro_yearly', now - 1000, now)
    assert.equal(e.canViewFull, false)
    assert.equal(e.daysRemaining, 0)
  })

  test('report_once 7d', () => {
    const now = 1700000000000
    const e = calcEntitlements('report_once', now + 7 * 86400000, now)
    assert.equal(e.canViewFull, true)
    assert.equal(e.daysRemaining, 7)
  })
})

// ---------- 纯函数: 续期日期 ----------
describe('T8-0b 续期日期 computeExpiresAt', () => {
  const now = 1700000000000
  const orderReportOnce = { sku: 'report_once' }
  const orderProYearly = { sku: 'pro_yearly' }

  test('report_once 首次: now + 7d', () => {
    const exp = computeExpiresAt(orderReportOnce, null, now)
    assert.equal(exp, now + 7 * 86400000)
  })

  test('pro_yearly 首次: now + 365d', () => {
    const exp = computeExpiresAt(orderProYearly, null, now)
    assert.equal(exp, now + 365 * 86400000)
  })

  test('pro_yearly 续费 (未过期): max(now, current) + 365d', () => {
    const currentSub = { plan_type: 'pro_yearly', expires_at: now + 100 * 86400000 }
    const exp = computeExpiresAt(orderProYearly, currentSub, now)
    // max(now, now+100d) = now+100d, +365d
    assert.equal(exp, now + 465 * 86400000)
  })

  test('pro_yearly 续费 (已过期): now + 365d', () => {
    const currentSub = { plan_type: 'pro_yearly', expires_at: now - 1000 }
    const exp = computeExpiresAt(orderProYearly, currentSub, now)
    assert.equal(exp, now + 365 * 86400000)
  })
})

// ---------- T8-1: orders.create 未登录 ----------
describe('T8-1 orders.create 未登录', () => {
  test('无 openid → 40101', async () => {
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L120' } }, makeCtx(null))
    fail(r, 40101)
  })
})

// ---------- T8-2: orders.create 无 active plan ----------
describe('T8-2 orders.create 无 active plan', () => {
  test('有 user 但无 plan → 40401', async () => {
    const openid = 't8_2_openid'
    // bootstrap 创建 user + family, 但不存 plan
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 't8_2' } }, makeCtx(openid))
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L131' } }, makeCtx(openid))
    fail(r, 40401)
  })
})

// ---------- T8-3: report_once 完整 mock pay 闭环 ----------
describe('T8-3 report_once → mockPay → subscription.get', () => {
  test('canViewFull=true, expires_at=now+7d', async () => {
    const openid = 't8_3_openid'
    await bootstrapFamily(openid)
    // bootstrap 已写 free subscription, 这里直接买
    const created = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L142' } }, makeCtx(openid))
    const { order, payment } = ok(created)
    assert.equal(order.status, 'pending')
    assert.equal(order.amount_fen, 1990)
    assert.equal(payment.mock, true)

    const paid = await dispatch({ action: 'orders.mockPay', payload: { order_id: order._id } }, makeCtx(openid))
    const { subscription } = ok(paid)
    assert.equal(subscription.plan_type, 'report_once')
    assert.equal(subscription.entitlements.canViewFull, true)
    assert.equal(subscription.entitlements.daysRemaining, 7)

    // 验证 subscription.get 返回真读
    const sub = await dispatch({ action: 'subscription.get', payload: {} }, makeCtx(openid))
    const subData = ok(sub)
    assert.equal(subData.effective_plan_type, 'report_once')
    assert.equal(subData.entitlements.canViewFull, true)
  })
})

// ---------- T8-4: 重复调 mockPay → 40901 ----------
describe('T8-4 重复调 orders.mockPay', () => {
  test('已 paid 再次 mockPay → 40901', async () => {
    const openid = 't8_4_openid'
    await bootstrapFamily(openid)
    const created = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L167' } }, makeCtx(openid))
    const order = ok(created).order
    await dispatch({ action: 'orders.mockPay', payload: { order_id: order._id } }, makeCtx(openid))
    // 第二次
    const r2 = await dispatch({ action: 'orders.mockPay', payload: { order_id: order._id } }, makeCtx(openid))
    fail(r2, 40901)
  })
})

// ---------- T8-5: 已过期订阅 → canViewFull=false ----------
describe('T8-5 订阅过期', () => {
  test('plan_type=report_once 但 expires_at < now → canViewFull=false, DB 保留', async () => {
    const openid = 't8_5_openid'
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    // 先 bootstrap 创 user/family
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 't8_5' } }, makeCtx(openid))
    // memoryStore 写一条已过期的 subscription (绕过普通 mockPay 流程)
    const now = Date.now()
    handlers._seedSubscription({
      family_id: 'fam_' + openid, // 本地 memoryStore 用 openid 当 family_id
      openid,
      plan_type: 'report_once',
      started_at: now - 10 * 86400000,
      expires_at: now - 1 * 86400000, // 1 天前过期
      source_order_id: 'expired_seed',
    })

    const sub = await dispatch({ action: 'subscription.get', payload: {} }, makeCtx(openid))
    const subData = ok(sub)
    assert.equal(subData.subscription.plan_type, 'report_once') // DB 字段保留
    assert.equal(subData.effective_plan_type, 'free')          // 实时降级
    assert.equal(subData.entitlements.canViewFull, false)
    assert.equal(subData.entitlements.daysRemaining, 0)
  })
})

// ---------- T8-6: Pro 续费不缩短 ----------
describe('T8-6 Pro 续费', () => {
  test('已有 pro_yearly 未过期 → 新 expires = max(now, current) + 365d', async () => {
    const openid = 't8_6_openid'
    await bootstrapFamily(openid)
    // 第一次 Pro
    const c1 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'pro_yearly', client_request_id: 'req_L209' } }, makeCtx(openid)))
    await dispatch({ action: 'orders.mockPay', payload: { order_id: c1.order._id } }, makeCtx(openid))

    const sub1 = ok(await dispatch({ action: 'subscription.get', payload: {} }, makeCtx(openid)))
    const oldExpires = sub1.subscription.expires_at

    // 等几毫秒, 再买一次 (续费)
    await new Promise((r) => setTimeout(r, 10))
    const c2 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'pro_yearly', client_request_id: 'req_L217' } }, makeCtx(openid)))
    const paid2 = ok(await dispatch({ action: 'orders.mockPay', payload: { order_id: c2.order._id } }, makeCtx(openid)))
    const newExpires = paid2.subscription.expires_at

    // 新 expires = old + 365d (不缩短)
    assert.equal(newExpires, oldExpires + 365 * 86400000)
    assert.ok(newExpires > oldExpires, '新到期应晚于旧到期')
  })
})

// ---------- T8-7: Pro 覆盖 report_once ----------
describe('T8-7 Pro 覆盖 report_once', () => {
  test('先 report_once, 再 pro_yearly → 最终 plan_type=pro_yearly', async () => {
    const openid = 't8_7_openid'
    await bootstrapFamily(openid)
    const c1 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L232' } }, makeCtx(openid)))
    await dispatch({ action: 'orders.mockPay', payload: { order_id: c1.order._id } }, makeCtx(openid))
    const c2 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'pro_yearly', client_request_id: 'req_L234' } }, makeCtx(openid)))
    await dispatch({ action: 'orders.mockPay', payload: { order_id: c2.order._id } }, makeCtx(openid))

    const sub = ok(await dispatch({ action: 'subscription.get', payload: {} }, makeCtx(openid)))
    assert.equal(sub.subscription.plan_type, 'pro_yearly')
    assert.equal(sub.entitlements.canViewFull, true)
    assert.equal(sub.entitlements.daysRemaining, 365)
  })
})

// ---------- T8-8: 非法 sku ----------
describe('T8-8 非法 sku', () => {
  test('sku=garbage → 40020 INVALID_SKU', async () => {
    const openid = 't8_8_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'garbage', client_request_id: 'req_L249' } }, makeCtx(openid))
    fail(r, 40020)
  })

  test('sku=pro_family → 40020 (本期禁用)', async () => {
    const openid = 't8_8b_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'pro_family', client_request_id: 'req_L256' } }, makeCtx(openid))
    fail(r, 40020)
  })
})

// ---------- T8-9: 越权 (订单不属于当前用户) ----------
describe('T8-9 订单越权', () => {
  test('A 创建订单, B 调 mockPay → 40301', async () => {
    const openidA = 't8_9_A'
    const openidB = 't8_9_B'
    await bootstrapFamily(openidA)
    // B 也 bootstrap 一下, 否则 B 没有 user, 走的是 UNAUTHORIZED 而不是 FORBIDDEN
    await dispatch({ action: 'user.bootstrap', payload: { nickname: 'B' } }, makeCtx(openidB))
    const c = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L269' } }, makeCtx(openidA)))
    const r = await dispatch({ action: 'orders.mockPay', payload: { order_id: c.order._id } }, makeCtx(openidB))
    fail(r, 40301)
  })
})

// ---------- T8-10: share.getQrCode 本地 placeholder ----------
describe('T8-10 share.getQrCode', () => {
  test('本地无 wx-server-sdk → mode=placeholder', async () => {
    const openid = 't8_10_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'share.getQrCode', payload: {} }, makeCtx(openid))
    const data = ok(r)
    assert.equal(data.mode, 'placeholder')
    assert.equal(data.file_id, '')
    assert.equal(data.temp_url, '')
    assert.equal(data.scene, 'from=poster')
    assert.equal(data.page, 'pages/landing/index')
  })
})

// ---------- T8-11: user.bootstrap 返回真读 subscription ----------
describe('T8-11 user.bootstrap 真读 subscription', () => {
  test('第二次 bootstrap 仍返回 plan_type=free (从真读)', async () => {
    const openid = 't8_11_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'user.bootstrap', payload: {} }, makeCtx(openid))
    const data = ok(r)
    assert.ok(data.subscription)
    assert.equal(data.subscription.plan_type, 'free')
    assert.equal(data.subscription.expires_at, null)
  })

  test('付费后 bootstrap 也返回真读', async () => {
    const openid = 't8_11b_openid'
    await bootstrapFamily(openid)
    const c = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L305' } }, makeCtx(openid)))
    await dispatch({ action: 'orders.mockPay', payload: { order_id: c.order._id } }, makeCtx(openid))
    const r = await dispatch({ action: 'user.bootstrap', payload: {} }, makeCtx(openid))
    const data = ok(r)
    assert.equal(data.subscription.plan_type, 'report_once')
  })
})

// ---------- T8-12: subscription.get 无记录自动写 free ----------
describe('T8-12 subscription.get 缺记录', () => {
  test('新用户 → 自动写 free subscription, canViewFull=false', async () => {
    const openid = 't8_12_openid'
    await bootstrapFamily(openid)
    // bootstrap 已懒写 free, 这里直接 get
    const r = await dispatch({ action: 'subscription.get', payload: {} }, makeCtx(openid))
    const data = ok(r)
    assert.ok(data.subscription)
    assert.equal(data.subscription.plan_type, 'free')
    assert.equal(data.entitlements.canViewFull, false)
  })
})

// ---------- T8-bonus: Pro 购买 report_once 拒绝 ----------
describe('T8-bonus Pro 购买单次报告', () => {
  test('Pro 状态下 buy report_once → 40921 ALREADY_ENTITLED', async () => {
    const openid = 't8_bonus_openid'
    await bootstrapFamily(openid)
    // 先 Pro
    const c1 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'pro_yearly', client_request_id: 'req_L333' } }, makeCtx(openid)))
    await dispatch({ action: 'orders.mockPay', payload: { order_id: c1.order._id } }, makeCtx(openid))
    // 再买单次
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_L336' } }, makeCtx(openid))
    fail(r, 40921)
  })
})

// ---------- T8-13: share.getQrCode 云端 wxacode + 上传 ----------
/**
 * 用子进程跑云端测试, 避免污染主进程的 require.cache / usingCloudDb 捕获。
 * 进程内若替换 wx-server-sdk + 重载 handlers, 会让同进程内的其它测试
 * (T8-5 通过 require 取 handlers 写 memoryStore) 与 dispatch (旧绑定) 分离,
 * T8-5 会出现 "subscriptions 找不到" 的伪 fail。
 * 子进程天然隔离 — 主进程的 handlers 仍保持 usingCloudDb=false。
 */
describe('T8-13 share.getQrCode 云端 wxacode + upload (子进程)', () => {
  test('cloud: getUnlimited → uploadFile → file_id = cloud://.../test.png', () => {
    const { spawnSync } = require('child_process')
    const path = require('path')

    const driverPath = path.join(__dirname, '_share_qr_cloud_driver.js')
    const probePayload = Buffer.from('PROBE').toString('base64')
    const child = spawnSync(process.execPath, [driverPath], {
      env: { ...process.env, SHARE_QR_CLOUD_PROBE: '1' },
      encoding: 'utf8',
    })
    const out = (child.stdout || '').trim()
    if (out.startsWith('FAIL:')) {
      throw new Error(out.slice(5).trim())
    }
    const result = JSON.parse(out)
    assert.equal(result.mode, 'wxacode')
    assert.equal(result.file_id, 'cloud://share-qrcodes/test.png')
    assert.equal(result.temp_url, '')
    assert.equal(result.page, 'pages/landing/index')
    assert.equal(result.scene, 'from=poster')
    assert.equal(result.cloudPath, 'share-qrcodes/landing-v1.png')
    assert.equal(result.uploadCalls, 1)
  })
})

// ---------- T8-14: orders.create 幂等 + 响应裁剪 (Phase 8.1) ----------
describe('T8-14 orders.create 幂等', () => {
  test('同 client_request_id + 同 sku → 返回同一订单 _id, 不重复下单', async () => {
    const openid = 't8_14_openid'
    await bootstrapFamily(openid)
    const key = 'req_idem_001'
    const c1 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openid)))
    const c2 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openid)))

    assert.equal(c2.order._id, c1.order._id, '重复请求应返回原订单')
    assert.equal(c2.payment.order_id, c1.order._id)
    assert.equal(c2.order.amount_fen, c1.order.amount_fen)
    assert.equal(c2.order.status, 'pending')

    // 底层确实只落了一条订单
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const all = handlers._allOrders().filter((o) => o.openid === openid)
    assert.equal(all.length, 1, `应只有 1 条订单, 实际 ${all.length}`)
  })

  test('同 client_request_id + 不同 sku → 40010 VALIDATION_ERROR', async () => {
    const openid = 't8_14b_openid'
    await bootstrapFamily(openid)
    const key = 'req_idem_002'
    ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openid)))
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'pro_yearly', client_request_id: key } }, makeCtx(openid))
    fail(r, 40010)

    // 冲突请求不得改写原订单的 sku, 也不得新增订单
    const handlers = require('../uniapp/cloudfunctions/api/handlers')
    const all = handlers._allOrders().filter((o) => o.openid === openid)
    assert.equal(all.length, 1)
    assert.equal(all[0].sku, 'report_once', '原订单 SKU 不应被替换')
  })

  test('幂等键按 openid 隔离: 不同用户可用同一 client_request_id', async () => {
    const openidA = 't8_14c_A'
    const openidB = 't8_14c_B'
    await bootstrapFamily(openidA)
    await bootstrapFamily(openidB)
    const key = 'req_shared_key'
    const a = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openidA)))
    const b = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openidB)))
    assert.notEqual(a.order._id, b.order._id, '不同用户的同名幂等键不应互相命中')
  })
})

describe('T8-14b client_request_id 校验', () => {
  test('缺失 → 40010', async () => {
    const openid = 't8_14d_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once' } }, makeCtx(openid))
    fail(r, 40010)
  })

  test('空字符串 → 40010', async () => {
    const openid = 't8_14e_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: '' } }, makeCtx(openid))
    fail(r, 40010)
  })

  test('超过 64 字符 → 40010', async () => {
    const openid = 't8_14f_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'x'.repeat(65) } }, makeCtx(openid))
    fail(r, 40010)
  })

  test('恰好 64 字符 → 通过', async () => {
    const openid = 't8_14g_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'x'.repeat(64) } }, makeCtx(openid))
    ok(r)
  })

  test('非字符串 (number) → 40010', async () => {
    const openid = 't8_14h_openid'
    await bootstrapFamily(openid)
    const r = await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 12345 } }, makeCtx(openid))
    fail(r, 40010)
  })
})

describe('T8-14c orders.create 响应裁剪', () => {
  test('order 只含 _id/sku/amount_fen/status/created_at, 无内部字段', async () => {
    const openid = 't8_14i_openid'
    await bootstrapFamily(openid)
    const d = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_dto_001' } }, makeCtx(openid)))

    assert.deepEqual(
      Object.keys(d.order).sort(),
      ['_id', 'amount_fen', 'created_at', 'sku', 'status'],
    )
    for (const leaked of ['openid', 'out_trade_no', 'wx_transaction_id', 'client_request_id', 'family_id', 'pay_channel']) {
      assert.equal(d.order[leaked], undefined, `order 不应包含 ${leaked}`)
    }
  })

  test('幂等命中返回的订单同样是裁剪后的 DTO', async () => {
    const openid = 't8_14j_openid'
    await bootstrapFamily(openid)
    const key = 'req_dto_002'
    ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openid)))
    const d2 = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: key } }, makeCtx(openid)))

    assert.deepEqual(
      Object.keys(d2.order).sort(),
      ['_id', 'amount_fen', 'created_at', 'sku', 'status'],
    )
    assert.equal(d2.order.openid, undefined)
    assert.equal(d2.order.client_request_id, undefined)
  })

  test('裁剪后 mockPay 仍可用返回的 _id 完成支付闭环', async () => {
    const openid = 't8_14k_openid'
    await bootstrapFamily(openid)
    const d = ok(await dispatch({ action: 'orders.create', payload: { sku: 'report_once', client_request_id: 'req_dto_003' } }, makeCtx(openid)))
    const paid = ok(await dispatch({ action: 'orders.mockPay', payload: { order_id: d.order._id } }, makeCtx(openid)))
    assert.equal(paid.subscription.plan_type, 'report_once')
  })
})
