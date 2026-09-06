/**
 * 开放城市清单（PDD §附录 B 扩展版）
 *
 * tier:
 *   - 'tier1' 一线（北京/上海/广州/深圳）
 *   - 'tier2' 新一线（第一财经新一线榜单 top15，覆盖强消费力省会/计划单列市）
 *   - 'tier3' 强二线（省会 + 计划单列市，但消费力略低）
 *
 * medianIncome: 家庭月收入中位数（元），用于收入系数夹逼（PDD §6.2.2）
 *   tier1: 28000 / tier2: 20000 / tier3: 15000
 *
 * 排序规则：按 tier 分组 → 拼音升序，方便人工核对与扩展。
 */
module.exports = [
  // ---------- tier1: 一线城市 (4) ----------
  { name: '北京', tier: 'tier1', medianIncome: 28000 },
  { name: '广州', tier: 'tier1', medianIncome: 28000 },
  { name: '上海', tier: 'tier1', medianIncome: 28000 },
  { name: '深圳', tier: 'tier1', medianIncome: 28000 },

  // ---------- tier2: 新一线城市 (15) ----------
  { name: '成都', tier: 'tier2', medianIncome: 20000 },
  { name: '重庆', tier: 'tier2', medianIncome: 20000 },
  { name: '东莞', tier: 'tier2', medianIncome: 20000 },
  { name: '佛山', tier: 'tier2', medianIncome: 20000 },
  { name: '杭州', tier: 'tier2', medianIncome: 20000 },
  { name: '合肥', tier: 'tier2', medianIncome: 20000 },
  { name: '南京', tier: 'tier2', medianIncome: 20000 },
  { name: '宁波', tier: 'tier2', medianIncome: 20000 },
  { name: '青岛', tier: 'tier2', medianIncome: 20000 },
  { name: '苏州', tier: 'tier2', medianIncome: 20000 },
  { name: '天津', tier: 'tier2', medianIncome: 20000 },
  { name: '武汉', tier: 'tier2', medianIncome: 20000 },
  { name: '西安', tier: 'tier2', medianIncome: 20000 },
  { name: '长沙', tier: 'tier2', medianIncome: 20000 },
  { name: '郑州', tier: 'tier2', medianIncome: 20000 },

  // ---------- tier3: 强二线城市 (11) ----------
  { name: '大连', tier: 'tier3', medianIncome: 15000 },
  { name: '福州', tier: 'tier3', medianIncome: 15000 },
  { name: '贵阳', tier: 'tier3', medianIncome: 15000 },
  { name: '哈尔滨', tier: 'tier3', medianIncome: 15000 },
  { name: '济南', tier: 'tier3', medianIncome: 15000 },
  { name: '昆明', tier: 'tier3', medianIncome: 15000 },
  { name: '兰州', tier: 'tier3', medianIncome: 15000 },
  { name: '南宁', tier: 'tier3', medianIncome: 15000 },
  { name: '厦门', tier: 'tier3', medianIncome: 15000 },
  { name: '沈阳', tier: 'tier3', medianIncome: 15000 },
  { name: '无锡', tier: 'tier3', medianIncome: 15000 },
]
