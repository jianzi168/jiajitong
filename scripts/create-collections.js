/**
 * 云数据库集合初始化脚本（开发计划 Phase 0.2 + 技术方案 §4）
 *
 * 用 wx-server-sdk 在目标云开发环境创建集合 + 索引（当前 14 个集合）。
 *
 * 运行:
 *   1. 微信开发者工具 → 编辑器 → 右下角"终端"
 *   2. 输入: node scripts/create-collections.js <envId>
 *
 * 注意:
 *   - 本脚本需要 wx-server-sdk 与真实 envId，只能在微信开发者工具内运行；
 *     本地直接 node 执行会因缺少 SDK 报错，属预期行为。
 *   - 如果集合已存在, skip 不报错
 *   - 集合清单需与 scripts/check-indexes.js 保持一致
 */
'use strict'

async function main() {
  const cloud = require('wx-server-sdk')
  const envId = process.argv[2]
  if (!envId) {
    console.error('用法: node scripts/create-collections.js <envId>')
    process.exit(1)
  }
  cloud.init({ env: envId })
  const db = cloud.database()

  const collections = [
    // ---- 代码实际在读写的集合（12 个）----
    'users', 'families', 'financial_profiles', 'budget_plans', 'weekly_entries',
    'app_config',            // 分享/订阅消息模板配置
    'family_invites',        // 伴侣邀请码
    'family_members',        // 家庭成员
    'analytics_events',      // 埋点
    'action_statuses',       // 行动清单采纳状态
    'subscribe_records',     // 订阅消息推送配额
    'feedbacks',             // 帮助与反馈
  ]
  // 已移除（2026-09-06）：recommendation_status / calc_sessions 两个集合
  // 此前按技术方案 §4 建了但代码从未读写，属于死 schema：
  //   - recommendation_status：建议采纳状态实际落在 action_statuses，本集合被取代
  //   - calc_sessions：免登录测算暂存未采用 —— 快测只有 3 个字段，重填成本极低，
  //     而为匿名会话存储财务数据反而增加隐私面与 TTL 清理负担
  // 注：已存在的云端集合不会被本脚本删除，仅不再新建。

  console.log('=== 1. 创建集合 ===')
  for (const name of collections) {
    try {
      await db.createCollection(name)
      console.log(`  ✓ ${name}`)
    } catch (e) {
      if (/already exists|Duplicated/i.test(e.errMsg || e.message || '')) {
        console.log(`  - ${name} (已存在, 跳过)`)
      } else {
        console.error(`  ✗ ${name}:`, e.errMsg || e.message)
      }
    }
  }

  console.log('\n=== 2. 创建索引 ===')
  // users._openid 唯一
  await safeCreateIndex(db, 'users', '_openid_1', { _openid: 1 }, { unique: true })
  // financial_profiles.family_id 唯一
  await safeCreateIndex(db, 'financial_profiles', 'family_id_1', { family_id: 1 }, { unique: true })
  // budget_plans.(family_id, is_active) 联合
  await safeCreateIndex(db, 'budget_plans', 'family_active', { family_id: 1, is_active: 1 })
  // budget_plans.(family_id, created_at) 降序
  await safeCreateIndex(db, 'budget_plans', 'family_created', { family_id: 1, created_at: -1 })
  // weekly_entries.(family_id, week_start) 唯一 —— 同周 upsert 覆盖防重复 (T7-2)
  await safeCreateIndex(db, 'weekly_entries', 'family_week_start', { family_id: 1, week_start: 1 }, { unique: true })
  // weekly_entries.family_id 单键, 用于月内聚合
  await safeCreateIndex(db, 'weekly_entries', 'family_id', { family_id: 1 })

  // app_config: 业务键唯一
  await safeCreateIndex(db, 'app_config', 'key_1', { key: 1 }, { unique: true })
  // family_invites: 邀请码唯一
  await safeCreateIndex(db, 'family_invites', 'invite_code_1', { invite_code: 1 }, { unique: true })
  // analytics_events: 漏斗
  await safeCreateIndex(db, 'analytics_events', 'event_created', { event: 1, created_at: -1 })
  // family_members: 一户一人
  await safeCreateIndex(db, 'family_members', 'family_openid', { family_id: 1, openid: 1 }, { unique: true })
  // action_statuses: 一户一条建议一条状态（Phase 10 行动清单写库）
  await safeCreateIndex(db, 'action_statuses', 'family_rec', { family_id: 1, rec_id: 1 }, { unique: true })
  // subscribe_records: 一人一模板一条记录（Phase 10 订阅消息推送）
  await safeCreateIndex(db, 'subscribe_records', 'openid_template', { openid: 1, template_id: 1 }, { unique: true })
  await safeCreateIndex(db, 'subscribe_records', 'template_id', { template_id: 1 })
  // feedbacks: 按时间倒序查阅
  await safeCreateIndex(db, 'feedbacks', 'created_at_-1', { created_at: -1 })

  console.log('\n✅ 初始化完成')
  process.exit(0)
}

/**
 * opts.strict=true 时, 创建失败直接抛错中止。
 * 用于幂等唯一索引这类"建不上就等于没有保护"的场景 —— 不能只打印一行红字就当成功。
 */
async function safeCreateIndex(db, coll, name, key, opts = {}) {
  const { strict = false, ...indexOpts } = opts
  try {
    // wx-server-sdk createIndex 签名: createIndex(keys, options), options.name + options.unique
    await db.collection(coll).createIndex(key, { name, ...indexOpts })
    console.log(`  ✓ ${coll}.${name}${indexOpts.unique ? ' (unique)' : ''}`)
  } catch (e) {
    const msg = e.errMsg || e.message || ''
    if (/already exists|Duplicated|already a/i.test(msg)) {
      console.log(`  - ${coll}.${name} (已存在, 跳过)`)
    } else {
      console.error(`  ✗ ${coll}.${name}:`, msg)
      if (strict) throw e
    }
  }
}

main().catch(e => {
  console.error('初始化失败:', e)
  process.exit(1)
})