<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import ScoreRing from '@/components/ScoreRing.vue'

// 7 大类预算行（完整版带区间）
const budgets = [
  { name: '餐饮', amt: '¥3,600', range: '2,700–4,500' },
  { name: '日用', amt: '¥1,800', range: '1,350–2,250' },
  { name: '娱乐', amt: '¥2,000', range: '1,500–2,500' },
  { name: '医疗', amt: '¥1,200', range: '900–1,500' },
  { name: '服饰', amt: '¥900', range: '675–1,125' },
  { name: '交通通讯', amt: '¥600', range: '450–750' },
  { name: '其他', amt: '¥1,200', range: '900–1,500' }
]

// accordion 用本地 ref 控制；当前只展开"餐饮"作为示例
const open = ref(true)
function toggle() {
  open.value = !open.value
}

const babyItems = [
  { k: '首年育儿增量', v: '¥3,200/月' },
  { k: '储备目标', v: '¥80,000' },
  { k: '已储备', v: '¥32,000 (40%)' },
  { k: '距计划生育', v: '18 个月' }
]

const risks = [
  { k: '备用金', v: '3.9 个月', ok: true },
  { k: '固定支出占比', v: '45%', ok: true },
  { k: '储蓄率', v: '20%', ok: false }
]

const suggestions = [
  '娱乐预算从 ¥2,000 调到 ¥1,500',
  '开个备育专户，每月自动转 ¥3,000'
]

function go(target) {
  const map = {
    dashboard: '/pages/dashboard/index',
    partner: '/pages/partner/index'
  }
  const url = map[target]
  if (!url) return
  if (target === 'dashboard') {
    uni.reLaunch({ url })
  } else {
    uni.navigateTo({ url })
  }
}

function onPdf() {
  uni.showToast({ title: 'PDF 生成待接入', icon: 'none' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="完整规划书" />

    <view class="screen-body screen-body-scroll">
      <!-- 报告 hero：原模板在此使用 score-display-sm，但只用分数数字，未嵌入 SVG；这里用 ScoreRing 替换以保持一致 -->
      <view class="report-hero">
        <ScoreRing :score="82" size="sm" />
        <view class="meta-line">
          <text class="status-pill status-pill-ok">稳健</text>
          <text>上海 · 备孕中</text>
        </view>
      </view>

      <text class="section-heading">月度预算（7 大类）</text>
      <view
        v-for="b in budgets"
        :key="b.name"
        class="budget-line"
      >
        <text>{{ b.name }}</text>
        <text class="budget-amt">{{ b.amt }}</text>
        <text class="budget-pct">{{ b.range }}</text>
      </view>

      <!-- accordion -->
      <button class="accordion-trigger" @tap="toggle">
        餐饮 计算依据 {{ open ? '▲' : '▼' }}
      </button>
      <view v-if="open" class="accordion-panel">
        <text>基准 ¥2,100 × 家庭系数 1.8 × 城市系数 1.35 = ¥5,103 → 归一 ¥3,600</text>
        <text class="hint-text">数据来源：城镇消费支出统计 2025Q1</text>
      </view>

      <!-- 备育专项 -->
      <view class="glass-card baby-panel">
        <text class="section-heading">备育专项</text>
        <view
          v-for="row in babyItems"
          :key="row.k"
          class="kv-row"
        >
          <text>{{ row.k }}</text>
          <text class="kv-val">{{ row.v }}</text>
        </view>
        <view class="track-bar">
          <view class="track-fill" style="width:40%;"></view>
        </view>
      </view>

      <text class="section-heading">抗风险报告</text>
      <view class="glass-card risk-panel">
        <view
          v-for="r in risks"
          :key="r.k"
          class="risk-row"
          :class="r.ok ? 'risk-row-ok' : 'risk-row-warn'"
        >
          <text>{{ r.k }}</text>
          <text>
            {{ r.v }}
            <text
              class="status-dot"
              :class="r.ok ? 'status-dot-ok' : 'status-dot-warn'"
            ></text>
          </text>
        </view>
        <text class="hint-text">备育前建议备用金 ≥ 6 个月</text>
      </view>

      <text class="section-heading">优化建议 (5)</text>
      <view class="glass-card action-card action-card-warn">
        <text class="tip-strong">备育储备有点紧</text>
        <view class="numbered-list">
          <text
            v-for="(s, i) in suggestions"
            :key="i"
            class="li"
          >{{ s }}</text>
        </view>
        <text class="impact-text">预估：每月多储备 ¥800–1,200</text>
      </view>

      <button class="grad-btn" @tap="go('dashboard')">启用预算追踪</button>
      <button class="grad-btn grad-btn-outline" @tap="go('partner')">邀请伴侣</button>
      <button class="text-link" @tap="onPdf">导出 PDF</button>
    </view>
  </view>
</template>

<style>
.meta-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}
.meta-line .status-pill { margin-top: 0; }
</style>