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
  const doc = {
    _id: id,
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
  await db.collection('families').doc(id).set({ data: doc })
  return doc
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

  const doc = {
    _id: id,
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
    activated_at: null, // 启用追踪时再填
  }
  await db.collection('budget_plans').doc(id).set({ data: doc })
  return doc
}

async function getActivePlan(familyId) {
  const db = getDB()
  const { data } = await db.collection('budget_plans').where({
    family_id: familyId,
    is_active: true,
  }).limit(1).get()
  return data[0] || null
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
}