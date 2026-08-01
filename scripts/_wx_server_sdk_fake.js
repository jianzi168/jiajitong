/**
 * 测试用 wx-server-sdk stub。
 * 通过 Module._resolveFilename 替换到 wx-server-sdk 上,
 * 只在 test-commercialization.js 的 T8-13 用到。
 * 不被生产代码 import。
 */
'use strict'

function makeChainable(result) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (fn) => Promise.resolve(result).then(fn)
      if (prop === 'get') return () => Promise.resolve(result)
      if (prop === 'add') return () => Promise.resolve({ _id: 'fake_id' })
      if (prop === 'update') return () => Promise.resolve({ stats: { updated: 1 } })
      if (prop === 'doc') return () => makeChainable(result)
      if (prop === 'where') return () => makeChainable(result)
      if (prop === 'limit') return () => ({ get: () => Promise.resolve({ data: result || [] }) })
      if (prop === 'collection') return () => makeChainable(result)
      return () => makeChainable(result)
    },
    apply() { return makeChainable(result) },
  })
}

module.exports = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'fake-env',
  database() {
    return makeChainable([{ _id: 'fake_user', _openid: 'fake', family_id: 'fake_fam' }])
  },
  getWXContext() {
    return { OPENID: 'fake_openid', UNIONID: '', APPID: 'fake_appid' }
  },
  openapi: {
    wxacode: {
      async getUnlimited() {
        return { buffer: Buffer.from('FAKE_PNG') }
      },
    },
  },
  async uploadFile({ cloudPath, fileContent }) {
    // 收集调用以便测试断言 cloudPath
    module.exports._uploadCalls = module.exports._uploadCalls || []
    module.exports._uploadCalls.push({ cloudPath, fileContent })
    return { fileID: 'cloud://share-qrcodes/test.png' }
  },
}
