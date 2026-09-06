/**
 * 业务云函数统一入口（Phase 7 引入，Phase 10 收口 engineClient）
 *
 * 历史：
 * - engineClient 是「通用 wx.cloud.callFunction 客户端」+ 历史 Phase 1-6 action 集合
 * - 本模块原只放 Phase 7 新增的 action，Phase 10 已将 engineClient 全部方法
 *   （calc.quick / calc.full / cities.list / user.bootstrap / plans.save / plans.getActive）
 *   迁移至此统一收口，utils/engineClient.js 已删除。
 *
 * 调用方式: import { activatePlan } from '@/services/api'
 *
 * 统一封装了 callFunction 的错误处理 + requestId。
 */

import { callFunction } from './cloud'

function wrap(action) {
  return async (payload = {}) => {
    try {
      return await callFunction(action, payload)
    } catch (e) {
      // 业务错误（NOT_FOUND 等）用 warn，避免控制台红字误导为崩溃
      const isBiz = typeof e.code === 'number' && e.code >= 40000 && e.code < 50000
      if (isBiz) console.warn(`[api.${action}]`, e.message, e.userHint || '')
      else console.error(`[api.${action}]`, e)
      throw e
    }
  }
}

/** 从页面上的 plan 对象抽出 plans.save 需要的 planOutput */
function toPlanOutput(plan) {
  return {
    health_score: plan.health_score,
    risk_level: plan.risk_level,
    monthly_summary: plan.monthly_summary,
    categories: plan.categories,
    baby_reserve: plan.baby_reserve,
    recommendations: plan.recommendations || [],
    risk_report: plan.risk_report,
    meta: plan.meta,
  }
}

/**
 * 确保云端有 active plan 后再启用追踪。
 * 报告页可能只持有 globalData（wizard 保存失败时的 fallback），此时先补 save。
 * 已启用则直接返回（幂等），避免重复点击。
 * @param {object|null} localPlan 本地/报告页持有的方案（可选）
 */
export async function ensureAndActivate(localPlan = null) {
  await callFunction('user.bootstrap', {})
  let active = await callFunction('plans.getActive', {})
  // 已启用：直接返回，不再打 activate
  if (active && active.plan && active.plan.activated_at) {
    return { plan: active.plan }
  }
  if (!active || !active.plan) {
    if (!localPlan || !localPlan.health_score) {
      const err = new Error('NOT_FOUND')
      err.code = 40401
      err.userHint = '请先生成预算方案'
      console.warn('[api.plans.activate]', err.message, err.userHint)
      throw err
    }
    await callFunction('plans.save', {
      planInput: localPlan.planInput || {},
      planOutput: toPlanOutput(localPlan),
    })
  }
  return callFunction('plans.activate', {})
}

export const getActivePlan    = wrap('plans.getActive')
export const listPlans        = wrap('plans.list')
export const getPlanById      = wrap('plans.getById')
export const activatePlan     = wrap('plans.activate')
export const adjustPlan       = wrap('plans.adjust')
export const recalcPlan       = wrap('plans.recalc')
export const getDashboard     = wrap('dashboard.get')
export const getCurrentWeekly = wrap('weekly.getCurrent')
export const submitWeekly     = wrap('weekly.submit')
export const copyLastWeek     = wrap('weekly.copyLastWeek')

// Phase 10 收敛: 自 engineClient 迁移（统一收口，engineClient.js 已删除）
export const calcQuick   = wrap('calc.quick')
export const calcFull    = wrap('calc.full')
export const listCities  = wrap('cities.list')
export const bootstrap   = wrap('user.bootstrap')
export const savePlan    = wrap('plans.save')

// Phase 8 分享
export const getShareQrCode  = wrap('share.getQrCode')

// Phase 9 数据可携带 & 注销
export const exportData     = wrap('users.exportData')
export const deleteAccount  = wrap('users.deleteMe')

// Phase 10 伴侣邀请
export const getFamilyProfile  = wrap('families.getProfile')
export const saveFamilyProfile = wrap('families.saveProfile')

export const createInvite    = wrap('families.inviteCreate')
export const joinFamily      = wrap('families.inviteJoin')
export const getFamilyMembers = wrap('families.getMembers')

// Phase 10 月末自动复盘
export const getMonthlyReview = wrap('reviews.getMonthly')
export const getMonthlyTrend = wrap('reviews.getTrend')

// Phase 10 行动清单写库
export const getActionStatus = wrap('actions.getStatus')
export const saveActionStatus = wrap('actions.saveStatus')

// Phase 10 订阅消息推送
export const recordSubscribe     = wrap('subscribe.record')
export const getSubscribeStatus  = wrap('subscribe.getStatus')
export const sendSubscribeMsg    = wrap('subscribe.send')

// Phase 10 埋点系统
export const trackAnalytics = wrap('analytics.track')

// 帮助与反馈
export const submitFeedback = wrap('feedback.submit')

export default {
  getActivePlan,
  activatePlan,
  adjustPlan,
  ensureAndActivate,
  getDashboard,
  getCurrentWeekly,
  submitWeekly,
  copyLastWeek,
  // Phase 10 收敛: engineClient 迁移方法
  calcQuick,
  calcFull,
  listCities,
  bootstrap,
  savePlan,
  // Phase 8 分享
  getShareQrCode,
  // Phase 9
  exportData,
  deleteAccount,
  // Phase 10
  createInvite,
  joinFamily,
  getFamilyMembers,
  // Phase 10 月末自动复盘
  getMonthlyReview,
  getMonthlyTrend,
  // Phase 10 行动清单写库
  getActionStatus,
  saveActionStatus,
  // Phase 10 订阅消息推送
  recordSubscribe,
  getSubscribeStatus,
  sendSubscribeMsg,
  // Phase 10 埋点系统
  trackAnalytics,
  // 帮助与反馈
  submitFeedback,
}