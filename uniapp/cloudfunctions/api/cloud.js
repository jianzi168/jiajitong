/**
 * 云开发初始化（技术方案 §5.5）
 *
 * 仅在云函数运行时调用（require('wx-server-sdk')）。
 * 本地测试不会 require 本文件。
 *
 * manifest.json.mp-weixin.cloudfunctionRoot: "cloudfunctions/"
 * 部署：右键 cloudfunctions/api/ → 上传并部署
 */
'use strict'

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV, // 自动跟随调用方所在环境
})

module.exports = cloud