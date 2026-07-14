/**
 * 引擎调用客户端（探针版本 — Phase 1 之后 / Phase 2 之前）
 *
 * 平台自适应：
 * - 微信小程序：callFunction('api', { action, payload })  → Phase 2 接入
 * - 其他（H5 / Node / 本地开发）：直接 require 引擎本地跑
 *
 * ⚠️ 当前为探针版：所有环境走本地 require。Phase 2 接入 wx.cloud.callFunction 后，
 *    平台判断逻辑会按 #ifdef MP-WEIXIN 切分。
 *
 * 引擎单一来源：uniapp/cloudfunctions/common/engine/index.js
 */

// 在非云函数环境直接 require 引擎
// Vue 单文件组件 <script> 默认走 ESM；此文件用 module.exports 以兼容 Node 探针脚本。
// Vue 里 import 时会拿到 default 字段（webpack/vite interop）。
const engine = require('../../cloudfunctions/common/engine')

/**
 * 检测是否在微信小程序环境（条件编译占位）
 * UniApp 在 mp-weixin 编译时会用 `wx.getSystemInfoSync()` 区分；Node/H5 没有 wx 全局
 */
function isMiniProgram() {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined'
}

/**
 * 快测
 * @param {{ city: string, income: number, housing: number }} input
 * @returns {Promise<object>} 与云函数 calc.quick 响应一致
 */
async function callCalcQuick(input) {
  if (isMiniProgram()) {
    // Phase 2 接入：return callFunction('api', { action: 'calc.quick', payload: input })
    throw new Error('callFunction not wired in Phase 1 probe; please run on non-MP env')
  }
  return engine.calcQuick(input)
}

/**
 * 完整测算
 * @param {object} input 完整向导字段
 */
async function callCalcFull(input) {
  if (isMiniProgram()) {
    throw new Error('callFunction not wired in Phase 1 probe')
  }
  return engine.calcFull(input)
}

module.exports = {
  callCalcQuick,
  callCalcFull,
  isMiniProgram,
}

// Vue ESM 兼容：被 `import engineClient from '@/utils/engineClient'` 时能拿到 default
module.exports.default = module.exports