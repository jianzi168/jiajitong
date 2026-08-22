/**
 * PDF 导出 (Phase 8) — 客户端 Canvas → PNG → openDocument
 *
 * 设计:
 *  - 零云算力, 复用 poster.js 绘制
 *  - 图片型 PDF (单页), 微信文档菜单可「保存到本地 / 转发」
 *  - 失败兜底: openDocument 失败时降级为 saveImageToPhotosAlbum (走 share 流)
 *
 * 用法:
 *   import { exportReportPdf } from '@/utils/pdf'
 *   await exportReportPdf(plan)
 */

import { buildShareModel, drawSharePoster } from './poster'

/**
 * @param {object} plan - active plan (含 meta / monthly_summary / health_score)
 */
export function exportReportPdf(plan) {
  if (!plan) {
    return Promise.reject(new Error('NO_PLAN'))
  }

  const model = buildShareModel(plan, { scoreOnly: false })
  const canvasId = 'reportPdfCanvas'
  const fileName = `jiajitong-report-${plan._id || Date.now()}.png`

  return new Promise((resolve, reject) => {
    drawSharePoster({ canvasId, model, qrImage: '', pageSize: 'a4' })
      .then(() => {
        // canvas → tempFilePath
        uni.canvasToTempFilePath({
          canvasId,
          fileType: 'png',
          quality: 1,
          success: ({ tempFilePath }) => {
            // 写入 USER_DATA_PATH
            const fm = wx.getFileSystemManager()
            const savePath = `${wx.env.USER_DATA_PATH}/${fileName}`
            fm.writeFile({
              filePath: savePath,
              data: tempFilePath,
              encoding: 'binary',
              success: () => {
                // 唤起微信文档
                uni.openDocument({
                  filePath: savePath,
                  showMenu: true,
                  success: (res) => {
                    uni.showToast({ title: '已生成 PDF', icon: 'success' })
                    resolve(res)
                  },
                  fail: (e) => {
                    // 降级为保存图片
                    fallbackToImage(tempFilePath)
                      .then(resolve)
                      .catch(reject)
                  },
                })
              },
              fail: (e) => {
                // 写文件失败, 降级为直接保存图片
                fallbackToImage(tempFilePath)
                  .then(resolve)
                  .catch(reject)
              },
            })
          },
          fail: (e) => reject(new Error('CANVAS_TO_FILE_FAILED: ' + (e.errMsg || ''))),
        })
      })
      .catch(reject)
  })
}

function fallbackToImage(tempFilePath) {
  return new Promise((resolve, reject) => {
    // 检查相册权限
    uni.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          // 已拒绝, 引导去设置
          uni.showModal({
            title: '需要相册权限',
            content: '请在设置中开启相册权限以保存图片',
            confirmText: '去设置',
            success: (m) => {
              if (m.confirm) uni.openSetting()
              reject(new Error('AUTH_DENIED'))
            },
            fail: () => reject(new Error('MODAL_FAILED')),
          })
          return
        }
        // 未询问 或 已授权
        if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          uni.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => doSave(),
            fail: () => reject(new Error('AUTH_DENIED')),
          })
          return
        }
        doSave()
      },
      fail: () => reject(new Error('GET_SETTING_FAILED')),
    })

    function doSave() {
      uni.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => {
          uni.showToast({ title: '已保存为图片', icon: 'success' })
          resolve()
        },
        fail: (e) => reject(new Error('SAVE_FAILED: ' + (e.errMsg || ''))),
      })
    }
  })
}
