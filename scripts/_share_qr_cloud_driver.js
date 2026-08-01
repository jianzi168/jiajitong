/**
 * 子进程驱动: 注入 fake wx-server-sdk 后跑 share.getQrCode 云端分支。
 * 仅由 test-commercialization.js 调起; 不直接被 npm test 收录。
 *
 * 输出: 单行 JSON (成功) 或 "FAIL: <err>" (失败) 到 stdout。
 */
'use strict'

const Module = require('module')
const path = require('path')

// 注入 fake
const fakePath = path.resolve(__dirname, '_wx_server_sdk_fake.js')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'wx-server-sdk') return fakePath
  return origResolve.call(this, request, parent, ...rest)
}

// 启动时强制清掉 handlers/api/db 缓存, 让 usingCloudDb 重新捕获为 true
delete require.cache[require.resolve('../uniapp/cloudfunctions/api/handlers')]
delete require.cache[require.resolve('../uniapp/cloudfunctions/api')]
delete require.cache[require.resolve('../uniapp/cloudfunctions/api/common/db')]

const fakeSdk = require(fakePath)
fakeSdk._uploadCalls = []

const { dispatch } = require('../uniapp/cloudfunctions/api')

;(async () => {
  try {
    const r = await dispatch(
      { action: 'share.getQrCode', payload: { page_path: 'pages/landing/index' } },
      { openid: 't8_13_openid', unionid: null, appid: null, requestId: null },
    )
    if (r.code !== 0) {
      process.stdout.write('FAIL: dispatch code=' + r.code + ' msg=' + r.message)
      return
    }
    const data = r.data
    process.stdout.write(JSON.stringify({
      mode: data.mode,
      file_id: data.file_id,
      temp_url: data.temp_url,
      page: data.page,
      scene: data.scene,
      cloudPath: fakeSdk._uploadCalls[0] ? fakeSdk._uploadCalls[0].cloudPath : null,
      uploadCalls: fakeSdk._uploadCalls.length,
    }))
  } catch (e) {
    process.stdout.write('FAIL: ' + (e && e.message ? e.message : String(e)))
  }
})()
