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
 *
 * openid 来源: 优先 cloud.getWXContext()(技术方案 §6.x 标准), 退到 context.wxContext(老调用方),
 * 最后从传入的 ctx.openid 兜底(本地测试)。
 */
async function main(event, context) {
  // 定时触发器事件（config.json triggers）：每周日 20:00 批量推送周记账提醒
  if (event && event.Type === 'Timer') {
    return dispatch({ action: 'subscribe.remindWeekly', payload: {} }, {})
  }

  let openid = null, unionid = null, appid = null
  if (cloud && typeof cloud.getWXContext === 'function') {
    try {
      const wxContext = cloud.getWXContext()
      openid = wxContext.OPENID || null
      unionid = wxContext.UNIONID || null
      appid = wxContext.APPID || null
    } catch (e) {
      console.warn('[api] getWXContext failed:', e && (e.errMsg || e.message))
    }
  }
  if (!openid && context && context.wxContext) {
    openid = context.wxContext.OPENID || openid
    unionid = context.wxContext.UNIONID || unionid
    appid = context.wxContext.APPID || appid
  }

  const ctx = {
    openid,
    unionid,
    appid,
    requestId: event && event.requestId || null,
  }
  return dispatch(event, ctx)
}

exports.main = main
exports.dispatch = dispatch
exports.handlers = handlers