/**
 * 快测探针：直接调引擎（不经过 engineClient / 云函数）
 *
 * Phase 1 完成后，前端 engineClient 改为只走 wx.cloud.callFunction，
 * 不再 import 引擎（UniApp rollup 对 CJS 的具名导入不友好）。
 * 探针 demo 直接 require 引擎验证算法层契约。
 *
 * 运行：node scripts/demo-quick.js
 */
'use strict'

const engine = require('../uniapp/cloudfunctions/common/engine')

const city = '上海'
const income = 32000
const housing = 11000

console.log('=== 快测探针 (直接调引擎) ===')
console.log(`输入: city=${city}, income=${income}, housing=${housing}`)

const r = engine.calcQuick({ city, income, housing })

console.log('\n=== 引擎响应（与 PDD §6.1 一致）===')
console.log(JSON.stringify(r, null, 2))

console.log('\n=== 渲染校验（对应 quick/result.vue）===')
console.log(`ScoreRing score:     ${r.health_score}`)
console.log(`statusPill:          ${r.risk_level}`)
console.log(`disposable range:    ¥${r.disposable_range[0]} — ¥${r.disposable_range[1]}`)
console.log(`top_recommendation:  ${r.top_recommendation}`)
console.log(`city_estimated:      ${r.city_estimated}`)

const checks = [
  ['score in [70, 100]', r.health_score >= 70 && r.health_score <= 100],
  ['risk_level green', r.risk_level === 'green'],
  ['range[0] > 0', r.disposable_range[0] > 0],
  ['range[1] > range[0]', r.disposable_range[1] > r.disposable_range[0]],
  ['city_estimated false', r.city_estimated === false],
]

console.log('\n=== 探针断言 ===')
let allPass = true
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  if (!ok) allPass = false
}
console.log(`\n结果: ${allPass ? '🎉 链路通' : '❌ 有失败'}`)
process.exit(allPass ? 0 : 1)