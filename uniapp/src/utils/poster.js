/**
 * 分享长图 / PDF 客户端渲染 (Phase 8)
 *
 * 视觉对齐 prototype-v2 share-card：
 *  - 全幅 --grad-hero 渐变 + 白字（无内嵌白卡）
 *  - 顺序：品牌 → 分数 → 标签 → 城市·阶段 → 风险描述 → 比例 → 码 → 脚注
 *  - 比例继续区间脱敏（PDD 隐私），不画精确金额
 *
 * 设计稿坐标系固定 (share 750×1334 / a4 1242×1754)，按 canvas CSS 像素等比缩放。
 */

/**
 * 从 plan 构造安全的 share model
 * @param {object} plan - active plan
 * @param {object} opts - { scoreOnly: boolean } 仅隐藏比例区间
 */
export function buildShareModel(plan, opts = {}) {
  if (!plan) return null
  const { scoreOnly = false } = opts
  const meta = plan.meta || {}
  const summary = plan.monthly_summary || {}
  const income = Number(summary.income) || 0
  const savings = Number(summary.savings_target) || 0
  const fixed = Number(summary.fixed_expense) || 0

  function ratioToBand(num) {
    if (income <= 0) return null
    const pct = (num / income) * 100
    if (pct < 5) return '0%–4%'
    if (pct < 15) return '5%–14%'
    if (pct < 25) return '15%–24%'
    if (pct < 35) return '25%–34%'
    if (pct < 45) return '35%–44%'
    if (pct < 55) return '45%–54%'
    if (pct < 65) return '55%–64%'
    if (pct < 75) return '65%–74%'
    if (pct < 85) return '75%–84%'
    if (pct < 95) return '85%–94%'
    return '95%+'
  }

  const riskBand = ({ green: '稳健区间', yellow: '关注区间', red: '需调整区间' })[plan.risk_level] || '稳健区间'

  return {
    brand: '家计通',
    score: plan.health_score || 0,
    riskLabel: riskBand,
    riskDesc: `财务处于${riskBand}`,
    city: meta.city || '',
    stage: meta.stage || '',
    stageText: stageLabel(meta.stage),
    savingsBand: ratioToBand(savings),
    fixedBand: ratioToBand(fixed),
    scoreOnly: !!scoreOnly,
  }
}

/** 设计稿尺寸 */
const DESIGN = {
  share: { w: 750, h: 1334 },
  a4: { w: 1242, h: 1754 },
}

/**
 * 解析实际绘制尺寸（必须与 canvas CSS 宽高等值，单位 px）
 * 旧版 canvas-id API 的坐标系 = CSS 像素，不是设计稿像素。
 */
function resolveDrawSize(pageSize, cssWidth, cssHeight) {
  const design = DESIGN[pageSize] || DESIGN.share
  let w = Number(cssWidth) || 0
  let h = Number(cssHeight) || 0

  if (!w || !h) {
    if (pageSize === 'a4') {
      w = 375
      h = 530
    } else {
      w = uni.upx2px(670)
      h = uni.upx2px(1192)
    }
  }

  return { design, w, h, s: w / design.w }
}

/** 圆角矩形路径 */
function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/**
 * 绘制分享长图 / PDF
 * @param {object} opts
 * @param {string} opts.canvasId
 * @param {object} opts.model
 * @param {string} [opts.qrImage]
 * @param {'share'|'a4'} [opts.pageSize]
 * @param {number} [opts.cssWidth]
 * @param {number} [opts.cssHeight]
 */
export function drawSharePoster({
  canvasId,
  model,
  qrImage = '',
  pageSize = 'share',
  cssWidth,
  cssHeight,
}) {
  if (!model) return Promise.reject(new Error('share model is null'))

  const { design, w, h, s } = resolveDrawSize(pageSize, cssWidth, cssHeight)
  const ctx = uni.createCanvasContext(canvasId)
  const X = (n) => n * s
  const Y = (n) => n * s
  const cx = w / 2

  return new Promise((resolve, reject) => {
    try {
      // 1. 全幅 --grad-hero（145deg ≈ 从左上到右下）
      const grd = ctx.createLinearGradient(0, 0, w, h)
      grd.addColorStop(0, '#FF6B8A')
      grd.addColorStop(0.45, '#FF8A5C')
      grd.addColorStop(1, '#C084FC')
      ctx.setFillStyle(grd)
      ctx.fillRect(0, 0, w, h)

      // 内容区垂直起点（对齐原型卡片内边距节奏）
      const top = 160

      // 2. brand
      ctx.setFillStyle('rgba(255, 255, 255, 0.9)')
      ctx.setFontSize(X(26))
      ctx.setTextAlign('center')
      ctx.fillText(model.brand, cx, Y(top))

      // 3. 健康分大字
      ctx.setFillStyle('#FFFFFF')
      ctx.setFontSize(X(144))
      ctx.fillText(String(model.score || 0), cx, Y(top + 200))

      // 4. 健康分标签
      ctx.setFillStyle('rgba(255, 255, 255, 0.85)')
      ctx.setFontSize(X(28))
      ctx.fillText('家庭财务健康分', cx, Y(top + 270))

      let cursor = top + 340

      // 5. 城市 · 阶段（scoreOnly 仍保留，仅隐藏比例）
      const metaText = [model.city, model.stageText || stageLabel(model.stage)]
        .filter(Boolean)
        .join(' · ')
      if (metaText) {
        ctx.setFillStyle('#FFFFFF')
        ctx.setFontSize(X(32))
        ctx.fillText(metaText, cx, Y(cursor))
        cursor += 56
      }

      // 6. 风险描述
      const riskDesc = model.riskDesc || (model.riskLabel ? `财务处于${model.riskLabel}` : '')
      if (riskDesc) {
        ctx.setFillStyle('rgba(255, 255, 255, 0.85)')
        ctx.setFontSize(X(28))
        ctx.fillText(riskDesc, cx, Y(cursor))
        cursor += 72
      }

      // 7. 比例区间（仅 scoreOnly=false）
      if (!model.scoreOnly && (model.savingsBand || model.fixedBand)) {
        const stats = []
        if (model.savingsBand) stats.push(`储蓄率 ${model.savingsBand}`)
        if (model.fixedBand) stats.push(`固定占比 ${model.fixedBand}`)
        if (stats.length) {
          ctx.setFillStyle('rgba(255, 255, 255, 0.85)')
          ctx.setFontSize(X(26))
          ctx.fillText(stats.join('    '), cx, Y(cursor))
          cursor += 80
        }
      } else {
        cursor += 24
      }

      // 8. 小程序码（白底圆角）
      const qrSize = 144
      const qrPad = 12
      const boxSize = qrSize + qrPad * 2
      const boxX = (design.w - boxSize) / 2
      const boxY = Math.max(cursor + 40, design.h - 420)
      const bx = X(boxX)
      const by = Y(boxY)
      const bs = X(boxSize)
      const qs = X(qrSize)
      const qx = bx + X(qrPad)
      const qy = by + Y(qrPad)

      ctx.setFillStyle('rgba(255, 255, 255, 0.95)')
      roundRectPath(ctx, bx, by, bs, bs, X(24))
      ctx.fill()

      const finish = () => {
        // 9. foot
        ctx.setFillStyle('rgba(255, 255, 255, 0.75)')
        ctx.setFontSize(X(24))
        ctx.setTextAlign('center')
        ctx.fillText('扫码测测你们家预算', cx, by + bs + Y(48))
        ctx.draw(false, () => resolve())
      }

      if (qrImage) {
        ctx.drawImage(qrImage, qx, qy, qs, qs)
        finish()
      } else {
        ctx.setFillStyle('#A8A29E')
        ctx.setFontSize(X(22))
        ctx.setTextAlign('center')
        ctx.fillText('QR', bx + bs / 2, by + bs / 2 + X(8))
        finish()
      }
    } catch (e) {
      reject(e)
    }
  })
}

function stageLabel(stage) {
  return ({
    newlywed: '新婚家庭',
    planning: '备育家庭',
    pregnant: '备育家庭',
    has_child: '有宝宝家庭',
  })[stage] || ''
}
