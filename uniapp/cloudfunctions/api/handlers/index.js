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

// ============================================================
// 集中式鉴权 guard (安全审计 Phase 9)
// ============================================================

/**
 * 登录校验: 所有需要 openid 的 action 统一入口。
 * 返回 null 表示放行; 返回 fail response 则调用方直接 return。
 */
function requireAuth(ctx) {
  if (!ctx || !ctx.openid) {
    return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }
  return null
}

/**
 * owner 角色校验: 仅 family owner 可执行敏感操作。
 * 接受已解析的 user 对象 (来自 db 或 memoryStore)。
 * 返回 null 表示放行。
 */
function requireOwner(user) {
  if (!user || user.role !== 'owner') {
    return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '需要 owner 权限')
  }
  return null
}

// 检查 wx-server-sdk 是否可用（云函数环境）；否则走本地内存（单测）
let usingCloudDb = false
let cloud = null
try {
  cloud = require('wx-server-sdk')
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
  // Phase 10 伴侣邀请
  family_invites: new Map(),
  family_members: new Map(),
  // Phase 10 行动清单写库
  action_statuses: new Map(),
  // Phase 10 订阅消息
  subscribe_records: new Map(),
  // Phase 10 埋点系统
  analytics_events: new Map(),
  // 帮助与反馈
  feedbacks: new Map(),
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
  const authErr = requireAuth(ctx); if (authErr) return authErr
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

/**
 * 统计本月该 family 已创建的计划数（免费用户限流辅助，双路）
 */
async function countPlansThisMonth(familyId) {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  if (db) {
    return await db.countPlansThisMonth(familyId, monthStart.toISOString())
  }
  let count = 0
  for (const [, v] of memoryStore.budget_plans) {
    if (v && v.family_id === familyId && v.created_at && new Date(v.created_at) >= monthStart) count++
  }
  return count
}

// ---------- plans.save (Phase 6，Phase 9 加免费限流) ----------
async function plansSave(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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

  // Phase 9: 免费用户月度限流（1次/月）
  const { effectivePlanType } = await subscriptionGetEffective(familyId)
  if (effectivePlanType === 'free') {
    const monthCount = await countPlansThisMonth(familyId)
    if (monthCount >= 1) {
      return fail(ERROR_CODE.RATE_LIMITED, 'FREE_TIER_LIMIT',
        '免费用户每月仅可测算 1 次，升级 Pro 可解锁无限次测算')
    }
  }

  let saved
  if (usingCloudDb) {
    saved = await db.savePlan({ familyId, planInput, planOutput })
  } else {
    // 本地：继承上一版 activated_at，再禁用旧 is_active
    let prevActivatedAt = null
    for (const [, v] of memoryStore.budget_plans) {
      if (v && v.family_id === familyId && v.is_active) {
        if (v.activated_at) prevActivatedAt = v.activated_at
        v.is_active = false
      }
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
      activated_at: prevActivatedAt,
    }
    memoryStore.budget_plans.set(saved._id, saved)
  }

  return ok({ plan: saved })
}

// ---------- plans.getActive (Phase 6) ----------
async function plansGetActive(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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

  return ok({ plan: ensureRecommendations(plan) || null })
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

// 兜底：旧数据 recommendations 为空时，构造一条正向维持建议，避免行动清单空态
function ensureRecommendations(plan) {
  if (!plan) return plan
  if (plan.recommendations && plan.recommendations.length) return plan
  const score = plan.health_score || 0
  const healthy = score >= 80
  plan.recommendations = [{
    id: 'R-POSITIVE',
    title: healthy ? '财务状况优秀，继续保持' : '财务状况良好，仍可微调',
    severity: 'green',
    category: 'R-POSITIVE',
    description: healthy
      ? `当前健康分 ${score} 分，整体财务状况优秀，暂无需要调整的风险项。`
      : `当前健康分 ${score} 分，整体情况良好，可继续优化储蓄结构。`,
    actions: healthy ? [
      '保持当前储蓄节奏，建议设置工资到账自动转账',
      '将多余资金配置到稳健理财或长期投资',
      '每季度回顾一次预算分配',
    ] : [
      '尝试把储蓄率提升到收入的 20% 以上',
      '优先补齐 3-6 个月应急金',
      '减少非必要支出，把释放资金用于长期目标',
    ],
    impact: 0,
    feasibility: 0.9,
    stage_weight: 1,
    estimatedImpact: healthy ? '维持当前健康状态' : '进一步提升财务健康度',
    score: 1,
  }]
  return plan
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
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  let user, plan
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return requireOwner(user)
    plan = await db.getActivePlan(user.family_id)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return requireOwner(user)
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
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
  // 注意: plan 必须返回完整对象（含 recommendations/categories 等）。
  // 前端 planStore.loadDashboard 会用 res.plan 覆盖 activePlan,
  // 若裁剪成 _id/monthly_summary/baby_reserve, 行动清单等页面将拿不到 recommendations。
  if (!activated) {
    return ok({
      activated: false,
      plan: ensureRecommendations(plan),
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
    plan: ensureRecommendations(plan),
    categories,
    totals: { used: totalUsed, suggested: totalSuggested, pct: totalPct, color: colorOf(totalPctRaw) },
    baby_reserve: babyComputed,
  })
}

// ---------- weekly.getCurrent (Phase 7) ----------
async function weeklyGetCurrent(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
  // 安全: 仅 owner 可修改周记账数据
  const ownerErr = requireOwner(user); if (ownerErr) return ownerErr

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
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
  // 安全: 仅 owner 可读上周数据 (含金额)
  const ownerErr = requireOwner(user); if (ownerErr) return ownerErr

  return ok({ categories: last ? last.categories : null })
}

// ============================================================
// Phase 8 商业化 action
// ============================================================

// ---------- subscription.get ----------
async function subscriptionGet(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
    if (user.role !== 'owner') return requireOwner(user)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return requireOwner(user)
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

// ---------- 结算边界 (Phase 8.1) ----------
/**
 * 终态订单: 永远不该由结算发放权益 (已取消 / 已退款)
 */
const ORDER_TERMINAL_STATUS = ['cancelled', 'refunded']

/** 从 memoryStore 找该订单发放过的订阅 */
function findMemorySubscriptionBySourceOrder(orderId) {
  if (!orderId) return null
  for (const [, v] of memoryStore.subscriptions) {
    if (v && v.source_order_id === orderId) return v
  }
  return null
}

/** 订阅 → 对外 DTO (带实时 entitlements) */
function subscriptionSettleDto(sub, now) {
  return {
    plan_type: sub.plan_type,
    expires_at: sub.expires_at || null,
    started_at: sub.started_at || null,
    source_order_id: sub.source_order_id || null,
    entitlements: calcEntitlements(sub.plan_type, sub.expires_at || null, now),
  }
}

/**
 * 结算一笔已支付订单 → 发放/恢复权益。
 *
 * 与 Mock 无关的纯结算边界: 后续真实 payNotify 回调可以直接复用,
 * 只需换 channel / transactionId, 不必重写权益逻辑。
 *
 * 三条路径:
 *   1. pending          → 置 paid(用 paidAt), 按 computeExpiresAt 发放
 *   2. paid + 已有订阅   → 原样返回, 绝不重算 (幂等重试)
 *   3. paid + 订阅缺失   → 用订单原始 paid_at 补发, 而不是重试时的墙钟时间
 *
 * 路径 3 是关键: 若用重试时间重算, 一次重试就白送用户一个完整周期。
 *
 * @param {object}  order         订单文档 (调用方已确认存在)
 * @param {object}  user          结算发起人 (需与订单同属一人/一户)
 * @param {string}  channel       支付渠道 ('mock' | 'wxpay')
 * @param {string}  transactionId 渠道流水号
 * @param {number}  paidAt        本次结算时间; 订单已有 paid_at 时以订单为准
 * @returns {{ ok: true, order, subscription } | { ok: false, error }}
 */
async function settlePaidOrder({ order, user, channel = 'mock', transactionId = null, paidAt }) {
  if (!order || !order._id) {
    return { ok: false, error: fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '订单不存在') }
  }
  if (!user || !user.openid) {
    return { ok: false, error: fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录') }
  }

  // 越权守卫: 订单必须同时属于该 openid 与该 family。
  // 放在结算内部而不是只在 handler 里, 是为了让未来的回调路径也拿到同一道闸。
  if (order.openid !== user.openid ||
      (order.family_id && user.family_id && order.family_id !== user.family_id)) {
    return { ok: false, error: fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '订单不属于当前用户') }
  }

  // 终态订单不发权益, 也不"静默当作已支付"
  if (ORDER_TERMINAL_STATUS.includes(order.status)) {
    return {
      ok: false,
      error: fail(ERROR_CODE.ORDER_STATUS_INVALID, 'ORDER_STATUS_INVALID', `订单已是 ${order.status} 状态`),
    }
  }
  if (order.status !== 'pending' && order.status !== 'paid') {
    return {
      ok: false,
      error: fail(ERROR_CODE.ORDER_STATUS_INVALID, 'ORDER_STATUS_INVALID', `订单状态 ${order.status} 无法结算`),
    }
  }

  const sku = SKU_CATALOG[order.sku]
  if (!sku) {
    return { ok: false, error: fail(ERROR_CODE.INVALID_SKU, 'INVALID_SKU', '订单 SKU 已下线') }
  }

  const orderId = order._id
  const familyId = user.family_id
  const nowWall = Date.now()

  // 已支付订单: 若权益已发放过, 原样返回 —— 这是重试幂等的唯一出口
  if (order.status === 'paid') {
    const granted = usingCloudDb
      ? await db.getSubscriptionBySourceOrder(orderId)
      : findMemorySubscriptionBySourceOrder(orderId)
    if (granted) {
      return {
        ok: true,
        order,
        subscription: subscriptionSettleDto(granted, nowWall),
      }
    }

    // 没有指向本订单的订阅, 有两种可能, 必须区分:
    //   a) 权益写失败/被删 → 用户当前没有有效权益 → 补发
    //   b) 后续订单已续期, 一户一份的订阅被改写成指向新订单 → 用户权益完好
    // 若把 b) 也当成补发, 一次陈旧重试就会在现有到期日上再叠一个周期(白送)。
    // 判据: 用户此刻是否已有未过期的付费订阅。有 → 原样返回, 不重算。
    const { subscription: existing } = await subscriptionGetEffective(familyId)
    if (existing && existing.plan_type !== 'free' &&
        existing.expires_at && existing.expires_at > nowWall) {
      return {
        ok: true,
        order,
        subscription: subscriptionSettleDto(existing, nowWall),
      }
    }
    // 落到这里 = 订单已 paid 但权益确实缺失, 走下面的补发
  }

  // 结算基准时间: 订单已有 paid_at 就以它为准, 保证重放算出同一个 expires_at
  const settledAt = (typeof order.paid_at === 'number' && order.paid_at > 0)
    ? order.paid_at
    : ((typeof paidAt === 'number' && paidAt > 0) ? paidAt : nowWall)

  // pending → paid
  if (order.status === 'pending') {
    if (usingCloudDb) {
      const marked = await db.markOrderPaid({
        orderId, channel, transactionId, paidAt: settledAt,
      })
      if (!marked.ok) {
        // 并发下另一路已置 paid: 回读后重入, 由上面的"已发放"分支收口
        const fresh = await db.getOrder(orderId, user.openid)
        if (fresh && fresh.status !== 'pending') {
          return settlePaidOrder({ order: fresh, user, channel, transactionId, paidAt: fresh.paid_at })
        }
      }
    } else {
      order.status = 'paid'
      order.pay_channel = channel
      order.wx_transaction_id = transactionId
      order.paid_at = settledAt
      order.updated_at = nowWall
    }
  }

  // 计算并写入权益。
  // 补发场景(订单早已 paid)同样走这里, 但 now 传的是 settledAt 而非墙钟,
  // 于是 computeExpiresAt 复现出与首次结算完全一致的 expires_at。
  const { subscription: currentSub } = await subscriptionGetEffective(familyId)
  // 懒写的 free 占位不参与续期计算, 否则补发会被当成"首购"以外的分支干扰
  const baseSub = currentSub && currentSub.plan_type !== 'free' ? currentSub : null
  const expires_at = computeExpiresAt(order, baseSub, settledAt)
  const plan_type = sku.plan_type
  const started_at = baseSub ? (baseSub.started_at || settledAt) : settledAt

  let newSub
  if (usingCloudDb) {
    newSub = await db.upsertSubscription({
      familyId, openid: user.openid, plan_type, started_at, expires_at,
      source_order_id: orderId,
    })
  } else {
    // 一户一份: 删旧
    for (const [k, v] of memoryStore.subscriptions) {
      if (v && v.family_id === familyId) memoryStore.subscriptions.delete(k)
    }
    const id = 'sub_' + nowWall + '_' + Math.random().toString(36).slice(2, 6)
    newSub = {
      _id: id, family_id: familyId, openid: user.openid,
      plan_type, started_at, expires_at, source_order_id: orderId,
      created_at: nowWall, updated_at: nowWall,
    }
    memoryStore.subscriptions.set(id, newSub)
  }

  // 重读订单返回最新状态
  const updatedOrder = usingCloudDb
    ? await db.getOrder(orderId, user.openid)
    : memoryStore.orders.get(orderId)

  return {
    ok: true,
    order: updatedOrder || order,
    subscription: subscriptionSettleDto(newSub, nowWall),
  }
}

// ---------- orders.mockPay ----------
async function ordersMockPay(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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
    if (user.role !== 'owner') return requireOwner(user)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    if (user.role !== 'owner') return requireOwner(user)
  }

  // 读订单 (归属校验统一由 settlePaidOrder 兜底)
  let order
  if (usingCloudDb) {
    order = await db.getOrder(order_id, openid)
    if (!order) return fail(ERROR_CODE.FORBIDDEN, 'FORBIDDEN', '订单不属于当前用户')
  } else {
    const o = memoryStore.orders.get(order_id)
    if (!o) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '订单不存在')
    order = o
  }

  // 首次结算用当前时间; 重试时 order.paid_at 已存在, settlePaidOrder 会优先用它
  const settled = await settlePaidOrder({
    order,
    user: { openid, family_id: user.family_id },
    channel: 'mock',
    transactionId: 'MOCK_' + order_id,
    paidAt: Date.now(),
  })
  if (!settled.ok) return settled.error

  return ok({
    order: settled.order,
    subscription: settled.subscription,
  })
}

// ---------- share.getQrCode ----------
async function shareGetQrCode(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
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

// ============================================================
// Phase 10: 伴侣邀请
// ============================================================

// ---------- families.inviteCreate ----------
async function familiesInviteCreate(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  }
  const ownerErr = requireOwner(user); if (ownerErr) return ownerErr

  // 家庭已有伴侣（成员）时不能再生成邀请码（防绕过 UI）
  const members = await listFamilyMembers(user.family_id)
  if (members.length > 0) {
    return fail(ERROR_CODE.FAMILY_ALREADY_PAIRED, 'FAMILY_ALREADY_PAIRED', '伴侣已加入，无需再生成邀请码')
  }

  let invite
  if (usingCloudDb) {
    invite = await db.createFamilyInvite({ familyId: user.family_id, openid })
  } else {
    // 本地内存: 生成 8 位随机码
    const code = 'TEST' + Math.random().toString(36).slice(2, 6).toUpperCase()
    const now_ = Date.now()
    invite = {
      invite_code: code,
      family_id: user.family_id,
      created_by: openid,
      created_at: now_,
      expires_at: now_ + 24 * 3600 * 1000,
      used: false,
      used_by: null,
      used_at: null,
    }
    // 存到内存（模拟 DB 集合）
    const key = `invite_${code}`
    memoryStore.family_invites = memoryStore.family_invites || new Map()
    memoryStore.family_invites.set(key, invite)
  }

  return ok({
    invite_code: invite.invite_code,
    expires_at: invite.expires_at,
    family_id: invite.family_id,
  })
}

// ---------- families.inviteJoin ----------
async function familiesInviteJoin(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid
  const { invite_code } = payload || {}
  if (!invite_code || typeof invite_code !== 'string') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 invite_code')
  }

  // 先查邀请码（获取 family_id 用于后续幂等检查）
  let invite
  if (usingCloudDb) {
    invite = await db.getFamilyInvite(invite_code)
  } else {
    const key = `invite_${invite_code}`
    const m = memoryStore.family_invites || new Map()
    invite = m.get(key) || null
  }

  if (!invite) {
    return fail(ERROR_CODE.INVITE_NOT_FOUND, 'INVITE_NOT_FOUND', '邀请码无效或不存在')
  }

  // 查被邀请方用户信息（用于幂等检查 & 后续写入）
  let joinerUser
  if (usingCloudDb) {
    joinerUser = await db.getUserByOpenid(openid)
    if (!joinerUser) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  } else {
    joinerUser = memoryStore.users.get(openid)
    if (!joinerUser) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  }

  // 不能加入自己的家庭（在幂等检查之前，owner 用自己的码应报错而非"已是成员"）
  if (invite.created_by === openid) {
    return fail(ERROR_CODE.CANNOT_JOIN_OWN, 'CANNOT_JOIN_OWN', '您已经是该家庭的管理员，无需通过邀请码加入')
  }

  // 幂等：如果已是同一家庭的成员，直接返回成功（不检查 used/expired）
  if (joinerUser.family_id === invite.family_id) {
    return ok({ joined: true, already_member: true, family_id: invite.family_id })
  }

  // 幂等检查通过后再校验邀请码状态
  if (invite.expires_at && (typeof invite.expires_at === 'number' ? invite.expires_at : new Date(invite.expires_at).getTime()) < Date.now()) {
    return fail(ERROR_CODE.INVITE_EXPIRED, 'INVITE_EXPIRED', '邀请码已过期（24 小时有效）')
  }
  if (invite.used) {
    return fail(ERROR_CODE.INVITE_ALREADY_USED, 'INVITE_ALREADY_USED', '邀请码已被使用')
  }

  // 家庭已有伴侣（成员）时不能再加入（保持 owner + 1 伴侣不变量，防多邀请码绕过）
  const familyMembers = await listFamilyMembers(invite.family_id)
  if (familyMembers.length > 0) {
    return fail(ERROR_CODE.FAMILY_ALREADY_PAIRED, 'FAMILY_ALREADY_PAIRED', '该家庭已有伴侣加入，无法再加入')
  }

  // 如果已在另一个家庭且是 owner，检查是否有实际数据
  // 没有方案的 owner 是 bootstrap 自动创建的空家庭，允许加入对方家庭
  if (joinerUser.role === 'owner' && joinerUser.family_id !== invite.family_id) {
    let hasPlan = false
    if (usingCloudDb) {
      const p = await db.getActivePlan(joinerUser.family_id)
      hasPlan = !!p
    } else {
      hasPlan = !!findActivePlanLocal(joinerUser.family_id)
    }
    if (hasPlan) {
      return fail(ERROR_CODE.ALREADY_MEMBER, 'ALREADY_MEMBER',
        '您当前家庭已有预算方案，无法直接加入其他家庭。如需加入，请先注销当前账号。')
    }
    // 空家庭的 owner 可以加入，会自动切换为 member
  }

  // 执行加入
  if (usingCloudDb) {
    // 添加家庭成员记录
    await db.addFamilyMember({
      familyId: invite.family_id,
      openid,
      nickname: joinerUser.nickname || '',
      avatar: joinerUser.avatar || '',
      role: 'member',
    })
    // 更新用户记录
    await db.updateUserFamilyId(openid, invite.family_id, 'member')
    // 标记邀请已使用
    await db.markInviteUsed(invite_code, openid)
  } else {
    // 本地内存路径
    const fm = memoryStore.family_members = memoryStore.family_members || new Map()
    const memberKey = `${invite.family_id}_${openid}`
    fm.set(memberKey, {
      family_id: invite.family_id,
      openid,
      nickname: joinerUser.nickname || '',
      avatar: joinerUser.avatar || '',
      role: 'member',
      joined_at: Date.now(),
    })
    // 更新用户
    joinerUser.family_id = invite.family_id
    joinerUser.role = 'member'
    // 标记邀请
    invite.used = true
    invite.used_by = openid
    invite.used_at = Date.now()
  }

  return ok({ joined: true, family_id: invite.family_id })
}

// 列出某家庭所有成员（cloud 走 db，memory 遍历过滤）
async function listFamilyMembers(familyId) {
  if (usingCloudDb) {
    return await db.getFamilyMembers(familyId)
  }
  const fm = memoryStore.family_members || new Map()
  const members = []
  for (const [, v] of fm) {
    if (v && v.family_id === familyId) members.push(v)
  }
  return members
}

// ---------- families.getMembers ----------
async function familiesGetMembers(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  }

  let members = await listFamilyMembers(user.family_id)

  // 查找家庭真正的 owner（不能直接用调用者，因为 member 也会调用此接口）
  let owner = null
  if (usingCloudDb) {
    // 云端：查 family_members 中 role='owner' 的记录，或 users 表中同 family_id + role='owner'
    owner = await db.getFamilyOwner(user.family_id)
  } else {
    // 内存：遍历 users 找 role='owner' 且同 family_id
    // 注意: 内存 user 对象字段是 _openid（与云端 db 保持一致）, 不是 openid
    for (const [, u] of memoryStore.users) {
      if (u && u.family_id === user.family_id && u.role === 'owner') {
        owner = { openid: u._openid, nickname: u.nickname || '', avatar: u.avatar || '', role: 'owner' }
        break
      }
    }
  }
  if (!owner) {
    // 降级：用调用者信息（理论上不应发生）
    owner = { openid, nickname: user.nickname || '', avatar: user.avatar || '', role: user.role }
  }

  return ok({ owner, members })
}

// ---------- reviews.getMonthly (月末自动复盘) ----------
// 按 family_id 聚合指定月 entries，计算执行率 / 健康分 / 超支Top / 结余Top / 建议
async function reviewsGetMonthly(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid
  const { year, month } = payload || {}
  // 默认当前月；支持显式指定便于测试
  const now = new Date()
  const y = year ? Number(year) : now.getFullYear()
  const m = month ? Number(month) : now.getMonth() + 1
  if (!y || !m || m < 1 || m > 12) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', 'year/month 无效')
  }

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

  const monthLabel = `${m}月`
  const emptyRes = { has_data: false, month_label: monthLabel, metrics: null, overspend_top: [], surplus_top: [], suggestion: '' }

  if (!plan) return ok(emptyRes)

  // 聚合该月 entries
  let monthEntries
  if (usingCloudDb) {
    monthEntries = await db.getMonthlyEntries(user.family_id, y, m)
  } else {
    monthEntries = findMonthlyEntriesLocal(user.family_id, y, m)
  }

  const usedByCat = { food: 0, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
  for (const e of monthEntries) {
    for (const k of Object.keys(usedByCat)) {
      usedByCat[k] += Number((e.categories && e.categories[k]) || 0)
    }
  }

  // 每类: used / suggested / pct(未截断, 保留真实超支比例)
  const catStats = (plan.categories || []).map((c) => {
    const used = usedByCat[c.id] || 0
    const suggested = c.suggested || 0
    const pctRaw = suggested > 0 ? Math.round((used / suggested) * 100) : 0
    return { id: c.id, name: c.name, suggested, used, pct: pctRaw }
  })

  // 只统计有预算的分类
  const activeCats = catStats.filter((c) => c.suggested > 0)
  const totalUsed = catStats.reduce((s, c) => s + c.used, 0)
  const totalSuggested = catStats.reduce((s, c) => s + c.suggested, 0)
  // 无方案分类或无任何支出 → 无数据可复盘（空态引导去记账）
  if (!activeCats.length || totalUsed <= 0) return ok(emptyRes)

  const overspend = activeCats
    .filter((c) => c.used > c.suggested)
    .map((c) => ({ id: c.id, name: c.name, pct: c.pct, over: c.used - c.suggested }))
    .sort((a, b) => b.over - a.over)
  const surplus = activeCats
    .filter((c) => c.used < c.suggested)
    .map((c) => ({ id: c.id, name: c.name, pct: c.pct, save: c.suggested - c.used }))
    .sort((a, b) => b.save - a.save)

  // 执行率 = 未超支分类占比
  const okCats = activeCats.filter((c) => c.used <= c.suggested).length
  const executionRate = Math.round((okCats / activeCats.length) * 100)

  // 健康分: 100 起，每超支一类扣 15，超 130% 再扣 5，下限 0
  let score = 100
  for (const c of overspend) {
    score -= 15
    if (c.pct > 130) score -= 5
  }
  const healthScore = Math.max(0, score)

  // 上月健康分（对比展示: "78→82"）
  let prevScore = null
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  let prevEntries = []
  if (usingCloudDb) {
    prevEntries = await db.getMonthlyEntries(user.family_id, prevY, prevM)
  } else {
    prevEntries = findMonthlyEntriesLocal(user.family_id, prevY, prevM)
  }
  if (prevEntries.length) {
    const prevUsed = { food: 0, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
    for (const e of prevEntries) {
      for (const k of Object.keys(prevUsed)) prevUsed[k] += Number((e.categories && e.categories[k]) || 0)
    }
    let ps = 100
    for (const c of activeCats) {
      const p = (prevUsed[c.id] || 0)
      if (p > c.suggested) {
        ps -= 15
        if (c.suggested > 0 && Math.round((p / c.suggested) * 100) > 130) ps -= 5
      }
    }
    prevScore = Math.max(0, ps)
  }

  // 建议文案
  let suggestion = ''
  if (overspend.length) {
    const top = overspend[0]
    suggestion = `「${top.name}」本月超支 ¥${top.over}，建议下月下调该分类预算，或拆分到每周记账控制。`
    if (surplus.length) {
      const sv = surplus[0]
      suggestion += `「${sv.name}」结余 ¥${sv.save}，可转入备育储备或用于家庭奖励。`
    }
  } else {
    suggestion = `本月 ${activeCats.length} 类预算全部在控，执行率 ${executionRate}%，继续保持！`
  }

  return ok({
    has_data: true,
    month_label: monthLabel,
    metrics: {
      execution_rate: executionRate,
      health_score: healthScore,
      prev_health_score: prevScore,
      total_used: totalUsed,
      total_suggested: totalSuggested,
    },
    overspend_top: overspend.slice(0, 3),
    surplus_top: surplus.slice(0, 3),
    suggestion,
  })
}

// ---------- actions.getStatus / actions.saveStatus (Phase 10: 行动清单写库) ----------
// 采纳状态按 family_id 共享：owner 与 member 都可读写（家庭协作）
async function actionsGetStatus(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  }

  const statuses = {}
  if (usingCloudDb) {
    const list = await db.getActionStatuses(user.family_id)
    for (const s of list) statuses[s.rec_id] = s.status
  } else {
    const m = memoryStore.action_statuses || new Map()
    for (const [, v] of m) {
      if (v && v.family_id === user.family_id) statuses[v.rec_id] = v.status
    }
  }
  return ok({ statuses })
}

async function actionsSaveStatus(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid
  const { rec_id, status } = payload || {}

  if (!rec_id || typeof rec_id !== 'string') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 rec_id')
  }
  const VALID_STATUS = ['accepted', 'later', 'ignored']
  if (!VALID_STATUS.includes(status)) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', 'status 无效（accepted/later/ignored）')
  }

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    await db.setActionStatus({ familyId: user.family_id, recId: rec_id, status })
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    const m = memoryStore.action_statuses = memoryStore.action_statuses || new Map()
    m.set(`${user.family_id}_${rec_id}`, {
      family_id: user.family_id,
      rec_id,
      status,
      updated_at: Date.now(),
    })
  }
  return ok({ rec_id, status })
}

// ---------- subscribe.* (Phase 10: 订阅消息推送) ----------
// 模板 ID 配置: 优先 app_config['subscribe_weekly_template_id'], 缺省用常量占位。
// 真实 ID 需在小程序后台申请订阅消息模板后配置。
const DEFAULT_WEEKLY_TMPL_ID = '' // 留空 = 未配置

async function getWeeklyTemplateId() {
  if (usingCloudDb) {
    const v = await db.getAppConfig('subscribe_weekly_template_id')
    return v || DEFAULT_WEEKLY_TMPL_ID
  }
  const v = memoryStore.app_config && memoryStore.app_config.get('subscribe_weekly_template_id')
  return (v && v.value) || DEFAULT_WEEKLY_TMPL_ID
}

// 真实推送（云函数环境）；内存路径模拟成功
async function sendSubscribeMessage({ openid, templateId, page, data }) {
  if (usingCloudDb && cloud && cloud.openapi && cloud.openapi.subscribeMessage) {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page: page || 'pages/dashboard/index',
      data: data || {},
      miniprogramState: 'formal',
    })
  }
  // 本地内存: 模拟发送成功
}

// subscribe.record: 前端授权成功后上报（配额 +1）
async function subscribeRecord(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid
  const { template_id } = payload || {}
  if (!template_id || typeof template_id !== 'string') {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 template_id')
  }

  let user
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    const rec = await db.incSubscribeQuota({ openid, familyId: user.family_id, templateId: template_id })
    return ok({ template_id: template_id, quota: rec.quota, total: rec.total })
  }
  user = memoryStore.users.get(openid)
  if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
  const key = `${openid}_${template_id}`
  const m = memoryStore.subscribe_records = memoryStore.subscribe_records || new Map()
  const prev = m.get(key)
  const rec = prev
    ? { ...prev, quota: prev.quota + 1, total: (prev.total || 0) + 1, updated_at: Date.now() }
    : { openid, family_id: user.family_id, template_id: template_id, quota: 1, total: 1, created_at: Date.now(), updated_at: Date.now() }
  m.set(key, rec)
  return ok({ template_id: template_id, quota: rec.quota, total: rec.total })
}

// subscribe.getStatus: 查询当前订阅状态（模板、剩余配额）
async function subscribeGetStatus(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid
  const configured = await getWeeklyTemplateId()

  const records = []
  if (usingCloudDb) {
    // 按已配置模板查当前用户记录
    if (configured) {
      const rec = await db.getSubscribeRecord(openid, configured)
      if (rec) records.push({ template_id: rec.template_id, quota: rec.quota || 0, total: rec.total || 0, updated_at: rec.updated_at })
    }
  } else {
    const m = memoryStore.subscribe_records || new Map()
    for (const [, v] of m) {
      if (v && v.openid === openid) records.push({ template_id: v.template_id, quota: v.quota, total: v.total, updated_at: v.updated_at })
    }
  }
  return ok({ configured: !!configured, records })
}

// subscribe.send: 主动推送一条给指定 openid（默认自己），成功后扣配额
async function subscribeSend(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const { openid, template_id, page, data } = payload || {}
  const target = openid || ctx.openid
  const templateId = template_id || (await getWeeklyTemplateId())
  if (!templateId || typeof templateId !== 'string') {
    return fail(ERROR_CODE.SUBSCRIBE_NOT_CONFIGURED, 'SUBSCRIBE_NOT_CONFIGURED', '订阅消息模板未配置')
  }

  // 校验目标用户有配额
  let quotaOk = false
  let remaining = 0
  if (usingCloudDb) {
    const rec = await db.getSubscribeRecord(target, templateId)
    if (rec && (rec.quota || 0) > 0) quotaOk = true
  } else {
    const m = memoryStore.subscribe_records || new Map()
    const rec = m.get(`${target}_${templateId}`)
    if (rec && rec.quota > 0) quotaOk = true
  }
  if (!quotaOk) {
    return fail(ERROR_CODE.SUBSCRIBE_QUOTA_EXHAUSTED, 'SUBSCRIBE_QUOTA_EXHAUSTED', '订阅配额已用完，请重新订阅')
  }

  await sendSubscribeMessage({ openid: target, templateId, page, data })

  // 扣配额
  if (usingCloudDb) {
    const r = await db.decrementSubscribeQuota(target, templateId)
    remaining = r ? r.quota : 0
  } else {
    const m = memoryStore.subscribe_records || new Map()
    const rec = m.get(`${target}_${templateId}`)
    rec.quota -= 1
    remaining = rec.quota
  }
  return ok({ sent: true, openid: target, template_id: templateId, remaining })
}

// subscribe.remindWeekly: 给所有订阅了周提醒模板的用户批量推送（供定时触发器调用）
async function subscribeRemindWeekly(ctx, payload) {
  const templateId = await getWeeklyTemplateId()
  if (!templateId) {
    return fail(ERROR_CODE.SUBSCRIBE_NOT_CONFIGURED, 'SUBSCRIBE_NOT_CONFIGURED', '订阅消息模板未配置')
  }

  const targets = []
  if (usingCloudDb) {
    const list = await db.getSubscribeRecordsByTemplate(templateId)
    for (const r of list) {
      if ((r.quota || 0) > 0) targets.push({ openid: r.openid, templateId: r.template_id, quota: r.quota })
    }
  } else {
    const m = memoryStore.subscribe_records || new Map()
    for (const [, v] of m) {
      if (v && v.template_id === templateId && v.quota > 0) targets.push({ openid: v.openid, templateId: v.template_id, quota: v.quota })
    }
  }

  let sent = 0
  for (const t of targets) {
    try {
      await sendSubscribeMessage({
        openid: t.openid,
        templateId: t.templateId,
        page: 'pages/weekly/index',
        data: { thing1: { value: '本周支出待填写' }, time2: { value: '周日 20:00 前' } },
      })
      if (usingCloudDb) await db.decrementSubscribeQuota(t.openid, t.templateId)
      else {
        const m = memoryStore.subscribe_records || new Map()
        const rec = m.get(`${t.openid}_${t.templateId}`)
        if (rec) rec.quota -= 1
      }
      sent++
    } catch (e) {
      console.error('[subscribe.remindWeekly] send failed:', e && (e.errMsg || e.message))
    }
  }
  return ok({ template_id: templateId, targeted: targets.length, sent })
}

// ---------- analytics.track (Phase 10: 埋点系统) ----------
// 不强制登录：落地页等未登录场景也埋点，openid 尽力而为（来自 WXContext）。
// 防滥用：单次 ≤20 条；event 名 ≤64 字符；data 须可 JSON 序列化且 ≤4KB。
async function analyticsTrack(ctx, payload) {
  const { events } = payload || {}
  if (!Array.isArray(events) || events.length === 0) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 events 数组')
  }
  if (events.length > 20) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '单次最多 20 条')
  }

  const openid = (ctx && ctx.openid) || ''
  const accepted = []
  for (const raw of events) {
    const name = raw && raw.event
    if (!name || typeof name !== 'string') continue
    let data = {}
    try {
      const s = JSON.stringify(raw.data || {})
      if (s.length <= 4096) data = raw.data || {}
    } catch (e) { /* data 不可序列化 → 空对象 */ }
    accepted.push({
      openid: (raw.openid || openid || '').slice(0, 64),
      event: name.slice(0, 64),
      data,
      page: String(raw.page || '').slice(0, 128),
      platform: String(raw.platform || '').slice(0, 32),
      client_ts: Number(raw.ts) || Date.now(),
    })
  }
  if (!accepted.length) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '无有效事件')
  }

  if (usingCloudDb) {
    await db.insertAnalyticsEvents(accepted)
  } else {
    const m = memoryStore.analytics_events = memoryStore.analytics_events || new Map()
    for (const ev of accepted) {
      const id = `${ev.client_ts}_${Math.random().toString(36).slice(2, 8)}`
      m.set(id, { ...ev, created_at: Date.now() })
    }
  }
  return ok({ accepted: accepted.length })
}

// ---------- users.exportData (Phase 9: 数据可携带权) ----------
async function usersExportData(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  if (usingCloudDb) {
    const data = await db.exportUserData(openid)
    if (!data) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '用户数据不存在')
    return ok(data)
  }

  // 本地内存路径
  const user = memoryStore.users.get(openid)
  if (!user) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '用户数据不存在')
  const familyId = user.family_id

  const family = memoryStore.families.get(familyId) || null
  const plans = []
  for (const [, v] of memoryStore.budget_plans) {
    if (v && v.family_id === familyId) plans.push(v)
  }
  const entries = []
  for (const [, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId) entries.push(v)
  }
  const profile = memoryStore.financial_profiles.get(familyId) || null
  let sub = null
  for (const [, v] of memoryStore.subscriptions) {
    if (v && v.family_id === familyId) { sub = v; break }
  }

  return ok({
    exported_at: new Date().toISOString(),
    user: { nickname: user.nickname, avatar: user.avatar, role: user.role, created_at: user.created_at },
    family: family ? { name: family.name, stage: family.stage, city: family.city, created_at: family.created_at } : null,
    plans: plans.map(p => ({
      version: p.version, health_score: p.health_score, risk_level: p.risk_level,
      is_active: p.is_active, activated_at: p.activated_at,
      monthly_summary: p.monthly_summary, categories: p.categories,
      baby_reserve: p.baby_reserve, recommendations: p.recommendations,
      created_at: p.created_at,
    })),
    entries: entries.map(e => ({
      week_start: e.week_start, week_end: e.week_end,
      categories: e.categories, total: e.total, created_at: e.created_at,
    })),
    profile,
    subscription: sub ? { plan_type: sub.plan_type, started_at: sub.started_at, expires_at: sub.expires_at } : null,
  })
}

// ---------- users.deleteMe (Phase 9: 账号注销) ----------
async function usersDeleteMe(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  if (usingCloudDb) {
    const result = await db.deleteUserData(openid)
    if (!result.deleted) {
      return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', result.reason || '用户不存在')
    }
    return ok({ deleted: true })
  }

  // 本地内存路径: 级联清
  const user = memoryStore.users.get(openid)
  if (!user) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '用户不存在')
  const familyId = user.family_id

  // 删 entries
  for (const [k, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId) memoryStore.weekly_entries.delete(k)
  }
  // 删 plans
  for (const [k, v] of memoryStore.budget_plans) {
    if (v && v.family_id === familyId) memoryStore.budget_plans.delete(k)
  }
  // 删 profile
  memoryStore.financial_profiles.delete(familyId)
  // 删 subscription
  for (const [k, v] of memoryStore.subscriptions) {
    if (v && v.family_id === familyId) memoryStore.subscriptions.delete(k)
  }
  // 删 orders
  for (const [k, v] of memoryStore.orders) {
    if (v && v.openid === openid) memoryStore.orders.delete(k)
  }
  // 删 family
  memoryStore.families.delete(familyId)
  // 删 user
  memoryStore.users.delete(openid)

  return ok({ deleted: true })
}

// ============================================================
// 帮助与反馈
// ============================================================

const FEEDBACK_TYPES = new Set(['suggestion', 'bug', 'other'])
const FEEDBACK_RATE_WINDOW_MS = 60 * 1000
const FEEDBACK_RATE_MAX = 3
/** 进程内限流：key -> 时间戳数组 */
const feedbackRateBuckets = new Map()

function checkFeedbackRateLimit(key) {
  const now = Date.now()
  const list = (feedbackRateBuckets.get(key) || []).filter((t) => now - t < FEEDBACK_RATE_WINDOW_MS)
  if (list.length >= FEEDBACK_RATE_MAX) {
    feedbackRateBuckets.set(key, list)
    return false
  }
  list.push(now)
  feedbackRateBuckets.set(key, list)
  return true
}

async function feedbackSubmit(ctx, payload) {
  const openid = (ctx && (ctx.openid || ctx.OPENID)) || null
  const { type, content, contact, client_meta } = payload || {}

  if (!FEEDBACK_TYPES.has(type)) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '请选择反馈类型')
  }
  const text = typeof content === 'string' ? content.trim() : ''
  if (text.length < 10) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '再多写一点')
  }
  if (text.length > 500) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '内容太长')
  }
  const contactText = typeof contact === 'string' ? contact.trim() : ''
  if (contactText.length > 50) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '联系方式太长')
  }

  const rateKey = openid || 'anon'
  if (!checkFeedbackRateLimit(rateKey)) {
    return fail(ERROR_CODE.RATE_LIMITED, 'RATE_LIMITED', '提交太频繁，稍后再试')
  }

  const meta = client_meta && typeof client_meta === 'object' ? client_meta : {}

  try {
    if (usingCloudDb) {
      const doc = await db.createFeedback({
        openid,
        type,
        content: text,
        contact: contactText,
        client_meta: meta,
      })
      return ok({ id: doc._id })
    }

    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const doc = {
      _id: id,
      openid,
      type,
      content: text,
      contact: contactText,
      client_meta: meta,
      created_at: Date.now(),
      status: 'new',
    }
    memoryStore.feedbacks.set(id, doc)
    return ok({ id })
  } catch (e) {
    console.error('[feedback.submit]', e && (e.errMsg || e.message || e), e)
    const msg = String((e && (e.errMsg || e.message)) || '')
    if (/COLLECTION_NOT_EXIST|collection not exist|Db or Table not exist/i.test(msg)) {
      return fail(
        ERROR_CODE.INTERNAL_ERROR,
        'INTERNAL_ERROR',
        '反馈库未就绪，请在云开发控制台创建集合 feedbacks 后重试'
      )
    }
    return fail(ERROR_CODE.INTERNAL_ERROR, 'INTERNAL_ERROR', '提交失败，请稍后重试')
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
  // Phase 9 数据可携带 & 注销
  'users.exportData': usersExportData,
  'users.deleteMe': usersDeleteMe,
  // Phase 10 伴侣邀请
  'families.inviteCreate': familiesInviteCreate,
  'families.inviteJoin': familiesInviteJoin,
  'families.getMembers': familiesGetMembers,
  // Phase 10 月末自动复盘
  'reviews.getMonthly': reviewsGetMonthly,
  // Phase 10 行动清单写库
  'actions.getStatus': actionsGetStatus,
  'actions.saveStatus': actionsSaveStatus,
  // Phase 10 订阅消息推送
  'subscribe.record': subscribeRecord,
  'subscribe.getStatus': subscribeGetStatus,
  'subscribe.send': subscribeSend,
  'subscribe.remindWeekly': subscribeRemindWeekly,
  // Phase 10 埋点系统
  'analytics.track': analyticsTrack,
  // 帮助与反馈
  'feedback.submit': feedbackSubmit,
  // 纯函数导出 (供测试)
  calcEntitlements,
  computeExpiresAt,
  SKU_CATALOG,
  // 安全审计 (供测试)
  requireAuth,
  requireOwner,
  // 结算边界: 后续真实支付回调 (payNotify) 复用同一入口, 不再重写权益逻辑
  settlePaidOrder,
  _resetMemory() {
    memoryStore.users.clear()
    memoryStore.families.clear()
    memoryStore.financial_profiles.clear()
    memoryStore.budget_plans.clear()
    memoryStore.weekly_entries.clear()
    memoryStore.subscriptions.clear()
    memoryStore.orders.clear()
    memoryStore.app_config.clear()
    memoryStore.family_invites.clear()
    memoryStore.family_members.clear()
    memoryStore.action_statuses.clear()
    memoryStore.subscribe_records.clear()
    memoryStore.analytics_events.clear()
    memoryStore.feedbacks.clear()
    feedbackRateBuckets.clear()
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
  /** 测试用: 只清订阅表, 模拟"订单已 paid 但权益丢失" */
  _clearSubscriptions() {
    memoryStore.subscriptions.clear()
  },
  /** 测试用: 列出 memoryStore 反馈 */
  _allFeedbacks() {
    return Array.from(memoryStore.feedbacks.values())
  },
  /** 测试用: 种入 app_config（如订阅消息模板 ID） */
  _seedAppConfig(key, value) {
    memoryStore.app_config.set(key, { key, value, updated_at: Date.now() })
    return { key, value }
  },
  /** 测试用: 列出全部埋点事件（断言写入） */
  _allAnalyticsEvents() {
    return Array.from(memoryStore.analytics_events.values())
  },
}