export function isSubscribeConfigured(tmplIds) {
  if (!Array.isArray(tmplIds) || tmplIds.length === 0) return false
  return tmplIds.every((id) => typeof id === 'string' && id.length > 0)
}

/**
 * 「功能未就绪」的统一文案。
 *
 * 只保留真正未就绪的入口。已实现的入口必须移除占位文案 ——
 * 否则用户改完点了保存、看到"正在接入"，却不知道到底存没存上。
 *
 * subscribe：依赖小程序后台申请到的订阅消息模板 ID（后端下发，见
 * setup-reminder/index.vue）。模板未配置时该入口不可用。
 */
export const UNAVAILABLE_COPY = Object.freeze({
  subscribe: '周度提醒正在准备中, 暂未开启',
})

/**
 * 家庭档案是否已可持久化。
 * true：families.getProfile / families.saveProfile 已实现（2026-09）。
 */
export const canPersistFamilyProfile = true
