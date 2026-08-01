/**
 * 业务 handlers（技术方案 §5.2 路由表 + 开发计划 Phase 2 + 6）
 *
 * 命名规则：{资源}.{动作}
 *   - cities.list
 *   - calc.quick / calc.full
 *   - user.bootstrap           (Phase 6, 需要 openid)
 *   - plans.save / plans.getActive (Phase 6, 需要 owner)
 *
 * db 模块默认依赖 wx-server-sdk；本地测试通过 stub 让其落内存。
 */
'use strict'

const benchmark = require('../common/benchmark-data')
const engine = require('../common/engine')
const { ok, fail, ERROR_CODE } = require('../common/response')

// 检查 wx-server-sdk 是否可用（云函数环境）；否则走本地内存（单测）
let usingCloudDb = false
try {
  require('wx-server-sdk')
  usingCloudDb = true
} catch (e) {
  usingCloudDb = false
}

const db = usingCloudDb ? require('../common/db') : null

// 本地内存 store (单测/探针)
const memoryStore = {
  users: new Map(),
  families: new Map(),
  financial_profiles: new Map(),
  budget_plans: new Map(),
  weekly_entries: new Map(),
  // Phase 8 商业化
  subscriptions: new Map(),
  orders: new Map(),
  app_config: new Map(),
}

// ---------- Phase 8: 权益计算纯函数 ----------
/**
 * 给定 plan_type + expires_at + now, 算出 entitlements
 * 纯函数, 测试可注入固定 now 验证跨年/2 月 29 日
 */
function calcEntitlements(plan_type, expires_at, now) {
  const paid = ['pro_yearly', 'pro_family', 'report_once'].includes(plan_type)
  const notExpired = !expires_at || expires_at > now
  const canViewFull = paid && notExpired
  const canExportPdf = canViewFull
  const canShareFree = true
  const daysRemaining = expires_at
    ? Math.max(0, Math.ceil((expires_at - now) / 86400000))
    : null
  return { canViewFull, canExportPdf, canShareFree, daysRemaining }
}

/**
 * SKU catalog: 服务端唯一真值
 * 客户端不得传入 amount_fen 或 expires_at
 */
const SKU_CATALOG = {
  report_once: { amount_fen: 1990, days: 7, plan_type: 'report_once' },
  pro_yearly:  { amount_fen: 6800, days: 365, plan_type: 'pro_yearly' },
  pro_family:  { amount_fen: 12800, days: 365, plan_type: 'pro_family' }, // 本期禁用
}

/**
 * 给定 now + order + 已存在的 subscription, 算出新 expires_at
 *  - report_once: now + 7d
 *  - pro_yearly 首次: now + 365d
 *  - pro_yearly 续费: max(now, current_expires_at) + 365d
 *  - Pro 覆盖 report_once: 直接 now + 365d (旧 7 天失效)
 */
function computeExpiresAt(order, currentSub, now) {
  const sku = SKU_CATALOG[order.sku]
  if (!sku) return null
  if (order.sku === 'report_once') return now + sku.days * 86400000
  // pro_yearly / pro_family
  if (currentSub && currentSub.plan_type === sku.plan_type && currentSub.expires_at && currentSub.expires_at > now) {
    return currentSub.expires_at + sku.days * 86400000
  }
  return now + sku.days * 86400000
}
// ---------- cities.list ----------
async function citiesList(ctx, payload) {
  return ok({
    cities: benchmark.cities.map(c => ({
      name: c.name,
      tier: c.tier,
      medianIncome: c.medianIncome,
    })),
  })
}

// ---------- calc.quick ----------
async function calcQuick(ctx, payload) {
  const { city, income, housing } = payload || {}
  if (!city || typeof income !== 'number' || typeof housing !== 'number') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 city/income/housing 字段')
  }
  if (income <= 0 || housing < 0) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', 'income 必须 > 0，housing 必须 ≥ 0')
  }
  try {
    const data = engine.calcQuick({ city, income, housing })
    return ok(data)
  } catch (e) {
    if (e.code === ERROR_CODE.IMBALANCE) {
      return fail(e.code, e.message, e.userHint, e.details)
    }
    throw e
  }
}

// ---------- calc.full ----------
async function calcFull(ctx, payload) {
  const v = payload || {}
  if (!v.city || typeof v.monthlyIncome !== 'number') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 city/monthlyIncome 字段')
  }
  if (!v.fixedExpenses || typeof v.fixedExpenses !== 'object') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 fixedExpenses 对象')
  }
  try {
    const data = engine.calcFull({
      stage: v.stage, city: v.city, monthlyIncome: v.monthlyIncome,
      incomeStability: v.incomeStability, fixedExpenses: v.fixedExpenses,
      savingsTarget: v.savingsTarget, emergencyFundMonths: v.emergencyFundMonths,
      monthsToBaby: v.monthsToBaby, currentBabyReserve: v.currentBabyReserve,
    })
    return ok(data)
  } catch (e) {
    if (e.code === ERROR_CODE.IMBALANCE) {
      return fail(e.code, e.message, e.userHint, e.details)
    }
    throw e
  }
}

// ---------- user.bootstrap (Phase 6) ----------
async function userBootstrap(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  const { nickname, avatar } = payload || {}

  // 查找用户
  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) {
      // 创建 family + user + profile
      const family = await db.createFamily({})
      user = await db.createUser({
        openid, nickname, avatar,
        familyId: family._id, role: 'owner',
      })
      await db.createFinancialProfile({ familyId: family._id })
    } else {
      await db.updateUserLastActive(openid)
    }
  } else {
    // 本地内存 fallback（单测）
    user = memoryStore.users.get(openid)
    if (!user) {
      const familyId = 'fam_' + openid  // 完整 openid 当 family id, 避免 slice 撞车
      user = {
        _openid: openid,
        nickname: nickname || '测试用户',
        avatar: avatar || '',
        family_id: familyId,
        role: 'owner',
        created_at: new Date(),
      }
      memoryStore.users.set(openid, user)
      memoryStore.families.set(familyId, { _id: familyId })
      memoryStore.financial_profiles.set(familyId, { family_id: familyId })
    }
  }

  // 取当前 active plan
  let activePlan = null
  if (db) {
    activePlan = await db.getActivePlan(user.family_id)
  } else {
    for (const [k, v] of memoryStore.budget_plans) {
      if (v && v.family_id === user.family_id && v.is_active) {
        activePlan = v
        break
      }
    }
  }

  // Phase 8: 读真实订阅 (无则保持 free 空壳, 不阻塞 bootstrap)
  let subscription = { plan_type: 'free', expires_at: null, source_order_id: null, started_at: null }
  try {
    const { subscription: sub, effectivePlanType } = await subscriptionGetEffective(user.family_id)
    if (sub) {
      subscription = {
        plan_type: sub.plan_type,
        expires_at: sub.expires_at || null,
        source_order_id: sub.source_order_id || null,
        started_at: sub.started_at || null,
        effective_plan_type: effectivePlanType,
      }
    }
  } catch (e) {
    console.warn('[userBootstrap] subscription read failed, fallback to free:', e.message)
  }

  return ok({
    user,
    family_id: user.family_id,
    subscription,
    activePlan,
  })
}

/**
 * 读家庭有效订阅(纯函数 + memoryStore/cloudDb 双路)
 * 内部 helper, 不在 module.exports 暴露
 */
async function subscriptionGetEffective(familyId) {
  if (db) {
    const { subscription, effectivePlanType } = await db.getActiveSubscription(familyId)
    return { subscription, effectivePlanType }
  }
  let sub = null
  for (const [, v] of memoryStore.subscriptions) {
    if (v && v.family_id === familyId) { sub = v; break }
  }
  if (!sub) return { subscription: null, effectivePlanType: 'free' }
  const isExpired = sub.expires_at ? sub.expires_at <= Date.now() : false
  return { subscription: sub, effectivePlanType: isExpired ? 'free' : sub.plan_type }
}

// ---------- plans.save (Phase 6) ----------
async function plansSave(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  const { planInput, planOutput } = payload || {}
  if (!planOutput || !planOutput.health_score) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 planOutput')
  }

  let user, familyId
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    familyId = user.family_id
  } else {
    user = memoryStore.users.get(openid)
    familyId = user ? user.family_id : 'fam_test'
  }

  let saved
  if (usingCloudDb) {
    saved = await db.savePlan({ familyId, planInput, planOutput })
  } else {
    // 本地：禁用旧的 is_active，写一条新的
    for (const [k, v] of memoryStore.budget_plans) {
      if (v && v.family_id === familyId && v.is_active) v.is_active = false
    }
    saved = {
      // 同毫秒内两个 family 存 plan 会撞 _id, 后者覆盖前者 → 补随机后缀
      // (云端 db.savePlan 走 genId 已带随机, 这里只是本地内存路径对齐)
      _id: 'plan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      family_id: familyId,
      version: memoryStore.budget_plans.size + 1,
      health_score: planOutput.health_score,
      risk_level: planOutput.risk_level,
      is_active: true,
      monthly_summary: planOutput.monthly_summary,
      categories: planOutput.categories,
      baby_reserve: planOutput.baby_reserve,
      recommendations: planOutput.recommendations || [],
      risk_report: planOutput.risk_report,
      created_at: new Date(),
    }
    memoryStore.budget_plans.set(saved._id, saved)
  }

  return ok({ plan: saved })
}

// ---------- plans.getActive (Phase 6) ----------
async function plansGetActive(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  let user, plan
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    plan = await db.getActivePlan(user.family_id)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return ok({ plan: null })
    plan = findActivePlanLocal(user.family_id)
  }

  return ok({ plan: plan || null })
}

// ---------- helpers (Phase 7) ----------
function colorOf(pct) {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

// 把 plan.baby_reserve 原始 shape 转成前端可直读 shape
// 原始: { target, current, monthlyRequired, monthsRemaining, monthlyIncrement, oneTimeChildbirth, pressureRatio }
// 附加: pct, color
function shapeBabyReserve(br) {
  if (!br || !br.target || br.target <= 0) return null
  const pct = Math.min(100, Math.round((br.current / br.target) * 100))
  return { ...br, pct, color: colorOf(pct) }
}

function isoWeekRange(d = new Date()) {
  // ISO 周一
  const day = d.getDay() || 7 // 周日=0 视作 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const iso = (dt) => dt.toISOString().slice(0, 10)
  return { weekStart: iso(monday), weekEnd: iso(sunday) }
}

const WEEKLY_CAT_IDS = ['food', 'daily', 'entertainment', 'medical', 'clothing', 'transport', 'other']

// 本地 helper: 找 active plan
function findActivePlanLocal(familyId) {
  for (const [, v] of memoryStore.budget_plans) {
    if (v && v.family_id === familyId && v.is_active) return v
  }
  return null
}

// 本地 helper: 找/建 weekly entry (本周)
function findWeeklyEntryLocal(familyId, weekStart) {
  for (const [, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId && v.week_start === weekStart) return v
  }
  return null
}

// 本地 helper: 找上一周 entry (week_start < 当前 weekStart)
function findLastWeekEntryLocal(familyId, beforeWeekStart) {
  let best = null
  for (const [, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId && v.week_start < beforeWeekStart) {
      if (!best || v.week_start > best.week_start) best = v
    }
  }
  return best
}

// 本地 helper: 本月 entries (week_start 在 [first, last] 之间)
function findMonthlyEntriesLocal(familyId, year, month) {
  const firstDay = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const nextFirst = new Date(year, month, 1).toISOString().slice(0, 10)
  const out = []
  for (const [, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId && v.week_start >= firstDay && v.week_start < nextFirst) {
      out.push(v)
    }
  }
  return out
}

// ---------- plans.activate (Phase 7) ----------
async function plansActivate(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  let user, plan
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
    plan = await db.getActivePlan(user.family_id)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
    plan = findActivePlanLocal(user.family_id)
  }

  if (!plan) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '当前没有 active plan')

  let updated
  if (usingCloudDb) {
    updated = await db.activatePlan(plan._id)
  } else {
    // 本地: 幂等置 activated_at
    if (!plan.activated_at) {
      plan.activated_at = Date.now()
    }
    updated = plan
  }

  return ok({ plan: updated })
}

// ---------- dashboard.get (Phase 7) ----------
async function dashboardGet(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  let user, plan
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    plan = await db.getActivePlan(user.family_id)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    plan = findActivePlanLocal(user.family_id)
  }

  if (!plan) {
    return ok({ activated: false, plan: null, categories: [], totals: null, baby_reserve: null })
  }

  const activated = !!plan.activated_at
  const babyComputed = shapeBabyReserve(plan.baby_reserve)
  if (!activated) {
    return ok({
      activated: false,
      plan: {
        _id: plan._id,
        monthly_summary: plan.monthly_summary,
        baby_reserve: plan.baby_reserve,
      },
      categories: [],
      totals: null,
      baby_reserve: babyComputed,
    })
  }

  // activated=true: 聚合本月 entries
  const now = new Date()
  let monthEntries
  if (usingCloudDb) {
    monthEntries = await db.getMonthlyEntries(user.family_id, now.getFullYear(), now.getMonth() + 1)
  } else {
    monthEntries = findMonthlyEntriesLocal(user.family_id, now.getFullYear(), now.getMonth() + 1)
  }

  const usedByCat = { food: 0, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
  for (const e of monthEntries) {
    for (const k of Object.keys(usedByCat)) {
      usedByCat[k] += Number((e.categories && e.categories[k]) || 0)
    }
  }

  const categories = (plan.categories || []).map((c) => {
    const used = usedByCat[c.id] || 0
    const pctRaw = c.suggested > 0 ? Math.round((used / c.suggested) * 100) : 0
    const pct = Math.min(100, pctRaw)
    return { id: c.id, name: c.name, suggested: c.suggested, used, pct, color: colorOf(pctRaw) }
  })

  const totalUsed = Object.values(usedByCat).reduce((s, v) => s + v, 0)
  const totalSuggested = plan.monthly_summary && plan.monthly_summary.disposable ? plan.monthly_summary.disposable : 0
  const totalPctRaw = totalSuggested > 0 ? Math.round((totalUsed / totalSuggested) * 100) : 0
  const totalPct = Math.min(100, totalPctRaw)

  return ok({
    activated: true,
    plan: {
      _id: plan._id,
      monthly_summary: plan.monthly_summary,
      baby_reserve: plan.baby_reserve,
    },
    categories,
    totals: { used: totalUsed, suggested: totalSuggested, pct: totalPct, color: colorOf(totalPctRaw) },
    baby_reserve: babyComputed,
  })
}

// ---------- weekly.getCurrent (Phase 7) ----------
async function weeklyGetCurrent(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  let user, entry
  const { weekStart, weekEnd } = isoWeekRange()
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    entry = await db.getWeeklyEntry(user.family_id, weekStart)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    entry = findWeeklyEntryLocal(user.family_id, weekStart)
  }

  return ok({ entry: entry || null, weekStart, weekEnd })
}

// ---------- weekly.submit (Phase 7) ----------
async function weeklySubmit(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  if (!payload || !payload.categories) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 categories')
  }

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  }

  const { weekStart, weekEnd } = isoWeekRange()

  // 校验 7 类
  const cats = {}
  for (const id of WEEKLY_CAT_IDS) {
    cats[id] = Math.max(0, Math.round(Number(payload.categories[id]) || 0))
  }

  let entry
  if (usingCloudDb) {
    entry = await db.saveWeeklyEntry(user.family_id, weekStart, weekEnd, cats)
  } else {
    // 本地: upsert
    const existing = findWeeklyEntryLocal(user.family_id, weekStart)
    const total = Object.values(cats).reduce((s, v) => s + v, 0)
    const nowTs = Date.now()
    if (existing) {
      existing.categories = cats
      existing.total = total
      existing.updated_at = nowTs
      entry = existing
    } else {
      const id = 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
      entry = {
        _id: id,
        family_id: user.family_id,
        week_start: weekStart,
        week_end: weekEnd,
        categories: cats,
        total,
        created_at: nowTs,
        updated_at: nowTs,
      }
      memoryStore.weekly_entries.set(id, entry)
    }
  }

  return ok({ entry })
}

// ---------- weekly.copyLastWeek (Phase 7) ----------
async function weeklyCopyLastWeek(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  let user, last
  const { weekStart } = isoWeekRange()
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    last = await db.getLastWeekEntry(user.family_id, weekStart)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    last = findLastWeekEntryLocal(user.family_id, weekStart)
  }

  return ok({ categories: last ? last.categories : null })
}

// ============================================================
// Phase 8 商业化 action
// ============================================================

// ---------- subscription.get ----------
async function subscriptionGet(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid

  // 取 user
  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  }

  const { subscription, effectivePlanType } = await subscriptionGetEffective(user.family_id)
  // T8-12: 无记录时懒写 free, 保证前端总是有 subscription 字段
  let subRow = subscription
  if (!subRow) {
    if (usingCloudDb) {
      subRow = await db.upsertSubscription({
        familyId: user.family_id, openid, plan_type: 'free',
        started_at: Date.now(), expires_at: null, source_order_id: null,
      })
    } else {
      const now_ = Date.now()
      const id = 'sub_' + now_ + '_' + Math.random().toString(36).slice(2, 6)
      subRow = {
        _id: id, family_id: user.family_id, openid,
        plan_type: 'free', started_at: now_, expires_at: null, source_order_id: null,
        created_at: now_, updated_at: now_,
      }
      memoryStore.subscriptions.set(id, subRow)
    }
  }
  const now = Date.now()
  const plan_type = subRow.plan_type
  const expires_at = subRow.expires_at || null
  const entitlements = calcEntitlements(plan_type, expires_at, now)

  return ok({
    subscription: {
      plan_type,
      expires_at,
      started_at: subRow.started_at || null,
      source_order_id: subRow.source_order_id || null,
    },
    effective_plan_type: effectivePlanType,
    entitlements,
    server_now: now,
  })
}

// ---------- orders.create ----------
/**
 * 对外订单 DTO: 只暴露客户端渲染需要的字段。
 * openid / out_trade_no / wx_transaction_id / client_request_id / family_id
 * 属于内部或支付渠道字段, 一律不下发。
 */
function publicOrderDto(order) {
  if (!order) return null
  return {
    _id: order._id,
    sku: order.sku,
    amount_fen: order.amount_fen,
    status: order.status,
    created_at: order.created_at,
  }
}

/** orders.create 的统一成功响应 (订单 + 支付描述符) */
function ordersCreateOk(order) {
  return ok({
    order: publicOrderDto(order),
    payment: {
      mock: true,
      order_id: order._id,
      sku: order.sku,
      amount_fen: order.amount_fen,
    },
  })
}

const CLIENT_REQUEST_ID_MAX = 64

/** memoryStore 侧按 openid + client_request_id 查已有订单 */
function findMemoryOrderByClientRequest(openid, clientRequestId) {
  for (const [, o] of memoryStore.orders) {
    if (o && o.openid === openid && o.client_request_id === clientRequestId) return o
  }
  return null
}

async function ordersCreate(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  const { sku, client_request_id } = payload || {}
  if (typeof client_request_id !== 'string' || client_request_id.length === 0 ||
      client_request_id.length > CLIENT_REQUEST_ID_MAX) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR',
      `client_request_id 必填且长度 1-${CLIENT_REQUEST_ID_MAX}`)
  }
  if (!sku || !SKU_CATALOG[sku]) {
    return fail(ERROR_CODE.INVALID_SKU, 'INVALID_SKU', '不支持的 SKU')
  }
  if (sku === 'pro_family') {
    return fail(ERROR_CODE.INVALID_SKU, 'INVALID_SKU', '家庭版敬请期待')
  }

  // 幂等前置查: 命中同 key 直接返回原订单, 不重复下单也不重复校验权益
  const existing = usingCloudDb
    ? await db.getOrderByClientRequest({ openid, clientRequestId: client_request_id })
    : findMemoryOrderByClientRequest(openid, client_request_id)
  if (existing) {
    if (existing.sku !== sku) {
      // 同一 key 复用到不同 SKU: 视为客户端 bug, 拒绝而不是静默改单
      return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR',
        'client_request_id 已用于其他 SKU 的订单')
    }
    return ordersCreateOk(existing)
  }

  // owner 鉴权
  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
  }

  // 必须有 active plan
  let activePlan = null
  if (usingCloudDb) {
    activePlan = await db.getActivePlan(user.family_id)
  } else {
    for (const [, v] of memoryStore.budget_plans) {
      if (v && v.family_id === user.family_id && v.is_active) { activePlan = v; break }
    }
  }
  if (!activePlan) {
    return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '请先生成预算方案')
  }

  // 已有同级或更高有效权益 → 拒绝 (T8 防降级)
  const { effectivePlanType } = await subscriptionGetEffective(user.family_id)
  if (sku === 'report_once' && (effectivePlanType === 'pro_yearly' || effectivePlanType === 'pro_family')) {
    return fail(ERROR_CODE.ALREADY_ENTITLED, 'ALREADY_ENTITLED', '您已是 Pro 会员')
  }

  // 读 SKU 金额 (优先 app_config, fallback 写死)
  let amount_fen = SKU_CATALOG[sku].amount_fen
  if (usingCloudDb) {
    const cfg = await db.getAppConfig('paywall_prices_v1')
    if (cfg && cfg[sku] && typeof cfg[sku] === 'number') {
      amount_fen = cfg[sku]
    }
  } else {
    const cfg = memoryStore.app_config.get('paywall_prices_v1')
    if (cfg && cfg.value && cfg.value[sku] && typeof cfg.value[sku] === 'number') {
      amount_fen = cfg.value[sku]
    }
  }

  // 写 pending order
  let order
  if (usingCloudDb) {
    try {
      order = await db.createOrder({
        openid, familyId: user.family_id, sku, amount_fen,
        client_request_id,
      })
    } catch (e) {
      // 并发下同 key 两次请求都走到这里, 唯一索引挡下第二条 → 回读原订单
      if (!db.isDuplicateKeyError(e)) throw e
      const raced = await db.getOrderByClientRequest({ openid, clientRequestId: client_request_id })
      if (!raced) throw e
      if (raced.sku !== sku) {
        return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR',
          'client_request_id 已用于其他 SKU 的订单')
      }
      order = raced
    }
  } else {
    const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const now_ = Date.now()
    order = {
      _id: id,
      openid, family_id: user.family_id, sku, amount_fen,
      status: 'pending', pay_channel: 'mock',
      out_trade_no: id, wx_transaction_id: null, paid_at: null,
      client_request_id,
      created_at: now_, updated_at: now_,
    }
    memoryStore.orders.set(id, order)
  }

  return ordersCreateOk(order)
}

// ---------- orders.mockPay ----------
async function ordersMockPay(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  const { order_id } = payload || {}
  if (!order_id) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 order_id')
  }

  // owner 鉴权
  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
  }

  // 读订单 + 校验归属
  let order
  if (usingCloudDb) {
    order = await db.getOrder(order_id, openid)
    if (!order) return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '订单不属于当前用户')
  } else {
    const o = memoryStore.orders.get(order_id)
    if (!o) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '订单不存在')
    if (o.openid !== openid) return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '订单不属于当前用户')
    order = o
  }

  if (order.status !== 'pending') {
    return fail(ERROR_CODE.ORDER_STATUS_INVALID, 'ORDER_STATUS_INVALID', `订单已是 ${order.status} 状态`)
  }

  const now = Date.now()

  // 置 paid
  if (usingCloudDb) {
    await db.markOrderPaid({ orderId: order_id, channel: 'mock', transactionId: 'MOCK_' + order_id })
  } else {
    order.status = 'paid'
    order.pay_channel = 'mock'
    order.wx_transaction_id = 'MOCK_' + order_id
    order.paid_at = now
    order.updated_at = now
  }

  // upsert subscription
  const { subscription: currentSub } = await subscriptionGetEffective(user.family_id)
  const expires_at = computeExpiresAt(order, currentSub, now)
  const plan_type = SKU_CATALOG[order.sku].plan_type
  const started_at = currentSub ? (currentSub.started_at || now) : now

  let newSub
  if (usingCloudDb) {
    newSub = await db.upsertSubscription({
      familyId: user.family_id, openid, plan_type, started_at, expires_at,
      source_order_id: order_id,
    })
  } else {
    newSub = {
      family_id: user.family_id, openid, plan_type, started_at, expires_at,
      source_order_id: order_id, updated_at: now,
    }
    // 一户一份: 删旧
    for (const [k, v] of memoryStore.subscriptions) {
      if (v && v.family_id === user.family_id) memoryStore.subscriptions.delete(k)
    }
    newSub._id = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    newSub.created_at = now
    memoryStore.subscriptions.set(newSub._id, newSub)
  }

  const entitlements = calcEntitlements(plan_type, expires_at, now)

  // 重读订单返回最新
  const updatedOrder = usingCloudDb
    ? await db.getOrder(order_id, openid)
    : memoryStore.orders.get(order_id)

  return ok({
    order: updatedOrder,
    subscription: {
      plan_type,
      expires_at,
      started_at,
      source_order_id: order_id,
      entitlements,
    },
  })
}

// ---------- share.getQrCode ----------
async function shareGetQrCode(ctx, payload) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  const openid = ctx.openid
  const page_path = (payload && payload.page_path) || 'pages/landing/index'

  // 鉴权
  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }

  // 本地模式: 直接返回 placeholder
  if (!usingCloudDb) {
    return ok({
      mode: 'placeholder',
      file_id: '',
      temp_url: '',
      page: page_path,
      scene: 'from=poster',
    })
  }

  // 云端: try/catch wxacode
  try {
    const cloud = require('wx-server-sdk')
    const qrRes = await cloud.openapi.wxacode.getUnlimited({
      scene: 'from=poster',
      page: page_path,
      width: 280,
    })
    // 派生确定性的版本化云端路径 (例如 pages/landing/index → share-qrcodes/landing-v1.png)
    const pathSegments = page_path.split('/').filter(Boolean)
    const lastSeg = pathSegments[pathSegments.length - 1] || ''
    const stem =
      pathSegments.length > 1 && lastSeg === 'index'
        ? pathSegments[pathSegments.length - 2]
        : lastSeg || 'page'
    const cloudPath = `share-qrcodes/${stem}-v1.png`

    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: qrRes.buffer,
    })

    return ok({
      mode: 'wxacode',
      file_id: uploadRes.fileID || '',
      temp_url: '',
      page: page_path,
      scene: 'from=poster',
    })
  } catch (e) {
    console.warn('[shareGetQrCode] wxacode failed, fallback placeholder:', e.message)
    return ok({
      mode: 'placeholder',
      file_id: '',
      temp_url: '',
      page: page_path,
      scene: 'from=poster',
    })
  }
}

module.exports = {
  'cities.list': citiesList,
  'calc.quick': calcQuick,
  'calc.full': calcFull,
  'user.bootstrap': userBootstrap,
  'plans.save': plansSave,
  'plans.getActive': plansGetActive,
  'plans.activate': plansActivate,
  'dashboard.get': dashboardGet,
  'weekly.getCurrent': weeklyGetCurrent,
  'weekly.submit': weeklySubmit,
  'weekly.copyLastWeek': weeklyCopyLastWeek,
  // Phase 8 商业化
  'subscription.get': subscriptionGet,
  'orders.create': ordersCreate,
  'orders.mockPay': ordersMockPay,
  'share.getQrCode': shareGetQrCode,
  // 纯函数导出 (供测试)
  calcEntitlements,
  computeExpiresAt,
  SKU_CATALOG,
  _resetMemory() {
    memoryStore.users.clear()
    memoryStore.families.clear()
    memoryStore.financial_profiles.clear()
    memoryStore.budget_plans.clear()
    memoryStore.weekly_entries.clear()
    memoryStore.subscriptions.clear()
    memoryStore.orders.clear()
    memoryStore.app_config.clear()
  },
  _seedWeeklyEntry(entry) {
    const id = entry._id || `seed_w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const stored = { _id: id, ...entry }
    memoryStore.weekly_entries.set(id, stored)
    return stored
  },
  _seedSubscription(sub) {
    const id = sub._id || `seed_s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const stored = { _id: id, ...sub }
    memoryStore.subscriptions.set(id, stored)
    return stored
  },
  _seedOrder(order) {
    const id = order._id || `seed_o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const stored = { _id: id, ...order }
    memoryStore.orders.set(id, stored)
    return stored
  },
  /** 测试用: 列出 memoryStore 里的全部订单(断言"只落了一条") */
  _allOrders() {
    return Array.from(memoryStore.orders.values())
  },
}