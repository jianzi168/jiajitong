/**
 * 登录会话恢复（微信云开发 openid 自动注入，无需自建 token）
 *
 * - 登录成功后写入 family_id / logged_in
 * - 冷启动 / 刷新时若本地有会话，静默 user.bootstrap 并跳回主站
 */

import { bootstrap } from '@/services/api'
import { usePlanStore } from '@/stores/plan'

const KEYS = {
  openid: 'openid',
  familyId: 'family_id',
  nickname: 'nickname',
  loggedIn: 'logged_in',
}

let inflight = null

export function hasLocalSession() {
  try {
    return !!(uni.getStorageSync(KEYS.loggedIn) || uni.getStorageSync(KEYS.familyId))
  } catch (e) {
    return false
  }
}

export function clearLocalSession() {
  try {
    uni.removeStorageSync(KEYS.openid)
    uni.removeStorageSync(KEYS.familyId)
    uni.removeStorageSync(KEYS.nickname)
    uni.removeStorageSync(KEYS.loggedIn)
  } catch (e) {}
  try {
    usePlanStore().clear()
  } catch (e) {}
}

/** 把 bootstrap 响应写入本地缓存 + Pinia */
export function applyProfile(profile) {
  if (!profile) return

  const user = profile.user || {}
  uni.setStorageSync(KEYS.openid, user._openid || '')
  uni.setStorageSync(KEYS.familyId, profile.family_id || user.family_id || '')
  uni.setStorageSync(KEYS.nickname, user.nickname || '')
  uni.setStorageSync(KEYS.loggedIn, '1')

  const planStore = usePlanStore()

  if (profile.activePlan) {
    try {
      const app = getApp()
      if (app && app.globalData) app.globalData.fullPlanResult = profile.activePlan
    } catch (e) {}
    planStore.activePlan = profile.activePlan
    planStore.activated = !!profile.activePlan.activated_at
  } else {
    planStore.clear()
  }
}

export function resolveHomeRoute(profile) {
  if (profile && profile.activePlan) return '/pages/home/index'
  return '/pages/home/empty'
}

/**
 * 静默恢复：调 user.bootstrap（openid 由云函数注入）
 * @returns {Promise<{ profile: object, route: string }>}
 */
export async function restoreSession() {
  if (inflight) return inflight
  inflight = (async () => {
    const profile = await bootstrap({})
    applyProfile(profile)
    return { profile, route: resolveHomeRoute(profile) }
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}
