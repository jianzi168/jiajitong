/**
 * app_config seed 脚本 (Phase 8 商业化)
 *
 * 把 paywall_prices_v1 配置写入 app_config 集合;
 * 云函数端用 getAppConfig('paywall_prices_v1') 读,
 * 前端 fallback 写死 { report_once: 1990, pro_yearly: 6800, pro_family: 12800 }。
 *
 * 用法:
 *   node scripts/seed-prices.js cloud1-0g12dcf7941e979c
 *
 * 注: 仅 dev/staging 环境需要 seed, prod 由运营手动改价格
 *     并通过版本号 (v1, v2, ...) 灰度。
 */
'use strict'

const PRICES_V1 = {
  report_once: 1990,    // ¥19.9
  pro_yearly:   6800,    // ¥68
  pro_family:   12800,   // ¥128 (本期占位, 暂不接 orders.create)
  report_once_days: 7,   // 7 天 Pro
  currency: 'CNY',
}

async function main() {
  const cloud = require('wx-server-sdk')
  const envId = process.argv[2]
  if (!envId) {
    console.error('用法: node scripts/seed-prices.js <envId>')
    process.exit(1)
  }
  cloud.init({ env: envId })
  const db = cloud.database()
  const _ = db.command

  const KEY = 'paywall_prices_v1'
  const coll = db.collection('app_config')

  try {
    const { data } = await coll.where({ key: KEY }).limit(1).get()
    if (data.length > 0) {
      const existing = data[0]
      await coll.doc(existing._id).update({
        data: { value: PRICES_V1, updated_at: new Date(), updated_by: 'seed-script' },
      })
      console.log(`  ↻ ${KEY} updated:`, PRICES_V1)
    } else {
      await coll.add({
        data: {
          key: KEY,
          value: PRICES_V1,
          updated_at: new Date(),
          updated_by: 'seed-script',
        },
      })
      console.log(`  ✓ ${KEY} created:`, PRICES_V1)
    }
  } catch (e) {
    console.error('  ✗ seed 失败:', e.errMsg || e.message)
    process.exit(1)
  }

  process.exit(0)
}

main().catch(e => {
  console.error('seed 失败:', e)
  process.exit(1)
})
