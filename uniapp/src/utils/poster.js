/**
 * 分享长图 / PDF 客户端渲染 (Phase 8)
 *
 * 设计原则:
 *  - 字段白名单: 调用方传入 share model, 不直接传完整 plan
 *  - 默认脱敏: 不画具体收入/储蓄金额; 比例转为区间
 *  - 单一画布: share canvas (750×1334) 与 PDF canvas (1242×1754) 共用绘制函数
 *  - 系统字体: 客户端 canvas 不嵌入字体, 微信内置即可
 *
 * 用法:
 *   import { drawSharePoster, buildShareModel } from '@/utils/poster'
 *   const model = buildShareModel(plan, { scoreOnly: false })
 *   await drawSharePoster({ canvasId: 'shareCanvas', model, qrImage: '' })
 */

/**
 * 从 plan 构造安全的 share model
 *  - 拒绝把 openid / family_id / plan_id / income 原始数字画入
 *  - 比例转为 10 个百分点一档的区间
 * @param {object} plan - active plan
 * @param {object} opts - { scoreOnly: boolean }
 */
export function buildShareModel(plan, opts = {}) {
  if (!plan) return null
  const { scoreOnly = false } = opts
  const meta = plan.meta || {}
  const summary = plan.monthly_summary || {}
  const income = Number(summary.income) || 0
  const savings = Number(summary.savings_target) || 0
  const fixed = Number(summary.fixed_expense) || 0

  // 比例区间
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

  const riskLabel = ({ green: '稳健区间', yellow: '关注区间', red: '需调整区间' })[plan.risk_level] || '家庭财务健康分'

  const model = {
    brand: '家计通',
    score: plan.health_score || 0,
    riskLabel,
    city: meta.city || '',
    stage: meta.stage || '',
    savingsBand: ratioToBand(savings),
    fixedBand: ratioToBand(fixed),
    scoreOnly: !!scoreOnly,
  }

  return model
}

/**
 * 绘制分享长图 / PDF
 * @param {object} opts - { canvasId, model, qrImage, pageSize: 'share'|'a4', ctx? }
 */
export function drawSharePoster({ canvasId, model, qrImage = '', pageSize = 'share' }) {
  if (!model) return Promise.reject(new Error('share model is null'))

  const size = pageSize === 'a4' ? { w: 1242, h: 1754 } : { w: 750, h: 1334 }
  const ctx = uni.createCanvasContext(canvasId)

  return new Promise((resolve, reject) => {
    try {
      // 1. 渐变背景 (暖光, 复用 prototype-v2 mesh-bg)
      const grd = ctx.createLinearGradient(0, 0, size.w, size.h)
      grd.addColorStop(0, '#FFE4DA')
      grd.addColorStop(0.5, '#FFB199')
      grd.addColorStop(1, '#FF6B8A')
      ctx.setFillStyle(grd)
      ctx.fillRect(0, 0, size.w, size.h)

      // 白色卡片 (中央 80% 宽)
      const cardW = size.w * 0.84
      const cardH = size.h * 0.78
      const cardX = (size.w - cardW) / 2
      const cardY = size.h * 0.08
      ctx.setFillStyle('rgba(255, 255, 255, 0.95)')
      const r = 32
      ctx.beginPath()
      ctx.moveTo(cardX + r, cardY)
      ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + r, r)
      ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH, r)
      ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - r, r)
      ctx.arcTo(cardX, cardY, cardX + r, cardY, r)
      ctx.closePath()
      ctx.fill()

      // 2. brand
      const fontScale = pageSize === 'a4' ? 1.6 : 1
      ctx.setFillStyle('#FF6B8A')
      ctx.setFontSize(20 * fontScale)
      ctx.setTextAlign('center')
      ctx.fillText(model.brand, size.w / 2, cardY + 60 * fontScale)

      // 3. 健康分大字
      ctx.setFillStyle('#2C2C2C')
      ctx.setFontSize(140 * fontScale)
      ctx.setTextAlign('center')
      ctx.fillText(String(model.score || 0), size.w / 2, cardY + 240 * fontScale)

      // 4. 健康分标签
      ctx.setFontSize(22 * fontScale)
      ctx.setFillStyle('#666')
      ctx.fillText('家庭财务健康分', size.w / 2, cardY + 290 * fontScale)

      // 5. 风险评级
      ctx.setFontSize(24 * fontScale)
      ctx.setFillStyle('#FF6B8A')
      ctx.fillText(model.riskLabel, size.w / 2, cardY + 340 * fontScale)

      // 6. 城市 + 阶段 (scoreOnly 模式跳过)
      if (!model.scoreOnly && (model.city || model.stage)) {
        const cityText = [model.city, stageLabel(model.stage)].filter(Boolean).join(' · ')
        if (cityText) {
          ctx.setFontSize(22 * fontScale)
          ctx.setFillStyle('#666')
          ctx.fillText(cityText, size.w / 2, cardY + 400 * fontScale)
        }
      }

      // 7. 比例区间 (scoreOnly 模式跳过)
      if (!model.scoreOnly && (model.savingsBand || model.fixedBand)) {
        const stats = []
        if (model.savingsBand) stats.push(`储蓄率 ${model.savingsBand}`)
        if (model.fixedBand) stats.push(`固定占比 ${model.fixedBand}`)
        if (stats.length) {
          ctx.setFontSize(20 * fontScale)
          ctx.setFillStyle('#444')
          ctx.fillText(stats.join('  ·  '), size.w / 2, cardY + 460 * fontScale)
        }
      }

      // 8. 小程序码
      const qrSize = 160 * fontScale
      const qrX = (size.w - qrSize) / 2
      const qrY = cardY + cardH - qrSize - 120 * fontScale
      if (qrImage) {
        // 留接口, Phase 8 暂用 placeholder
      } else {
        // 占位框
        ctx.setFillStyle('#F5F5F5')
        ctx.fillRect(qrX, qrY, qrSize, qrSize)
        ctx.setStrokeStyle('#DDD')
        ctx.setLineWidth(2)
        ctx.strokeRect(qrX, qrY, qrSize, qrSize)
        ctx.setFontSize(20 * fontScale)
        ctx.setFillStyle('#999')
        ctx.setTextAlign('center')
        ctx.fillText('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 8)
      }

      // 9. brand foot
      ctx.setFontSize(18 * fontScale)
      ctx.setFillStyle('#999')
      ctx.fillText('扫码测测你们家预算', size.w / 2, cardY + cardH - 50 * fontScale)

      ctx.draw(false, () => resolve())
    } catch (e) {
      reject(e)
    }
  })
}

function stageLabel(stage) {
  return ({ newlywed: '新婚', planning: '备孕中', pregnant: '已孕', has_child: '有宝宝' })[stage] || ''
}
