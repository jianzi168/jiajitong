/**
 * 快测探针：模拟 step1→step2→step3→result 链路
 * 验证 engineClient 能在非云函数环境下工作（Phase 1 探针目标）
 *
 * 运行：node scripts/demo-quick.js
 */
'use strict'

const engineClient = require('../uniapp/src/utils/engineClient.js')

// 模拟 step1 选城市
const city = '上海'

// 模拟 step2 收入
const income = 32000

// 模拟 step3 房贷
const housing = 11000

console.log('=== 快测探针 ===')
console.log(`输入: city=${city}, income=${income}, housing=${housing}`)
console.log('调用 engineClient.callCalcQuick ...\n')

engineClient.callCalcQuick({ city, income, housing }).then(r => {
  console.log('=== 引擎响应（与 PDD §6.1 一致）===')
  console.log(JSON.stringify(r, null, 2))

  console.log('\n=== 渲染校验（对应 quick/result.vue）===')
  console.log(`ScoreRing score:     ${r.health_score}`)
  console.log(`statusPill:          ${r.risk_level}`)
  console.log(`disposable range:    ¥${r.disposable_range[0]} — ¥${r.disposable_range[1]}`)
  console.log(`top_recommendation:  ${r.top_recommendation}`)
  console.log(`city_estimated:      ${r.city_estimated}`)

  // 校验 vs 原硬编码（78 / ¥8,200-10,800 / 餐饮可省 ¥300-500）
  const checks = []
  checks.push(['score in [70, 100]', r.health_score >= 70 && r.health_score <= 100])
  checks.push(['risk_level green', r.risk_level === 'green'])
  checks.push(['range[0] > 0', r.disposable_range[0] > 0])
  checks.push(['range[1] > range[0]', r.disposable_range[1] > r.disposable_range[0]])
  checks.push(['city_estimated false', r.city_estimated === false])

  console.log('\n=== 探针断言 ===')
  let allPass = true
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`)
    if (!ok) allPass = false
  }
  console.log(`\n结果: ${allPass ? '🎉 链路通' : '❌ 有失败'}`)
  process.exit(allPass ? 0 : 1)
}).catch(e => {
  console.error('❌ 调用失败:', e.message)
  process.exit(1)
})
