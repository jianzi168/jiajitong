/**
 * 帮助与反馈 · FAQ 常量
 * 后续可改为调用 faq.list 云函数热更新；本期前端只读本文件。
 */
export const FAQ_ITEMS = [
  {
    id: 'calc',
    question: '预算数字怎么算出来的？',
    answer: '基于城市消费水平与你填写的收入、阶段，由规则引擎给出建议区间。这不是理财产品推荐，也不构成投资建议。',
  },
  {
    id: 'partner',
    question: '如何邀请伴侣一起看？',
    answer: '在「我的 → 伴侣管理」或完整版规划书的「邀请伴侣共读」生成邀请码，分享给对方加入同一家庭后即可共读。',
  },
  {
    id: 'weekly',
    question: '周度填报有什么用？',
    answer: '用来对照本月预算进度，形成轻量追踪习惯，帮助你们看见钱花到了哪里。',
  },
  {
    id: 'privacy',
    question: '数据安全吗？会卖掉吗？',
    answer: '数据加密存储。我们不算理财、不卖贷款。更多说明见「我的 → 数据导出与隐私」。',
  },
  {
    id: 'export',
    question: '如何导出或注销数据？',
    answer: '打开「我的 → 数据导出与隐私」，可导出数据或申请注销账号。',
  },
]

export default FAQ_ITEMS
