/**
 * 业务云函数统一入口（Phase 7 引入）
 *
 * 与 utils/engineClient 的区别：
 * - engineClient 是「通用 wx.cloud.callFunction 客户端」+ 历史 Phase 1-6 action 集合
 * - 本模块只放 Phase 7 新增的 action（plans.activate / dashboard.get / weekly.*）
 *   以及未来可能从 engineClient 迁过来的方法
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
 * @param {object|null} localPlan 本地/报告页持有的方案（可选）
 */
export async function ensureAndActivate(localPlan = null) {
  await callFunction('user.bootstrap', {})
  const active = await callFunction('plans.getActive', {})
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
export const activatePlan     = wrap('plans.activate')
export const getDashboard     = wrap('dashboard.get')
export const getCurrentWeekly = wrap('weekly.getCurrent')
export const submitWeekly     = wrap('weekly.submit')
export const copyLastWeek     = wrap('weekly.copyLastWeek')

export default {
  getActivePlan,
  activatePlan,
  ensureAndActivate,
  getDashboard,
  getCurrentWeekly,
  submitWeekly,
  copyLastWeek,
}