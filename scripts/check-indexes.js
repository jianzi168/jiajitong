#!/usr/bin/env node
/**
 * 集合索引校验脚本（技术方案附录 C）
 *
 * 用法：
 *   node scripts/check-indexes.js           # 打印索引清单
 *   node scripts/check-indexes.js --check   # 连接云开发校验（需配置 envId）
 *
 * 索引需在微信云开发控制台 → 数据库 → 选集合 → 索引管理 手动创建。
 */

const INDEX_LIST = [
  { collection: 'users', fields: '_openid', unique: true },
  { collection: 'families', fields: 'owner_openid', unique: false },
  { collection: 'family_members', fields: 'family_id + openid', unique: true },
  { collection: 'financial_profiles', fields: 'family_id', unique: true },
  { collection: 'budget_plans', fields: 'family_id + is_active', unique: false },
  { collection: 'budget_plans', fields: 'family_id + created_at', unique: false },
  { collection: 'weekly_entries', fields: 'family_id + week_start', unique: true },
  { collection: 'recommendation_status', fields: 'family_id + plan_id + rule_id', unique: true },
  { collection: 'subscriptions', fields: 'openid', unique: false },
  { collection: 'subscriptions', fields: 'family_id', unique: false },
  { collection: 'orders', fields: 'openid + created_at', unique: false },
  { collection: 'family_invites', fields: 'invite_code', unique: true },
  { collection: 'calc_sessions', fields: '_openid + created_at', unique: false },
  { collection: 'calc_sessions', fields: 'expire_at', unique: false },
  { collection: 'analytics_events', fields: '_openid + created_at', unique: false },
  { collection: 'analytics_events', fields: 'event + created_at', unique: false },
  { collection: 'app_config', fields: 'key', unique: true }
]

const COLLECTIONS = [
  'users', 'families', 'family_members', 'financial_profiles',
  'budget_plans', 'weekly_entries', 'subscriptions', 'orders',
  'recommendation_status', 'family_invites', 'calc_sessions',
  'analytics_events', 'app_config'
]

function printList() {
  console.log('\n📋 家计通 · 云数据库索引清单\n')
  console.log('集合（13 个，需在控制台手动创建）：')
  COLLECTIONS.forEach((c, i) => console.log(`  ${i + 1}. ${c}`))

  console.log('\n索引（17 条，需在控制台手动创建）：\n')
  console.log('  集合                        | 索引字段                    | 唯一')
  console.log('  ' + '-'.repeat(80))
  INDEX_LIST.forEach((idx) => {
    const col = idx.collection.padEnd(28)
    const fields = idx.fields.padEnd(28)
    const unique = idx.unique ? '✅ 唯一' : '   否'
    console.log(`  ${col} | ${fields} | ${unique}`)
  })

  console.log('\n📌 操作步骤：')
  console.log('  1. 打开微信云开发控制台 → 数据库')
  console.log('  2. 逐个创建上述 13 个集合')
  console.log('  3. 对每个集合进入「索引管理」创建上述索引')
  console.log('  4. 对每个集合设置安全规则为 { "read": false, "write": false }')
  console.log('')
}

async function checkCloud() {
  console.log('\n🔍 连接云开发校验索引...\n')
  try {
    // 动态引入，避免未安装时报错
    const tcb = require('@cloudbase/node-sdk')
    const app = tcb.init({ env: process.env.CLOUD_ENV || 'jiajitong-dev' })
    const db = app.database()

    for (const idx of INDEX_LIST) {
      try {
        const indexes = await db.collection(idx.collection).getIndexes()
        const fieldList = idx.fields.split(' + ')
        const found = indexes.find((i) =>
          i.keys && fieldList.every((f, i2) => i.keys[f] !== undefined)
        )
        if (found) {
          console.log(`  ✅ ${idx.collection} [${idx.fields}]`)
        } else {
          console.log(`  ❌ ${idx.collection} [${idx.fields}] — 缺失，请去控制台补建`)
        }
      } catch (e) {
        console.log(`  ⚠️  ${idx.collection} — 无法获取索引（集合可能未创建）`)
      }
    }
  } catch (e) {
    console.log('  ⚠️  未安装 @cloudbase/node-sdk，跳过云端校验')
    console.log('  安装：npm install -g @cloudbase/node-sdk')
    printList()
  }
  console.log('')
}

const args = process.argv.slice(2)
if (args.includes('--check')) {
  checkCloud()
} else {
  printList()
}
