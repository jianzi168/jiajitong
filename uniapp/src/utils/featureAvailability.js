export function isSubscribeConfigured(tmplIds) {
  if (!Array.isArray(tmplIds) || tmplIds.length === 0) return false
  return tmplIds.every((id) => typeof id === 'string' && id.length > 0)
}
export const UNAVAILABLE_COPY = Object.freeze({
  subscribe: '周度提醒正在准备中, 暂未开启',
  delete: '账号注销功能正在接入, 当前未提交任何申请',
  pdf: 'PDF 导出功能正在接入',
  csv: '数据导出功能正在接入',
  policy: '隐私政策功能正在接入',
  familySave: '家庭档案保存功能正在接入, 当前修改不会同步',
})
export const canPersistFamilyProfile = false
