/**
 * datetime 工具回归测试
 *
 * 历史 BUG: partner/index.vue#countdown(ts) 直接做 ts - Date.now(),
 * 当云端返回 ISO string 时, string - number = NaN → 显示「NaN 小时 NaN 分钟」
 *
 * 此测试钉死 toTimestamp / countdownText 的兼容契约, 防止有人改回直接相减
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

async function loadModule() {
  // datetime.js 是 ESM, 用动态 import
  const m = await import('../uniapp/src/utils/datetime.js')
  return m
}

test('datetime - toTimestamp 兼容三种时间表示', async () => {
  const { toTimestamp } = await loadModule()
  const now = Date.now()

  // 1. number (内存版 expires_at)
  assert.equal(toTimestamp(now), now)

  // 2. ISO string (云端 db 返回 new Date(...) 序列化的产物)
  const isoStr = new Date(now + 60000).toISOString()
  assert.equal(toTimestamp(isoStr), now + 60000)

  // 3. Date 对象
  const dateObj = new Date(now + 120000)
  assert.equal(toTimestamp(dateObj), now + 120000)

  // 4. 异常输入: 都应返回 NaN, 不抛错
  assert.ok(Number.isNaN(toTimestamp(null)))
  assert.ok(Number.isNaN(toTimestamp(undefined)))
  assert.ok(Number.isNaN(toTimestamp('not a date')))
  assert.ok(Number.isNaN(toTimestamp({})))
})

test('datetime - countdownText 处理 ISO string（修复「NaN 小时 NaN 分钟」）', async () => {
  const { countdownText } = await loadModule()
  const now = 1700000000000  // 固定 now, 便于断言

  // 关键场景: ISO string 输入 (云端实际格式)
  const isoStr = new Date(now + 13 * 3600000 + 34 * 60000).toISOString()
  assert.equal(countdownText(isoStr, now), '13 小时 34 分钟')

  // 等价 number 输入 (内存版本格式)
  assert.equal(countdownText(now + 13 * 3600000 + 34 * 60000, now), '13 小时 34 分钟')

  // 等价 Date 对象输入
  assert.equal(countdownText(new Date(now + 13 * 3600000 + 34 * 60000), now), '13 小时 34 分钟')
})

test('datetime - countdownText 边界场景', async () => {
  const { countdownText } = await loadModule()
  const now = 1700000000000

  // 已过期: 显示 0 小时 0 分钟 (而非负数或 NaN)
  assert.equal(countdownText(now - 1000, now), '0 小时 0 分钟')

  // 恰好等于 now: 0
  assert.equal(countdownText(now, now), '0 小时 0 分钟')

  // 异常输入: 不显示 NaN
  assert.equal(countdownText('invalid', now), '时间格式异常')
  assert.equal(countdownText(null, now), '时间格式异常')
  assert.equal(countdownText(undefined, now), '时间格式异常')
})

test('datetime - countdownText 不返回含 NaN 的字符串', async () => {
  // 钉死: 任何输入都不能包含 "NaN" 字样
  const { countdownText } = await loadModule()
  const inputs = [
    'invalid',
    null,
    undefined,
    {},
    [],
    '2026-13-99',  // 无效日期
    '',
    NaN,
  ]
  for (const input of inputs) {
    const out = countdownText(input, Date.now())
    assert.ok(!out.includes('NaN'), `countdownText(${JSON.stringify(input)}) 应不含 NaN, 实际=${out}`)
  }
})

// ============================================================
// createNowTicker: 倒计时自动推进（防"显示后不动"BUG）
// ============================================================
test('createNowTicker - 手动 tick() 会更新 ref.value', async () => {
  const { createNowTicker } = await loadModule()
  const nowRef = { value: 1000 }
  let fakeTime = 1000
  const ticker = createNowTicker(nowRef, 100, () => fakeTime)

  ticker.tick()
  assert.equal(nowRef.value, 1000)

  fakeTime += 60_000           // 1000 + 60000 = 61000
  ticker.tick()
  assert.equal(nowRef.value, 61_000, 'tick 后 nowRef 应反映新时间')

  fakeTime += 60_000           // 61000 + 60000 = 121000
  ticker.tick()
  assert.equal(nowRef.value, 121_000)
})

test('createNowTicker - 真实 setTimeout 递归会自动推进', async () => {
  const { createNowTicker } = await loadModule()
  const nowRef = { value: 0 }
  let fakeTime = 0
  // 用 30ms 间隔, 等待 100ms 验证至少触发 2 次
  const ticker = createNowTicker(nowRef, 30, () => {
    fakeTime += 30
    return fakeTime
  })
  ticker.start()
  // 启动时立即同步一次
  assert.equal(nowRef.value, 30)
  // 等待 100ms 让 setTimeout 递归触发多次
  await new Promise(resolve => setTimeout(resolve, 100))
  ticker.stop()
  // 至少推进过 2 次 (递归 setTimeout 在 100ms 内至少 2-3 次)
  assert.ok(nowRef.value > 60, `setTimeout 递归应自动推进, nowRef.value=${nowRef.value}`)
})

test('createNowTicker - stop 后不再推进（防内存泄漏）', async () => {
  const { createNowTicker } = await loadModule()
  const nowRef = { value: 0 }
  let fakeTime = 0
  const ticker = createNowTicker(nowRef, 30, () => ++fakeTime)
  ticker.start()
  const before = nowRef.value
  ticker.stop()
  await new Promise(resolve => setTimeout(resolve, 100))
  // 注意: 此时 before 可能是 1 (start 立即同步过一次)
  // 关键是 stop 后 nowRef 不应再增加
  assert.ok(nowRef.value === before, `stop 后 nowRef.value 不应再变化, before=${before} after=${nowRef.value}`)
})

test('createNowTicker - start 幂等（多次调用不会创建多个 timer）', async () => {
  const { createNowTicker } = await loadModule()
  const nowRef = { value: 0 }
  let fakeTime = 0
  const ticker = createNowTicker(nowRef, 30, () => ++fakeTime)
  ticker.start()
  ticker.start()    // 第二次应被忽略
  ticker.start()    // 第三次也应被忽略
  ticker.stop()
  // 应该只有一个 timer 链; 如果有多个, 100ms 后 nowRef 会推进过多
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(nowRef.value <= 5, `start 应幂等, nowRef.value=${nowRef.value} (应 ≤ 5)`)
})

test('createNowTicker - 拒绝非法参数', async () => {
  const { createNowTicker } = await loadModule()
  assert.throws(
    () => createNowTicker(null),
    /nowRef must be/
  )
  assert.throws(
    () => createNowTicker({}),
    /nowRef must be/
  )
  assert.throws(
    () => createNowTicker({ value: 'not a number' }),
    /nowRef must be/
  )
})

// ============================================================
// countdownTextDetail: 含秒倒计时（供 partner 页"会跳动"的秒级倒计时）
// ============================================================
test('countdownTextDetail - 含秒输出（供倒计时逐秒跳动）', async () => {
  const { countdownTextDetail } = await loadModule()
  const now = 1700000000000

  // 13h34m12s → 精确到秒
  const target = now + 13 * 3600000 + 34 * 60000 + 12 * 1000
  assert.equal(countdownTextDetail(target, now), '13 小时 34 分钟 12 秒')

  // 整分（0 秒）也要带秒位，保证每秒都有可见变化
  assert.equal(countdownTextDetail(now + 13 * 3600000 + 34 * 60000, now), '13 小时 34 分钟 0 秒')

  // 已过期 → 全部 0，不出现负数/NaN
  assert.equal(countdownTextDetail(now - 5000, now), '0 小时 0 分钟 0 秒')

  // ISO string 输入同样兼容
  const isoTarget = new Date(now + 2 * 3600000 + 5 * 60000 + 30 * 1000).toISOString()
  assert.equal(countdownTextDetail(isoTarget, now), '2 小时 5 分钟 30 秒')

  // 异常输入 → 不抛错、不含 NaN
  assert.equal(countdownTextDetail('invalid', now), '时间格式异常')
  assert.ok(!countdownTextDetail(null, now).includes('NaN'))
  assert.ok(!countdownTextDetail(undefined, now).includes('NaN'))
})

test('countdownTextDetail - 秒位随时间推进（模拟倒计时跳动）', async () => {
  const { countdownTextDetail } = await loadModule()
  const target = 1700000000000 + 10 * 60000 // 目标: 10 分钟后到期

  // 同一目标时间, now 每秒前移 1s, 输出秒位逐秒递减 → 证明文本会"动"
  const t0 = countdownTextDetail(target, 1700000000000)
  const t1 = countdownTextDetail(target, 1700000000000 + 1000)
  const t2 = countdownTextDetail(target, 1700000000000 + 2000)
  assert.equal(t0, '0 小时 10 分钟 0 秒')
  assert.equal(t1, '0 小时 9 分钟 59 秒')
  assert.equal(t2, '0 小时 9 分钟 58 秒')
  // 相邻两帧文本不同 → 模板绑定后用户能看到秒在走
  assert.notEqual(t0, t1)
  assert.notEqual(t1, t2)
})
