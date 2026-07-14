/**
 * 引擎调用客户端
 *
 * 平台自适应：
 * - 微信小程序（MP-WEIXIN）：wx.cloud.callFunction('api', { action, payload })
 * - 其他（H5 / Node / 本地开发）：直接 require 引擎本地跑（探针/fallback）
 *
 * 引擎单一来源：uniapp/cloudfunctions/common/engine/index.js
 * Phase 2 网关：uniapp/cloudfunctions/api/index.js
 */

const engine = require('../../cloudfunctions/common/engine')

/**
 * 检测是否在微信小程序环境
 */
function isMiniProgram() {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined'
}

/**
 * 调云函数（MP 环境）
 * 抛 CloudError 给上层捕获
 */
async function callCloud(action, payload) {
  // #ifdef MP-WEIXIN
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
  // #endif
}

/**
 * 快测
 * @param {{ city: string, income: number, housing: number }} input
 */
async function callCalcQuick(input) {
  if (isMiniProgram()) {
    return callCloud('calc.quick', input)
  }
  return engine.calcQuick(input)
}

/**
 * 完整测算
 * @param {object} input
 */
async function callCalcFull(input) {
  if (isMiniProgram()) {
    return callCloud('calc.full', input)
  }
  return engine.calcFull(input)
}

/**
 * 开放城市列表
 */
async function callCitiesList() {
  if (isMiniProgram()) {
    return callCloud('cities.list', {})
  }
  // 本地 fallback：直接读 benchmark
  const { cities } = engine.benchmark
  return { cities: cities.map(c => ({ name: c.name, tier: c.tier, medianIncome: c.medianIncome })) }
}

module.exports = {
  callCalcQuick,
  callCalcFull,
  callCitiesList,
  isMiniProgram,
}

// Vue ESM 兼容
module.exports.default = module.exports