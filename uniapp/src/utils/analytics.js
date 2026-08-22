/**
 * 轻量埋点 SDK（Phase 10: 埋点系统）
 *
 * 设计：
 *  - track(event, data) 统一入口，事件先入本地队列（storage），
 *    达到批量阈值(10) 或距上次上报 15s 后批量上报一次。
 *  - 上报失败不清队列，下次打开/下次操作自动补发（弱网容错）。
 *  - openid / 平台 / 时间戳由 SDK 自动附加，页面无需关心。
 *
 * 用法：
 *  import { track, trackPage } from '@/utils/analytics'
 *  track('weekly_submit', { total: 320 })
 *  trackPage('dashboard')   // 等价 track('page_view', { page: 'dashboard' })
 */

import { trackAnalytics } from '@/services/api'

const QUEUE_KEY = '__analytics_queue'
const BATCH_SIZE = 10
const FLUSH_INTERVAL = 15000 // ms

let queue = loadQueue()
let flushing = false
let lastFlushAt = 0

function loadQueue() {
  try {
    const raw = uni.getStorageSync(QUEUE_KEY)
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

function saveQueue() {
  try {
    uni.setStorageSync(QUEUE_KEY, queue)
  } catch (e) {
    // 存储满时丢弃最旧（保底不崩溃）
    queue = queue.slice(-20)
  }
}

function platform() {
  try {
    return (uni.getSystemInfoSync().platform || 'unknown').toLowerCase()
  } catch (e) {
    return 'unknown'
  }
}

function openid() {
  try {
    return uni.getStorageSync('openid') || ''
  } catch (e) {
    return ''
  }
}

/**
 * 记录一个事件
 * @param {string} event 事件名（≤64 字符）
 * @param {object} [data] 附加属性（可 JSON 序列化，≤4KB）
 */
export function track(event, data = {}) {
  if (!event || typeof event !== 'string') return
  const ev = {
    event: String(event).slice(0, 64),
    data: safeData(data),
    page: '',
    ts: Date.now(),
  }
  queue.push(ev)
  saveQueue()
  maybeFlush()
}

/** 页面浏览：track('page_view', { page }) */
export function trackPage(page) {
  if (!page) return
  queue.push({ event: 'page_view', data: {}, page: String(page).slice(0, 128), ts: Date.now() })
  saveQueue()
  maybeFlush()
}

/** data 必须是可 JSON 序列化对象，超限降级为 { _truncated: true } */
function safeData(data) {
  try {
    const s = JSON.stringify(data || {})
    if (s.length <= 4096) return data || {}
    return { _truncated: true }
  } catch (e) {
    return {}
  }
}

/** 队列长度达标或距上次超时 → 上报 */
function maybeFlush() {
  const now = Date.now()
  if (queue.length >= BATCH_SIZE) {
    flush()
  } else if (queue.length > 0 && now - lastFlushAt >= FLUSH_INTERVAL) {
    flush()
  }
}

/** 批量上报全部队列；成功清空，失败保留 */
export async function flush() {
  if (flushing || queue.length === 0) return
  flushing = true
  const batch = queue.slice()
  try {
    await trackAnalytics({
      events: batch.map((e) => ({ ...e, openid: openid(), platform: platform() })),
    })
    queue = []
    saveQueue()
    lastFlushAt = Date.now()
  } catch (e) {
    // 保留队列，下次补发
  } finally {
    flushing = false
  }
}

/** 冷启动/页面跳转时调用，兜底补发积压队列 */
export function flushPending() {
  if (queue.length === 0) return
  setTimeout(() => flush(), 2000)
}
