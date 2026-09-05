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
const dateUtil = require('../common/date')
const planRecalc = require('../common/plan-recalc')

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

// 注意：本地测试路径下 db 为 null，因为 handlers 里大量分支是
// `if (db) { 云端 } else { 内存 }` 这种真值判断，而非 if (usingCloudDb)。
// 纯函数（不碰库）一律放 common/plan-recalc.js，由 handlers 直接 require，
// 避免"云端/内存两条路径各写一份逻辑导致本地通过、线上不一致"。
const db = usingCloudDb ? require('../common/db') : null

// 本地内存 store (单测/探针)
const memoryStore = {
  users: new Map(),
  families: new Map(),
  financial_profiles: new Map(),
  budget_plans: new Map(),
  weekly_entries: new Map(),
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

  return ok({
    user,
    family_id: user.family_id,
    activePlan,
  })
}

// ---------- plans.save (Phase 6) ----------
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
      // 必须与云端 db.savePlan 保持同构：缺了 plan_input 就无法重算，
      // 缺了 engine_version 就无法识别旧版本方案，本地测试也就覆盖不到迁移逻辑。
      engine_version: planOutput.engine_version || planRecalc.ENGINE_VERSION,
      health_score: planOutput.health_score,
      risk_level: planOutput.risk_level,
      is_active: true,
      monthly_summary: planOutput.monthly_summary,
      categories: planOutput.categories,
      baby_reserve: planOutput.baby_reserve,
      recommendations: planOutput.recommendations || [],
      risk_report: planOutput.risk_report,
      plan_input: planInput || null,
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

  return ok({
    plan: ensureRecommendations(plan) || null,
    // 旧引擎生成的方案标记为 stale，提示需要重算（不在此处自动重算，
    // 避免读接口带写副作用；正式迁移走 scripts/recalc-plans.js）
    stale: isPlanStale(plan),
  })
}

// ---------- plans.recalc（按当前引擎重算存量方案）----------
/**
 * 用当前引擎重算当前生效方案并落库。
 *
 * 与 scripts/recalc-plans.js 共用 db.computePlanUpdate()，口径一致。
 * 需要 owner 权限：重算会覆盖方案的派生字段。
 */
async function plansRecalc(ctx, payload) {
  const authErr = requireAuth(ctx); if (authErr) return authErr
  const openid = ctx.openid

  let user, plan
  if (usingCloudDb) {
    user = await db.getUserByOpenid(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    const ownerErr = requireOwner(user); if (ownerErr) return ownerErr
    plan = await db.getActivePlan(user.family_id)
  } else {
    user = memoryStore.users.get(openid)
    if (!user) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先 user.bootstrap')
    const ownerErr = requireOwner(user); if (ownerErr) return ownerErr
    plan = findActivePlanLocal(user.family_id)
  }

  if (!plan) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '当前没有生效的预算方案')
  if (!plan.plan_input) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '该方案缺少原始输入，无法重算，请重新测算')
  }

  if (usingCloudDb) {
    const updated = await db.recalcAndPersistPlan(plan._id)
    if (!updated) {
      return fail(ERROR_CODE.ENGINE_ERROR, 'ENGINE_ERROR', '重算失败，请稍后重试')
    }
    return ok({ plan: ensureRecommendations(updated), stale: false })
  }

  // 内存路径：与云端、迁移脚本共用 planRecalc.computePlanUpdate，只是写到 memoryStore
  const update = planRecalc.computePlanUpdate(plan)
  if (!update) return fail(ERROR_CODE.ENGINE_ERROR, 'ENGINE_ERROR', '重算失败，请稍后重试')
  const merged = { ...plan, ...update }
  memoryStore.budget_plans.set(plan._id, merged)
  return ok({ plan: ensureRecommendations(merged), stale: false })
}

// ---------- helpers (Phase 7) ----------
function colorOf(pct) {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

/**
 * 储蓄/储备类进度配色。
 * 与 colorOf 相反：colorOf 用于「已花占比」（越高越危险），
 * 本函数用于「目标完成度」（越高越好）。
 */
function progressColorOf(pct) {
  if (pct >= 100) return 'green'
  if (pct >= 70) return 'yellow'
  return 'red'
}

// 把 plan.baby_reserve 原始 shape 转成前端可直读 shape
// 原始: { target, current, monthlyRequired, monthsRemaining, monthlyIncrement, oneTimeChildbirth, pressureRatio }
// 附加: pct, color
function shapeBabyReserve(br) {
  if (!br || !br.target || br.target <= 0) return null
  const pct = Math.min(100, Math.round((br.current / br.target) * 100))
  return { ...br, pct, color: colorOf(pct) }
}

/**
 * 兜底：旧数据 recommendations 为空时，补一条正向维持建议，避免行动清单空态。
 *
 * **纯函数，不修改入参**（历史实现直接 mutate 传入的 plan，
 * 调用方拿到的对象被悄悄改掉，排查困难）。返回新对象。
 *
 * 注意：这里只在内存中补齐展示，不落库。存量数据的持久化重算
 * 走 scripts/recalc-plans.js 或 plans.recalc。
 */
function ensureRecommendations(plan) {
  if (!plan) return plan
  if (plan.recommendations && plan.recommendations.length) return plan
  const score = plan.health_score || 0
  const healthy = score >= 80
  return {
    ...plan,
    recommendations: [{
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
    }],
  }
}

/**
 * 判断方案是否由旧版引擎生成（供前端/运维识别待迁移数据）
 */
function isPlanStale(plan) {
  return planRecalc.isPlanStale(plan)
}

function isoWeekRange(d = new Date()) {
  // ISO 周一。日期一律走 common/date，避免 toISOString 的 UTC 偏移
  // （历史 BUG：UTC+8 下算出周日而非周一，且月份聚合边界错位一天）
  return dateUtil.weekRange(d)
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

// 本地 helper: 与目标月份【有重叠】的 entries
// 与 db.getMonthOverlappingEntries 保持一致：向左放宽 7 天，
// 让 week_start 在上月月末、但周内含本月日期的记录也能被分摊。
function findMonthlyEntriesLocal(familyId, year, month) {
  const { start: firstDay, nextStart: nextFirst } = dateUtil.monthFilter(year, month)
  const lowerBound = shiftDateString(firstDay, -7)
  const out = []
  for (const [, v] of memoryStore.weekly_entries) {
    if (v && v.family_id === familyId && v.week_start >= lowerBound && v.week_start < nextFirst) {
      out.push(v)
    }
  }
  return out
}

/** 'YYYY-MM-DD' 平移 N 天（本地内存路径用） */
function shiftDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return dateUtil.toDateString(new Date(Date.UTC(y, m - 1, d) + days * 86400000))
}

/**
 * 把周记账按"落在目标月内的天数比例"分摊累加到 usedByCat。
 *
 * 跨月周若整周归属单一月份，会让相邻月份各有一天数区间的支出"凭空消失"
 * 或"重复计入"。按天比例分摊是近似（假设周内日均支出均匀），
 * 但在无逐日流水的前提下是最合理的口径。
 */
function accumulateEntriesByDayShare(monthEntries, year, month) {
  const usedByCat = { food: 0, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
  for (const e of monthEntries) {
    const days = dateUtil.daysOfWeekInMonth(e.week_start, year, month)
    if (days <= 0) continue
    const ratio = days / 7
    for (const k of Object.keys(usedByCat)) {
      usedByCat[k] += Number((e.categories && e.categories[k]) || 0) * ratio
    }
  }
  // 分摊会产生小数，统一在此取整，避免各调用点口径不一
  for (const k of Object.keys(usedByCat)) {
    usedByCat[k] = Math.round(usedByCat[k])
  }
  return usedByCat
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
      // 未启用追踪：无填报数据，actual 为 null（前端提示「启用追踪后可见」）
      savings: {
        actual: null,
        target: Number((plan.monthly_summary && plan.monthly_summary.savings_target) || 0),
        pct: null,
        color: null,
      },
      baby_reserve: babyComputed,
    })
  }

  // activated=true: 聚合本月 entries（跨月周按天比例分摊）
  const now = new Date()
  const { year: curYear, month: curMonth } = dateUtil.monthRange(now)
  let monthEntries
  if (usingCloudDb) {
    monthEntries = await db.getMonthOverlappingEntries(user.family_id, curYear, curMonth)
  } else {
    monthEntries = findMonthlyEntriesLocal(user.family_id, curYear, curMonth)
  }

  const usedByCat = accumulateEntriesByDayShare(monthEntries, curYear, curMonth)

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
    // 本月实际储蓄 = 收入 − 固定支出 − 本月已填报支出
    // 未启用追踪时无填报数据，actual 返回 null，前端应提示「启用追踪后可见」，
    // 不能退化为 0——那会把全部可支配收入谎报成已储蓄。
    savings: computeSavings(plan, totalUsed),
    baby_reserve: babyComputed,
  })
}

/**
 * 本月储蓄进度
 * @param {object} plan - 含 monthly_summary
 * @param {number} spentThisMonth - 本月已填报支出合计
 * @returns {{actual: number|null, target: number, pct: number|null, color: string|null}}
 */
function computeSavings(plan, spentThisMonth) {
  const ms = (plan && plan.monthly_summary) || {}
  const target = Number(ms.savings_target) || 0
  const actual = Math.max(
    0,
    Math.round((Number(ms.income) || 0) - (Number(ms.fixed_expense) || 0) - (Number(spentThisMonth) || 0))
  )
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null
  return { actual, target, pct, color: pct === null ? null : progressColorOf(pct) }
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

  // 聚合该月 entries（跨月周按天比例分摊）
  let monthEntries
  if (usingCloudDb) {
    monthEntries = await db.getMonthOverlappingEntries(user.family_id, y, m)
  } else {
    monthEntries = findMonthlyEntriesLocal(user.family_id, y, m)
  }

  const usedByCat = accumulateEntriesByDayShare(monthEntries, y, m)

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
    prevEntries = await db.getMonthOverlappingEntries(user.family_id, prevY, prevM)
  } else {
    prevEntries = findMonthlyEntriesLocal(user.family_id, prevY, prevM)
  }
  if (prevEntries.length) {
    const prevUsed = accumulateEntriesByDayShare(prevEntries, prevY, prevM)
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
  'plans.recalc': plansRecalc,
  'dashboard.get': dashboardGet,
  'weekly.getCurrent': weeklyGetCurrent,
  'weekly.submit': weeklySubmit,
  'weekly.copyLastWeek': weeklyCopyLastWeek,
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
  // 安全审计 (供测试)
  requireAuth,
  requireOwner,
  _resetMemory() {
    memoryStore.users.clear()
    memoryStore.families.clear()
    memoryStore.financial_profiles.clear()
    memoryStore.budget_plans.clear()
    memoryStore.weekly_entries.clear()
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
  /** 测试用: 列出 memoryStore 反馈 */
  _allFeedbacks() {
    return Array.from(memoryStore.feedbacks.values())
  },
  /** 测试用: 列出 memoryStore 预算方案（校验读接口是否为纯读） */
  _allPlans() {
    return Array.from(memoryStore.budget_plans.values())
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