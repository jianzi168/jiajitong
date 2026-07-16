/**
 * 云调用统一封装（技术方案 §3.2）
 *
 * 当前状态：Phase 2 接通 wx.cloud.callFunction
 * Phase 6 任务：补 auth bootstrap / openid 缓存
 *
 * 引擎单一来源在 cloudfunctions/common/，**禁止**在前端复制引擎代码。
 * 前端通过 callFunction('api', { action: 'calc.quick', payload }) 走云函数调用引擎。
 */

let _initialized = false
let _openid = null

/**
 * 初始化云开发（在 App.vue onLaunch 调用）
 * @param {string} envId - 云开发环境 ID，来自 manifest.mp-weixin.envId[buildEnv]
 */
export function initCloud(envId) {
  if (_initialized) return
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.init({
      env: envId || undefined, // undefined 时使用默认环境（开发工具勾选）
      traceUser: true,
    })
    _initialized = true
  }
  // #endif
}

/**
 * 云函数调用
 * @param {string} action 业务动作，如 'calc.quick' / 'cities.list'
 * @param {object} payload 业务参数
 * @returns {Promise<object>} { code: 0, data: ... } 或 throw CloudError
 */
export async function callFunction(action, payload = {}) {
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.cloud) {
    if (!_initialized) {
      throw new Error('wx.cloud 未初始化，请先在 App.vue onLaunch 调 initCloud(envId)')
    }
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action, payload, requestId: `${Date.now()}-${Math.random()}` },
    })
    const result = res && res.result
    if (!result) {
      throw new CloudError(50001, 'EMPTY_RESPONSE', '云函数返回为空')
    }
    if (result.code !== 0) {
      throw new CloudError(result.code, result.message, result.userHint, result.details)
    }
    return result.data
  }
  // #endif
  throw new Error(`callFunction('${action}') only works in MP-WEIXIN environment`)
}

/**
 * 取当前用户 openid（云开发自动注入）
 * 注意：实际 openid 需通过云函数从 wxContext.OPENID 获取，前端无直接 API
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