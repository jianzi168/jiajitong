/**
 * 家庭档案读写测试
 *
 * 背景：family/index.vue 的 onSave() 曾只弹 toast 并把 isDirty 置 false，
 * 用户会以为保存成功 —— 典型的「看起来能点、点了没反应」。
 * 现在补上 families.getProfile / families.saveProfile。
 *
 * 同时锁住一个易复发的问题：家庭页此前用 tts / future 两个阶段取值，
 * 而引擎只认 newlywed / planning / pregnant。若前端传旧值入库，
 * 测算会拿不到阶段系数。
 *
 * 运行: node --test scripts/test-family-profile.js
 */
'use strict'

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { dispatch } = require('../uniapp/cloudfunctions/api')
const handlers = require('../uniapp/cloudfunctions/api/handlers')

beforeEach(() => {
  if (handlers._resetMemory) handlers._resetMemory()
})

function ctx(openid) {
  return { openid, unionid: null, appid: null, requestId: null }
}
function ok(r) {
  assert.equal(r.code, 0, `expected 0, got ${r.code} ${r.message || ''}`)
  return r.data
}

async function boot(openid) {
  await dispatch({ action: 'user.bootstrap' }, ctx(openid))
}

describe('families.getProfile', () => {
  test('返回默认档案与合法阶段列表', async () => {
    await boot('fp_1')
    const d = ok(await dispatch({ action: 'families.getProfile' }, ctx('fp_1')))
    assert.ok(d.profile)
    assert.ok(d.profile.name)
    assert.ok(d.profile.city)
    // 阶段列表必须与引擎口径一致
    assert.deepEqual(d.stages.sort(), ['newlywed', 'planning', 'pregnant'])
  })

  test('未登录 → UNAUTHORIZED', async () => {
    const r = await dispatch({ action: 'families.getProfile' }, {})
    assert.equal(r.code, 40101)
  })
})

describe('families.saveProfile', () => {
  test('保存家庭名/阶段/城市并可读回', async () => {
    await boot('fp_2')
    const d = ok(await dispatch({
      action: 'families.saveProfile',
      payload: { name: '晓雯的家', stage: 'planning', city: '厦门' },
    }, ctx('fp_2')))

    assert.equal(d.profile.name, '晓雯的家')
    assert.equal(d.profile.stage, 'planning')
    assert.equal(d.profile.city, '厦门')

    // 城市等级由服务端按城市名推导，不接受客户端传值
    assert.equal(d.profile.city_tier, 'tier3', '厦门应为 tier3')
    assert.equal(d.profile.city_estimated, false)
    assert.ok(d.profile.updated_at, '应回写更新时间')

    // 读回确认真的落库了
    const back = ok(await dispatch({ action: 'families.getProfile' }, ctx('fp_2')))
    assert.equal(back.profile.name, '晓雯的家')
    assert.equal(back.profile.stage, 'planning')
    assert.equal(back.profile.city, '厦门')
  })

  test('城市不在基准表 → city_estimated 为 true，等级兜底 tier2', async () => {
    await boot('fp_3')
    const d = ok(await dispatch({
      action: 'families.saveProfile',
      payload: { city: '鄂尔多斯' },
    }, ctx('fp_3')))
    assert.equal(d.profile.city_estimated, true)
    assert.equal(d.profile.city_tier, 'tier2')
  })

  test('只传部分字段 → 其余字段不受影响', async () => {
    await boot('fp_4')
    await dispatch({ action: 'families.saveProfile', payload: { name: '甲家', city: '上海' } }, ctx('fp_4'))
    const before = ok(await dispatch({ action: 'families.getProfile' }, ctx('fp_4')))
    assert.equal(before.profile.stage, 'newlywed')

    await dispatch({ action: 'families.saveProfile', payload: { name: '乙家' } }, ctx('fp_4'))
    const after = ok(await dispatch({ action: 'families.getProfile' }, ctx('fp_4')))
    assert.equal(after.profile.name, '乙家')
    assert.equal(after.profile.city, '上海', '未传的城市不应被清空')
    assert.equal(after.profile.stage, 'newlywed', '未传的阶段不应被清空')
  })

  test('拒绝引擎不认识的阶段取值（原 tts / future）', async () => {
    await boot('fp_5')
    for (const bad of ['tts', 'future', '', 'PLANNING', null]) {
      const r = await dispatch({ action: 'families.saveProfile', payload: { stage: bad } }, ctx('fp_5'))
      assert.equal(r.code, 40010, `stage=${JSON.stringify(bad)} 应被拒绝`)
    }
    // 被拒后档案不应被改动
    const d = ok(await dispatch({ action: 'families.getProfile' }, ctx('fp_5')))
    assert.equal(d.profile.stage, 'newlywed')
  })

  test('空家庭名 / 空城市 → 拒绝', async () => {
    await boot('fp_6')
    const r1 = await dispatch({ action: 'families.saveProfile', payload: { name: '   ' } }, ctx('fp_6'))
    assert.equal(r1.code, 40010)
    const r2 = await dispatch({ action: 'families.saveProfile', payload: { city: '' } }, ctx('fp_6'))
    assert.equal(r2.code, 40010)
  })

  test('家庭名超长被截断', async () => {
    await boot('fp_7')
    const long = '家'.repeat(100)
    const d = ok(await dispatch({ action: 'families.saveProfile', payload: { name: long } }, ctx('fp_7')))
    assert.equal(d.profile.name.length, 40, '应截断到 40 字')
  })

  test('无任何字段 → VALIDATION_ERROR', async () => {
    await boot('fp_8')
    const r = await dispatch({ action: 'families.saveProfile', payload: {} }, ctx('fp_8'))
    assert.equal(r.code, 40010)
  })

  test('member 不能改家庭档案（需 owner）', async () => {
    const OWNER = 'fp_owner'
    await boot(OWNER)
    const inv = ok(await dispatch({ action: 'families.inviteCreate' }, ctx(OWNER)))

    const MEMBER = 'fp_member'
    await boot(MEMBER)
    ok(await dispatch({ action: 'families.inviteJoin', payload: { invite_code: inv.invite_code } }, ctx(MEMBER)))

    const r = await dispatch({ action: 'families.saveProfile', payload: { name: '伴侣改名' } }, ctx(MEMBER))
    assert.equal(r.code, 40301, 'member 不应能修改家庭档案')

    // member 可以读
    ok(await dispatch({ action: 'families.getProfile' }, ctx(MEMBER)))

    // owner 仍可写
    ok(await dispatch({ action: 'families.saveProfile', payload: { name: '主人改名' } }, ctx(OWNER)))
  })
})
