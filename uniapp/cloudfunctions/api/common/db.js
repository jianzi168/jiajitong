/**
 * 云数据库封装（技术方案 §4 + §6.3）
 *
 * 4 个集合:
 * - users: 用户主表
 * - families: 家庭
 * - financial_profiles: 财务档案
 * - budget_plans: 预算方案
 *
 * 客户端禁止直连 (技术方案 §1.4 安全原则)
 */
'use strict'

function getDB() {
  // lazy require: 云函数环境有 wx-server-sdk，本地测试则抛错由 handler fallback
  const cloud = require('wx-server-sdk')
  return cloud.database()
}

/**
 * 检测是否在云函数环境（有 wx-server-sdk）
 */
function isCloudEnv() {
  try {
    require('wx-server-sdk')
    return true
  } catch (e) {
    return false
  }
}

function now() {
  return new Date()
}
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------- users ----------
async function getUserByOpenid(openid) {
  const db = getDB()
  const { data } = await db.collection('users').where({ _openid: openid }).limit(1).get()
  return data[0] || null
}

async function createUser({ openid, nickname, avatar, familyId, role = 'owner' }) {
  const db = getDB()
  const now_ = now()
  const doc = {
    _openid: openid,
    unionid: '',
    nickname: nickname || '家计通用户',
    avatar: avatar || '',
    family_id: familyId,
    role,
    created_at: now_,
    updated_at: now_,
    last_active_at: now_,
  }
  const { _id } = await db.collection('users').add({ data: doc })
  return { _id, ...doc }
}

async function updateUserLastActive(openid) {
  const db = getDB()
  await db.collection('users').where({ _openid: openid }).update({
    data: { last_active_at: now() },
  })
}

// ---------- families ----------
async function createFamily({ stage, city, city_tier, city_estimated, plan_date }) {
  const db = getDB()
  const id = genId('fam')
  const now_ = now()
  // _id 由 .doc(id) 指定；data 里再带 _id 会报 -501007 不能更新_id的值
  const data = {
    name: '我的家',
    stage: stage || 'newlywed',
    city: city || '上海',
    city_tier: city_tier || 'tier1',
    city_estimated: !!city_estimated,
    plan_date: plan_date || null,
    owner_openid: '',
    created_at: now_,
    updated_at: now_,
  }
  await db.collection('families').doc(id).set({ data })
  return { _id: id, ...data }
}

async function getFamily(familyId) {
  const db = getDB()
  try {
    const { data } = await db.collection('families').doc(familyId).get()
    return data
  } catch (e) {
    return null
  }
}

// ---------- financial_profiles ----------
async function createFinancialProfile({ familyId }) {
  const db = getDB()
  await db.collection('financial_profiles').add({
    data: {
      family_id: familyId,
      monthly_income: 0,
      income_stability: 'stable',
      fixed_expenses: [],
      savings_target: 0,
      savings_target_type: 'amount',
      emergency_fund: 0,
      baby_reserve_target: 0,
      baby_reserve_current: 0,
      updated_at: now(),
    },
  })
}

// ---------- budget_plans ----------
async function savePlan({ familyId, planInput, planOutput }) {
  const db = getDB()
  // 同一 family 只一条 is_active=true
  await db.collection('budget_plans').where({
    family_id: familyId,
    is_active: true,
  }).update({ data: { is_active: false } })

  const id = genId('plan')
  const now_ = now()
  // 计算 version = 已存版本数 + 1
  const { total } = await db.collection('budget_plans').where({ family_id: familyId }).count()
  const version = (total || 0) + 1

  // _id 由 .doc(id) 指定；data 里再带 _id 会报 -501007 不能更新_id的值
  const data = {
    family_id: familyId,
    version,
    health_score: planOutput.health_score,
    risk_level: planOutput.risk_level,
    is_active: true,
    monthly_summary: planOutput.monthly_summary || null,
    categories: planOutput.categories || [],
    baby_reserve: planOutput.baby_reserve || null,
    recommendations: planOutput.recommendations || [],
    risk_report: planOutput.risk_report || null,
    created_at: now_,
    activated_at: null, // 启用追踪时由 activatePlan 单独置, 本方法不填
  }
  await db.collection('budget_plans').doc(id).set({ data })
  return { _id: id, ...data }
}

async function getActivePlan(familyId) {
  const db = getDB()
  const { data } = await db.collection('budget_plans').where({
    family_id: familyId,
    is_active: true,
  }).limit(1).get()
  return data[0] || null
}

// ---------- weekly_entries ----------
async function getLastWeekEntry(familyId, beforeWeekStart) {
  const db = getDB()
  const _ = db.command
  // 简单实现:取 week_start < beforeWeekStart 的最新一条
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: _.lt(beforeWeekStart)
  }).orderBy('week_start', 'desc').limit(1).get().catch(() => ({ data: [] }))
  return (res.data && res.data[0]) || null
}

// ============================================================
// Phase 8 商业化
// ============================================================

// ---------- subscriptions ----------
/**
 * 按 family_id 读订阅(始终返回一条,缺则视为 free)
 * 不校验过期, 业务层 getActiveSubscription 才校验
 */
async function getSubscriptionByFamily(familyId) {
  const db = getDB()
  const { data } = await db.collection('subscriptions').where({ family_id: familyId }).limit(1).get()
  return (data && data[0]) || null
}

/**
 * 按 source_order_id 读订阅(结算幂等判定用)
 * 命中说明该订单的权益已经发放过, 调用方必须原样返回而不是重算 expires_at
 */
async function getSubscriptionBySourceOrder(orderId) {
  if (!orderId) return null
  const db = getDB()
  const { data } = await db.collection('subscriptions').where({ source_order_id: orderId }).limit(1).get()
  return (data && data[0]) || null
}

/**
 * upsert 订阅(按 family_id 业务主键)
 * 一户一份, 覆盖式写; 旧 plan_type 信息丢失由 entitlements 重算补偿
 */
async function upsertSubscription({ familyId, openid, plan_type, started_at, expires_at, source_order_id }) {
  const db = getDB()
  const now_ = now()
  const existing = await getSubscriptionByFamily(familyId)
  if (existing && existing._id) {
    await db.collection('subscriptions').doc(existing._id).update({
      data: { openid, plan_type, started_at, expires_at, source_order_id, updated_at: now_ }
    })
    return { ...existing, openid, plan_type, started_at, expires_at, source_order_id, updated_at: now_ }
  }
  const res = await db.collection('subscriptions').add({
    data: {
      family_id: familyId,
      openid,
      plan_type,
      started_at: started_at || now_,
      expires_at: expires_at || null,
      source_order_id: source_order_id || null,
      created_at: now_,
      updated_at: now_,
    }
  })
  return { _id: res._id, family_id: familyId, openid, plan_type, started_at, expires_at, source_order_id, created_at: now_, updated_at: now_ }
}

/**
 * 读"有效"订阅(未过期或永久)
 * 返回 { subscription, effectivePlanType, isExpired }
 *  - 无记录 → effectivePlanType='free', isExpired=false
 *  - 有记录但 expires_at < now → effectivePlanType='free'(DB 字段保留), isExpired=true
 */
async function getActiveSubscription(familyId) {
  const sub = await getSubscriptionByFamily(familyId)
  if (!sub) {
    return { subscription: null, effectivePlanType: 'free', isExpired: false }
  }
  const nowMs = Date.now()
  const isExpired = sub.expires_at ? sub.expires_at <= nowMs : false
  const effectivePlanType = isExpired ? 'free' : sub.plan_type
  return { subscription: sub, effectivePlanType, isExpired }
}

// ---------- orders ----------
/**
 * 判定是否唯一索引冲突 (orders 的 (openid, client_request_key) 唯一索引)
 * 云开发底层是 MongoDB, 冲突走 E11000; 不同版本 SDK 的字段名不一致, 宽松匹配
 */
function isDuplicateKeyError(e) {
  if (!e) return false
  const msg = e.errMsg || e.message || ''
  const code = e.errCode || e.code
  return code === 11000 || code === -501001 || /duplicate key|E11000/i.test(msg)
}

/**
 * 按 openid + client_request_id 读订单(下单幂等去重用)
 * 命中返回完整订单文档, 未命中返回 null
 */
async function getOrderByClientRequest({ openid, clientRequestId }) {
  if (!openid || !clientRequestId) return null
  const db = getDB()
  // 主查: client_request_key 是非空规范化键, 被唯一索引 (openid, client_request_key) 覆盖
  const { data } = await db.collection('orders')
    .where({ openid, client_request_key: clientRequestId })
    .limit(1)
    .get()
  if (data && data[0]) return data[0]
  // 回退: 本次改动之前落库的订单只写了 client_request_id, 没有 client_request_key。
  // 回填完成后(见 scripts/create-collections.js 的迁移说明)这段可以删。
  // 保留它是为了避免老订单重试时被判为"新请求"而重复下单。
  const legacy = await db.collection('orders')
    .where({ openid, client_request_id: clientRequestId })
    .limit(1)
    .get()
  return (legacy.data && legacy.data[0]) || null
}

/**
 * 创建 pending 订单; amount_fen 由调用方从 SKU 表取
 * 幂等: 同一 openid+client_request_id 只落一条 —— 由唯一索引
 * (openid, client_request_key) 兜底, 冲突时调用方 re-read 返回原订单
 */
async function createOrder({ openid, familyId, sku, amount_fen, client_request_id = null }) {
  const db = getDB()
  const now_ = now()
  const id = genId('ord')
  const doc = {
    family_id: familyId,
    openid,
    sku,
    amount_fen,
    status: 'pending',
    pay_channel: 'mock',         // 本期固定 mock; 真支付上线后改为 'wxpay'
    out_trade_no: id,
    wx_transaction_id: null,
    paid_at: null,
    client_request_id: client_request_id || null,
    // 非空规范化键: 无 client_request_id 时退化为 _id(天然唯一), 保证唯一索引可建
    client_request_key: client_request_id || id,
    created_at: now_,
    updated_at: now_,
  }
  await db.collection('orders').doc(id).set({ data: doc })
  return { _id: id, ...doc }
}

/**
 * 按 order_id 读订单, 强制校验 openid 归属
 * 越权返回 null (handler 层返回 40301)
 */
async function getOrder(orderId, openid) {
  if (!orderId) return null
  const db = getDB()
  const before = await db.collection('orders').doc(orderId).get()
  const order = Array.isArray(before.data) ? before.data[0] : before.data
  if (!order || !order._id) return null
  if (openid && order.openid !== openid) return null  // 越权
  return order
}

/**
 * 置订单为 paid; 写 paid_at + wx_transaction_id + updated_at
 *
 * 条件更新: 只有仍处于 pending 的订单会被改写 (where 而非 doc().update()),
 * 并发重试/支付回调与 mockPay 同时到达时, 只有一方的 paid_at 生效,
 * 另一方拿到 updated=0 → 调用方回读订单走"已支付"分支, 不会二次发放权益。
 *
 * @param {number} [paidAt] 结算时间; 省略则取当前时间。回调补单时必须传原始支付时间。
 * @returns {{ ok: boolean, updated: number, paid_at: number }}
 */
async function markOrderPaid({ orderId, channel, transactionId, paidAt }) {
  if (!orderId) throw new Error('markOrderPaid: orderId 必填')
  const db = getDB()
  const now_ = typeof paidAt === 'number' && paidAt > 0 ? paidAt : Date.now()
  const res = await db.collection('orders').where({ _id: orderId, status: 'pending' }).update({
    data: {
      status: 'paid',
      pay_channel: channel || 'mock',
      wx_transaction_id: transactionId || null,
      paid_at: now_,
      updated_at: Date.now(),
    }
  })
  const updated = (res && res.stats && typeof res.stats.updated === 'number') ? res.stats.updated : 0
  return { ok: updated > 0, updated, paid_at: now_ }
}

// ---------- app_config ----------
/**
 * 读 app_config[key]; 缺则 null
 */
async function getAppConfig(key) {
  if (!key) return null
  const db = getDB()
  const { data } = await db.collection('app_config').where({ key }).limit(1).get()
  if (!data || !data[0]) return null
  return data[0].value
}

/**
 * 写 app_config[key]; upsert
 */
async function setAppConfig({ key, value, updated_by = 'system' }) {
  if (!key) throw new Error('setAppConfig: key 必填')
  const db = getDB()
  const now_ = now()
  const { data } = await db.collection('app_config').where({ key }).limit(1).get()
  if (data && data[0] && data[0]._id) {
    await db.collection('app_config').doc(data[0]._id).update({
      data: { value, updated_at: now_, updated_by }
    })
    return { key, value, updated_at: now_ }
  }
  await db.collection('app_config').add({
    data: { key, value, updated_at: now_, updated_by }
  })
  return { key, value, updated_at: now_ }
}

// ---------- weekly_entries (已有方法上移, 保持原位) ----------
async function activatePlan(planId) {
  if (!planId) throw new Error('activatePlan: planId 必填')
  const db = getDB()
  const now_ = Date.now()
  // 幂等:已激活的 plan 不重复更新 activated_at
  // doc().get() 返回 data 为单条对象（非数组）
  const before = await db.collection('budget_plans').doc(planId).get()
  const plan = Array.isArray(before.data) ? before.data[0] : before.data
  if (!plan || !plan._id) {
    throw new Error('plan 不存在')
  }
  if (plan.activated_at) {
    return plan
  }
  await db.collection('budget_plans').doc(planId).update({
    data: { activated_at: now_ }
  })
  return { ...plan, activated_at: now_ }
}

function currentMonthRange(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth()
  const first = new Date(y, m, 1)
  const last  = new Date(y, m + 1, 0) // 当月最后一天
  const iso = (dt) => dt.toISOString().slice(0, 10)
  return { start: iso(first), end: iso(last), year: y, month: m + 1 }
}

async function getMonthlyEntries(familyId, year, month) {
  const db = getDB()
  const _ = db.command
  // 用 month 字符串前缀简单过滤 + plan 周一起点即可
  const firstDay = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const nextFirst = new Date(year, month, 1).toISOString().slice(0, 10)
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: _.gte(firstDay).and(_.lt(nextFirst))
  }).get().catch(() => ({ data: [] }))
  return res.data || []
}

async function getWeeklyEntry(familyId, weekStart) {
  const db = getDB()
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: weekStart
  }).limit(1).get().catch(() => ({ data: [] }))
  return (res.data && res.data[0]) || null
}

async function saveWeeklyEntry(familyId, weekStart, weekEnd, categories) {
  const db = getDB()
  const total = Object.values(categories || {}).reduce((s, v) => s + (Number(v) || 0), 0)
  const now_ = Date.now()
  // upsert:先查,有则 update,无则 add
  const existing = await getWeeklyEntry(familyId, weekStart)
  if (existing) {
    await db.collection('weekly_entries').doc(existing._id).update({
      data: { categories, total, updated_at: now_ }
    })
    return { ...existing, categories, total, updated_at: now_ }
  }
  const res = await db.collection('weekly_entries').add({
    data: {
      family_id: familyId,
      week_start: weekStart,
      week_end: weekEnd,
      categories,
      total,
      created_at: now_,
      updated_at: now_
    }
  })
  return { _id: res._id, family_id: familyId, week_start: weekStart, week_end: weekEnd, categories, total, created_at: now_, updated_at: now_ }
}

module.exports = {
  getDB,
  getUserByOpenid,
  createUser,
  updateUserLastActive,
  createFamily,
  getFamily,
  createFinancialProfile,
  savePlan,
  getActivePlan,
  activatePlan,
  getMonthlyEntries,
  getWeeklyEntry,
  saveWeeklyEntry,
  getLastWeekEntry,
  currentMonthRange,
  // ---------- Phase 8 商业化 ----------
  getSubscriptionByFamily,
  upsertSubscription,
  getActiveSubscription,
  getSubscriptionBySourceOrder,
  createOrder,
  getOrder,
  getOrderByClientRequest,
  isDuplicateKeyError,
  markOrderPaid,
  getAppConfig,
  setAppConfig,
}