/**
 * 统一响应格式（技术方案 §5.3）
 *
 * 成功：{ code: 0, data: {...} }
 * 失败：{ code: <int>, message: <string>, userHint: <string>, details?: <any> }
 *
 * code 规范：
 *   0       成功
 *   4xxxx   业务错误
 *   5xxxx   系统错误
 */

const ERROR_CODE = {
  // 业务错误 (4xxxx)
  IMBALANCE:          40001,
  CITY_NOT_COVERED:   40002,
  BABY_TOO_SOON:      40003, // warning 不阻断；这里用于客户端识别 severity
  UNKNOWN_ACTION:     40404,
  VALIDATION_ERROR:   40010,
  UNAUTHORIZED:       40101,
  FORBIDDEN:          40301,
  NOT_FOUND:          40401,
  RATE_LIMITED:       42901,

  // 系统错误 (5xxxx)
  INTERNAL_ERROR:     50001,
  ENGINE_ERROR:       50002,
}

function ok(data) {
  return { code: 0, data }
}

function fail(code, message, userHint = '', details = null) {
  return { code, message, userHint, details }
}

module.exports = { ok, fail, ERROR_CODE }