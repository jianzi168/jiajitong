<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { FAQ_ITEMS } from '@/constants/faq'
import { submitFeedback } from '@/services/api'

const faqs = FAQ_ITEMS
const openId = ref(faqs[0] ? faqs[0].id : '')

const TYPES = [
  { key: 'suggestion', label: '功能建议' },
  { key: 'bug', label: '遇到问题' },
  { key: 'other', label: '其他' },
]

const type = ref('suggestion')
const content = ref('')
const contact = ref('')
const submitting = ref(false)

function toggleFaq(id) {
  openId.value = openId.value === id ? '' : id
}

async function onSubmit() {
  if (submitting.value) return
  const text = content.value.trim()
  if (text.length < 10) {
    uni.showToast({ title: '再多写一点', icon: 'none' })
    return
  }
  if (text.length > 500) {
    uni.showToast({ title: '内容太长', icon: 'none' })
    return
  }
  const contactText = contact.value.trim()
  if (contactText.length > 50) {
    uni.showToast({ title: '联系方式太长', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    let client_meta = {}
    try {
      const sys = uni.getSystemInfoSync()
      client_meta = {
        platform: sys.platform || '',
        system: sys.system || '',
        version: sys.version || '',
        SDKVersion: sys.SDKVersion || '',
      }
    } catch (e) {}

    await submitFeedback({
      type: type.value,
      content: text,
      contact: contactText,
      client_meta,
    })
    uni.showToast({ title: '感谢反馈', icon: 'success' })
    content.value = ''
    contact.value = ''
  } catch (e) {
    uni.showToast({ title: e.userHint || e.message || '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="帮助与反馈" />

    <ScreenBody class="screen-body-scroll">
      <text class="section-heading">常见问题</text>
      <view class="glass-card faq-card">
        <view
          v-for="item in faqs"
          :key="item.id"
          class="faq-item"
        >
          <view class="faq-q" @tap="toggleFaq(item.id)">
            <text class="faq-q-text">{{ item.question }}</text>
            <text class="faq-chev">{{ openId === item.id ? '▾' : '▸' }}</text>
          </view>
          <view v-if="openId === item.id" class="faq-a">
            <text>{{ item.answer }}</text>
          </view>
        </view>
      </view>

      <text class="section-heading">意见反馈</text>
      <view class="glass-card">
        <view class="pill-group feedback-types">
          <view
            v-for="t in TYPES"
            :key="t.key"
            class="pill-option"
            :class="{ selected: type === t.key }"
            @tap="type = t.key"
          >
            {{ t.label }}
          </view>
        </view>

        <textarea
          class="feedback-input"
          v-model="content"
          maxlength="500"
          placeholder="请描述你的想法或遇到的问题…"
          :disabled="submitting"
        />

        <input
          class="feedback-contact"
          v-model="contact"
          maxlength="50"
          placeholder="微信 / 手机号"
          :disabled="submitting"
        />
        <text class="feedback-hint">选填，便于我们必要时联系你</text>

        <button
          class="grad-btn"
          :disabled="submitting"
          @tap="onSubmit"
        >
          {{ submitting ? '提交中…' : '提交反馈' }}
        </button>
      </view>
    </ScreenBody>
  </view>
</template>

<style scoped>
.faq-card {
  padding: 0 32rpx;
}
.faq-item {
  border-bottom: 1rpx solid var(--color-border);
}
.faq-item:last-child {
  border-bottom: none;
}
.faq-q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 28rpx 0;
}
.faq-q-text {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.faq-chev {
  color: var(--color-text-3);
  font-size: 24rpx;
}
.faq-a {
  padding: 0 0 28rpx;
  font-size: 26rpx;
  line-height: 1.55;
  color: var(--color-text-2);
}
.feedback-types {
  margin-bottom: 24rpx;
}
.feedback-input {
  width: 100%;
  min-height: 200rpx;
  box-sizing: border-box;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border: 3rpx solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 28rpx;
  line-height: 1.5;
}
.feedback-contact {
  display: block;
  width: 100%;
  height: 88rpx;
  box-sizing: border-box;
  padding: 0 24rpx;
  margin-bottom: 12rpx;
  border: 3rpx solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 28rpx;
  line-height: 88rpx;
}
.feedback-hint {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-bottom: 8rpx;
  line-height: 1.4;
}
</style>
