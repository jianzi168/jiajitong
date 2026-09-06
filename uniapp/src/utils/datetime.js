/**
 * 时间格式兼容工具（Phase 10 回归测试友好）
 *
 * 后端返回的 expires_at 可能是:
 *   - ISO string (云端: new Date(...).toJSON() 序列化产物)
 *   - number     (本地内存 fallback: Date.now() + N ms)
 *   - Date       (云端 raw 对象, 偶发)
 *
 * 前端所有"算差值 / 算倒计时"的地方都要先过 toTimestamp(), 否则
 * string - number = NaN, 会显示「NaN 小时 NaN 分钟」这种 BUG。
 */

/**
 * 把任意时间表示归一为毫秒时间戳
 * @param {string|number|Date|null|undefined} ts
 * @returns {number} 毫秒时间戳; 无法解析返回 NaN
 */
export function toTimestamp(ts) {
  if (ts == null) return NaN
  if (typeof ts === 'number') return ts
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === 'string') {
    const n = Date.parse(ts)
    return Number.isNaN(n) ? NaN : n
  }
  return NaN
}

/**
 * 业务时区（UTC+8，中国全境无夏令时）下的日期串 'YYYY-MM-DD'
 *
 * 不要用 new Date().toISOString().slice(0, 10)：它输出的是 UTC。
 * 在 UTC+8 的 00:00–08:00 之间，本地零点等于前一日 16:00Z，
 * 会取到前一天的日期——导出文件名、报表标题等场景会出现日期错一天。
 *
 * 与后端 cloudfunctions/api/common/date.js 的 toDateString 保持同一口径。
 *
 * @param {Date|number|string} [dt]
 * @returns {string}
 */
export function toDateString(dt = new Date()) {
  const ts = dt instanceof Date ? dt.getTime() : Date.parse(dt)
  if (Number.isNaN(ts)) return ''
  const shifted = new Date(ts + 8 * 3600000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 剩余时间倒计时 (e.g. "12 小时 34 分钟")
 * @param {string|number|Date} ts - 目标时间
 * @param {number} [now] - 当前时间(用于测试注入固定 now)
 * @returns {string}
 */
export function countdownText(ts, now = Date.now()) {
  const target = toTimestamp(ts)
  if (Number.isNaN(target)) return '时间格式异常'
  const left = Math.max(0, target - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  return `${h} 小时 ${m} 分钟`
}

/**
 * 含秒倒计时 (e.g. "13 小时 34 分钟 12 秒")
 * 供"会跳动"的倒计时使用: 秒位每秒递减, 绑定到模板后肉眼可见在走
 * (countdownText 只有小时/分钟粒度, 一帧内看不出变化, 容易被误判为"不动")
 * @param {string|number|Date} ts - 目标时间
 * @param {number} [now] - 当前时间(用于测试注入固定 now)
 * @returns {string}
 */
export function countdownTextDetail(ts, now = Date.now()) {
  const target = toTimestamp(ts)
  if (Number.isNaN(target)) return '时间格式异常'
  const left = Math.max(0, target - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return `${h} 小时 ${m} 分钟 ${s} 秒`
}

export default { toTimestamp, toDateString, countdownText, countdownTextDetail, createNowTicker }

/**
 * 创建一个响应式 now ticker (每 intervalMs 触发一次更新)
 *
 * 历史 BUG: 模板里 countdownText(inviteExpires) 只渲染一次, 因为 Date.now()
 * 不是响应式依赖, 模板不知道要重算 → 倒计时显示后永远不变
 *
 * 用法:
 *   const ticker = createNowTicker(60_000)
 *   onMounted(ticker.start)
 *   onUnmounted(ticker.stop)
 *   template: {{ countdownText(targetTs, ticker.now.value) }}
 *
 * @param {number} intervalMs - tick 间隔(默认 60s, 倒计时分钟切换够用)
 * @param {() => number} [nowProvider] - 时间源(测试可注入固定时间)
 * @returns {{ now: import('vue').Ref<number>, start: () => void, stop: () => void }}
 */
/**
 * 创建一个响应式 now ticker, 配合 Vue ref 使用
 *
 * 历史 BUG: 模板里 countdownText(inviteExpires) 只渲染一次, 因为 Date.now()
 * 不是响应式依赖, 模板不知道要重算 → 倒计时显示后永远不变
 *
 * 用法 (Vue 3 + uni-app):
 *   import { ref, onMounted, onUnmounted } from 'vue'
 *   const now = ref(Date.now())
 *   const ticker = createNowTicker(now)
 *   onMounted(ticker.start)
 *   onUnmounted(ticker.stop)
 *   // template:
 *   {{ countdownText(inviteExpires, now) }}
 *
 * @param {{ value: number }} nowRef - 类似 Vue ref 的对象 ({ value: number })
 * @param {number} [intervalMs] - tick 间隔(默认 60s)
 * @param {() => number} [nowProvider] - 时间源(测试可注入)
 * @returns {{ start: () => void, stop: () => void, tick: () => void }}
 */
export function createNowTicker(nowRef, intervalMs = 60_000, nowProvider = Date.now) {
  if (!nowRef || typeof nowRef.value !== 'number') {
    throw new Error('createNowTicker: nowRef must be an object with numeric .value (e.g. Vue ref)')
  }
  let timer = null
  let ticking = false
  // 用 setTimeout 递归代替 setInterval:
  //   - 避免某些小程序基础库下 setInterval 被冻结/不触发的问题
  //   - 避免回调叠加 (setInterval 不等待上一次的完成)
  //   - 每次 callback 跑完再排下一次, 行为更可控
  function loop() {
    nowRef.value = nowProvider()
    if (ticking) timer = setTimeout(loop, intervalMs)
  }
  return {
    start() {
      if (ticking) return // 幂等
      ticking = true
      nowRef.value = nowProvider() // 立即同步一次 (避免新页面先显示 0)
      timer = setTimeout(loop, intervalMs)
    },
    stop() {
      ticking = false
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    /** 测试用: 手动推进一次 tick (不依赖真实定时器) */
    tick() {
      nowRef.value = nowProvider()
    },
  }
}
