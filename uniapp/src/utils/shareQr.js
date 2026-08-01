/**
 * 分享页 QR 适配 (Phase 8.1)
 *
 * 设计原则:
 *  - 不抛错: QR 是可选的; 任何失败/缺失都降级为 '', 海报仍生成
 *  - 单点适配: downloader 由调用方注入 (uni.cloud.downloadFile),
 *    便于在 Node 测试中用 mock 替换
 *  - 字段白名单: 只识别 { mode: 'wxacode', file_id } 形态;
 *    placeholder / 非 wxacode 模式直接返回 ''
 */

export async function resolveQrImage(qr, downloadFile) {
  if (!qr || qr.mode !== 'wxacode' || !qr.file_id) return ''
  try {
    const res = await downloadFile(qr.file_id)
    return res || ''
  } catch (e) {
    return ''
  }
}
