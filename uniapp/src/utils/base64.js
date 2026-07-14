// 小程序/uni-app 通用 base64 编码（ASCII 子集，不依赖 atob/btoa 全实现）
// 微信小程序在 H5 环境中 btoa 存在；非 H5 用 wx.arrayBufferToBase64 + 字符串转 ArrayBuffer
export function toBase64(str) {
  // 先尝试浏览器/H5 环境的 btoa
  if (typeof btoa === 'function') {
    try {
      // 处理中文/特殊字符
      return btoa(unescape(encodeURIComponent(str)))
    } catch (e) {
      // fallthrough
    }
  }
  // 兜底：手写 base64（覆盖 ASCII 即可，本文件调用方都是纯 ASCII）
  return utf8ToBase64(str)
}

function utf8ToBase64(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0
  // UTF-8 编码
  const utf8 = unescape(encodeURIComponent(str))
  while (i < utf8.length) {
    const c1 = utf8.charCodeAt(i++) & 0xff
    const c2 = i < utf8.length ? utf8.charCodeAt(i++) & 0xff : NaN
    const c3 = i < utf8.length ? utf8.charCodeAt(i++) & 0xff : NaN
    const e1 = c1 >> 2
    const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)
    const e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6))
    const e4 = isNaN(c3) ? 64 : c3 & 63
    result += chars.charAt(e1) + chars.charAt(e2) +
              (e3 === 64 ? '=' : chars.charAt(e3)) +
              (e4 === 64 ? '=' : chars.charAt(e4))
  }
  return result
}
