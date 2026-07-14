<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'

// 每张卡的"已采纳/稍后/忽略"选中态：card 0 默认 0（已采纳），card 1 默认 null
const cardTags = ref([
  { selected: 0 },
  { selected: null }
])

const actions = [
  {
    title: '备育储备有点紧',
    desc: '按现在的储蓄节奏，距目标还差 ¥48,000。',
    steps: [
      '娱乐预算从 ¥2,000 调到 ¥1,500',
      '开个「备育账户」，每月自动转 ¥3,000',
      '和伴侣一起确认生育时间线'
    ],
    impact: '预估：每月多储备 ¥800–1,200',
    warn: true
  },
  {
    title: '餐饮可以优化',
    desc: '外卖频率偏高，建议每周 ≤3 次。',
    steps: [
      '定个「在家做饭日」，每周 3 天'
    ],
    impact: '预估：月省 ¥400–600',
    warn: false
  }
]

const tags = ['已采纳', '稍后', '忽略']

function pickTag(cardIdx, tagIdx) {
  cardTags.value[cardIdx].selected = tagIdx
}
</script>

<template>
  <view class="screen">
    <view class="navbar-wrap">
      <NavBar title="行动清单" />
      <text class="header-caption header-caption-pos">3 条待处理</text>
    </view>

    <view class="screen-body screen-body-scroll">
      <view
        v-for="(a, i) in actions"
        :key="i"
        class="glass-card action-card"
        :class="a.warn ? 'action-card-warn' : ''"
      >
        <text class="text-strong">{{ a.title }}</text>
        <text class="ac-p">{{ a.desc }}</text>
        <view class="numbered-list">
          <text
            v-for="(s, idx) in a.steps"
            :key="idx"
            class="li"
          >{{ idx + 1 }}. {{ s }}</text>
        </view>
        <text class="impact-text">{{ a.impact }}</text>
        <view class="tag-row">
          <view
            v-for="(t, ti) in tags"
            :key="ti"
            class="tag-btn"
            :class="cardTags[i].selected === ti ? 'active' : ''"
            @tap="pickTag(i, ti)"
          >{{ t }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
.navbar-wrap { position: relative; }
.header-caption-pos {
  position: absolute;
  right: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
</style>
