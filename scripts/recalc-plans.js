/**
 * 存量预算方案重算脚本（引擎升级迁移）
 *
 * 用途：引擎测算口径变更后，已落库的 budget_plans 仍持有旧算法的值。
 *      本脚本按 `engine_version` 精确定位旧方案，用当前引擎重算派生字段。
 *
 * 为什么需要显式迁移而不是读时自动修复：
 *   读时修复会让"读"带上写副作用——每次命中都触发一次全量测算 + 一次 DB 写入，
 *   云函数耗时与并发行为不可控，且失败被静默吞掉返回旧数据。
 *   显式迁移可预演、可限流、可核对，出问题能止损。
 *
 * 运行（需在微信开发者工具内，依赖 wx-server-sdk）：
 *   node scripts/recalc-plans.js <envId>                 # 预演，不写库
 *   node scripts/recalc-plans.js <envId> --apply          # 实际写入
 *   node scripts/recalc-plans.js <envId> --limit 10       # 只处理前 10 条
 *   node scripts/recalc-plans.js <envId> --family fam_x   # 只处理指定家庭
 *
 * 建议流程：
 *   1. 先跑预演，核对影响条数与抽样差异是否符合预期
 *   2. 小批量 --limit 20 --apply 验证
 *   3. 确认无误后全量 --apply
 */
'use strict'

const ENGINE = require('../uniapp/cloudfunctions/api/common/engine')
const { computePlanUpdate } = require('../uniapp/cloudfunctions/api/common/plan-recalc')

function parseArgs(argv) {
  const args = { envId: null, apply: false, limit: Infinity, familyId: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    else if (a === '--limit') args.limit = Number(argv[++i]) || Infinity
    else if (a === '--family') args.familyId = argv[++i] || null
    else if (!a.startsWith('--')) args.envId = a
  }
  return args
}

/**
 * 按 engine_version 给方案分类 —— 纯函数
 * @param {Array} all
 * @param {number} currentVersion
 * @returns {{upToDate: Array, stale: Array, noInput: Array}}
 */
function classifyPlans(all, currentVersion) {
  const upToDate = []
  const stale = []
  const noInput = []
  for (const p of all || []) {
    const v = Number(p.engine_version || 1)
    if (v >= currentVersion) { upToDate.push(p); continue }
    if (!p.plan_input) { noInput.push(p); continue }
    stale.push(p)
  }
  return { upToDate, stale, noInput }
}

/**
 * 执行迁移（CLI 与测试共用）
 *
 * @param {object} opts
 * @param {object} opts.db          - 云数据库句柄（需 collection()）
 * @param {object} [opts.engine]    - 引擎，默认取 uniapp 内的实现
 * @param {boolean} [opts.apply]    - false 时只预演不写库
 * @param {number} [opts.limit]
 * @param {object|null} [opts.familyId]
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{total:number, upToDate:number, stale:number, noInput:number, ok:number, failed:number, samples:Array}>}
 */
async function runMigration({ db, engine = ENGINE, apply = false, limit = Infinity, familyId = null, log = () => {} } = {}) {
  if (!db) throw new Error('runMigration: db 必填')
  const current = engine.ENGINE_VERSION

  const where = familyId ? { family_id: familyId } : {}
  const { data: all } = await db.collection('budget_plans').where(where).get()
  log(`1. 共读取 ${all.length} 条方案`)

  const { upToDate, stale, noInput } = classifyPlans(all, current)
  log(`2. 分类结果`)
  log(`   - 已是当前版本 (v${current}) : ${upToDate.length} 条，跳过`)
  log(`   - 待重算（旧版本）          : ${stale.length} 条`)
  log(`   - 缺 plan_input 无法重算     : ${noInput.length} 条（需用户重新测算）`)

  const result = {
    total: all.length,
    upToDate: upToDate.length,
    stale: stale.length,
    noInput: noInput.length,
    ok: 0,
    failed: 0,
    samples: [],
  }

  if (noInput.length) {
    log('')
    log('   无法重算的方案 _id：')
    noInput.slice(0, 20).forEach((p) => log(`     - ${p._id} (family=${p.family_id}, v${p.engine_version || 1})`))
    if (noInput.length > 20) log(`     ... 另有 ${noInput.length - 20} 条`)
  }

  if (!stale.length) {
    log('')
    log('✅ 没有需要重算的方案。')
    return result
  }

  const targets = stale.slice(0, limit)
  log('')
  log(`3. 抽样核对（前 ${Math.min(5, targets.length)} 条）`)

  let changed = 0
  for (const p of targets) {
    const update = computePlanUpdate(p)
    if (!update) {
      result.failed++
      log(`   ✗ ${p._id} 重算失败（引擎异常）`)
      continue
    }
    if (p.health_score !== update.health_score) changed++
    if (result.samples.length < 5) {
      const foodBefore = (p.categories || []).find((c) => c.id === 'food')
      const foodAfter = (update.categories || []).find((c) => c.id === 'food')
      result.samples.push({
        _id: p._id,
        version: p.engine_version || 1,
        healthBefore: p.health_score,
        healthAfter: update.health_score,
        foodBefore: foodBefore ? foodBefore.suggested : null,
        foodAfter: foodAfter ? foodAfter.suggested : null,
      })
      const s = result.samples[result.samples.length - 1]
      log(`   ${s._id} (v${s.version}): 健康分 ${s.healthBefore} → ${s.healthAfter} | 餐饮 ${s.foodBefore} → ${s.foodAfter}`)
    }
  }
  log(`   健康分发生变化的方案: ${changed} / ${targets.length}`)

  log('')
  if (!apply) {
    log('4. 预演结束，未写入。确认无误后加 --apply 执行。')
    return result
  }

  log(`4. 开始写入 ${targets.length} 条...`)
  for (const p of targets) {
    const update = computePlanUpdate(p)
    if (!update) {
      result.failed++
      log(`   ✗ ${p._id} 重算失败（引擎异常）`)
      continue
    }
    try {
      await db.collection('budget_plans').doc(p._id).update({ data: update })
      result.ok++
    } catch (e) {
      result.failed++
      log(`   ✗ ${p._id} 写入失败: ${(e && (e.errMsg || e.message)) || e}`)
    }
  }

  log('')
  log(`✅ 完成：成功 ${result.ok} 条，失败 ${result.failed} 条`)
  if (limit !== Infinity && stale.length > limit) {
    log(`   注意：本次仅处理前 ${limit} 条，仍有 ${stale.length - limit} 条待处理。`)
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.envId) {
    console.error('用法: node scripts/recalc-plans.js <envId> [--apply] [--limit N] [--family <familyId>]')
    process.exit(1)
  }

  const cloud = require('wx-server-sdk')
  cloud.init({ env: args.envId })
  const db = cloud.database()

  console.log('=== 存量方案重算 ===')
  console.log(`  目标环境 : ${args.envId}`)
  console.log(`  当前引擎 : v${ENGINE.ENGINE_VERSION}`)
  console.log(`  模式     : ${args.apply ? '写入（--apply）' : '预演（不写库）'}`)
  if (args.familyId) console.log(`  限定家庭 : ${args.familyId}`)
  if (args.limit !== Infinity) console.log(`  条数上限 : ${args.limit}`)
  console.log('')

  const result = await runMigration({
    db,
    apply: args.apply,
    limit: args.limit,
    familyId: args.familyId,
    log: (m) => console.log(m),
  })

  process.exit(result.failed > 0 ? 1 : 0)
}

module.exports = { runMigration, classifyPlans, parseArgs }

if (require.main === module) {
  main().catch((e) => {
    console.error('重算失败:', e)
    process.exit(1)
  })
}
