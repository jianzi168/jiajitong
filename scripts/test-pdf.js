/**
 * 图片型 PDF 生成测试
 *
 * 背景：微信 openDocument 只支持 doc/docx/xls/xlsx/ppt/pptx/pdf，
 * **不支持 PNG/JPG**。旧实现把 canvas 生成的 PNG 直接丢给 openDocument，
 * 必然失败并降级成「存图片」—— 用户点「导出 PDF」却拿不到 PDF。
 *
 * 新实现把 JPEG 用 /DCTDecode 原样内嵌进真 PDF（PDF 规范原生支持，
 * 无需解码重编码）。buildImagePdf() 是纯函数，因此可在此完整验证。
 *
 * 产物已用 pypdf 6.17.0（strict=True）与 Pillow 交叉验证通过：
 *   - 严格模式解析无告警，1 页，页面 595.28 x 841.89 pt（A4）
 *   - 内嵌图像可被 PIL 解码为 JPEG RGB，尺寸与原图一致
 *   - PDF 内原始流与原 JPEG 逐字节相同（零损失内嵌）
 *
 * 运行: node --test scripts/test-pdf.js
 */
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const FIXTURE = path.join(__dirname, 'fixtures', 'test-image.jpg')

/** pdf.js 是 ESM，动态 import */
async function loadPdf() {
  return import('../uniapp/src/utils/pdf.js')
}

function readFixture() {
  return new Uint8Array(fs.readFileSync(FIXTURE))
}

/** 取 PDF 的 latin1 文本视图，便于做结构断言 */
function asLatin1(pdf) {
  return Buffer.from(pdf).toString('latin1')
}

/** 解析 xref 表并校验每项偏移是否精确指向 "N 0 obj" */
function verifyXref(latin1) {
  // 注意：不能用 lastIndexOf('xref')，会匹配到 'startxref' 里的子串
  const xrefStart = latin1.indexOf('\nxref\n') + 1
  assert.ok(xrefStart > 0, '应存在独立的 xref 标记')

  const body = latin1.slice(xrefStart)
  const entries = body.split('\n').filter((l) => /^\d{10} \d{5} [nf] $/.test(l))
  return { xrefStart, entries }
}

describe('buildImagePdf', () => {
  test('产出符合 PDF 规范的单页文档', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()
    const pdf = buildImagePdf({ jpeg, imageWidth: 120, imageHeight: 120 })
    const latin1 = asLatin1(pdf)

    assert.ok(latin1.startsWith('%PDF-1.4'), '文件头应为 %PDF-1.4')
    assert.ok(latin1.trimEnd().endsWith('%%EOF'), '应以 %%EOF 结尾')

    // 五个对象：Catalog / Pages / Page / Image XObject / Contents
    for (const token of ['/Type /Catalog', '/Type /Pages', '/Type /Page', '/Subtype /Image']) {
      assert.ok(latin1.includes(token), `应包含 ${token}`)
    }
    assert.ok(latin1.includes('/MediaBox [0 0 595.28 841.89]'), '页面应为 A4')
  })

  test('JPEG 以 /DCTDecode 零损失内嵌', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()
    const pdf = buildImagePdf({ jpeg, imageWidth: 120, imageHeight: 120 })
    const latin1 = asLatin1(pdf)

    assert.ok(latin1.includes('/Filter /DCTDecode'), '应使用 DCTDecode 内嵌 JPEG')
    assert.ok(latin1.includes('/DeviceRGB'), 'canvas JPEG 为 RGB')
    assert.ok(latin1.includes(`/Length ${jpeg.length}`), '流长度应等于 JPEG 字节数')

    // 逐字节比对：内嵌过程不得改动 JPEG 任何一个字节
    const marker = latin1.indexOf('/DCTDecode')
    const streamStart = latin1.indexOf('stream\n', marker) + 'stream\n'.length
    const embedded = pdf.slice(streamStart, streamStart + jpeg.length)
    assert.equal(embedded.length, jpeg.length)
    assert.deepEqual(Array.from(embedded), Array.from(jpeg), 'JPEG 必须原样内嵌')
  })

  test('xref 偏移精确指向各对象（偏移错会让 PDF 打不开）', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()
    const pdf = buildImagePdf({ jpeg, imageWidth: 120, imageHeight: 120 })
    const latin1 = asLatin1(pdf)

    const { xrefStart, entries } = verifyXref(latin1)
    assert.equal(entries.length, 6, 'xref 应为 1 条 free + 5 个对象')

    // 首项是 free 链表头，跳过
    entries.slice(1).forEach((line, i) => {
      const offset = parseInt(line.slice(0, 10), 10)
      const expected = `${i + 1} 0 obj`
      assert.equal(
        latin1.substr(offset, expected.length), expected,
        `xref 第 ${i + 1} 项应指向 "${expected}"，实际指向 "${latin1.substr(offset, 20)}"`
      )
    })

    // startxref 必须指向 xref 表的起始
    const m = latin1.match(/startxref\n(\d+)/)
    assert.ok(m, '应存在 startxref')
    assert.equal(parseInt(m[1], 10), xrefStart, 'startxref 应指向 xref 表')
  })

  test('图片等比缩放并居中到 A4', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()

    // 宽图：应以宽度为约束，上下留白
    const wide = buildImagePdf({ jpeg, imageWidth: 2000, imageHeight: 1000 })
    const cm = asLatin1(wide).match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/)
    assert.ok(cm, '内容流应含 cm 变换矩阵')
    const dw = parseFloat(cm[1]), dh = parseFloat(cm[2])
    const ox = parseFloat(cm[3]), oy = parseFloat(cm[4])

    assert.ok(Math.abs(dw / dh - 2) < 0.01, '应保持 2:1 宽高比')
    assert.ok(Math.abs(dw - 595.28) < 0.01, '宽度应撑满 A4')
    assert.ok(Math.abs(ox - 0) < 0.01, '水平应居中（左边距 0）')
    assert.ok(oy > 0, '垂直方向应有留白并居中')
    assert.ok(Math.abs(oy - (841.89 - dh) / 2) < 0.01, '垂直居中')

    // 高图：应以高度为约束，左右留白
    const tall = buildImagePdf({ jpeg, imageWidth: 1000, imageHeight: 2000 })
    const cm2 = asLatin1(tall).match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/)
    const dh2 = parseFloat(cm2[2]), ox2 = parseFloat(cm2[3])
    assert.ok(Math.abs(dh2 - 841.89) < 0.01, '高度应撑满 A4')
    assert.ok(ox2 > 0, '水平方向应有留白并居中')
  })

  test('支持 ArrayBuffer 与普通数组入参', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()

    const fromBuf = buildImagePdf({
      jpeg: jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
      imageWidth: 120, imageHeight: 120,
    })
    const fromArr = buildImagePdf({
      jpeg: Array.from(jpeg), imageWidth: 120, imageHeight: 120,
    })
    const fromTyped = buildImagePdf({ jpeg, imageWidth: 120, imageHeight: 120 })

    assert.deepEqual(Array.from(fromBuf), Array.from(fromTyped), 'ArrayBuffer 结果应一致')
    assert.deepEqual(Array.from(fromArr), Array.from(fromTyped), '普通数组结果应一致')
  })

  test('入参校验：空图 / 非法尺寸一律抛错', async () => {
    const { buildImagePdf } = await loadPdf()
    const jpeg = readFixture()

    assert.throws(() => buildImagePdf({ jpeg: new Uint8Array(0), imageWidth: 1, imageHeight: 1 }), /EMPTY_IMAGE/)
    assert.throws(() => buildImagePdf({ jpeg: null, imageWidth: 1, imageHeight: 1 }), /EMPTY_IMAGE/)
    assert.throws(() => buildImagePdf({ jpeg, imageWidth: 0, imageHeight: 1 }), /BAD_IMAGE_SIZE/)
    assert.throws(() => buildImagePdf({ jpeg, imageWidth: -10, imageHeight: 1 }), /BAD_IMAGE_SIZE/)
    assert.throws(() => buildImagePdf({ jpeg, imageWidth: 1, imageHeight: NaN }), /BAD_IMAGE_SIZE/)
  })
})
