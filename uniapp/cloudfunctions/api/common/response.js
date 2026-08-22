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
  // Phase 10: 伴侣邀请
  INVITE_EXPIRED:      41001,
  INVITE_ALREADY_USED: 41002,
  INVITE_NOT_FOUND:    41003,
  ALREADY_MEMBER:      41004,
  CANNOT_JOIN_OWN:     41005,
  FAMILY_ALREADY_PAIRED: 41008, // 家庭已有伴侣，不能再生成邀请码
  // Phase 10: 订阅消息
  SUBSCRIBE_NOT_CONFIGURED: 41006, // 模板 ID 未配置（小程序后台申请后填入）
  SUBSCRIBE_QUOTA_EXHAUSTED: 41007, // 订阅配额耗尽（一次授权一次推送）

  // 系统错误 (5xxxx)
  INTERNAL_ERROR:     50001,
  ENGINE_ERROR:       50002,
  QR_CODE_FAILED:     50012, // Phase 8: 小程序码生成失败
}

function ok(data) {
  return { code: 0, data }
}

function fail(code, message, userHint = '', details = null) {
  return { code, message, userHint, details }
}

module.exports = { ok, fail, ERROR_CODE }