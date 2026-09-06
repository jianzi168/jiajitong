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

const dateUtil = require('./date')
const { ENGINE_VERSION, STAGE_SHARE_MODIFIERS } = require('./engine/constants')

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

// 家庭阶段取值白名单 —— 与引擎口径同源，避免前端传引擎不认识的值入库
const FAMILY_STAGES = Object.keys(STAGE_SHARE_MODIFIERS)

/**
 * 更新家庭档案（家庭名 / 阶段 / 城市）
 *
 * 城市等级与「是否估算」一律在服务端由城市名推导，不信任客户端传值 ——
 * 否则客户端可以写入与城市不匹配的 tier，污染测算基准。
 *
 * @throws {Error} EMPTY_FAMILY_NAME | INVALID_STAGE
 */
async function updateFamilyProfile(familyId, { name, stage, city } = {}) {
  const db = getDB()
  const update = { updated_at: now() }

  if (name !== undefined) {
    const trimmed = String(name == null ? '' : name).trim().slice(0, 40)
    if (!trimmed) {
      const e = new Error('EMPTY_FAMILY_NAME'); e.code = 'EMPTY_FAMILY_NAME'; throw e
    }
    update.name = trimmed
  }

  if (stage !== undefined) {
    if (!FAMILY_STAGES.includes(stage)) {
      const e = new Error('INVALID_STAGE'); e.code = 'INVALID_STAGE'; throw e
    }
    update.stage = stage
  }

  if (city !== undefined) {
    const trimmed = String(city == null ? '' : city).trim()
    if (!trimmed) {
      const e = new Error('EMPTY_CITY'); e.code = 'EMPTY_CITY'; throw e
    }
    const benchmarkData = require('../benchmark-data')
    const cityObj = benchmarkData.getCityByName(trimmed)
    update.city = trimmed
    update.city_tier = cityObj ? cityObj.tier : 'tier2'
    update.city_estimated = !cityObj
  }

  await db.collection('families').doc(familyId).update({ data: update })
  return { _id: familyId, ...update }
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
  // 继承上一版启用态：重新测算换版本时不应要求用户再次「启用追踪」
  const prev = await getActivePlan(familyId)
  const prevActivatedAt = (prev && prev.activated_at) ? prev.activated_at : null

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
    // 引擎版本：缺则说明是升级前存的旧方案，迁移脚本据此定位
    engine_version: planOutput.engine_version || ENGINE_VERSION,
    health_score: planOutput.health_score,
    risk_level: planOutput.risk_level,
    is_active: true,
    monthly_summary: planOutput.monthly_summary || null,
    categories: planOutput.categories || [],
    baby_reserve: planOutput.baby_reserve || null,
    recommendations: planOutput.recommendations || [],
    risk_report: planOutput.risk_report || null,
    plan_input: planInput || null,
    created_at: now_,
    // 首次由 activatePlan 写入；已启用则随版本继承
    activated_at: prevActivatedAt,
  }
  await db.collection('budget_plans').doc(id).set({ data })
  await stripPlanInputFromSuperseded(familyId)
  return { _id: id, ...data }
}

/**
 * 数据最小化：清掉该家庭「已被取代的旧方案」的原始输入（收入/支出明细）。
 *
 * plan_input 只在重算时需要，而重算只作用于当前生效方案；
 * 历史版本仅用于回看，保留测算结果即可。这样能减少敏感数据留存面
 * （见开发计划 §2.5）。
 *
 * **关键约束：只清 engine_version 已是当前版本的方案。**
 * 旧版本方案仍需 plan_input 供 scripts/recalc-plans.js 重算 ——
 * 若不加这个守卫，用户一存新方案，其历史方案的迁移就永久失效了。
 *
 * 失败不影响主流程：这是隐私增强，不是一致性要求。
 */
async function stripPlanInputFromSuperseded(familyId) {
  const db = getDB()
  try {
    await db.collection('budget_plans')
      .where({ family_id: familyId, is_active: false, engine_version: ENGINE_VERSION })
      .update({ data: { plan_input: null } })
  } catch (e) {
    console.error('[db.stripPlanInputFromSuperseded] failed', e && e.message)
  }
}

/**
 * 列出家庭的全部历史方案（按创建时间倒序）。
 *
 * 只返回列表所需字段：完整方案含 7 类预算、建议、风险报告，
 * 列表页一次拉全量会明显拖慢。需要详情再走 getPlanById。
 */
async function listPlans(familyId) {
  const db = getDB()
  // version 作为 tiebreaker：连续生成两版时 created_at 可能落在同一毫秒，
  // 只按 created_at 排序会得到不确定顺序（version 每家庭单调递增，可确定）
  const { data } = await db.collection('budget_plans')
    .where({ family_id: familyId })
    .orderBy('created_at', 'desc')
    .orderBy('version', 'desc')
    .limit(50)
    .get()
  return (data || []).map((p) => ({
    _id: p._id,
    version: p.version,
    created_at: p.created_at,
    activated_at: p.activated_at || null,
    is_active: !!p.is_active,
    health_score: p.health_score,
    risk_level: p.risk_level,
    engine_version: p.engine_version || 1,
  }))
}

/**
 * 按 id 取完整方案（含所有派生字段），供历史方案详情使用。
 * 不校验 family_id —— 归属校验在 handler 层做（那里才有 user 上下文）。
 */
async function getPlanById(planId) {
  if (!planId) return null
  const db = getDB()
  try {
    const { data } = await db.collection('budget_plans').doc(planId).get()
    return data || null
  } catch (e) {
    return null
  }
}

/**
 * 读取当前生效方案 —— **纯读，不写库**
 *
 * 历史实现在此处内嵌了"建议为空则重跑引擎并回写"的修复逻辑，
 * 导致读操作带写副作用：每次命中都触发一次全量测算 + 一次 DB 写入，
 * 云函数耗时与并发行为不可控，且失败时被静默吞掉返回旧数据。
 *
 * 现在职责拆开：
 *   - 需要修复/升级存量数据时，走 scripts/recalc-plans.js 显式迁移；
 *   - 读取路径只负责读，缺失的建议由 handlers 的 ensureRecommendations()
 *     在内存中补齐（不落库），保证展示不受影响。
 */
async function getActivePlan(familyId) {
  const db = getDB()
  const { data } = await db.collection('budget_plans').where({
    family_id: familyId,
    is_active: true,
  }).limit(1).get()
  return data[0] || null
}

// 重算的纯逻辑统一在 common/plan-recalc.js，db 只做转发，
// 保证 handlers（内存路径）与云端路径、迁移脚本口径一致。
const { isPlanStale, computePlanUpdate } = require('./plan-recalc')

/**
 * 就地重算并回写单个方案（显式写操作，供迁移脚本 / plans.recalc 调用）
 * @returns {object|null} 更新后的完整方案；无需重算或失败返回 null
 */
async function recalcAndPersistPlan(planId) {
  if (!planId) return null
  const db = getDB()
  const { data } = await db.collection('budget_plans').doc(planId).get()
  const plan = Array.isArray(data) ? data[0] : data
  if (!plan || !plan._id) return null

  const update = computePlanUpdate(plan)
  if (!update) return null

  await db.collection('budget_plans').doc(planId).update({ data: update })
  return { ...plan, ...update }
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

// ---------- 唯一索引冲突判定 ----------
/**
 * 判定是否唯一索引冲突 (family_invites / family_members 的唯一索引)
 * 云开发底层是 MongoDB, 冲突走 E11000; 不同版本 SDK 的字段名不一致, 宽松匹配
 */
function isDuplicateKeyError(e) {
  if (!e) return false
  const msg = e.errMsg || e.message || ''
  const code = e.errCode || e.code
  return code === 11000 || code === -501001 || /duplicate key|E11000/i.test(msg)
}

// ---------- 数据导出 (Phase 9) ----------
/**
 * 导出用户全量数据 (数据可携带权)
 * @returns {{ user, family, plans, entries, profile }}
 */
async function exportUserData(openid) {
  const db = getDB()

  // 1. 用户
  const user = await getUserByOpenid(openid)
  if (!user) return null
  const familyId = user.family_id

  // 2. 家庭
  const family = await getFamily(familyId)

  // 3. 全部预算方案 (不限制 is_active)
  const { data: plans } = await db.collection('budget_plans')
    .where({ family_id: familyId })
    .orderBy('created_at', 'desc')
    .get()
    .catch(() => ({ data: [] }))

  // 4. 全部周记账
  const { data: entries } = await db.collection('weekly_entries')
    .where({ family_id: familyId })
    .orderBy('week_start', 'desc')
    .get()
    .catch(() => ({ data: [] }))

  // 5. 财务档案
  const { data: profiles } = await db.collection('financial_profiles')
    .where({ family_id: familyId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))
  const profile = (profiles && profiles[0]) || null

  return {
    exported_at: new Date().toISOString(),
    user: { nickname: user.nickname, avatar: user.avatar, role: user.role, created_at: user.created_at },
    family: family ? { name: family.name, stage: family.stage, city: family.city, created_at: family.created_at } : null,
    plans: (plans || []).map(p => ({
      version: p.version, health_score: p.health_score, risk_level: p.risk_level,
      is_active: p.is_active, activated_at: p.activated_at,
      monthly_summary: p.monthly_summary, categories: p.categories,
      baby_reserve: p.baby_reserve, recommendations: p.recommendations,
      created_at: p.created_at,
    })),
    entries: (entries || []).map(e => ({
      week_start: e.week_start, week_end: e.week_end,
      categories: e.categories, total: e.total, created_at: e.created_at,
    })),
    profile,
  }
}

// ---------- 账号注销 (Phase 9) ----------
/**
 * 级联删除用户所有数据
 * 顺序: entries → plans → profile → family → user
 */
async function deleteUserData(openid) {
  const db = getDB()

  // 1. 查用户 → 拿 family_id
  const user = await getUserByOpenid(openid)
  if (!user) return { deleted: false, reason: '用户不存在' }

  const familyId = user.family_id

  // 2. 删周记账
  await db.collection('weekly_entries').where({ family_id: familyId }).remove().catch(() => {})

  // 3. 删预算方案
  await db.collection('budget_plans').where({ family_id: familyId }).remove().catch(() => {})

  // 4. 删财务档案
  await db.collection('financial_profiles').where({ family_id: familyId }).remove().catch(() => {})

  // 5. 删家庭
  await db.collection('families').where({ _id: familyId }).remove().catch(() => {})

  // 6. 删用户
  await db.collection('users').where({ _openid: openid }).remove().catch(() => {})

  return { deleted: true }
}

// ---------- family_invites (Phase 10: 伴侣邀请) ----------
/**
 * 生成随机邀请码（8 位大写字母数字）
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除易混淆字符 0/O/1/I
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * 创建家庭邀请码（24 小时有效）
 */
async function createFamilyInvite({ familyId, openid }) {
  const db = getDB()
  const now_ = now()
  const code = generateInviteCode()
  const expiresAt = new Date(now_.getTime() + 24 * 3600 * 1000)
  const doc = {
    invite_code: code,
    family_id: familyId,
    created_by: openid,
    created_at: now_,
    expires_at: expiresAt,
    used: false,
    used_by: null,
    used_at: null,
  }
  // 重试避免随机码碰撞（概率极低但防御）
  try {
    await db.collection('family_invites').add({ data: doc })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      // 换个码重试一次
      doc.invite_code = generateInviteCode()
      await db.collection('family_invites').add({ data: doc })
    } else {
      throw e
    }
  }
  return doc
}

/**
 * 按邀请码查找未被使用的有效邀请
 */
async function getFamilyInvite(inviteCode) {
  if (!inviteCode) return null
  const db = getDB()
  const { data } = await db.collection('family_invites').where({ invite_code: inviteCode }).limit(1).get()
  return (data && data[0]) || null
}

/**
 * 标记邀请码已使用
 */
async function markInviteUsed(inviteCode, usedBy) {
  if (!inviteCode) return
  const db = getDB()
  await db.collection('family_invites').where({ invite_code: inviteCode }).update({
    data: { used: true, used_by: usedBy, used_at: now() }
  })
}

/**
 * 添加家庭成员
 */
async function addFamilyMember({ familyId, openid, nickname, avatar, role = 'member' }) {
  const db = getDB()
  const now_ = now()
  // 一户一人唯一索引兜底
  try {
    await db.collection('family_members').add({
      data: {
        family_id: familyId,
        openid,
        nickname: nickname || '',
        avatar: avatar || '',
        role,
        joined_at: now_,
      }
    })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return null // 已是成员，幂等
    }
    throw e
  }
  return { family_id: familyId, openid, role, joined_at: now_ }
}

/**
 * 获取家庭成员列表
 */
async function getFamilyMembers(familyId) {
  const db = getDB()
  const { data } = await db.collection('family_members').where({ family_id: familyId }).get()
  return data || []
}

/**
 * 获取家庭真正的 owner（从 users 表查 role='owner'）
 */
async function getFamilyOwner(familyId) {
  const db = getDB()
  const { data } = await db.collection('users').where({ family_id: familyId, role: 'owner' }).limit(1).get()
  if (!data || !data[0]) return null
  const u = data[0]
  return { openid: u._openid, nickname: u.nickname || '', avatar: u.avatar || '', role: 'owner' }
}

/**
 * 获取家庭的行动建议采纳状态（Phase 10: 行动清单写库）
 */
async function getActionStatuses(familyId) {
  return withCollection('action_statuses', async () => {
    const db = getDB()
    const { data } = await db.collection('action_statuses').where({ family_id: familyId }).get()
    return data || []
  })
}

/**
 * 保存单条建议采纳状态（upsert: family_id + rec_id 唯一）
 */
async function setActionStatus({ familyId, recId, status }) {
  return withCollection('action_statuses', async () => {
    const db = getDB()
    const now_ = now()
    const { data } = await db.collection('action_statuses').where({ family_id: familyId, rec_id: recId }).limit(1).get()
    if (data && data[0] && data[0]._id) {
      await db.collection('action_statuses').doc(data[0]._id).update({
        data: { status, updated_at: now_ },
      })
      return { family_id: familyId, rec_id: recId, status, updated_at: now_ }
    }
    await db.collection('action_statuses').add({
      data: { family_id: familyId, rec_id: recId, status, updated_at: now_ },
    })
    return { family_id: familyId, rec_id: recId, status, updated_at: now_ }
  })
}

// ---------- Phase 10 订阅消息 ----------
/**
 * 读单个用户的订阅记录（openid + template_id）
 */
async function getSubscribeRecord(openid, templateId) {
  return withCollection('subscribe_records', async () => {
    const db = getDB()
    const { data } = await db.collection('subscribe_records').where({ openid, template_id: templateId }).limit(1).get()
    return (data && data[0]) || null
  })
}

/**
 * 订阅授权成功：配额 +1（upsert）
 */
async function incSubscribeQuota({ openid, familyId, templateId }) {
  return withCollection('subscribe_records', async () => {
    const db = getDB()
    const _ = db.command
    const now_ = now()
    const { data } = await db.collection('subscribe_records').where({ openid, template_id: templateId }).limit(1).get()
    if (data && data[0] && data[0]._id) {
      await db.collection('subscribe_records').doc(data[0]._id).update({
        data: { quota: _.inc(1), total: _.inc(1), family_id: familyId, updated_at: now_ },
      })
      return { openid, template_id: templateId, quota: (data[0].quota || 0) + 1, total: (data[0].total || 0) + 1 }
    }
    await db.collection('subscribe_records').add({
      data: { openid, family_id: familyId, template_id: templateId, quota: 1, total: 1, created_at: now_, updated_at: now_ },
    })
    return { openid, template_id: templateId, quota: 1, total: 1 }
  })
}

/**
 * 推送成功后：配额 -1（不足时返回 false，由调用方报错）
 */
async function decrementSubscribeQuota(openid, templateId) {
  return withCollection('subscribe_records', async () => {
    const db = getDB()
    const _ = db.command
    const { data } = await db.collection('subscribe_records').where({ openid, template_id: templateId }).limit(1).get()
    if (!data || !data[0] || !data[0]._id) return false
    const quota = data[0].quota || 0
    if (quota <= 0) return false
    await db.collection('subscribe_records').doc(data[0]._id).update({
      data: { quota: _.inc(-1), updated_at: now() },
    })
    return { openid, template_id: templateId, quota: quota - 1 }
  })
}

/**
 * 按模板查全部订阅者（定时批量推送用）
 */
async function getSubscribeRecordsByTemplate(templateId) {
  return withCollection('subscribe_records', async () => {
    const db = getDB()
    const { data } = await db.collection('subscribe_records').where({ template_id: templateId }).get()
    return data || []
  })
}

// ---------- Phase 10 埋点系统 ----------
/**
 * 批量写入埋点事件（analytics_events）
 */
async function insertAnalyticsEvents(events) {
  if (!events || !events.length) return 0
  return withCollection('analytics_events', async () => {
    const db = getDB()
    await db.collection('analytics_events').add({
      data: events.map((e) => ({
        openid: e.openid || '',
        event: e.event,
        data: e.data || {},
        page: e.page || '',
        platform: e.platform || '',
        client_ts: e.client_ts || Date.now(),
        created_at: now(),
      })),
    })
    return events.length
  })
}

async function updateUserFamilyId(openid, familyId, role) {
  const db = getDB()
  await db.collection('users').where({ _openid: openid }).update({
    data: { family_id: familyId, role, updated_at: now() }
  })
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
  // 走 common/date 按业务时区(UTC+8)换算，不再依赖运行环境 TZ
  return dateUtil.monthRange(d)
}

/**
 * 取与目标月份【有重叠】的周记账。
 *
 * 之所以不是"week_start 落在月内"：一周 7 天可能跨月，
 * 例如 8/31–9/6 这一周的 week_start 属 8 月，但其中 6 天在 9 月。
 * 若按 week_start 过滤，9 月 1–6 日的支出会在 9 月看板中完全消失。
 *
 * 查询窗口向左放宽 7 天以覆盖跨月周，调用方再用
 * dateUtil.daysOfWeekInMonth() 按天比例分摊。
 */
/**
 * 取该家庭全部周记账（按 week_start 升序），用于多月趋势聚合。
 *
 * 趋势需要跨月一次性统计，逐月查询会变成 N 次请求；
 * 这里一次取全量（上限 max 条，约 4 年）。
 */
async function getAllWeeklyEntries(familyId, max = 200) {
  const db = getDB()
  const res = await db.collection('weekly_entries')
    .where({ family_id: familyId })
    .orderBy('week_start', 'asc')
    .limit(max)
    .get()
    .catch(() => ({ data: [] }))
  return res.data || []
}

async function getMonthOverlappingEntries(familyId, year, month) {
  const db = getDB()
  const _ = db.command
  const { start: firstDay, nextStart: nextFirst } = dateUtil.monthFilter(year, month)
  // 向左放宽 7 天：纳入 week_start 在上月月末、但周内含目标月日期的记录
  const lowerBound = shiftDays(firstDay, -7)
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: _.gte(lowerBound).and(_.lt(nextFirst))
  }).get().catch(() => ({ data: [] }))
  return res.data || []
}

/** 'YYYY-MM-DD' 平移 N 天 */
function shiftDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return dateUtil.toDateString(new Date(Date.UTC(y, m - 1, d) + days * 86400000))
}

async function getWeeklyEntry(familyId, weekStart) {
  const db = getDB()
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: weekStart
  }).limit(1).get().catch(() => ({ data: [] }))
  return (res.data && res.data[0]) || null
}

/**
 * 写入/更新周记账。
 *
 * @param {string} [submitterOpenid] - 填报人（家庭成员均可填报，记录便于追溯）
 */
async function saveWeeklyEntry(familyId, weekStart, weekEnd, categories, submitterOpenid = '') {
  const db = getDB()
  const total = Object.values(categories || {}).reduce((s, v) => s + (Number(v) || 0), 0)
  const now_ = Date.now()
  // upsert:先查,有则 update,无则 add
  const existing = await getWeeklyEntry(familyId, weekStart)
  if (existing) {
    await db.collection('weekly_entries').doc(existing._id).update({
      data: { categories, total, submitter_openid: submitterOpenid, updated_at: now_ }
    })
    return { ...existing, categories, total, submitter_openid: submitterOpenid, updated_at: now_ }
  }
  const res = await db.collection('weekly_entries').add({
    data: {
      family_id: familyId,
      week_start: weekStart,
      week_end: weekEnd,
      categories,
      total,
      submitter_openid: submitterOpenid,
      created_at: now_,
      updated_at: now_
    }
  })
  return { _id: res._id, family_id: familyId, week_start: weekStart, week_end: weekEnd, categories, total, created_at: now_, updated_at: now_ }
}

// ---------- feedbacks（帮助与反馈） ----------
function isCollectionMissingError(e) {
  const msg = String((e && (e.errMsg || e.message)) || e || '')
  return /COLLECTION_NOT_EXIST|collection not exist|Db or Table not exist|not exists/i.test(msg)
}

// 已确认存在的集合缓存（避免每次调用都重复检查）
const ensuredCollections = new Set()

/**
 * 集合缺失时自动创建（幂等）。与 createFeedback 的容错一致，
 * 让 Phase 10 新集合（action_statuses / subscribe_records / analytics_events）
 * 在未跑建库脚本时也能自愈，而不是让前端收到 ENGINE_ERROR。
 */
async function ensureCollection(name) {
  if (ensuredCollections.has(name)) return
  const db = getDB()
  try {
    await db.createCollection(name)
  } catch (e) {
    // 并发下可能已被创建，忽略"已存在"
    if (!/already exists|Duplicated|exists/i.test(String((e && (e.errMsg || e.message)) || ''))) {
      throw e
    }
  }
  ensuredCollections.add(name)
}

/**
 * 执行 fn；若因集合缺失失败，自动建集合后重试一次。
 */
async function withCollection(name, fn) {
  try {
    return await fn()
  } catch (e) {
    if (!isCollectionMissingError(e)) throw e
    await ensureCollection(name)
    return await fn()
  }
}

/**
 * 写入一条用户反馈。openid 可为 null（测试无微信上下文时）。
 * 若集合尚未创建，尝试 createCollection 后重试一次。
 */
async function createFeedback({ openid, type, content, contact, client_meta, status = 'new' }) {
  const db = getDB()
  const now_ = Date.now()
  const doc = {
    openid: openid || null,
    type,
    content,
    contact: contact || '',
    client_meta: client_meta && typeof client_meta === 'object' ? client_meta : {},
    created_at: now_,
    status: status || 'new',
  }

  async function addOnce() {
    const { _id } = await db.collection('feedbacks').add({ data: doc })
    return { _id, ...doc }
  }

  try {
    return await addOnce()
  } catch (e) {
    if (!isCollectionMissingError(e)) throw e
    try {
      await db.createCollection('feedbacks')
    } catch (createErr) {
      // 并发下可能已被创建，忽略“已存在”
      if (!/already exists|Duplicated|exists/i.test(String((createErr && (createErr.errMsg || createErr.message)) || ''))) {
        console.error('[db.createFeedback] createCollection failed:', createErr)
      }
    }
    return await addOnce()
  }
}

module.exports = {
  getDB,
  getUserByOpenid,
  createUser,
  updateUserLastActive,
  createFamily,
  getFamily,
  updateFamilyProfile,
  FAMILY_STAGES,
  createFinancialProfile,
  savePlan,
  listPlans,
  getPlanById,
  getActivePlan,
  isPlanStale,
  computePlanUpdate,
  recalcAndPersistPlan,
  activatePlan,
  getMonthOverlappingEntries,
  getAllWeeklyEntries,
  getWeeklyEntry,
  saveWeeklyEntry,
  getLastWeekEntry,
  currentMonthRange,
  // ---------- 唯一索引冲突判定 ----------
  isDuplicateKeyError,
  getAppConfig,
  setAppConfig,
  // ---------- Phase 9 数据可携带 & 注销 ----------
  exportUserData,
  deleteUserData,
  // ---------- Phase 10 伴侣邀请 ----------
  createFamilyInvite,
  getFamilyInvite,
  markInviteUsed,
  addFamilyMember,
  getFamilyMembers,
  getFamilyOwner,
  updateUserFamilyId,
  // ---------- Phase 10 行动清单写库 ----------
  getActionStatuses,
  setActionStatus,
  // ---------- Phase 10 订阅消息 ----------
  getSubscribeRecord,
  incSubscribeQuota,
  decrementSubscribeQuota,
  getSubscribeRecordsByTemplate,
  // ---------- Phase 10 埋点系统 ----------
  insertAnalyticsEvents,
  // ---------- 帮助与反馈 ----------
  createFeedback,
}