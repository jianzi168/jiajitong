/**
 * 云数据库初始化说明（在微信开发者工具 → 云开发控制台执行）
 *
 * 1. 创建集合（全部安全规则 read: false, write: false）：
 *    users, families, family_members, financial_profiles, budget_plans,
 *    weekly_entries, subscriptions, orders, recommendation_status,
 *    family_invites, calc_sessions, analytics_events, app_config
 *
 * 2. 创建索引（云开发控制台 → 数据库 → 索引）：
 *    users: _openid (unique)
 *    financial_profiles: family_id (unique)
 *    budget_plans: family_id + is_active, family_id + created_at
 *    weekly_entries: family_id + week_start (unique)
 *
 * 3. 环境变量（云函数 → 配置）：
 *    INCOME_ENCRYPT_KEY — 32 字节 hex
 *    CLOUD_ENV — 当前环境 ID
 */

console.log('请阅读本文件注释，在微信云开发控制台手动初始化数据库。')
