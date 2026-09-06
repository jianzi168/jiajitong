import { resolveInviteAreaState, INVITE_AREA } from '../src/utils/partnerInvite.js'
const cases = [
  [true, null, INVITE_AREA.JOINED],      // 已加入, 无论有无码
  [true, 'ABC123', INVITE_AREA.JOINED],
  [false, 'ABC123', INVITE_AREA.INVITE_CARD], // 未加入但有码
  [false, null, INVITE_AREA.GENERATE],   // 未加入无码
  [false, '', INVITE_AREA.GENERATE],
]
for (const [hasPartner, inviteCode, expected] of cases) {
  const got = resolveInviteAreaState(hasPartner, inviteCode)
  if (got !== expected) throw new Error(`resolveInviteAreaState(${hasPartner}, ${inviteCode}) = ${got}, want ${expected}`)
}
console.log('partner invite state tests passed')
