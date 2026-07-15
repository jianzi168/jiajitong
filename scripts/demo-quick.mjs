/**
 * 快测探针：模拟 step1→step2→step3→result 链路
 * 验证 engineClient 能在非云函数环境下工作（Phase 1 探针目标）
 *
 * 运行：node scripts/demo-quick.mjs
 * 注：必须用 .mjs 后缀，启用 ESM 模式以 import engineClient (ESM)
 */
import engineClient from '../uniapp/src/utils/engineClient.js'

const city = '上海'
const income = 32000
const housing = 11000

console.log('=== 快测探针 ===')
console.log(`输入: city=${city}, income=${income}, housing=${housing}`)
console.log('调用 engineClient.callCalcQuick ...\n')

try {
  const r = await engineClient.callCalcQuick({ city, income, housing })

  console.log('=== 引擎响应（与 PDD §6.1 一致）===')
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
} catch (e) {
  console.error('❌ 调用失败:', e.message)
  process.exit(1)
}