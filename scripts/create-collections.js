/**
 * 云数据库集合初始化脚本（开发计划 Phase 0.2 + 技术方案 §4）
 *
 * 用 wx-server-sdk 在目标云开发环境创建 5 个集合 + 索引。
 *
 * 运行:
 *   1. 微信开发者工具 → 编辑器 → 右下角"终端"
 *   2. 输入: node scripts/create-collections.js cloud1-0g12dcf7941e979c
 *
 * 注意:
 *   - 云函数环境必须已经初始化（wx.cloud.init）
 *   - 如果集合已存在, skip 不报错
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
    'users', 'families', 'financial_profiles', 'budget_plans', 'weekly_entries',
    // Phase 8 分享/订阅消息模板配置
    'app_config',
    // Phase 9 预留
    'recommendation_status', 'family_invites', 'calc_sessions', 'analytics_events', 'family_members',
    // Phase 10 行动清单写库
    'action_statuses',
    // Phase 10 订阅消息推送
    'subscribe_records',
    // 帮助与反馈
    'feedbacks',
  ]

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
  // recommendation_status (Phase 7 留 P1,本期先建索引)
  await safeCreateIndex(db, 'recommendation_status', 'family_plan_rule', { family_id: 1, plan_id: 1, rule_id: 1 }, { unique: true })
  // family_invites: 邀请码唯一
  await safeCreateIndex(db, 'family_invites', 'invite_code_1', { invite_code: 1 }, { unique: true })
  // calc_sessions: 过期清理
  await safeCreateIndex(db, 'calc_sessions', 'expire_at_1', { expire_at: 1 })
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