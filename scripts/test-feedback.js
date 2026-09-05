/**
 * 帮助与反馈 · feedback.submit 测试
 */
'use strict'

const test = require('node:test')
const assert = require('assert')

function fakeCtx(openid) {
  if (!openid) return {}
  return { OPENID: openid, openid, appId: 'wx_test' }
}

let h

test('帮助与反馈 — feedback.submit', { concurrency: false }, async (t) => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../uniapp/cloudfunctions/api/handlers/index')]
    h = require('../uniapp/cloudfunctions/api/handlers/index')
    h._resetMemory()
  })

  await t.test('F-1 未登录可提交，openid 为 null', async () => {
    const res = await h['feedback.submit'](fakeCtx(null), {
      type: 'suggestion',
      content: '希望增加城市覆盖范围到更多二线城市',
    })
    assert.equal(res.code, 0)
    assert.ok(res.data.id)
    const rows = h._allFeedbacks()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].openid, null)
    assert.equal(rows[0].type, 'suggestion')
    assert.equal(rows[0].status, 'new')
  })

  await t.test('F-2 登录提交写入 openid', async () => {
    const res = await h['feedback.submit'](fakeCtx('userA'), {
      type: 'bug',
      content: '看板页面滚动时顶部标题会跟着动，请修复',
      contact: 'wechat_demo',
    })
    assert.equal(res.code, 0)
    const row = h._allFeedbacks()[0]
    assert.equal(row.openid, 'userA')
    assert.equal(row.type, 'bug')
    assert.equal(row.contact, 'wechat_demo')
  })

  await t.test('F-3 content 过短', async () => {
    const res = await h['feedback.submit'](fakeCtx('userA'), {
      type: 'other',
      content: '太短了',
    })
    assert.equal(res.code, 40010)
    assert.match(res.userHint || '', /多写/)
  })

  await t.test('F-4 type 非法', async () => {
    const res = await h['feedback.submit'](fakeCtx('userA'), {
      type: 'spam',
      content: '这是一段足够长的反馈内容用来通过校验',
    })
    assert.equal(res.code, 40010)
  })

  await t.test('F-5 限流：同 openid 每分钟最多 3 次', async () => {
    const payload = {
      type: 'suggestion',
      content: '这是一段足够长的反馈内容用来通过限流测试一二',
    }
    for (let i = 0; i < 3; i++) {
      const okRes = await h['feedback.submit'](fakeCtx('rateUser'), payload)
      assert.equal(okRes.code, 0, `第 ${i + 1} 次应成功`)
    }
    const limited = await h['feedback.submit'](fakeCtx('rateUser'), payload)
    assert.equal(limited.code, 42901)
    assert.match(limited.userHint || '', /频繁/)
  })

  await t.test('F-6 contact 过长', async () => {
    const res = await h['feedback.submit'](fakeCtx('userA'), {
      type: 'other',
      content: '这是一段足够长的反馈内容用来测试联系方式长度校验',
      contact: 'x'.repeat(51),
    })
    assert.equal(res.code, 40010)
    assert.match(res.userHint || '', /联系方式/)
  })
})
