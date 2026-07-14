/**
 * 云调用统一封装（技术方案 §3.2）
 *
 * 当前状态：占位骨架，**未接入 wx.cloud**
 * Phase 2 任务：
 *   1. 实现 initCloud() —— wx.cloud.init({ env, traceUser: true })
 *   2. 实现 callFunction(action, payload) —— 统一加 OPENID 注入 + 错误码映射
 *   3. 提供 getOpenId() 给登录相关页面用
 *
 * 引擎单一来源在 cloudfunctions/common/，**禁止**在前端复制引擎代码。
 * 前端通过 callFunction('api', { action: 'calc.quick', payload }) 走云函数调用引擎。
 */

let _initialized = false
let _openid = null

/**
 * 初始化云开发（在 App.vue onLaunch 调用）
 * Phase 2 实现
 */
export function initCloud() {
  if (_initialized) return
  // #ifdef MP-WEIXIN
  // wx.cloud.init({
  //   env: 'jiajitong-dev', // TODO: 从 manifest / build env 注入
  //   traceUser: true,
  // })
  // _initialized = true
  // #endif
  console.warn('[cloud.js] initCloud() noop — Phase 2 will wire wx.cloud')
}

/**
 * 云函数调用
 * @param {string} action 业务动作，如 'calc.quick' / 'cities.list'
 * @param {object} payload 业务参数
 * @returns {Promise<object>} { code: 0, data: ... } 或 { code, message, userHint, details }
 */
export async function callFunction(action, payload = {}) {
  // #ifdef MP-WEIXIN
  // const res = await wx.cloud.callFunction({
  //   name: 'api',
  //   data: { action, payload, requestId: `${Date.now()}-${Math.random()}` },
  // })
  // if (res.result && res.result.code !== 0) {
  //   throw new CloudError(res.result.code, res.result.message, res.result.userHint, res.result.details)
  // }
  // return res.result.data
  // #endif
  throw new Error(`callFunction('${action}') not wired in Phase 1 probe`)
}

/**
 * 取当前用户 openid（云开发自动注入）
 */
export function getOpenId() {
  return _openid
}

export class CloudError extends Error {
  constructor(code, message, userHint = '', details = null) {
    super(message)
    this.code = code
    this.userHint = userHint
    this.details = details
  }
}

export default {
  initCloud,
  callFunction,
  getOpenId,
  CloudError,
}