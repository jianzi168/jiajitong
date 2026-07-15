/**
 * API 网关主入口（技术方案 §5.5）
 *
 * 部署到微信云开发：此文件作为云函数入口
 *   微信开发者工具右键 cloudfunctions/api/ → 上传并部署
 *
 * 本地测试：直接 require 后调 dispatch({ action, payload }) 即可
 *   const { dispatch } = require('./uniapp/cloudfunctions/api')
 *   dispatch({ action: 'cities.list' })
 *
 * 调用方：
 *   客户端 → wx.cloud.callFunction({ name: 'api', data: { action, payload, requestId } })
 *   云开发 → 本 exports.main(event, context)
 *   本地测试 → dispatch(event, ctx)
 */
'use strict'

const { ok, fail, ERROR_CODE } = require('./common/response')
const handlers = require('./handlers')

// 兼容本地测试：检测 wx-server-sdk 是否可用
let cloud = null
try {
  cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
} catch (e) {
  // 本地测试无 wx-server-sdk，使用 stub
}

/**
 * 通用 dispatcher：接收 { action, payload } 返回统一响应
 */
async function dispatch(event, ctx = {}) {
  const { action, payload = {} } = event || {}

  if (!action) {
    return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 action 字段')
  }
  const handler = handlers[action]
  if (!handler) {
    return fail(ERROR_CODE.UNKNOWN_ACTION, 'UNKNOWN_ACTION', `未知 action: ${action}`)
  }

  try {
    const data = await handler(ctx, payload)
    return data
  } catch (e) {
    console.error('[api]', action, e)
    // 引擎 BizError（IMBALANCE 等）— 已经有 code/userHint，直接转 fail
    if (e.code && e.userHint !== undefined) {
      return fail(e.code, e.message || 'BIZ_ERROR', e.userHint || '', e.details || null)
    }
    return fail(ERROR_CODE.ENGINE_ERROR, 'ENGINE_ERROR', e.message || '引擎计算异常', null)
  }
}

/**
 * 云函数入口
 */
async function main(event, context) {
  const wxContext = (cloud && context && context.wxContext) || {}
  const ctx = {
    openid: wxContext.OPENID || null,
    unionid: wxContext.UNIONID || null,
    appid: wxContext.APPID || null,
    requestId: event && event.requestId || null,
  }
  return dispatch(event, ctx)
}

exports.main = main
exports.dispatch = dispatch
exports.handlers = handlers