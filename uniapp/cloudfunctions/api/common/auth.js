/**
 * 鉴权封装（技术方案 §5.6）
 *
 * 注意：本文件中的 wx-server-sdk 仅在云函数运行时存在；
 *       本地测试会 require 失败，handlers 里需 try/catch 或云函数侧 init。
 */
'use strict'

class AuthError extends Error {
  constructor(code, message, userHint = '') {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.userHint = userHint
  }
}

async function requireUser(openid) {
  const cloud = require('wx-server-sdk')
  if (!openid) {
    throw new AuthError(40101, 'UNAUTHORIZED', '请先登录')
  }
  const db = cloud.database()
  const { data } = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!data.length) {
    throw new AuthError(40101, 'UNAUTHORIZED', '用户不存在，请先登录')
  }
  return data[0]
}

async function requireOwner(user) {
  if (!user || user.role !== 'owner') {
    throw new AuthError(40301, 'FORBIDDEN', '需要 owner 权限')
  }
  return user
}

async function requireFamilyMember(user, familyId) {
  if (!user || user.family_id !== familyId) {
    throw new AuthError(40301, 'FORBIDDEN', '家庭不匹配')
  }
  return user
}

module.exports = { AuthError, requireUser, requireOwner, requireFamilyMember }