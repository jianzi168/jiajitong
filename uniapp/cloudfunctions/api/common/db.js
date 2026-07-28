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
}