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
    for (const [k, v] of memoryStore.budget_plans) {
      if (v && v.family_id === user.family_id && v.is_active) {
        plan = v; break
      }
    }
  }

  return ok({ plan: plan || null })
}

module.exports = {
  'cities.list': citiesList,
  'calc.quick': calcQuick,
  'calc.full': calcFull,
  'user.bootstrap': userBootstrap,
  'plans.save': plansSave,
  'plans.getActive': plansGetActive,
  _resetMemory() {
    memoryStore.users.clear()
    memoryStore.families.clear()
    memoryStore.financial_profiles.clear()
    memoryStore.budget_plans.clear()
  },
}