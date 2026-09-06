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
// 云环境不可用时的熔断：在截止时间前直接快速失败，不再发起调用。
// 否则像「appid missing」这类环境级错误会在每个页面重复刷屏
// （wx SDK 内部还会重试 3 次），且埋点每次 flush 都空转。
let _brokenUntil = 0
const BREAK_MS = 60_000

/** 环境级失败的特征（区别于业务错误：业务错误不应触发熔断） */
function isEnvFailure(err) {
  const msg = String((err && (err.errMsg || err.message)) || err || '')
  return /appid missing|cloud init|env check invalid|invalid env|请先调用.*init|Cloud API isn't enabled| OPERATE_SUPPRESS/i.test(msg)
}

/**
 * 云环境当前是否处于熔断期（埋点等非关键调用据此跳过）
 */
export function isCloudTemporarilyDown() {
  return Date.now() < _brokenUntil
}

/**
 * 初始化云开发（在 App.vue onLaunch 调用）
 * @param {string} envId - 云开发环境 ID，来自 manifest.mp-weixin.envId[buildEnv]
 */
export function initCloud(envId) {
  if (_initialized) return
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.cloud) {
    try {
      // wx.cloud.init 的失败（如 appid missing）是异步的，不会同步抛出，
      // 所以这里不能靠 try/catch 判断成败，只能靠后续 callFunction 的熔断兜底
      wx.cloud.init({
        env: envId || undefined, // undefined 时使用默认环境（开发工具勾选）
        traceUser: true,
      })
      _initialized = true
    } catch (e) {
      console.error('[cloud] wx.cloud.init 同步失败：', e && (e.errMsg || e.message))
      _brokenUntil = Date.now() + BREAK_MS
    }
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
    if (isCloudTemporarilyDown()) {
      // 熔断期：不再发起调用（避免每页重试刷屏），给出一次性的明确提示
      throw new CloudError(
        50301,
        'CLOUD_ENV_UNAVAILABLE',
        '云环境暂不可用，请检查开发者工具登录账号是否拥有该小程序权限、云开发是否已开通'
      )
    }
    try {
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
    } catch (e) {
      if (e instanceof CloudError) throw e
      if (isEnvFailure(e)) {
        // 熔断 + 一次性给出可执行的排查指引，替代每页重复的原始堆栈
        _brokenUntil = Date.now() + BREAK_MS
        console.error(
          '[cloud] 云环境不可用（已暂停调用 60s）：\n' +
          '  1. 开发者工具右上角确认登录的微信账号是该 appid 的开发者/管理员\n' +
          '  2. 确认该 appid 已开通云开发，且环境 ID 正确（config/cloud.js 与 manifest.json）\n' +
          '  3. 详情：', (e && (e.errMsg || e.message)) || e
        )
        throw new CloudError(
          50301,
          'CLOUD_ENV_UNAVAILABLE',
          '云环境暂不可用，请检查开发者工具登录账号与云开发配置'
        )
      }
      throw e
    }
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
  isCloudTemporarilyDown,
  CloudError,
}