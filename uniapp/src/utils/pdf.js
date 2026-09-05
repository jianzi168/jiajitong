/**
 * 规划书 PDF 导出
 *
 * 为什么自己生成 PDF：
 *   微信小程序的 openDocument 只支持 doc/docx/xls/xlsx/ppt/pptx/pdf，
 *   **不支持 PNG/JPG**。旧实现直接把 canvas 生成的 PNG 丢给 openDocument，
 *   必然失败并降级成「存图片」—— 用户点「导出 PDF」却拿不到 PDF。
 *
 * 方案：
 *   canvas → JPEG → **包装成真 PDF**。JPEG 可用 /DCTDecode 原样内嵌，
 *   这是 PDF 规范原生支持的，无需解码重编码，也就不需要任何第三方库。
 *
 * 关键设计：buildImagePdf() 是**纯函数**（字节数组进、字节数组出），
 * 因此能在 Node 里单测、并用真正的 PDF 解析器验证产物合法，
 * 而不是只能「到微信开发者工具里碰运气」。微信侧 I/O 只做胶水。
 *
 * 用法:
 *   import { buildImagePdf, exportReportPdf } from '@/utils/pdf'
 */

// A4 尺寸（PDF 单位 pt）
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

/**
 * 隐私页隐藏画布的 CSS 尺寸（px）。
 *
 * 必须与 poster.js 的 DESIGN.a4 同比例，且**必须与传给 drawSharePoster 的
 * cssWidth/cssHeight、以及页面 canvas 的 style 宽高一致** —— 旧版 canvas-id
 * API 的输出分辨率 = CSS 像素。用设计稿原尺寸可获得接近 150dpi 的打印质量。
 *
 * pdf.js 导出它作为单一来源，页面 canvas 的 style 直接引用，避免两处数值漂移。
 */
export const PDF_CANVAS_CSS = { width: 1242, height: 1754 }

/**
 * 字符串 → Latin-1 字节（PDF 结构部分只允许 ASCII/Latin-1）
 * @param {string} str
 * @returns {Uint8Array}
 */
function toLatin1Bytes(str) {
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code > 0xff) throw new Error('NON_LATIN1_CHAR_IN_PDF_STRUCTURE')
    out[i] = code
  }
  return out
}

/** 数字按 PDF 要求格式化（避免科学计数法与过长小数） */
function num(n) {
  if (!Number.isFinite(n)) throw new Error('NON_FINITE_NUMBER')
  return (Math.round(n * 1000) / 1000).toString()
}

/**
 * 把一张 JPEG 包装成单页 A4 PDF（图片等比缩放居中）。
 *
 * @param {object} opts
 * @param {Uint8Array|ArrayBuffer|number[]} opts.jpeg - JPEG 原始字节
 * @param {number} opts.imageWidth  - 图片像素宽
 * @param {number} opts.imageHeight - 图片像素高
 * @param {string} [opts.colorSpace] - 'DeviceRGB' | 'DeviceCMYK' | 'DeviceGray'
 * @returns {Uint8Array} PDF 字节
 */
export function buildImagePdf({ jpeg, imageWidth, imageHeight, colorSpace = 'DeviceRGB' }) {
  let img = jpeg
  if (img instanceof ArrayBuffer) img = new Uint8Array(img)
  else if (Array.isArray(img)) img = new Uint8Array(img)
  if (!(img instanceof Uint8Array) || img.length === 0) {
    throw new Error('EMPTY_IMAGE')
  }
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    throw new Error('BAD_IMAGE_SIZE')
  }

  // 等比缩放并居中到 A4
  const scale = Math.min(A4_WIDTH / imageWidth, A4_HEIGHT / imageHeight)
  const drawW = imageWidth * scale
  const drawH = imageHeight * scale
  const offsetX = (A4_WIDTH - drawW) / 2
  const offsetY = (A4_HEIGHT - drawH) / 2

  const content = toLatin1Bytes(
    `q ${num(drawW)} 0 0 ${num(drawH)} ${num(offsetX)} ${num(offsetY)} cm /Im0 Do Q\n`
  )

  // 对象编号：1 Catalog / 2 Pages / 3 Page / 4 Image XObject / 5 Contents
  const objBodies = [
    toLatin1Bytes('<< /Type /Catalog /Pages 2 0 R >>'),
    toLatin1Bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    toLatin1Bytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4_WIDTH)} ${num(A4_HEIGHT)}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    ),
    // /Filter /DCTDecode：流内是原始 JPEG，查看器直接解码即可
    toLatin1Bytes(
      `<< /Type /XObject /Subtype /Image /Width ${Math.round(imageWidth)} ` +
      `/Height ${Math.round(imageHeight)} /ColorSpace /${colorSpace} ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>`
    ),
    toLatin1Bytes(`<< /Length ${content.length} >>`),
  ]

  const chunks = []
  let offset = 0
  const push = (bytes) => {
    chunks.push(bytes)
    offset += bytes.length
  }

  // 文件头 + 二进制标记（含 >127 的字节，提示这是二进制文件而非文本）
  push(new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // %PDF-1.4\n
    0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,                   // %âãÏÓ\n
  ]))

  const offsets = []
  objBodies.forEach((body, i) => {
    offsets.push(offset)
    const objNum = i + 1
    push(toLatin1Bytes(`${objNum} 0 obj\n`))
    push(body)
    if (objNum === 4) {
      push(toLatin1Bytes('\nstream\n'))
      push(img)
      push(toLatin1Bytes('\nendstream'))
    } else if (objNum === 5) {
      push(toLatin1Bytes('\nstream\n'))
      push(content)
      push(toLatin1Bytes('\nendstream'))
    }
    push(toLatin1Bytes('\nendobj\n'))
  })

  const xrefOffset = offset
  // xref 每项固定 20 字节：10 位偏移 + 空格 + 5 位版本号 + 空格 + 类型 + 2 字节 EOL
  let xref = `xref\n0 ${objBodies.length + 1}\n`
  xref += '0000000000 65535 f \n'
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n'
  }
  push(toLatin1Bytes(xref))

  push(toLatin1Bytes(
    `trailer\n<< /Size ${objBodies.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`
  ))

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const c of chunks) {
    out.set(c, cursor)
    cursor += c.length
  }
  return out
}

/**
 * 生成规划书 PDF 并唤起微信文档预览（可保存 / 转发 / 打印）。
 *
 * 流程：poster 画 canvas → 导出 JPEG → 包装成 PDF → 落 USER_DATA_PATH → openDocument。
 * 任一步失败都抛出带 userHint 的错误，由调用方提示用户 —— 不再静默降级成
 * 「存图片」，那会让用户以为导出的就是 PDF。
 *
 * @param {object} plan - active plan
 * @returns {Promise<void>}
 */
export function exportReportPdf(plan) {
  if (!plan) return Promise.reject(pdfError('NO_PLAN', '当前没有可导出的规划书'))

  const canvasId = 'reportPdfCanvas'
  const fileName = `家计通规划书_${String(plan._id || Date.now()).slice(-8)}.pdf`

  return drawPosterJpeg(plan, canvasId)
    .then(({ tempFilePath, width, height }) =>
      readFileBytes(tempFilePath).then((jpeg) => {
        const pdf = buildImagePdf({ jpeg, imageWidth: width, imageHeight: height })
        const savePath = `${uni.env.USER_DATA_PATH}/${fileName}`
        return writeFileBytes(savePath, pdf)
      })
    )
    .then((savePath) => openDocument(savePath, 'pdf'))
}

/**
 * 绘制规划书海报并导出为 JPEG 字节源。
 *
 * 注意分工：drawSharePoster() **只负责画**（resolve 不带任何参数），
 * 取文件必须由调用方自己调 canvasToTempFilePath。这里用 jpg 而非 png，
 * 因为 PDF 侧要走 /DCTDecode（JPEG 原样内嵌），PNG 是无损压缩无法这样内嵌。
 *
 * @returns {Promise<{tempFilePath:string, width:number, height:number}>}
 */
function drawPosterJpeg(plan, canvasId) {
  return new Promise((resolve, reject) => {
    // 动态引入：poster 依赖 canvas，静态 import 会让本模块无法在 Node 下单测
    import('./poster.js').then(({ buildShareModel, drawSharePoster }) => {
      const model = buildShareModel(plan, { scoreOnly: false })
      drawSharePoster({
        canvasId,
        model,
        qrImage: '',
        pageSize: 'a4',
        cssWidth: PDF_CANVAS_CSS.width,
        cssHeight: PDF_CANVAS_CSS.height,
      })
        .then(() => {
          uni.canvasToTempFilePath({
            canvasId,
            fileType: 'jpg',
            quality: 1,
            success: ({ tempFilePath }) => resolve({
              tempFilePath,
              width: PDF_CANVAS_CSS.width,
              height: PDF_CANVAS_CSS.height,
            }),
            fail: (e) => reject(pdfError('CANVAS_TO_FILE_FAILED', '导出规划书图片失败' + (e && e.errMsg ? `：${e.errMsg}` : ''))),
          })
        })
        .catch(() => reject(pdfError('DRAW_FAILED', '规划书画布绘制失败')))
    }).catch(() => reject(pdfError('POSTER_LOAD_FAILED', '海报模块加载失败')))
  })
}

function readFileBytes(filePath) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath,
      success: (res) => {
        const data = res && res.data
        if (data instanceof ArrayBuffer) return resolve(new Uint8Array(data))
        if (data instanceof Uint8Array) return resolve(data)
        reject(pdfError('READ_FAILED', '读取规划书图片失败'))
      },
      fail: () => reject(pdfError('READ_FAILED', '读取规划书图片失败')),
    })
  })
}

function writeFileBytes(filePath, bytes) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().writeFile({
      filePath,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      encoding: 'binary',
      success: () => resolve(filePath),
      fail: () => reject(pdfError('WRITE_FAILED', '写入 PDF 文件失败')),
    })
  })
}

function openDocument(filePath, fileType) {
  return new Promise((resolve, reject) => {
    uni.openDocument({
      filePath,
      fileType,
      showMenu: true,
      success: resolve,
      fail: () => reject(pdfError('OPEN_FAILED', '打开 PDF 失败，请重试')),
    })
  })
}

function pdfError(code, message) {
  const e = new Error(message)
  e.code = code
  e.userHint = message
  return e
}

export default { buildImagePdf, exportReportPdf }
