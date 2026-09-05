/**
 * 占位反馈文案测试
 *
 * 「看起来能点、点了没反应」是体验杀手。本测试守护两件事：
 *   1. isSubscribeConfigured 只在模板 ID 真实配置时才放行（未配置 → 必须禁用入口）
 *   2. UNAVAILABLE_COPY 覆盖当前所有"功能未就绪"的入口，且文案必须说清后果
 *
 * 运行: node uniapp/scripts/test-placeholder-feedback.js
 */
import { isSubscribeConfigured, UNAVAILABLE_COPY } from '../src/utils/featureAvailability.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// ---- isSubscribeConfigured ----
assert(isSubscribeConfigured([]) === false, 'empty templates must be unavailable')
assert(isSubscribeConfigured(null) === false, 'null must be unavailable')
assert(isSubscribeConfigured(undefined) === false, 'undefined must be unavailable')
assert(isSubscribeConfigured(['']) === false, 'empty-string template must be unavailable')
assert(isSubscribeConfigured(['a', '']) === false, 'any empty template must make all unavailable')
assert(isSubscribeConfigured(['tmplA']) === true, 'configured template must be available')
assert(isSubscribeConfigured(['tmplA', 'tmplB']) === true, 'multiple configured templates must be available')

// ---- UNAVAILABLE_COPY ----
// 这两条文案被 family/index.vue 与 setup-reminder/index.vue 直接使用
assert(
  UNAVAILABLE_COPY.subscribe.includes('未'),
  'subscribe copy must disclose the feature is not open'
)
assert(
  UNAVAILABLE_COPY.familySave.includes('不会同步'),
  'familySave copy must disclose that edits are not persisted'
)

// 账号注销已由 users.deleteMe 真实实现（级联删除 entries/plans/profile/family/user），
// 不再是"未开放"状态，因此不应存在 delete 占位文案。
// 历史断言曾要求 UNAVAILABLE_COPY.delete 存在 —— 若它重新出现，
// 说明注销链路被回退成了占位，需要同步检查后端。
assert(
  UNAVAILABLE_COPY.delete === undefined,
  'account deletion is implemented (users.deleteMe); delete placeholder copy must not exist'
)

// 文案必须是冻结对象，防止运行期被改写
assert(Object.isFrozen(UNAVAILABLE_COPY), 'UNAVAILABLE_COPY must be frozen')

console.log('placeholder feedback tests passed')
