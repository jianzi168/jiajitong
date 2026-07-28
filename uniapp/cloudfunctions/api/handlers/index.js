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

  return ok({
    user,
    family_id: user.family_id,
    subscription: { plan_type: 'free', expires_at: null },
    activePlan,
  })
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
      _id: 'plan_' + Date.now(),
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
  _resetMemory() {
    memoryStore.users.clear()
    memoryStore.families.clear()
    memoryStore.financial_profiles.clear()
    memoryStore.budget_plans.clear()
    memoryStore.weekly_entries.clear()
  },
  _seedWeeklyEntry(entry) {
    const id = entry._id || `seed_w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const stored = { _id: id, ...entry }
    memoryStore.weekly_entries.set(id, stored)
    return stored
  },
}