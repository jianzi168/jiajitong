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
      console.error(`[api.${action}]`, e)
      throw e
    }
  }
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
  getDashboard,
  getCurrentWeekly,
  submitWeekly,
  copyLastWeek,
}