/**
 * 业务日期工具（云函数端，技术方案 §6）
 *
 * 为什么需要本模块：
 *   此前用 new Date(y, m, d) 构造「本地」日期，却用 toISOString().slice(0, 10)
 *   取出日期串。toISOString 输出的是 UTC，而业务时区是 UTC+8，本地零点
 *   等于前一日 16:00Z，于是日期整体退一天：
 *     - 周起点算成周日而非周一
 *     - 月份区间错位（当月最后一天的记录漏统计、上月末的记录被误计入本月）
 *
 *   更隐蔽的是：该行为依赖云函数运行环境的 TZ 设置。开发者本机 TZ 与云端
 *   不一致时，会出现「本地测试全绿、线上结果错位」。
 *
 * 因此本模块不依赖运行环境 TZ，一律按业务时区（Asia/Shanghai, UTC+8, 无夏令时）
 * 做显式换算，保证本地测试与云端行为完全一致。
 */
'use strict'

/** 业务时区偏移（分钟）。中国全境 UTC+8 且无夏令时 */
const BUSINESS_TZ_OFFSET_MIN = 480

const DAY_MS = 86400000

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 取某时刻在业务时区下的日历字段
 * @returns {{year:number, month:number, date:number, day:number}} day: 0=周日
 */
function partsInBusinessTz(dt = new Date()) {
  const shifted = new Date(dt.getTime() + BUSINESS_TZ_OFFSET_MIN * 60000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  }
}

/**
 * 时刻 → 业务时区下的 'YYYY-MM-DD'
 */
function toDateString(dt = new Date()) {
  const p = partsInBusinessTz(dt)
  return `${p.year}-${pad2(p.month)}-${pad2(p.date)}`
}

/**
 * ISO 周区间（周一 ~ 周日），业务时区
 *
 * 算法：先取业务时区当天 00:00 对应的绝对时刻作为锚点，再按整天数平移。
 * 用绝对时刻做加减，避免月末/月末跨月时的边界错误。
 *
 * @returns {{weekStart: string, weekEnd: string}}
 */
function weekRange(dt = new Date()) {
  const p = partsInBusinessTz(dt)
  const dayIdx = p.day === 0 ? 7 : p.day // 周日=0 视作 7
  const anchor = Date.UTC(p.year, p.month - 1, p.date) - BUSINESS_TZ_OFFSET_MIN * 60000
  const mondayMs = anchor - (dayIdx - 1) * DAY_MS
  const sundayMs = mondayMs + 6 * DAY_MS
  return {
    weekStart: toDateString(new Date(mondayMs)),
    weekEnd: toDateString(new Date(sundayMs)),
  }
}

/**
 * 当月区间，业务时区
 * @returns {{start:string, end:string, year:number, month:number}}
 *   start/end 均为 'YYYY-MM-DD' 闭区间（当月 1 号 ~ 当月最后一天）
 */
function monthRange(dt = new Date()) {
  const p = partsInBusinessTz(dt)
  const lastDay = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
  return {
    start: `${p.year}-${pad2(p.month)}-01`,
    end: `${p.year}-${pad2(p.month)}-${pad2(lastDay)}`,
    year: p.year,
    month: p.month,
  }
}

/**
 * 指定年月的聚合过滤区间 [start, nextStart)
 *
 * 供字符串比较使用（week_start >= start && week_start < nextStart），
 * 因此 nextStart 是下个月 1 号，而非当月最后一天。
 */
function monthFilter(year, month) {
  const start = `${year}-${pad2(month)}-01`
  const nextStart = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${pad2(month + 1)}-01`
  return { start, nextStart }
}

/**
 * 某周区间（自 weekStart 起 7 天）落在目标月份内的天数
 *
 * 用途：跨月周按天比例分摊到各月。
 *   看板此前只按 week_start 所在月份整周归属，导致每月 1~6 日填报的支出
 *   在该月看板中完全不可见（如 9/1–9/6 属 8/31 那一周，整周被算进 8 月）。
 *
 * @param {string} weekStart - 'YYYY-MM-DD'
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} [weekLength] - 周长度，默认 7
 * @returns {number} 0..7
 */
function daysOfWeekInMonth(weekStart, year, month, weekLength = 7) {
  if (!weekStart) return 0
  const { start, nextStart } = monthFilter(year, month)
  const parts = weekStart.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0

  const startMs = Date.UTC(parts[0], parts[1] - 1, parts[2])
  let count = 0
  for (let i = 0; i < weekLength; i++) {
    const dayStr = toDateString(new Date(startMs + i * DAY_MS))
    if (dayStr >= start && dayStr < nextStart) count++
  }
  return count
}

module.exports = {
  BUSINESS_TZ_OFFSET_MIN,
  partsInBusinessTz,
  toDateString,
  weekRange,
  monthRange,
  monthFilter,
  daysOfWeekInMonth,
}
