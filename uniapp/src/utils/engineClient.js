/**
 * 引擎调用客户端（前端 → 云函数 → 引擎）
 *
 * 设计：
 * - 前端永远通过 wx.cloud.callFunction('api', { action, payload }) 调用云函数
 * - 云函数侧的 api 网关 (cloudfunctions/api/index.js) 调引擎
 * - 前端不直接 import 引擎，避免 UniApp rollup 编译 CJS 模块的兼容问题
 *   + 引擎代码也不会进入前端 bundle（节省包体积）
 *
 * 引擎单一来源：uniapp/cloudfunctions/common/engine/index.js
 * 网关：uniapp/cloudfunctions/api/index.js
 */

/**
 * 检测是否在微信小程序环境
 */
export function isMiniProgram() {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined'
}

/**
 * 调云函数（所有环境）
 * 在 H5/Node 等非 MP 环境抛错（前端必须跑在 MP-WEIXIN 里）
 */
async function callCloud(action, payload) {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error(
      `engineClient.callCloud('${action}') 仅支持 MP-WEIXIN 环境。` +
      `本地 Node 调试请用 scripts/demo-quick.mjs（直接调引擎不走云函数）。`
    )
  }
  const res = await wx.cloud.callFunction({
    name: 'api',
    data: { action, payload },
  })
  const result = res && res.result
  if (!result) {
    throw new Error(`云函数返回为空: action=${action}`)
  }
  if (result.code !== 0) {
    const err = new Error(result.message || 'API_ERROR')
    err.code = result.code
    err.userHint = result.userHint
    err.details = result.details
    throw err
  }
  return result.data
}

/**
 * 快测
 */
export async function callCalcQuick(input) {
  return callCloud('calc.quick', input)
}

/**
 * 完整测算
 */
export async function callCalcFull(input) {
  return callCloud('calc.full', input)
}

/**
 * 开放城市列表
 */
export async function callCitiesList() {
  return callCloud('cities.list', {})
}

/**
 * 微信登录：调 user.bootstrap 拿 user + family
 */
export async function callWxLogin(payload = {}) {
  return callCloud('user.bootstrap', payload)
}

/**
 * 保存方案
 */
export async function callPlanSave(payload = {}) {
  return callCloud('plans.save', payload)
}

/**
 * 当前活跃方案
 */
export async function callPlanGetActive() {
  return callCloud('plans.getActive', {})
}

export default {
  callCalcQuick,
  callCalcFull,
  callCitiesList,
  callWxLogin,
  callPlanSave,
  callPlanGetActive,
  isMiniProgram,
}