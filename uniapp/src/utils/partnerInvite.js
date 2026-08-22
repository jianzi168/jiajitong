/**
 * 邀请区状态判定（伴侣已加入时禁用「生成邀请码」）
 *
 * 把「伴侣已加入 → 禁用 / 有邀请码 → 邀请卡 / 否则 → 生成按钮」
 * 收敛成一个纯函数，便于单测 + 模板按返回值分支。
 */
export const INVITE_AREA = Object.freeze({
  JOINED: 'joined',            // 伴侣已加入: 禁用按钮 + 提示, 邀请卡收起
  INVITE_CARD: 'invite-card',  // 已生成邀请码: 显示邀请卡
  GENERATE: 'generate',        // 未加入未生成: 可点击生成按钮
})

export function resolveInviteAreaState(hasPartner, inviteCode) {
  if (hasPartner) return INVITE_AREA.JOINED
  if (inviteCode) return INVITE_AREA.INVITE_CARD
  return INVITE_AREA.GENERATE
}
